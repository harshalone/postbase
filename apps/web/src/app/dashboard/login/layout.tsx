import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (!existing) {
    redirect("/setup");
  }

  return <>{children}</>;
}
