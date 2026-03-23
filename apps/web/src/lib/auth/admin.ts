/**
 * Admin auth — NextAuth instance for dashboard access.
 * Completely separate from per-project user auth.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/auth/admin",
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const [admin] = await db
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.email, credentials.email as string))
          .limit(1);

        if (!admin) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          admin.passwordHash
        );
        if (!valid) return null;

        return {
          id: admin.id,
          email: admin.email,
          mustChangeCredentials: admin.mustChangeCredentials,
          totpEnabled: admin.totpEnabled,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/dashboard/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session: sessionUpdate }) {
      if (user) {
        token.id = user.id;
        token.mustChangeCredentials = (user as { mustChangeCredentials?: boolean }).mustChangeCredentials ?? false;
        token.totpEnabled = (user as { totpEnabled?: boolean }).totpEnabled ?? false;
        // totpVerified starts false on every new login; set to true after TOTP verification
        token.totpVerified = false;
      }
      if (trigger === "update" && sessionUpdate?.totpVerified === true) {
        token.totpVerified = true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { mustChangeCredentials?: boolean }).mustChangeCredentials = token.mustChangeCredentials as boolean;
        (session.user as { totpEnabled?: boolean }).totpEnabled = token.totpEnabled as boolean;
        (session.user as { totpVerified?: boolean }).totpVerified = token.totpVerified as boolean;
      }
      return session;
    },
  },
});
