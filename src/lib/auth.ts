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

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const rateLimitKeys = buildAuthRateLimitKeys(
          credentials.email,
          extractClientIp(req?.headers)
        );

        for (const rateLimitKey of rateLimitKeys) {
          const limit = await checkRateLimit(rateLimitKey);
          if (!limit.allowed) {
            throw new Error("Too many login attempts. Try again in 15 minutes.");
          }
        }

        // Support login by email OR username (name field)
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: credentials.email },
              { name: { equals: credentials.email, mode: "insensitive" } },
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
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
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
      name?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
  }
}
