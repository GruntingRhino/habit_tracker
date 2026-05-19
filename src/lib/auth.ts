import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import {
  buildScopedRateLimitKeys,
  checkRateLimit,
  extractClientIp,
  resetRateLimit,
} from "@/lib/rate-limit";
import { normalizeUsername } from "@/lib/username";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.identifier || !credentials?.password) {
          return null;
        }

        const rawIdentifier = credentials.identifier.trim();
        const normalizedEmail = rawIdentifier.toLowerCase();
        const normalizedUsername = normalizeUsername(rawIdentifier);

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
            OR: [
              { email: normalizedEmail },
              { username: normalizedUsername },
            ],
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
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
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
