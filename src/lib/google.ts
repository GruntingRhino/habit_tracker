/**
 * Google Calendar, both ways, over plain REST (no SDK):
 *   - connect: OAuth (calendar.events scope, offline) → refresh token stored in GoogleAccount
 *   - pull: his primary calendar → CalendarEvent (incremental with a sync token; worker every 5 min)
 *   - push: events made in the app are created on his Google Calendar; attendees get real invites
 */
import prisma from "@/lib/prisma";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events"];

export const tz = () => process.env.APP_TZ || process.env.TZ || "America/New_York";

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function authUrl(state: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH}?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google token error: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

/** OAuth callback: store the refresh token. */
export async function connect(userId: string, code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: process.env.GOOGLE_REDIRECT_URI! });
  let email: string | null = null;
  try {
    email = JSON.parse(Buffer.from(t.id_token!.split(".")[1], "base64url").toString("utf8")).email ?? null;
  } catch {
    // no id token: fine
  }
  const existing = await prisma.googleAccount.findUnique({ where: { userId } });
  const refreshToken = t.refresh_token ?? existing?.refreshToken;
  if (!refreshToken) throw new Error("Google didn't return a refresh token — remove LiveImproved's access in your Google account and connect again.");
  const data = { email, refreshToken, accessToken: t.access_token!, expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000), syncToken: null, lastError: null };
  await prisma.googleAccount.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return email;
}

async function accessToken(userId: string) {
  const acct = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!acct) return null;
  if (acct.accessToken && acct.expiresAt && acct.expiresAt > new Date()) return acct.accessToken;
  const t = await tokenRequest({ refresh_token: acct.refreshToken, grant_type: "refresh_token" });
  await prisma.googleAccount.update({ where: { userId }, data: { accessToken: t.access_token, expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000) } });
  return t.access_token!;
}

async function api<T>(userId: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const token = await accessToken(userId);
  if (!token) throw new Error("Google Calendar isn't connected");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (res.status === 204 ? {} : await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string }[];
}

/** "2026-10-02" (all-day) → local midnight. */
function localDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

/** Pull changes from his primary calendar into CalendarEvent. Returns how many changed. */
export async function pullEvents(userId: string): Promise<number> {
  const acct = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!acct) return 0;
  let pageToken: string | undefined;
  let syncToken = acct.syncToken ?? undefined;
  let changed = 0;
  let nextSync: string | undefined;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ singleEvents: "true", showDeleted: "true", maxResults: "250" });
    if (pageToken) q.set("pageToken", pageToken);
    if (syncToken) q.set("syncToken", syncToken);
    else {
      q.set("timeMin", new Date(Date.now() - 30 * 86_400_000).toISOString());
    }
    const { status, body } = await api<{ items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string; error?: { message?: string } }>(userId, `/calendars/primary/events?${q}`);
    if (status === 410) {
      // Sync token expired: start over with a full sync.
      syncToken = undefined;
      pageToken = undefined;
      continue;
    }
    if (status >= 400) throw new Error(`Google Calendar ${status}: ${body.error?.message ?? ""}`);
    for (const g of body.items ?? []) {
      const start = g.start?.dateTime ? new Date(g.start.dateTime) : g.start?.date ? localDate(g.start.date) : null;
      const end = g.end?.dateTime ? new Date(g.end.dateTime) : g.end?.date ? localDate(g.end.date) : start;
      if (g.status === "cancelled") {
        await prisma.calendarEvent.updateMany({ where: { userId, googleId: g.id }, data: { status: "cancelled", syncedAt: new Date() } });
        changed++;
        continue;
      }
      if (!start || !end) continue;
      const data = {
        title: (g.summary ?? "(no title)").slice(0, 300),
        description: g.description?.slice(0, 5000) ?? null,
        location: g.location?.slice(0, 300) ?? null,
        start,
        end,
        allDay: !g.start?.dateTime,
        attendees: (g.attendees ?? []).map((a) => a.email).slice(0, 50),
        status: "confirmed",
        syncedAt: new Date(),
      };
      await prisma.calendarEvent.upsert({ where: { userId_googleId: { userId, googleId: g.id } }, update: data, create: { userId, googleId: g.id, source: "google", ...data } });
      changed++;
    }
    pageToken = body.nextPageToken;
    if (!pageToken) {
      nextSync = body.nextSyncToken;
      break;
    }
  }
  await prisma.googleAccount.update({ where: { userId }, data: { syncToken: nextSync ?? syncToken ?? null, lastSyncAt: new Date(), lastError: null } });
  return changed;
}

function toGoogle(e: { title: string; description: string | null; location: string | null; start: Date; end: Date; allDay: boolean; attendees: string[] }) {
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    summary: e.title,
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    start: e.allDay ? { date: ymd(e.start) } : { dateTime: e.start.toISOString(), timeZone: tz() },
    end: e.allDay ? { date: ymd(new Date(e.end.getTime() > e.start.getTime() ? e.end : new Date(e.start.getTime() + 86_400_000))) } : { dateTime: e.end.toISOString(), timeZone: tz() },
    attendees: e.attendees.length ? e.attendees.map((email) => ({ email })) : undefined,
  };
}

/** Create or update an app event on his Google Calendar; invites go to attendees. */
export async function pushEvent(userId: string, eventId: string) {
  const e = await prisma.calendarEvent.findFirst({ where: { id: eventId, userId } });
  if (!e || !(await prisma.googleAccount.findUnique({ where: { userId } }))) return null;
  const body = JSON.stringify(toGoogle(e));
  const r = e.googleId
    ? await api<GEvent & { error?: { message?: string } }>(userId, `/calendars/primary/events/${encodeURIComponent(e.googleId)}?sendUpdates=all`, { method: "PATCH", body })
    : await api<GEvent & { error?: { message?: string } }>(userId, `/calendars/primary/events?sendUpdates=all`, { method: "POST", body });
  if (r.status >= 400) throw new Error(`Google Calendar ${r.status}: ${r.body.error?.message ?? ""}`);
  await prisma.calendarEvent.update({ where: { id: e.id }, data: { googleId: r.body.id, syncedAt: new Date() } });
  return r.body.id;
}

export async function deleteGoogleEvent(userId: string, googleId: string) {
  const r = await api<{ error?: { message?: string } }>(userId, `/calendars/primary/events/${encodeURIComponent(googleId)}?sendUpdates=all`, { method: "DELETE" });
  if (r.status >= 400 && r.status !== 404 && r.status !== 410) throw new Error(`Google Calendar ${r.status}: ${r.body.error?.message ?? ""}`);
}

/** Pull, and record the outcome for the health check. Never throws. */
export async function syncGoogle(userId: string) {
  try {
    const n = await pullEvents(userId);
    return { ok: true, changed: n };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.googleAccount.updateMany({ where: { userId }, data: { lastError: msg.slice(0, 300) } });
    return { ok: false, error: msg };
  }
}
