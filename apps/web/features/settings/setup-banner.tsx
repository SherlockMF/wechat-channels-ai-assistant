"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui";

export function SetupBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/settings")) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/settings/providers");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          settings: { setupCompleted: boolean; dismissWizard: boolean };
        };
        if (cancelled) return;
        setVisible(
          !payload.settings.setupCompleted && !payload.settings.dismissWizard,
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[#ead1a9] bg-[#fff8ee] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-[#9c5f17]">
        首次使用：请完成环境检测与 API 配置，确保全部功能可用。
      </p>
      <div className="flex items-center gap-2">
        <Link href="/settings">
          <Button type="button" size="sm">
            打开设置向导
          </Button>
        </Link>
        <button
          type="button"
          aria-label="关闭提醒"
          className="rounded-lg p-1.5 text-[#9c5f17] hover:bg-[#f5e6d0]"
          onClick={() => setVisible(false)}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
