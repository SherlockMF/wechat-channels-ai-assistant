import type {
  ScriptDraftFormat,
  ScriptDraftProcessKind,
  ScriptDraftSmartSubTopic,
  ScriptDraftTopic,
} from "@video-diagnosis/shared-types";

export const SCRIPT_FORMAT_OPTIONS: Array<{
  value: ScriptDraftFormat;
  label: string;
  pipeline: "koubo" | "follow";
}> = [
  { value: "koubo", label: "口播种草", pipeline: "koubo" },
  { value: "showroom_koubo", label: "展厅场景口播", pipeline: "koubo" },
  { value: "service_intro", label: "服务介绍", pipeline: "koubo" },
  { value: "project_finish", label: "项目完工成片", pipeline: "follow" },
  { value: "hydro_site", label: "水电/工地展示", pipeline: "follow" },
  { value: "service_process", label: "服务过程", pipeline: "follow" },
  { value: "vlog", label: "Vlog", pipeline: "follow" },
];

export const SCRIPT_TOPIC_OPTIONS: Array<{
  value: ScriptDraftTopic;
  label: string;
}> = [
  { value: "smart_home", label: "全屋智能（可选子品）" },
  { value: "water", label: "全屋净水" },
  { value: "hydro", label: "水电工程" },
  { value: "service", label: "综合服务" },
];

export const SCRIPT_SMART_SUB_OPTIONS: Array<{
  value: ScriptDraftSmartSubTopic;
  label: string;
}> = [
  { value: "lighting", label: "灯光开关" },
  { value: "curtain", label: "窗帘" },
  { value: "theater", label: "影院影音" },
  { value: "voice", label: "语音中控" },
  { value: "panel", label: "中控面板" },
  { value: "security", label: "智能安防" },
  { value: "scene", label: "综合场景" },
];

export const SCRIPT_PROCESS_OPTIONS: Array<{
  value: ScriptDraftProcessKind;
  label: string;
}> = [
  { value: "plan_meeting", label: "跟业主谈方案" },
  { value: "install_inspect", label: "现场验是否按标准装" },
  { value: "progress_check", label: "看施工进度" },
];

const KOUBO_FORMATS = new Set<ScriptDraftFormat>([
  "koubo",
  "showroom_koubo",
  "service_intro",
]);

export function isKouboFormat(format: ScriptDraftFormat): boolean {
  if (format === "other") return true;
  return KOUBO_FORMATS.has(format);
}

export function topicRequired(format: ScriptDraftFormat): boolean {
  return format !== "vlog" && format !== "other";
}

export function defaultTopicForFormat(
  format: ScriptDraftFormat,
): ScriptDraftTopic | null {
  if (format === "hydro_site") return "hydro";
  if (format === "service_intro") return "service";
  if (format === "vlog" || format === "other") return null;
  return null;
}

export function formatLabel(
  format: ScriptDraftFormat,
  formatOther?: string | null,
): string {
  if (format === "other") {
    return formatOther?.trim() || "其他形态";
  }
  return (
    SCRIPT_FORMAT_OPTIONS.find((item) => item.value === format)?.label ?? format
  );
}

export function topicLabel(
  topic: ScriptDraftTopic | null,
  topicOther?: string | null,
): string {
  if (!topic) return "未选主题";
  if (topic === "other") return topicOther?.trim() || "其他主题";
  return (
    SCRIPT_TOPIC_OPTIONS.find((item) => item.value === topic)?.label ?? topic
  );
}

export function smartSubTopicLabel(sub: ScriptDraftSmartSubTopic): string {
  return (
    SCRIPT_SMART_SUB_OPTIONS.find((item) => item.value === sub)?.label ?? sub
  );
}

export function smartSubTopicLabels(
  subs: ScriptDraftSmartSubTopic[],
): string[] {
  return subs.map(smartSubTopicLabel);
}

export function topicKeywords(topic: ScriptDraftTopic | null): string[] {
  switch (topic) {
    case "water":
      return ["净水", "软水", "净水器", "水健康", "萨奇", "水倍康"];
    case "hydro":
      return ["水电", "施工", "隐蔽工程", "线管"];
    case "service":
      return ["一站式", "服务", "恒远", "找恒远"];
    case "smart_home":
      return ["全屋智能", "智能家居", "灯光", "窗帘", "安防", "门锁", "易来"];
    default:
      return [];
  }
}
