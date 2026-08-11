import { createHash } from "node:crypto";
import {
  viralResearchSnapshotSchema,
  type ImportedVideoRecord,
  type ViralResearchItem,
  type ViralResearchTopicCard,
} from "@video-diagnosis/shared-types";
import { normalizeOwnerId } from "@/lib/data/owner";
import {
  applyOwnerAccountFit,
  selectOwnedHistoryItems,
} from "@/lib/viral-research/account-fit";
import {
  createViralResearchSnapshotId,
  isViralResearchSnapshotExpired,
  readCachedViralResearchSnapshot,
  writeViralResearchSnapshot,
} from "@/lib/viral-research/cache";
import { resolveViralResearchConfig } from "@/lib/viral-research/config";
import { searchDashScope } from "@/lib/viral-research/dashscope";
import {
  clipResearchText,
  enforceResearchItemPolicy,
  filterResearchItemsByQuery,
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
  if (!dashscope.analysis || allowedDashIds.size < 3) return [];
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
    }))
    .filter((card) => card.sourceIds.length >= 3)
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

function evidenceRequirements(query: ViralResearchQuery): string[] {
  if (/净水|饮水|软水/u.test(query.topic)) {
    return ["本地水质或水垢实测", "同户型配置与成本口径", "安装前后可复核画面"];
  }
  if (/智能家居|全屋智能/u.test(query.topic)) {
    return ["真实设备联动过程", "触发条件与失败边界", "本地项目同机位实拍"];
  }
  if (/水电|工地|施工/u.test(query.topic)) {
    return ["施工节点近景", "验收标准出处", "问题与整改前后对比"];
  }
  return ["本账号真实案例", "过程或结果实拍", "适用条件与限制"];
}

function topicCardsFromCommonPatterns(
  snapshotId: string,
  query: ViralResearchQuery,
  dashscope: ResearchAdapterResult,
  externalItems: ViralResearchItem[],
): ViralResearchTopicCard[] {
  if (!dashscope.analysis?.commonPatterns.length || externalItems.length < 3) {
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
    if (sources.length < 3) return [];
    const sourceIds = sources.map((source) => source.id);
    const sourceKey = [...sourceIds].sort().join("|");
    if (seenSourceSets.has(sourceKey)) return [];
    seenSourceSets.add(sourceKey);
    const summary = pattern.split(/[：:。；;]/u)[0]?.trim() || "主题共性结构";
    const title = `资料候选｜${clipResearchText(summary, 42) ?? "主题共性结构"}`;
    return [
      {
        id: topicCardId(snapshotId, title),
        title,
        whyNow:
          "由本次主题相关公开资料归纳，但来源没有足够的公开互动指标，只能作为内容结构候选，不能视为爆款验证。",
        targetAudience:
          query.audience ?? "与本次主题存在明确需求的目标用户",
        sourceIds,
        reusableStructures: [pattern],
        originalAngle: `结合${query.region ?? "本地"}真实项目、客户问题和可拍素材重新取材，不复述来源表达。`,
        requiredEvidence: evidenceRequirements(query),
        productionCost: "medium" as const,
        risks: ["外部热度未经公开指标验证", "发布前需逐条核对来源与事实"],
      },
    ];
  }).slice(0, 3);
}

