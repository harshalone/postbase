"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Copy, Check } from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export function CodeBlock({ code, language = "typescript" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const lineCount = code.split("\n").length;
  const height = Math.max(lineCount * 20 + 24, 60);

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-zinc-800 relative" style={{ height }}>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="cursor-pointer absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors border border-zinc-700"
      >
        {copied ? <><Check size={12} className="text-green-400" /> Copied</> : <><Copy size={12} /> Copy</>}
      </button>
      <MonacoEditor
        height="100%"
        language={language}
        theme="vs-dark"
        value={code}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: "off",
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 12,
          overviewRulerLanes: 0,
          renderLineHighlight: "none",
          padding: { top: 8, bottom: 8 },
          automaticLayout: true,
          wordWrap: "on",
          domReadOnly: true,
          scrollbar: { vertical: "hidden", horizontal: "hidden" },
        }}
      />
    </div>
  );
}
