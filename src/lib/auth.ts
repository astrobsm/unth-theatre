import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sessionCookieConfig } from "@/lib/authCookies";
import {
  failureMessage,
  verifyStaffCredentials,
  type CredentialDeps,
} from "@/lib/staffCredentials";

// The database side of credential checking, kept here so staffCredentials.ts
// stays free of Prisma and can be tested without one.
const prismaCredentialDeps: CredentialDeps = {
  // Case-insensitive: staff sign in with any capitalisation, so
  // "AstroDouglas" and "astrodouglas" are the same account.
  findByUsername: (username) =>
    prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    }),
  // Matches both stored shapes at once — "08031234567" and "+2348031234567"
  // share their last ten digits.
  findByPhoneSuffix: (last10) =>
    prisma.user.findMany({ where: { phoneNumber: { endsWith: last10 } } }),
  comparePassword: (plain, hash) => bcrypt.compare(plain, hash),
};

// Evaluated once at module load, exactly as NextAuth does with its own
// useSecureCookies, so the session cookie and the CSRF cookie always agree.
const SESSION_COOKIE = sessionCookieConfig(process.env.NEXTAUTH_URL);

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Username OR phone number, using exactly the same check as the Wi-Fi
        // captive portal so the two can never disagree about who may sign in.
        // See lib/staffCredentials.ts, including why a phone number is not
        // always sufficient on its own.
        const result = await verifyStaffCredentials(
          prismaCredentialDeps,
          credentials?.username,
          credentials?.password
        );

        if (!result.ok) {
          // These messages reach the sign-in screen, so they say what to do
          // next rather than merely what went wrong.
          throw new Error(failureMessage(result.reason));
        }

        return {
          id: result.user.id,
          name: result.user.fullName,
          email: result.user.email,
          role: result.user.role,
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      // Load per-user module grants from DB. We refresh on initial sign-in
      // and whenever the session is explicitly updated (via update()).
      // Resilient: if the table doesn't exist yet (pre-`prisma db push` on
      // production), default to empty so logins keep working.
      if (user || trigger === "update" || token.extraModules === undefined) {
        try {
          const uid = (user?.id as string) || (token.id as string);
          if (uid) {
            const grants = await prisma.userModuleGrant.findMany({
              where: { userId: uid },
              select: { moduleId: true },
            });
            token.extraModules = grants.map((g) => g.moduleId);
          } else {
            token.extraModules = [];
          }
        } catch (e: any) {
          if (e?.code === "P2021" || String(e?.message || "").includes("user_module_grants")) {
            console.warn("[auth.jwt] user_module_grants table missing — run prisma db push on this DB. Continuing without grants.");
          } else {
            console.error("[auth.jwt] failed to load module grants:", e);
          }
          token.extraModules = token.extraModules || [];
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.extraModules = (token.extraModules as string[]) || [];
      }
      return session;
    }
  },
  pages: {
    signIn: "/auth/login",
  },
  events: {
    async signIn({ user }) {
      try {
        if (user?.id) {
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: "LOGIN",
              tableName: "users",
              recordId: user.id,
            },
          });
        }
      } catch (e) {
        console.error("[auth.events.signIn] failed to record audit log:", e);
      }
    },
    async signOut({ token }) {
      try {
        const uid = (token as any)?.id;
        if (uid) {
          await prisma.auditLog.create({
            data: {
              userId: uid,
              action: "LOGOUT",
              tableName: "users",
              recordId: uid,
            },
          });
        }
      } catch (e) {
        console.error("[auth.events.signOut] failed to record audit log:", e);
      }
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },
  // Explicit cookie config, keyed on the ORIGIN rather than on NODE_ENV.
  //
  // This previously used NODE_ENV === "production", which made sign-in
  // impossible on the hospital's local server: that runs `next start` (so
  // NODE_ENV is production) over plain http on a LAN address, and browsers
  // reject a `__Secure-`-prefixed cookie that was not set over a secure
  // channel. See lib/authCookies.ts for the full account.
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE.name,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: SESSION_COOKIE.secure,
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: false,
};
