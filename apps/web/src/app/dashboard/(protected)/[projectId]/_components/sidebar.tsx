"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  Users,
  Database,
  HardDrive,
  Key,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Puzzle,
  Terminal,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview",      icon: LayoutDashboard, suffix: ""              },
  { label: "Auth Providers",icon: Shield,           suffix: "/auth"         },
  { label: "Users",         icon: Users,            suffix: "/users"        },
  { label: "Database",      icon: Database,         suffix: "/database"     },
  { label: "SQL Editor",    icon: Terminal,         suffix: "/sql"          },
  { label: "Storage",       icon: HardDrive,        suffix: "/storage"      },
  { label: "Integrations",  icon: Puzzle,           suffix: "/integrations" },
  { label: "API Keys",      icon: Key,              suffix: "/api-keys"     },
  { label: "Audit Logs",    icon: ScrollText,       suffix: "/logs"         },
  { label: "Settings",      icon: Settings,         suffix: "/settings"     },
];

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const base = `/dashboard/${projectId}`;

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((v) => {
      localStorage.setItem("sidebar-collapsed", String(!v));
      return !v;
    });
  }

  function isActive(suffix: string) {
    const href = base + suffix;
    if (suffix === "") return pathname === base;
    return pathname.startsWith(href);
  }

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-60"} border-r border-zinc-800 flex flex-col shrink-0 transition-all duration-200`}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        className="cursor-pointer p-4 border-b border-zinc-800 flex items-center gap-2.5 hover:bg-zinc-900 transition-colors h-14"
      >
        <Image src="/logo.png" alt="Postbase" width={28} height={28} className="shrink-0" />
        {!collapsed && <span className="font-bold text-lg text-white truncate">Postbase</span>}
      </Link>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.suffix);
          return (
            <Link
              key={item.suffix}
              href={base + item.suffix}
              title={collapsed ? item.label : undefined}
              className={`cursor-pointer flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="cursor-pointer m-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors border border-zinc-800"
      >
        {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
      </button>
    </aside>
  );
}
