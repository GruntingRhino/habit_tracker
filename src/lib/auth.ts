import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import {
  buildScopedRateLimitKeys,
  checkRateLimit,
  extractClientIp,
  resetRateLimit,
} from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const normalizedEmail = credentials.email.trim().toLowerCase();

        const rateLimitKeys = buildAuthRateLimitKeys(
          normalizedEmail,
          extractClientIp(req?.headers)
        );

        for (const rateLimitKey of rateLimitKeys) {
          const limit = await checkRateLimit(rateLimitKey);
          if (!limit.allowed) {
            throw new Error("Too many login attempts. Try again in 15 minutes.");
          }
        }

        const user = await prisma.user.findFirst({
          where: {
            email: normalizedEmail,
          },
        });

        if (!user) {
          return null;
        }

        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!passwordValid) {
          return null;
        }

        for (const rateLimitKey of rateLimitKeys) {
          await resetRateLimit(rateLimitKey);
        }
        return {
          id: user.id,
          email: user.email,
          username: user.username ?? undefined,
          name: user.name ?? undefined,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }

      const email = user.email?.trim().toLowerCase();
      if (!email) {
        return false;
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true },
      });

      if (!existingUser) {
        const generatedPassword = await bcrypt.hash(crypto.randomUUID(), 12);
        await prisma.user.create({
          data: {
            email,
            password: generatedPassword,
            name:
              user.name?.trim() ||
              (typeof profile?.name === "string" ? profile.name : null),
          },
        });
      } else if (!existingUser.name && user.name?.trim()) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { name: user.name.trim() },
        });
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.username =
          "username" in user && typeof user.username === "string"
            ? user.username
            : token.username;
        token.name = user.name;
      }

      if ((!token.id || !token.name || !token.username) && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: String(token.email).toLowerCase() },
          select: { id: true, email: true, username: true, name: true },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.email = dbUser.email;
          token.username = dbUser.username;
          token.name = dbUser.name;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.username = token.username as string | null | undefined;
        session.user.name = token.name as string | null | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

function buildAuthRateLimitKeys(identifier: string, ip: string | null): string[] {
  return buildScopedRateLimitKeys("auth", identifier, ip);
}

// Extend next-auth session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      username?: string | null;
      name?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username?: string | null;
  }
}
