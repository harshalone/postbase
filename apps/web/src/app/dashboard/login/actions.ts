"use server";

import { signIn } from "@/lib/auth/admin";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function loginAction(email: string, password: string, rememberMe = false) {
  // Fetch user flags before signIn so we can return them without needing auth()
  const [admin] = await db
    .select({ mustChangeCredentials: adminUsers.mustChangeCredentials, totpEnabled: adminUsers.totpEnabled })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  try {
    await signIn("credentials", {
      email,
      password,
      rememberMe: String(rememberMe),
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Invalid email or password." };
    }
    return { ok: false, error: "Invalid email or password." };
  }

  return {
    ok: true,
    mustChangeCredentials: admin?.mustChangeCredentials ?? false,
    totpEnabled: admin?.totpEnabled ?? false,
  };
}
