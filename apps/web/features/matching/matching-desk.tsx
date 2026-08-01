"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/components/ui";
import { MatchWorkspace } from "@/features/matching/match-workspace";
import { MatchingBatchUpload } from "@/features/matching/matching-batch-upload";

export function MatchingDesk({ defaultImportId }: { defaultImportId: string }) {
  const searchParams = useSearchParams();
  const initialTab =
    searchParams.get("tab") === "upload" ? "upload" : "local";
  const [tab, setTab] = useState<"local" | "upload">(initialTab);
  const [uploadedImportId, setUploadedImportId] = useState<string | null>(
    searchParams.get("importId"),
  );

  const reviewImportId = useMemo(
    () => uploadedImportId ?? defaultImportId,
    [uploadedImportId, defaultImportId],
  );

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-line bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("local")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-semibold transition",
            tab === "local" ? "bg-[#e9f0eb] text-pine" : "text-[#66736c] hover:bg-fog",
          )}
        >
          本地数据源
        </button>
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-semibold transition",
            tab === "upload" ? "bg-[#e9f0eb] text-pine" : "text-[#66736c] hover:bg-fog",
          )}
        >
          上传新批次
        </button>
      </div>

      {tab === "local" ? (
        <MatchWorkspace importId={defaultImportId} />
      ) : (
        <div className="space-y-8">
          <MatchingBatchUpload
            onCompleted={(importId) => {
              setUploadedImportId(importId);
            }}
          />
          {uploadedImportId && (
            <div className="space-y-3">
              <h2 className="font-display text-xl font-semibold">本批次匹配复核</h2>
              <MatchWorkspace importId={reviewImportId} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
