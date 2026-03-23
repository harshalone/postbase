"use server";

import { signOut } from "@/lib/auth/admin";

export async function signOutAction() {
  await signOut({ redirectTo: "/dashboard/login" });
}
