"use client";

import { useState } from "react";
import { CopyButton } from "./copy-button";
import { ResetButton } from "./reset-button";

export function KeyRow({
  projectId,
  label,
  description,
  initialValue,
  type,
  badge,
}: {
  projectId: string;
  label: string;
  description: string;
  initialValue: string;
  type: "anon" | "service_role";
  badge: "public" | "secret";
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            badge === "public"
              ? "bg-brand-900 text-brand-400"
              : "bg-red-950 text-red-400"
          }`}
        >
          {badge}
        </span>
      </div>
      <p className="text-xs text-zinc-500 mb-2">{description}</p>
      <div className="flex items-start gap-2">
        <code className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-300 font-mono break-all">
          {value}
        </code>
        <div className="flex items-center gap-1 shrink-0">
          <CopyButton value={value} />
          <ResetButton projectId={projectId} type={type} onReset={setValue} />
        </div>
      </div>
    </div>
  );
}
