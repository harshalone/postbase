"use server";

import { auth, signOut } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function updateCredentialsAction(email: string, password: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not authenticated." };
  }

  if (!email || !password || password.length < 8) {
    return { ok: false, error: "Email and password (min 8 chars) are required." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db
    .update(adminUsers)
    .set({ email, passwordHash, mustChangeCredentials: false, updatedAt: new Date() })
    .where(eq(adminUsers.id, session.user.id));

  // Sign out so the user logs back in with the new credentials (refreshes JWT)
  await signOut({ redirect: false });

  return { ok: true };
}
