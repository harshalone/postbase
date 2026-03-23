"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { generateTotpSetupAction, enableTotpAction } from "../actions";

type Step = "loading" | "scan" | "verify" | "done";

export default function TwoFactorSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    generateTotpSetupAction().then((res) => {
      if (!res.ok) {
        router.push("/dashboard/login");
        return;
      }
      setSecret(res.secret!);
      setQrDataUrl(res.qrDataUrl!);
      setStep("scan");
    });
  }, [router]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await enableTotpAction(secret, code);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Invalid code.");
      return;
    }
    setStep("done");
  }

  if (step === "loading") {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-start justify-center px-4 pt-24">
        <p className="text-zinc-400 text-sm">Generating QR code…</p>
      </main>
    );
  }

  if (step === "done") {
    return (
      <main className="min-h-screen bg-zinc-950 flex items-start justify-center px-4 pt-24">
        <div className="w-full max-w-sm text-center">
          <div className="flex flex-col items-center mb-8 gap-3">
            <Image src="/logo.png" alt="Postbase" width={48} height={48} priority />
            <h1 className="text-xl font-bold text-white">2FA enabled</h1>
            <p className="text-sm text-zinc-400">
              Two-factor authentication is now active on your account.
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="cursor-pointer w-full px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
          >
            Go to dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex items-start justify-center px-4 pt-24">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image src="/logo.png" alt="Postbase" width={48} height={48} priority />
          <h1 className="text-xl font-bold text-white">Set up two-factor authentication</h1>
          <p className="text-sm text-zinc-400 text-center">
            Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
          {/* Step 1 — QR code */}
          <div>
            <p className="text-xs text-zinc-400 mb-3 font-medium uppercase tracking-wide">
              Step 1 — Scan QR code
            </p>
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="TOTP QR code"
                className="rounded-lg bg-white p-2"
                width={180}
                height={180}
              />
            </div>
            <details className="mt-3">
              <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">
                Can&apos;t scan? Enter the key manually
              </summary>
              <p className="mt-2 text-xs font-mono text-zinc-300 bg-zinc-800 rounded px-3 py-2 break-all select-all">
                {secret}
              </p>
            </details>
          </div>

          {/* Step 2 — Verify */}
          <div>
            <p className="text-xs text-zinc-400 mb-3 font-medium uppercase tracking-wide">
              Step 2 — Verify code
            </p>
            <form onSubmit={handleVerify} className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 text-center tracking-widest font-mono focus:outline-none focus:border-brand-500"
                required
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="cursor-pointer w-full px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? "Verifying…" : "Enable 2FA"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
