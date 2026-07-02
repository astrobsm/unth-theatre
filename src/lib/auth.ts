import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        // Username matching is case-insensitive: staff can sign in with any
        // capitalisation (e.g. "AstroDouglas" == "astrodouglas").
        const user = await prisma.user.findFirst({
          where: { username: { equals: credentials.username.trim(), mode: 'insensitive' } }
        });

        if (!user) {
          throw new Error("User not found");
        }

        if (user.status !== "APPROVED") {
          throw new Error("Account pending approval");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error("Invalid password");
        }

        return {
          id: user.id,
          name: user.fullName,
          email: user.email,
          role: user.role,
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
  // Explicit cookie config so production (HTTPS) and dev behave deterministically.
  // Using __Secure- prefix in production hardens the cookie; relying on the default
  // can cause subtle mismatches between sign-in and getServerSession in some setups.
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: false,
};
