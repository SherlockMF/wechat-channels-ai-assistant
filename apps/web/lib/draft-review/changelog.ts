import type { DiagnosisResult } from "@video-diagnosis/shared-types";
import type { DraftReviewChangelog, DraftReviewChangelogItem } from "@video-diagnosis/shared-types";

type Problem = DiagnosisResult["primaryProblems"][number];

const categoryLabel: Record<Problem["category"], string> = {
  hook: "开头钩子",
  copy: "文案表达",
  visual: "视觉呈现",
  subtitle: "字幕信息",
  pacing: "内容节奏",
  audio: "声音设计",
  structure: "内容结构",
};

function overlapRatio(a: Problem, b: Problem): number {
  const start = Math.max(a.startSecond, b.startSecond);
  const end = Math.min(a.endSecond, b.endSecond);
  if (end <= start) return 0;
  const overlap = end - start;
  const shorter = Math.min(a.endSecond - a.startSecond, b.endSecond - b.startSecond);
  return shorter > 0 ? overlap / shorter : 0;
}

function toItem(problem: Problem, summary: string): DraftReviewChangelogItem {
  return {
    category: problem.category,
    summary,
    startSecond: problem.startSecond,
    endSecond: problem.endSecond,
  };
}

/** 相对上一版诊断，规则匹配生成改版对照。 */
export function buildVersionChangelog(
  previous: DiagnosisResult | null,
  next: DiagnosisResult,
): DraftReviewChangelog {
  const prevProblems = previous?.primaryProblems ?? [];
  const nextProblems = next.primaryProblems ?? [];

  if (prevProblems.length === 0) {
    return {
      improved: [],
      remaining: [],
      newIssues: nextProblems.map((problem) =>
        toItem(
          problem,
          `${categoryLabel[problem.category]}：${problem.inference}`,
        ),
      ),
    };
  }

  const matchedPrev = new Set<number>();
  const remaining: DraftReviewChangelogItem[] = [];
  const newIssues: DraftReviewChangelogItem[] = [];

  for (const nextProblem of nextProblems) {
    let bestIndex = -1;
    let bestScore = 0;
    prevProblems.forEach((prevProblem, index) => {
      if (matchedPrev.has(index)) return;
      if (prevProblem.category !== nextProblem.category) return;
      const score = overlapRatio(prevProblem, nextProblem);
      // 同类即可弱匹配；有时间重叠更优先
      const effective = score > 0 ? score : 0.15;
      if (effective > bestScore) {
        bestScore = effective;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= 0.15) {
      matchedPrev.add(bestIndex);
      remaining.push(
        toItem(
          nextProblem,
          `${categoryLabel[nextProblem.category]}仍存在：${nextProblem.inference}`,
        ),
      );
    } else {
      newIssues.push(
        toItem(
          nextProblem,
          `${categoryLabel[nextProblem.category]}：${nextProblem.inference}`,
        ),
      );
    }
  }

  const improved = prevProblems
    .filter((_, index) => !matchedPrev.has(index))
    .map((problem) =>
      toItem(
        problem,
        `${categoryLabel[problem.category]}已改善（原：${problem.inference}）`,
      ),
    );

  return { improved, remaining, newIssues };
}
