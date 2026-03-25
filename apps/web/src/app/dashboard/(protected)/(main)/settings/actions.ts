"use server";

import { auth } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not authenticated." };
  }

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }

  const [user] = await db
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.user.id));

  if (!user) {
    return { ok: false, error: "User not found." };
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db
    .update(adminUsers)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(adminUsers.id, session.user.id));

  return { ok: true };
}
