/**
 * Create (or reset) a login.
 *   npx tsx scripts/create-user.ts --username sam --name "Sam" --pronouns they
 *   npx tsx scripts/create-user.ts --owner --username abhay          (give the owner a login)
 * Prints a temporary password once; they change it in Profile → Account.
 */
import prisma from "@/lib/prisma";
import { hashPassword, newPassword } from "@/lib/auth";
import { getOwner } from "@/lib/users";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

(async () => {
  const username = arg("username")?.toLowerCase();
  if (!username || !/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error("--username: 3-30 letters, numbers, . _ -");
  const password = newPassword();
  const passwordHash = await hashPassword(password);
  let user;
  if (process.argv.includes("--owner")) {
    const owner = await getOwner();
    user = await prisma.user.update({ where: { id: owner.id }, data: { username, passwordHash, isAdmin: true, pronouns: "he", sessionVersion: { increment: 1 } } });
  } else {
    const pronouns = arg("pronouns") ?? "they";
    if (!["he", "she", "they"].includes(pronouns)) throw new Error("--pronouns: he, she or they");
    const name = arg("name") ?? username;
    user = await prisma.user.upsert({
      where: { username },
      update: { passwordHash, name, pronouns, sessionVersion: { increment: 1 } },
      create: { email: `${username}@liveimproved.local`, username, name, pronouns, passwordHash },
    });
  }
  console.log(`login ready: ${user.username} (${user.name}) — temporary password: ${password}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
