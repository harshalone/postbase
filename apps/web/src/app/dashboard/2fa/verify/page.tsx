"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense } from "react";

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // 1. Validate the TOTP code against the DB
    const verifyRes = await fetch("/api/auth/admin/verify-totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const verifyData = await verifyRes.json();

    if (!verifyData.ok) {
      setLoading(false);
      setError(verifyData.error ?? "Invalid code. Please try again.");
      return;
    }

    // 2. Update the NextAuth JWT to mark totpVerified = true
    await fetch("/api/auth/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totpVerified: true }),
    });

    setLoading(false);

    const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
    router.push(callbackUrl);
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-start justify-center px-4 pt-24">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/logo.png" alt="Postbase" width={48} height={48} priority />
          <h1 className="text-xl font-bold text-white">Two-factor authentication</h1>
          <p className="text-sm text-zinc-400 text-center">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Authentication code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 text-center tracking-widest font-mono focus:outline-none focus:border-brand-500"
              required
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="cursor-pointer w-full px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function TwoFactorVerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
