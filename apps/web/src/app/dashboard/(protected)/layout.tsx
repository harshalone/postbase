import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (!existing) {
    redirect("/setup");
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
