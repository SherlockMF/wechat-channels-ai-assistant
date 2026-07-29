import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

async function replace(relativePath, before, after) {
  const target = path.join(root, relativePath);
  const source = await fs.readFile(target, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`找不到待替换内容：${relativePath}`);
  }
  await fs.writeFile(target, source.replace(before, after), "utf8");
}

await replace(
  "apps/web/lib/data/local-repository.ts",
  '      analysisMode: "local_rule" as const,',
  `      analysisMode:
        job?.currentStep === "codex_multimodal_completed"
          ? ("codex_multimodal" as const)
          : ("local_rule" as const),`,
);

await replace(
  "apps/web/features/videos/video-diagnosis.tsx",
  '  analysisMode: "local_rule" | "worker";',
  '  analysisMode: "local_rule" | "codex_multimodal" | "worker";',
);

await replace(
  "apps/web/features/videos/video-diagnosis.tsx",
  `                {payload.analysisMode === "local_rule"
                  ? "本地规则诊断"
                  : "Worker 内容诊断"}`,
  `                {payload.analysisMode === "local_rule"
                  ? "本地规则诊断"
                  : payload.analysisMode === "codex_multimodal"
                    ? "Codex 多模态诊断"
                    : "Worker 内容诊断"}`,
);

await replace(
  "apps/web/features/analysis/analysis-queue.tsx",
  '    local_rule_completed: "本地规则诊断完成",',
  `    local_rule_completed: "本地规则诊断完成",
    codex_multimodal_completed: "Codex 多模态诊断完成",`,
);

console.log("Codex analysis mode UI updated.");
