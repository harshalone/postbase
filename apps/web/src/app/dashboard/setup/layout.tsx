import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/admin";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Must be logged in to see this page
  if (!session) {
    redirect("/dashboard/login");
  }

  // If credentials are already set, go to dashboard
  const mustChange = (session.user as { mustChangeCredentials?: boolean })
    ?.mustChangeCredentials;

  if (!mustChange) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
