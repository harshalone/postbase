"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import { Shield, Mail, FileText } from "lucide-react";

const TABS = [
  {
    label: "Providers",
    icon: Shield,
    suffix: "",
    description: "Configure OAuth, social and enterprise login providers",
  },
  {
    label: "Email Settings",
    icon: Mail,
    suffix: "/email",
    description: "Configure SMTP or AWS SES for sending auth emails",
  },
  {
    label: "Templates",
    icon: FileText,
    suffix: "/templates",
    description: "Customize magic link and OTP email templates",
  },
];

export default function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const pathname = usePathname();
  const base = `/dashboard/${projectId}/auth`;

  function isActive(suffix: string) {
    if (suffix === "") {
      return pathname === base;
    }
    return pathname.startsWith(base + suffix);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header & Tab bar combined */}
      <div className="flex items-center px-6 h-14 border-b border-zinc-800 shrink-0 bg-zinc-950">
        <div className="flex items-center gap-1 h-full">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.suffix);
            return (
              <Link
                key={tab.suffix}
                href={base + tab.suffix}
                title={tab.description}
                className={`flex items-center gap-1.5 px-3 h-full text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? "border-brand-500 text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
