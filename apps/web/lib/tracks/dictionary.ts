import type { TrackId } from "@video-diagnosis/shared-types";

export interface TrackDefinition {
  id: TrackId;
  label: string;
  /** 命中判定与检索词扩展共用；全部以归一化形式参与匹配。 */
  terms: string[];
  /** 该赛道选题开拍前必须准备的实证。 */
  requiredEvidence: string[];
}

export const DEFAULT_REQUIRED_EVIDENCE = [
  "本账号真实案例",
  "过程或结果实拍",
  "适用条件与限制",
];

export const TRACK_DEFINITIONS: readonly TrackDefinition[] = [
  {
    id: "smart_home",
    label: "智能家居 / 全屋智能",
    terms: [
      "智能家居",
      "全屋智能",
      "智能灯光",
      "智能窗帘",
      "智能安防",
      "智能门锁",
      "智能开关",
      "中控屏",
      "场景联动",
      "设备联动",
      "语音助手",
      "传感器",
      "米家",
      "鸿蒙智家",
      "homekit",
      "matter",
      "zigbee",
      "无主灯",
    ],
    requiredEvidence: [
      "真实设备联动过程",
      "触发条件与失败边界",
      "本地项目同机位实拍",
    ],
  },
  {
    id: "water",
    label: "净水 / 软水 / 饮水",
    terms: [
      "净水",
      "软水",
      "水质",
      "水垢",
      "直饮",
      "饮水",
      "净水器",
      "软水机",
      "前置过滤",
      "反渗透",
      "ro膜",
      "滤芯",
      "tds",
      "管道直饮",
      "热水循环",
    ],
    requiredEvidence: [
      "本地水质或水垢实测",
      "同户型配置与成本口径",
      "安装前后可复核画面",
    ],
  },
  {
    id: "decoration",
    label: "装修水电 / 施工验收",
    terms: [
      "水电",
      "工地",
      "施工",
      "装修",
      "布线",
      "管线",
      "电路",
      "回路",
      "强弱电",
      "点位",
      "开槽",
      "预埋",
      "隐蔽工程",
      "验收",
      "防水",
    ],
    requiredEvidence: [
      "施工节点近景",
      "验收标准出处",
      "问题与整改前后对比",
    ],
  },
  {
    id: "appliance",
    label: "家电新品 / 家庭影院",
    terms: [
      "家电",
      "新品",
      "空调",
      "中央空调",
      "新风",
      "地暖",
      "冰箱",
      "洗衣机",
      "洗碗机",
      "热水器",
      "智能马桶",
      "扫地机器人",
      "家庭影院",
      "投影",
      "电视",
      "发布会",
    ],
    requiredEvidence: [
      "实机运行画面",
      "参数来源与出处",
      "同价位对比口径",
    ],
  },
] as const;

const definitionsById = new Map<TrackId, TrackDefinition>(
  TRACK_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function allTrackIds(): TrackId[] {
  return TRACK_DEFINITIONS.map((definition) => definition.id);
}

export function trackLabel(id: TrackId): string {
  return definitionsById.get(id)?.label ?? id;
}

/** 中文没有词边界，统一去掉非字母数字后做包含匹配。 */
export function normalizeTrackText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export interface TrackMatch {
  trackIds: TrackId[];
  matchedTerms: string[];
}

export function matchTracks(
  text: string,
  scope: readonly TrackId[] = allTrackIds(),
): TrackMatch {
  const haystack = normalizeTrackText(text);
  if (!haystack) return { trackIds: [], matchedTerms: [] };
  const trackIds: TrackId[] = [];
  const matchedTerms = new Set<string>();
  for (const id of scope) {
    const definition = definitionsById.get(id);
    if (!definition) continue;
    let hit = false;
    for (const term of definition.terms) {
      if (!haystack.includes(normalizeTrackText(term))) continue;
      hit = true;
      matchedTerms.add(term);
    }
    if (hit) trackIds.push(id);
  }
  return { trackIds, matchedTerms: [...matchedTerms].slice(0, 8) };
}

/** 研究检索的查询词扩展：命中赛道时补充同赛道核心词。 */
export function expandTrackTerms(topic: string, limit = 8): string[] {
  const { trackIds } = matchTracks(topic);
  const expanded = new Set<string>();
  for (const id of trackIds) {
    for (const term of definitionsById.get(id)?.terms ?? []) {
      expanded.add(term);
      if (expanded.size >= limit) return [...expanded];
    }
  }
  return [...expanded];
}

export function requiredEvidenceForTracks(
  trackIds: readonly TrackId[],
): string[] {
  const evidence = new Set<string>();
  for (const id of trackIds) {
    for (const item of definitionsById.get(id)?.requiredEvidence ?? []) {
      evidence.add(item);
    }
  }
  return evidence.size ? [...evidence].slice(0, 6) : [...DEFAULT_REQUIRED_EVIDENCE];
}

/** 主题文本对应的实证要求；无赛道命中时回落到通用要求。 */
export function requiredEvidenceForTopic(topic: string): string[] {
  return requiredEvidenceForTracks(matchTracks(topic).trackIds);
}
