import { createHash } from "node:crypto";
import {
  viralResearchSnapshotSchema,
  type ImportedVideoRecord,
  type ViralResearchItem,
  type ViralResearchTopicCard,
} from "@video-diagnosis/shared-types";
import { normalizeOwnerId } from "@/lib/data/owner";
import { requiredEvidenceForTopic } from "@/lib/tracks/dictionary";
import {
  applyOwnerAccountFit,
  selectOwnedHistoryItems,
} from "@/lib/viral-research/account-fit";
import { viralSamplesToResearchItems } from "@/lib/viral-research/samples";
import {
  createViralResearchSnapshotId,
  isViralResearchSnapshotExpired,
  readCachedViralResearchSnapshot,
  viralResearchContextFingerprint,
  writeViralResearchSnapshot,
} from "@/lib/viral-research/cache";
import { resolveViralResearchConfig } from "@/lib/viral-research/config";
import { searchDashScope } from "@/lib/viral-research/dashscope";
import {
  clipResearchText,
  enforceResearchItemPolicy,
  filterResearchItemsByQuery,
  type ResearchRelevanceJudgement,
} from "@/lib/viral-research/source-policy";
import {
  VIRAL_RESEARCH_CACHE_TTL_MS,
  viralResearchRequestSchema,
  type ResearchAdapterResult,
  type ViralResearchRequest,
  type ViralResearchQuery,
  type ViralResearchServiceOptions,
  type ViralResearchServiceResult,
} from "@/lib/viral-research/types";

