import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
    if (!existing) {
      redirect("/setup");
    }
  } catch (error) {
    console.error("[ProtectedDashboardLayout] Database error:", error);
    throw error;
  }

  const session = await auth();
  if (!session) {
    redirect("/dashboard/login");
  }

  if (session.user as { totpEnabled?: boolean; totpVerified?: boolean }) {
    const user = session.user as { totpEnabled?: boolean; totpVerified?: boolean };
    if (user.totpEnabled && !user.totpVerified) {
      redirect("/dashboard/2fa/verify");
    }
  }

  return <>{children}</>;
}
