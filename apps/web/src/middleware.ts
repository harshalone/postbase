import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/admin";

/**
 * Every /api/dashboard/* route serves the admin dashboard and must only be
 * reachable by an authenticated admin — these routes have no per-project
 * ownership check of their own (there is a single admin, per admin.ts), so
 * this is the only gate. Mirrors the session + TOTP check used by
 * dashboard/(protected)/layout.tsx for page navigation.
 */
export default auth((req) => {
  const session = req.auth;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { totpEnabled?: boolean; totpVerified?: boolean } | undefined;
  if (user?.totpEnabled && !user.totpVerified) {
    return NextResponse.json({ error: "TOTP verification required" }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/api/dashboard/:path*"],
  // admin.ts pulls in bcryptjs + the pg-backed drizzle db client for its
  // Credentials provider, neither of which run in the default Edge runtime.
  runtime: "nodejs",
};
