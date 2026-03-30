"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import {
  Table2,
  FunctionSquare,
  Zap,
  List,
  Blocks,
  GitBranch,
  Radio,
} from "lucide-react";

const DATABASE_NAV = [
  { label: "Tables",           icon: Table2,          suffix: "/tables" },
  { label: "Functions",        icon: FunctionSquare,  suffix: "/functions" },
  { label: "Triggers",         icon: Zap,             suffix: "/triggers" },
  { label: "Enumerated Types", icon: List,            suffix: "/enums" },
  { label: "Extensions",       icon: Blocks,          suffix: "/extensions" },
  { label: "Indexes",          icon: GitBranch,       suffix: "/indexes" },
  { label: "Publications",     icon: Radio,           suffix: "/publications" },
];

export default function DatabaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params.projectId as string;
  const base = `/dashboard/${projectId}/database`;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sub-navigation sidebar */}
      <div className="w-56 border-r border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
        <div className="px-5 py-5">
          <h2 className="text-sm font-semibold text-white">Database</h2>
        </div>
        <nav className="px-3 pb-3 space-y-0.5">
          {DATABASE_NAV.map((item) => {
            const href = base + item.suffix;
            const active =
              pathname === href || pathname.startsWith(href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.suffix}
                href={href}
                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                  active
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
