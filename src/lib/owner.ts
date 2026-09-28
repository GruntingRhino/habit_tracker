import prisma from "@/lib/prisma";

export interface OwnerSession {
  user: { id: string; email: string; name: string | null };
}

let cached: OwnerSession | null = null;

/** The app has exactly one user. Access is enforced by src/proxy.ts. */
export async function getOwner() {
  const email = (process.env.OWNER_EMAIL ?? "owner@local").toLowerCase();
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: process.env.OWNER_NAME ?? "Abhay" },
  });
}

export async function getOwnerSession(): Promise<OwnerSession> {
  if (cached) return cached;
  const user = await getOwner();
  cached = { user: { id: user.id, email: user.email, name: user.name } };
  return cached;
}