function topicCardId(snapshotId: string, title: string): string {
  return `topic-${createHash("sha256")
    .update(`${snapshotId}:${title}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function topicCardsFromAnalysis(
  snapshotId: string,
  dashscope: ResearchAdapterResult,
  allowedDashIds: Set<string>,
): ViralResearchTopicCard[] {
  if (!dashscope.analysis || allowedDashIds.size < 1) return [];
  const sourceIdsByIndex = new Map<number, string>();
  for (const item of dashscope.items) {
    if (item.sourceIndex && allowedDashIds.has(item.id)) {
      sourceIdsByIndex.set(item.sourceIndex, item.id);
    }
  }
  return dashscope.analysis.topicCards
    .map((card) => ({
      id: topicCardId(snapshotId, card.title),
      title: card.title,
      whyNow: card.whyNow,
      targetAudience: card.targetAudience,
      sourceIds: [
        ...new Set(
          card.sourceIndexes
            .map((index) => sourceIdsByIndex.get(index))
            .filter((id): id is string => Boolean(id)),
        ),
      ],
      reusableStructures: card.reusableStructures,
      originalAngle: card.originalAngle,
      requiredEvidence: card.requiredEvidence,
      productionCost: card.productionCost,
      risks: card.risks,
      evidenceStrength: "weak" as const,
    }))
    .filter((card) => card.sourceIds.length >= 1)
    .slice(0, 3);
}

function textBigrams(value: string): Set<string> {
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

function patternSourceScore(pattern: string, source: ViralResearchItem): number {
  const expected = textBigrams(pattern);
  const observed = textBigrams(`${source.title} ${source.snippet ?? ""}`);
  if (!expected.size || !observed.size) return 0;
  let matches = 0;
  for (const token of expected) if (observed.has(token)) matches += 1;
  return matches / expected.size;
}

function topicCardsFromCommonPatterns(
  snapshotId: string,
  query: ViralResearchQuery,
  dashscope: ResearchAdapterResult,
  externalItems: ViralResearchItem[],
): ViralResearchTopicCard[] {
  if (!dashscope.analysis?.commonPatterns.length || externalItems.length < 1) {
    return [];
  }
  const seenSourceSets = new Set<string>();
  return dashscope.analysis.commonPatterns.flatMap((pattern) => {
    const sources = externalItems
      .map((source, position) => ({
        source,
        position,
        score: patternSourceScore(pattern, source),
      }))
      .sort((left, right) => right.score - left.score || left.position - right.position)
      .slice(0, 3)
      .map(({ source }) => source);
    if (sources.length < 1) return [];
    const sourceIds = sources.map((source) => source.id);
    const sourceKey = [...sourceIds].sort().join("|");
    if (seenSourceSets.has(sourceKey)) return [];
    seenSourceSets.add(sourceKey);
    const summary = pattern.split(/[：:。；;]/u)[0]?.trim() || "主题共性结构";
    return [
      {
        id: topicCardId(snapshotId, summary),
        title: clipResearchText(summary, 42) ?? "主题共性结构",
        whyNow:
          "由本次主题相关的公开资料归纳，是内容结构候选，不代表已被验证的爆款。",
        targetAudience:
          query.audience ?? "与本次主题存在明确需求的目标用户",
        sourceIds,
        reusableStructures: [pattern],
        originalAngle: `结合${query.region ?? "本地"}真实项目、客户问题和可拍素材重新取材，不复述来源表达。`,
        requiredEvidence: requiredEvidenceForTopic(query.topic),
        productionCost: "medium" as const,
        risks: ["外部热度未经公开指标验证", "发布前需逐条核对来源与事实"],
        evidenceStrength: "weak" as const,
      },
    ];
  }).slice(0, 3);
}

/** 卡片证据强度取其引用来源里最强的一档。 */
function cardEvidenceStrength(
  sourceIds: string[],
  levelById: ReadonlyMap<string, ViralResearchItem["evidenceLevel"]>,
): ViralResearchTopicCard["evidenceStrength"] {
  const levels = sourceIds.map((id) => levelById.get(id));
  if (
    levels.includes("platform_page") ||
    levels.includes("verified_metric")
  ) {
    return "platform_sourced";
  }
  if (levels.includes("media_article")) return "media_sourced";
  return "weak";
}

function completeTopicCards(
  snapshotId: string,
  query: ViralResearchQuery,
  dashscope: ResearchAdapterResult,
  allowedDashIds: Set<string>,
  externalItems: ViralResearchItem[],
): ViralResearchTopicCard[] {
  const analyzed = topicCardsFromAnalysis(snapshotId, dashscope, allowedDashIds);
  const candidates = analyzed.length
    ? analyzed
    : topicCardsFromCommonPatterns(snapshotId, query, dashscope, externalItems);
  const levelById = new Map(
    externalItems.map((item) => [item.id, item.evidenceLevel] as const),
  );
  const seenTitles = new Set<string>();
  const seenSourceSets = new Set<string>();
  return candidates
    .filter((card) => {
      const titleKey = card.title.toLowerCase();
      const sourceKey = [...card.sourceIds].sort().join("|");
      if (seenTitles.has(titleKey) || seenSourceSets.has(sourceKey)) return false;
      seenTitles.add(titleKey);
      seenSourceSets.add(sourceKey);
      return true;
    })
    .slice(0, 3)
    .map((card) => ({
      ...card,
      evidenceStrength: cardEvidenceStrength(card.sourceIds, levelById),
    }));
}

async function ownerHistory(
  options: ViralResearchServiceOptions,
): Promise<{ records: ImportedVideoRecord[]; error?: string }> {
  if (options.ownedHistory) return { records: options.ownedHistory };
  if (!options.loadOwnedHistory) return { records: [] };
  try {
    return { records: await options.loadOwnedHistory() };
  } catch {
    return {
      records: [],
      error: "账号历史读取失败，本次适配度标记为 unknown",
    };
  }
}

async function manualSamples(
  options: ViralResearchServiceOptions,
): Promise<import("@video-diagnosis/shared-types").ViralSample[]> {
  if (options.viralSamples) return options.viralSamples;
  if (!options.loadViralSamples) return [];
  try {
    return await options.loadViralSamples();
  } catch {
    return [];
  }
}

function uniqueReasons(...reasons: Array<string | undefined>): string[] {
  return [...new Set(reasons.filter((reason): reason is string => Boolean(reason)))];
}

/** 联网结果拿不到互动指标，按证据、新鲜度和账号适配共同排序。 */
const EXTERNAL_EVIDENCE_RANK: Record<string, number> = {
  verified_metric: 4,
  platform_page: 3,
  media_article: 2,
  public_source: 1,
};

function externalEvidenceScore(item: ViralResearchItem): number {
  return (EXTERNAL_EVIDENCE_RANK[item.evidenceLevel] ?? 0) * 100;
}

const FUTURE_DATE_TOLERANCE_MS = 5 * 60 * 1000;

function parsedPublishedAt(item: ViralResearchItem): number | undefined {
  if (!item.publishedAt) return undefined;
  const parsed = Date.parse(item.publishedAt);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sourceIsInsideFreshnessWindow(
  item: ViralResearchItem,
  now: Date,
  freshnessDays: number,
): boolean {
  const publishedAt = parsedPublishedAt(item);
  if (publishedAt === undefined) return true;
  const nowMs = now.getTime();
  if (publishedAt > nowMs + FUTURE_DATE_TOLERANCE_MS) return false;
  return publishedAt >= nowMs - freshnessDays * 24 * 60 * 60 * 1000;
}

function externalFreshnessScore(
  item: ViralResearchItem,
  now: Date,
  freshnessDays: number,
): number {
  const publishedAt = parsedPublishedAt(item);
  if (publishedAt === undefined) return 5;
  const ageDays = Math.max(0, now.getTime() - publishedAt) / (24 * 60 * 60 * 1000);
  return Math.max(10, 30 * (1 - ageDays / Math.max(1, freshnessDays)));
}

function accountFitScore(item: ViralResearchItem): number {
  switch (item.accountFit?.level) {
    case "high":
      return 20;
    case "medium":
      return 10;
    case "unknown":
      return 5;
    default:
      return 0;
  }
}

function externalResearchScore(
  item: ViralResearchItem,
  now: Date,
  freshnessDays: number,
): number {
  return (
    externalEvidenceScore(item) +
    externalFreshnessScore(item, now, freshnessDays) +
    accountFitScore(item)
  );
}

function relevanceJudgementsById(
  dashscope: ResearchAdapterResult,
): Map<string, ResearchRelevanceJudgement> {
  const judgements = new Map<string, ResearchRelevanceJudgement>();
  const byIndex = new Map(
    (dashscope.analysis?.sourceJudgements ?? []).map(
      (judgement) => [judgement.index, judgement] as const,
    ),
  );
  for (const item of dashscope.items) {
    const judgement =
      item.sourceIndex === undefined ? undefined : byIndex.get(item.sourceIndex);
    if (!judgement) continue;
    judgements.set(item.id, {
      relevant: judgement.relevant,
      kind: judgement.kind,
      reason: judgement.reason,
    });
  }
  return judgements;
}

export async function researchViralVideos(
  ownerId: string,
  request: ViralResearchRequest,
  options: ViralResearchServiceOptions = {},
): Promise<ViralResearchServiceResult> {
  const input = viralResearchRequestSchema.parse(request);
  const owner = normalizeOwnerId(ownerId);
  const config = options.config ?? (await resolveViralResearchConfig());
  const now = options.now?.() ?? new Date();
  const model = config.dashscope.model;
  // 个性化上下文必须先于缓存读取，避免新增样本或账号数据后继续命中旧快照。
  const [history, samples] = await Promise.all([
    ownerHistory(options),
    manualSamples(options),
  ]);
  const contextFingerprint = viralResearchContextFingerprint(
    history.records,
    samples,
  );
  const cached = await readCachedViralResearchSnapshot(owner, input.query, {
    storageRoot: options.storageRoot,
    model,
    freshnessDays: config.dashscope.freshnessDays,
    contextFingerprint,
  });
  if (
    cached &&
    !input.forceRefresh &&
    !isViralResearchSnapshotExpired(cached, now)
  ) {
    return { snapshot: cached, cacheHit: true, expired: false };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const dashscope = await searchDashScope(
    config.dashscope,
    input.query,
    fetchImpl,
  );

  const safeExternalItems = enforceResearchItemPolicy(dashscope.items, 100);
  const relevantExternalItems = filterResearchItemsByQuery(
    input.query,
    safeExternalItems,
    relevanceJudgementsById(dashscope),
  );
  const accountAdjusted = applyOwnerAccountFit(
    relevantExternalItems.filter((item) =>
      sourceIsInsideFreshnessWindow(
        item,
        now,
        config.dashscope.freshnessDays,
      ),
    ),
    history.records,
  );
  const externalItems = enforceResearchItemPolicy(
    accountAdjusted
      .map((item, position) => ({ item, position }))
      .sort(
        (left, right) =>
          externalResearchScore(
            right.item,
            now,
            config.dashscope.freshnessDays,
          ) -
            externalResearchScore(
              left.item,
              now,
              config.dashscope.freshnessDays,
            ) ||
          left.position - right.position,
      )
      .map(({ item }) => item),
    12,
  );
  if (externalItems.length === 0 && cached) {
    const reason = uniqueReasons(
      dashscope.degradedReason,
      "实时检索未取得新来源，返回已过期的 owner 私有快照",
    ).join("；");
    return {
      snapshot: viralResearchSnapshotSchema.parse({
        ...cached,
        limitations: [
          ...new Set([
            ...cached.limitations,
            "这次没检索到新的公开来源，下面是上一次的研究结果。",
          ]),
        ].slice(0, 2),
        degradedReason: reason,
      }),
      cacheHit: true,
      expired: true,
      stale: true,
    };
  }

  const relevantSampleItems = filterResearchItemsByQuery(
    input.query,
    viralSamplesToResearchItems(samples, input.query),
  );
  const sampleItems = enforceResearchItemPolicy(
    relevantSampleItems,
    5,
  );
  const historyItems = selectOwnedHistoryItems(input.query, history.records, 2);
  const items = enforceResearchItemPolicy(
    [...sampleItems, ...externalItems, ...historyItems],
    10,
  );
  const fetchedAt = now.toISOString();
  const snapshotId = createViralResearchSnapshotId(input.query, model, fetchedAt);
  const allowedDashIds = new Set(
    items
      .filter((item) => item.sourceType === "dashscope")
      .map((item) => item.id),
  );
  const finalExternalItems = items.filter(
    (item) => item.sourceType === "dashscope",
  );
  const canSummarizeCommonalities = allowedDashIds.size >= 1;
  const commonPatterns = canSummarizeCommonalities
    ? (dashscope.analysis?.commonPatterns ?? [])
        .map((pattern) => clipResearchText(pattern, 240))
        .filter((pattern): pattern is string => Boolean(pattern))
        .slice(0, 6)
    : [];
  const topicCards = completeTopicCards(
    snapshotId,
    input.query,
    dashscope,
    allowedDashIds,
    finalExternalItems,
  );
  const finalItemIds = new Set(items.map((item) => item.id));
  const closedTopicCards = topicCards.filter((card) =>
    card.sourceIds.every((sourceId) => finalItemIds.has(sourceId)),
  );

  // 只保留两条人话；技术性原因统一放进 degradedReason。
  const limitations: string[] = [];
  if (externalItems.length > 0) {
    limitations.push(
      "联网来源只能证明网页可访问，互动数据需要你自己点开核对。",
    );
  } else if (sampleItems.length > 0) {
    limitations.push("本次未执行联网检索，下方来源来自你录入的爆款样本。");
  }
  if (externalItems.length === 0 && sampleItems.length === 0) {
    limitations.push("这次没检索到可用的公开来源，可以换个关键词再试一次。");
  } else if (externalItems.length > 0 && closedTopicCards.length === 0) {
    limitations.push("这次没整理出选题角度，下方来源仍可直接点开参考。");
  } else if (history.records.length < 3 && externalItems.length > 0) {
    limitations.push(
      "账号历史样本不足，暂时无法判断这些选题和你账号的适配度。",
    );
  }
  const degradedReasons = uniqueReasons(
    dashscope.status !== "ok" ? dashscope.degradedReason : undefined,
    externalItems.length === 0 && sampleItems.length === 0
      ? "没有取得主题相关且可追溯的外部研究来源"
      : undefined,
    history.error,
  );
  const providers = [
    ...(externalItems.length ? ["dashscope-native-search"] : []),
    ...(sampleItems.length ? ["viral-samples"] : []),
    ...(historyItems.length ? ["owned-history"] : []),
  ];
  const snapshot = viralResearchSnapshotSchema.parse({
    id: snapshotId,
    ownerId: owner,
    query: input.query,
    provider: providers.join("+") || "none",
    searchPerformed: externalItems.length > 0 || sampleItems.length > 0,
    fetchedAt,
    expiresAt: new Date(now.getTime() + VIRAL_RESEARCH_CACHE_TTL_MS).toISOString(),
    items,
    topicCards: closedTopicCards,
    commonPatterns,
    limitations: [...new Set(limitations)].slice(0, 2),
    degradedReason: degradedReasons.length
      ? degradedReasons.join("；").slice(0, 600)
      : null,
  });

  try {
    await writeViralResearchSnapshot(snapshot, {
      storageRoot: options.storageRoot,
      ...(externalItems.length > 0
        ? { cacheQuery: input.query, cacheModel: model }
        : {}),
      ...(externalItems.length > 0
        ? {
            cacheFreshnessDays: config.dashscope.freshnessDays,
            cacheContextFingerprint: contextFingerprint,
          }
        : {}),
    });
    return { snapshot, cacheHit: false, expired: false };
  } catch {
    const cacheWriteReason =
      "研究结果缓存写入失败，本次仍返回实时检索结果但不会复用缓存";
    return {
      snapshot: viralResearchSnapshotSchema.parse({
        ...snapshot,
        degradedReason: uniqueReasons(
          snapshot.degradedReason ?? undefined,
          cacheWriteReason,
        ).join("；").slice(0, 600) || null,
      }),
      cacheHit: false,
      expired: false,
    };
  }
}