function completeTopicCards(
  snapshotId: string,
  query: ViralResearchQuery,
  dashscope: ResearchAdapterResult,
  allowedDashIds: Set<string>,
  externalItems: ViralResearchItem[],
): ViralResearchTopicCard[] {
  const analyzed = topicCardsFromAnalysis(snapshotId, dashscope, allowedDashIds);
  const verifiedMetricIds = new Set(
    externalItems
      .filter((item) => item.evidenceLevel === "verified_metric")
      .map((item) => item.id),
  );
  const labeledAnalyzed = analyzed.map((card) => {
    const verifiedMetricCount = card.sourceIds.filter((id) =>
      verifiedMetricIds.has(id),
    ).length;
    if (verifiedMetricCount >= 3) return card;
    return {
      ...card,
      title: card.title.startsWith("资料候选｜")
        ? card.title
        : `资料候选｜${card.title}`,
      whyNow: `外部热度未验证：${card.whyNow}`,
      risks: [...new Set(["引用来源缺少足够的公开互动指标", ...card.risks])],
    };
  });
  const candidates = labeledAnalyzed.length
    ? labeledAnalyzed
    : topicCardsFromCommonPatterns(snapshotId, query, dashscope, externalItems);
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
    .slice(0, 3);
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

function uniqueReasons(...reasons: Array<string | undefined>): string[] {
  return [...new Set(reasons.filter((reason): reason is string => Boolean(reason)))];
}

function externalEvidenceScore(item: ViralResearchItem): number {
  const metrics = item.visibleMetrics;
  const metricScore = metrics
    ? 1_000_000_000 +
      (metrics.views ?? 0) * 1_000 +
      (metrics.likes ?? 0) * 100 +
      (metrics.comments ?? 0) * 10 +
      (metrics.shares ?? 0)
    : 0;
  const platformScore = item.url && /(?:douyin\.com|xiaohongshu\.com|bilibili\.com|weixin\.qq\.com|youtube\.com)/iu.test(item.url)
    ? 100_000_000
    : 0;
  return metricScore + platformScore;
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
  const cached = await readCachedViralResearchSnapshot(owner, input.query, {
    storageRoot: options.storageRoot,
  });
  if (
    cached &&
    !input.forceRefresh &&
    !isViralResearchSnapshotExpired(cached, now)
  ) {
    return { snapshot: cached, cacheHit: true, expired: false };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const [dashscope, history] = await Promise.all([
    searchDashScope(config.dashscope, input.query, fetchImpl),
    ownerHistory(options),
  ]);

  const safeExternalItems = enforceResearchItemPolicy(dashscope.items, 100);
  const relevantExternalItems = filterResearchItemsByQuery(
    input.query,
    safeExternalItems,
  );
  const externalItems = enforceResearchItemPolicy(
    relevantExternalItems
      .map((item, position) => ({ item, position }))
      .sort(
        (left, right) =>
          externalEvidenceScore(right.item) - externalEvidenceScore(left.item) ||
          left.position - right.position,
      )
      .map(({ item }) => item),
    12,
  );
  if (externalItems.length === 0 && cached) {
    const reason = uniqueReasons(
      dashscope.degradedReason,
      "实时检索失败，返回已过期的 owner 私有快照",
    ).join("；");
    return {
      snapshot: viralResearchSnapshotSchema.parse({
        ...cached,
        limitations: [...new Set([...cached.limitations, reason])],
        degradedReason: reason,
      }),
      cacheHit: true,
      expired: true,
    };
  }

  const accountAdjusted = applyOwnerAccountFit(externalItems, history.records);
  const historyItems = selectOwnedHistoryItems(input.query, history.records, 2);
  const items = enforceResearchItemPolicy(
    [...accountAdjusted, ...historyItems],
    10,
  );
  const fetchedAt = now.toISOString();
  const snapshotId = createViralResearchSnapshotId(input.query, fetchedAt);
  const allowedDashIds = new Set(
    items
      .filter((item) => item.sourceType === "dashscope")
      .map((item) => item.id),
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
    externalItems,
  );

  const limitations = [
    "DashScope 联网来源只证明公开网页可检索，不等同于平台已验证的爆款指标。",
    ...(canSummarizeCommonalities
      ? []
      : ["暂无可追溯的外部短视频页面，未归纳跨网共性。"]),
    ...(externalItems.length >= 1 && topicCards.length > 0
      ? [
          topicCards.some((card) => card.title.startsWith("资料候选｜"))
            ? "选题角度由主题相关公开资料的共性归纳生成，但来源缺少公开互动指标，仅可作为资料型候选。"
            : "选题卡基于可追溯且主题相关的来源生成，但仍需逐条复核，不能视为爆火保证。",
        ]
      : [
          externalItems.length < 3
            ? "主题相关且可追溯的独立外部来源少于 3 个，未生成选题卡。"
            : "模型未返回由至少 3 条主题相关来源共同支撑的选题角度，未生成选题卡。",
        ]),
    ...(history.records.length < 3
      ? ["账号历史样本不足，账号适配度仅作 unknown 处理。"]
      : []),
    ...(history.error ? [history.error] : []),
    ...uniqueReasons(dashscope.degradedReason),
  ];
  const degradedReasons = uniqueReasons(
    dashscope.status !== "ok" ? dashscope.degradedReason : undefined,
    externalItems.length === 0
      ? "没有取得主题相关且可追溯的外部研究来源"
      : undefined,
  );
  const providers = [
    ...(externalItems.length ? ["dashscope-native-search"] : []),
    ...(historyItems.length ? ["owned-history"] : []),
  ];
  const snapshot = viralResearchSnapshotSchema.parse({
    id: snapshotId,
    ownerId: owner,
    query: input.query,
    provider: providers.join("+") || "none",
    searchPerformed: externalItems.length > 0,
    fetchedAt,
    expiresAt: new Date(now.getTime() + VIRAL_RESEARCH_CACHE_TTL_MS).toISOString(),
    items,
    topicCards,
    commonPatterns,
    limitations: [...new Set(limitations)],
    degradedReason: degradedReasons.length
      ? degradedReasons.join("；").slice(0, 600)
      : null,
  });

  try {
    await writeViralResearchSnapshot(snapshot, {
      storageRoot: options.storageRoot,
      ...(externalItems.length > 0 ? { cacheQuery: input.query } : {}),
    });
    return { snapshot, cacheHit: false, expired: false };
  } catch {
    const cacheWriteLimitation = "研究结果缓存写入失败，本次仍返回实时检索结果但不会复用缓存";
    return {
      snapshot: viralResearchSnapshotSchema.parse({
        ...snapshot,
        limitations: [...new Set([...snapshot.limitations, cacheWriteLimitation])],
        degradedReason: uniqueReasons(
          snapshot.degradedReason ?? undefined,
          cacheWriteLimitation,
        ).join("；").slice(0, 600) || null,
      }),
      cacheHit: false,
      expired: false,
    };
  }
}
