"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { updateCredentialsAction } from "./actions";

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await updateCredentialsAction(email, password);
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }

    // Redirect to login — credentials changed, must sign in fresh
    router.push("/dashboard/login");
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/logo.png" alt="Postbase" width={48} height={48} priority />
          <h1 className="text-xl font-bold text-white">Set your credentials</h1>
          <p className="text-sm text-zinc-400 text-center">
            Update your admin email and password before continuing.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-zinc-400 mb-1">New email</label>
            <input
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500"
              required
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password || !confirm}
            className="cursor-pointer w-full px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save and continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
