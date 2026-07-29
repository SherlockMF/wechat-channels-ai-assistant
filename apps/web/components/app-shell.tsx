"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Database,
  FileSpreadsheet,
  Film,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/components/ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const localMode = process.env.NEXT_PUBLIC_APP_MODE !== "REAL";
  const navigation = localMode
    ? [
        {
          href: "/imports/local-source/matching",
          label: "真实数据",
          icon: Database,
        },
        { href: "/analysis", label: "分析队列", icon: BarChart3 },
      ]
    : [
        { href: "/imports/new", label: "创建分析", icon: FileSpreadsheet },
        { href: "/analysis", label: "分析队列", icon: BarChart3 },
      ];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/90 bg-[#f8faf8]/95 backdrop-blur">
        <div className="mx-auto flex min-h-[70px] max-w-[1560px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-0">
          <Link href={localMode ? "/analysis" : "/imports/new"} className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-white">
              <Film size={18} />
            </span>
            <span>
              <span className="block font-display text-base font-semibold leading-none">
                视频号内容诊断助手
              </span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-[#78857e]">
                Content Review Desk
              </span>
            </span>
          </Link>
          <nav className="order-3 flex w-full items-center justify-center gap-1 rounded-xl border border-line bg-white p-1 md:order-none md:w-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/analysis"
                  ? pathname === "/analysis" || pathname.startsWith("/videos/")
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
                    active
                      ? "bg-[#e9f0eb] text-pine"
                      : "text-[#66736c] hover:bg-fog",
                  )}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            {localMode && (
              <span className="hidden items-center gap-1.5 rounded-full border border-[#b9d4c4] bg-[#f2f8f4] px-3 py-1.5 text-xs font-bold text-pine sm:inline-flex">
                <Database size={12} />
                真实本地数据
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#68766f]">
              <ShieldCheck size={15} className="text-pine" />
              文件默认私有
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1560px] px-4 py-7 md:px-8 md:py-9">{children}</main>
    </div>
  );
}
