/**
 * Day boundaries, "today" and chrono-node date parsing all use the process timezone.
 * Vercel reserves TZ (functions run in UTC), so the zone comes from APP_TZ instead.
 * Node picks up a runtime change to process.env.TZ, and register() runs before any request.
 */
export function register() {
  if (process.env.APP_TZ) process.env.TZ = process.env.APP_TZ;
}
