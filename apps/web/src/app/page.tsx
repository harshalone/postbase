import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      <div className="text-center flex flex-col items-center gap-4">
        <Image src="/logo.png" alt="Postbase" width={72} height={72} priority />
        <h1 className="text-5xl font-bold text-white">Postbase</h1>
        <p className="text-zinc-400 text-lg">
          Self-hosted auth + database platform for Next.js
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium transition-colors"
        >
          Open Dashboard
        </Link>
        <a
          href="https://github.com/your-org/postbase"
          className="px-6 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded-lg font-medium transition-colors"
        >
          GitHub
        </a>
      </div>
      <div className="grid grid-cols-3 gap-4 max-w-2xl w-full mt-8">
        {[
          { title: "25+ Auth Providers", desc: "Google, GitHub, Discord, Magic Link, Passkeys & more" },
          { title: "Database API", desc: "Query your PostgreSQL with anon/service keys + RLS" },
          { title: "File Storage", desc: "S3-compatible storage with bucket policies" },
        ].map((f) => (
          <div key={f.title} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900">
            <h3 className="font-semibold text-white mb-1">{f.title}</h3>
            <p className="text-zinc-400 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
