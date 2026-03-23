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

  const mustChange = (session.user as { mustChangeCredentials?: boolean })
    ?.mustChangeCredentials;

  if (mustChange) {
    redirect("/dashboard/setup");
  }

  return <>{children}</>;
}
