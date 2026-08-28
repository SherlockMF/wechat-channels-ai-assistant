"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Clapperboard,
  Database,
  FileSpreadsheet,
  Film,
  Flame,
  ScrollText,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/components/ui";
import { SetupBanner } from "@/features/settings/setup-banner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sitesMode = process.env.NEXT_PUBLIC_SITES_DEPLOYMENT === "true";
  const localMode = !sitesMode && process.env.NEXT_PUBLIC_APP_MODE !== "REAL";
  // 工作流顺序：脚本工作台 → 发布前审片 → 数据匹配 → 数据分析
  const navigation = [
    { href: "/scripts", label: "脚本工作台", icon: ScrollText },
    { href: "/hotspots", label: "研究热点", icon: Flame },
    { href: "/review", label: "发布前审片", icon: Clapperboard },
    sitesMode
      ? { href: "/imports/new", label: "数据匹配", icon: FileSpreadsheet }
      : {
          href: "/imports/local-source/matching",
          label: "数据匹配",
          icon: Database,
        },
    { href: "/analysis", label: "数据分析", icon: BarChart3 },
  ];
  const homeHref = "/scripts";
  const settingsActive = pathname.startsWith("/settings");
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/90 bg-[#f8faf8]/95 backdrop-blur">
        <div className="mx-auto flex min-h-[70px] max-w-[1560px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-0">
          <Link href={homeHref} className="flex items-center gap-3">
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
                  : item.href === "/review"
                    ? pathname.startsWith("/review")
                    : item.href === "/scripts"
                      ? pathname.startsWith("/scripts")
                      : item.href === "/hotspots"
                        ? pathname.startsWith("/hotspots")
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
            <Link
              href="/settings"
              aria-label="设置"
              title="设置"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition",
                settingsActive
                  ? "border-pine/30 bg-[#e9f0eb] text-pine"
                  : "border-line bg-white text-[#66736c] hover:bg-fog",
              )}
            >
              <Settings size={16} />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1560px] px-4 py-7 md:px-8 md:py-9">
        <SetupBanner />
        {children}
      </main>
    </div>
  );
}
