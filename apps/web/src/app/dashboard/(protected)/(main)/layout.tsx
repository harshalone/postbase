import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth/admin";
import { UserMenu } from "./user-menu";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const email = session?.user?.email ?? "";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between gap-3">
        <Link href="/dashboard" className="cursor-pointer flex items-center gap-2.5">
          <Image src="/logo.png" alt="Postbase" width={26} height={26} />
          <span className="font-bold text-white">Postbase</span>
        </Link>
        <UserMenu email={email} />
      </header>
      <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
