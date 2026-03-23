"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense } from "react";
import { loginAction } from "./actions";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await loginAction(email, password);

    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Invalid email or password.");
      return;
    }

    // Check mustChangeCredentials via the session endpoint
    const res = await fetch("/api/auth/admin/session");
    const session = await res.json();

    const user = session?.user as {
      mustChangeCredentials?: boolean;
      totpEnabled?: boolean;
    } | undefined;

    if (user?.mustChangeCredentials) {
      router.push("/dashboard/setup");
    } else if (user?.totpEnabled) {
      const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
      router.push(`/dashboard/2fa/verify?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    } else {
      const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
      router.push(callbackUrl);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-start justify-center px-4 pt-24">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/logo.png" alt="Postbase" width={48} height={48} priority />
          <h1 className="text-xl font-bold text-white">Sign in to Postbase</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Email</label>
            <input
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@getpostbase.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
              required
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="cursor-pointer w-full px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
