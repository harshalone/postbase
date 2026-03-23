import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/admin";

export default async function ProtectedDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/dashboard/login");
  }

  const user = session.user as {
    mustChangeCredentials?: boolean;
    totpEnabled?: boolean;
    totpVerified?: boolean;
  };

  if (user?.mustChangeCredentials) {
    redirect("/dashboard/setup");
  }

  if (user?.totpEnabled && !user?.totpVerified) {
    redirect("/dashboard/2fa/verify");
  }

  return <>{children}</>;
}
