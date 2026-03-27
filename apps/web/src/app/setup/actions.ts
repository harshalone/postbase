"use server";

import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import bcrypt from "bcryptjs";

export async function createAdminAction(email: string, password: string) {
  if (!email || !password || password.length < 8) {
    return { ok: false, error: "Email and password (min 8 chars) are required." };
  }

  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (existing) {
    return { ok: false, error: "Admin already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(adminUsers).values({
    email,
    passwordHash,
    mustChangeCredentials: false,
  });

  return { ok: true };
}
