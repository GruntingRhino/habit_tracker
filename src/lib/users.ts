/** The people who use the app (no web-request code here: the worker and brain import it). */
import prisma from "@/lib/prisma";

/**
 * The owner (Abhay): the server-side worker and brain use this for owner-only things
 * (health alerts). Everything per person goes through getOwnerSession / the users list.
 */
export async function getOwner() {
  const email = (process.env.OWNER_EMAIL ?? "owner@local").toLowerCase();
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: process.env.OWNER_NAME ?? "Abhay", pronouns: "he", isAdmin: true, integrations: true },
  });
}

/** Everyone who can log in (the worker and brain run per person). */
export async function activeUsers() {
  const owner = await getOwner();
  const others = await prisma.user.findMany({ where: { passwordHash: { not: null }, id: { not: owner.id } } });
  return [owner, ...others];
}
