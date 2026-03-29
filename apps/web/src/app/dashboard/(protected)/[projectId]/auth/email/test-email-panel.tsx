"use client";

import { useState, useEffect } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TestEmailPanelProps {
  projectId: string;
  onClose: () => void;
  closing: boolean;
}

export function TestEmailPanel({ projectId, onClose, closing }: TestEmailPanelProps) {
  const toast = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Test email from Postbase");
  const [body, setBody] = useState("This is a test email to verify your email configuration is working correctly.");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!to || !subject || !body) return;
    setSending(true);
    try {
      const res = await fetch("/api/dashboard/email-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, to, subject, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Failed to send", data.error ?? "Something went wrong. Check your settings and try again.");
      } else {
        toast.success("Email sent!", `Test email delivered to ${to}`);
        onClose();
      }
    } catch {
      toast.error("Failed to send", "Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`slide-panel-backdrop fixed inset-0 z-40 bg-black/40 ${closing ? "closing" : ""}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`slide-panel fixed inset-y-0 right-0 z-50 w-[440px] bg-zinc-950 border-l border-zinc-800 flex flex-col shadow-2xl ${closing ? "closing" : ""}`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Send Test Email</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Verify your email configuration is working</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form id="test-email-form" onSubmit={handleSend} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">To</label>
            <input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Subject</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Test email subject"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Body</label>
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Email body..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-brand-500 placeholder:text-zinc-600 resize-none"
            />
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-xs text-zinc-500 leading-relaxed">
              The email will be sent using your saved configuration. Make sure you have saved your settings before testing.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="test-email-form"
            disabled={sending || !to || !subject || !body}
            className="cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
          >
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send size={14} />
                Send Test
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
