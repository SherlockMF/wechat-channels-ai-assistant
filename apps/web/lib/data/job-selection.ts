import type { AnalysisJob } from "@/lib/data/types";

function resultPriority(job: AnalysisJob): number {
  if (job.status !== "completed") return 0;
  if (job.currentStep === "codex_multimodal_completed") return 3;
  if (job.currentStep === "local_rule_completed") return 1;
  return 2;
}

export function selectPreferredAnalysisJob(
  jobs: AnalysisJob[],
  videoRecordId: string,
): AnalysisJob | null {
  return (
    jobs
      .filter((job) => job.videoRecordId === videoRecordId)
      .sort(
        (left, right) =>
          resultPriority(right) - resultPriority(left) ||
          new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
      )[0] ?? null
  );
}
