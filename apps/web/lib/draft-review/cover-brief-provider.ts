import type { DraftCoverBriefOptions } from "@video-diagnosis/shared-types";

export interface CoverBriefContext {
  title: string | null;
  tags: string[];
  goal: string | null;
  diagnosisSummary: string | null;
  problemCategories: string[];
}

export interface CoverBriefGenerateInput {
  backgroundPath: string;
  backgroundMimeType: string;
  userDescription: string;
  context: CoverBriefContext;
  options?: DraftCoverBriefOptions | null;
}

export interface CoverBriefOutput {
  /**
   * 唯一给用户复制的内容：连同同一张背景图一起发给 GPT/即梦即可。
   * 内含画面要求、必须上屏的标题文案、卖点、排版。
   */
  pastePrompt: string;
  /** 内部备选标题，已写入 pastePrompt；仍落库便于检索 */
  titles: string[];
}

export interface CoverBriefProvider {
  readonly name: string;
  generate(input: CoverBriefGenerateInput): Promise<CoverBriefOutput>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickTopic(input: CoverBriefGenerateInput): string {
  return (
    input.context.title ||
    input.context.tags[0] ||
    input.userDescription.slice(0, 16) ||
    "精工项目"
  );
}

function defaultTitles(topic: string, tags: string[]): string[] {
  const sell = tags.slice(0, 2).join(" + ") || "全屋智能 + 全屋净水";
  return [
    `${topic}｜精工实录`,
    sell,
    "看不见的工程，看得见的匠心",
  ];
}

const styleLabel: Record<string, string> = {
  site_real: "实景工地海报：真实工地感、可信、少装饰",
  premium_delivery: "高端交付海报：克制、品牌感、留白干净",
  tech_blueprint: "科技蓝图叠加：半透明管线/节点示意，突出看不见的工程",
  bold_feed: "信息流大字冲击：主标题极大、卖点清晰、强点击欲",
};

const themeLabel: Record<string, string> = {
  white_outline: "主文字白字+深描边，高对比可读",
  warm_gold: "主文字白/浅色，点缀暖金或香槟金细线/小标题",
  blue_orange_green: "卖点胶囊用蓝/橙/绿区分，主标题仍白字深描边",
  dark_glass: "文字区半透明深色玻璃底，白字清晰",
};

const moodLabel: Record<string, string> = {
  trust: "调性：安心可信、匠心交付",
  premium: "调性：专业克制、高端品牌",
  pain_point: "调性：痛点共鸣、结果承诺更醒目",
};

const overlayLabel: Record<string, string> = {
  light: "压暗：轻微边缘暗角即可",
  medium: "压暗：中等暗角，保证天空/墙面可放字",
  strong: "压暗：较强对比，文字区更稳，仍保留建筑可读",
};

function optionLine(
  key: string,
  value: string | null | undefined,
  known: Record<string, string>,
  prefix: string,
): string | null {
  if (!value?.trim()) return null;
  return known[value] ? `- ${known[value]}` : `- ${prefix}：${value.trim()}`;
}

/** 把可选控制写成提示词片段；未选则不写入。 */
export function formatCoverBriefOptions(
  options: DraftCoverBriefOptions | null | undefined,
): string[] {
  if (!options) return [];
  return [
    options.aspectRatio?.trim()
      ? `- 画幅：竖版 ${options.aspectRatio.trim()}`
      : null,
    optionLine("style", options.style, styleLabel, "风格"),
    optionLine("themeColor", options.themeColor, themeLabel, "主题色"),
    optionLine("mood", options.mood, moodLabel, "调性"),
    optionLine("overlay", options.overlay, overlayLabel, "压暗"),
  ].filter((line): line is string => Boolean(line));
}

/** 拼成「一张图 + 这一段提示词」就能发给 GPT 的完整指令。 */
export function buildPastePrompt(params: {
  topic: string;
  userDescription: string;
  tags: string[];
  goal: string | null;
  imageAnalysis: string;
  titles: string[];
  options?: DraftCoverBriefOptions | null;
}): string {
  const primary = params.titles[0] ?? params.topic;
  const secondary =
    params.titles[1] ??
    (params.tags.length
      ? params.tags.slice(0, 2).join(" + ")
      : "全屋智能 · 全屋净水");
  const tertiary = params.titles[2] ?? "精工工艺 品质施工";
  const selling =
    params.tags.length > 0
      ? params.tags.slice(0, 3)
      : ["全屋智能水电", "全屋净水系统", "精工工艺 品质施工"];
  const aspect = params.options?.aspectRatio || "3:4";
  const optionLines = formatCoverBriefOptions(params.options);

  return [
    `我已附上同一张实景照片。请【严格基于这张照片】生成一张竖版 ${aspect} 微信视频号封面成片（直接出图，不要只改文案）。`,
    ``,
    `【背景硬性要求】`,
    `- 必须保留这张照片里的建筑/场景、透视与光线，禁止换成别的房子或虚构外景。`,
    `- ${params.imageAnalysis || "识别主体与天空/墙面等留白，标题放在干净区域。"}`,
    `- 可按需要压暗边缘或加暗角，提高文字可读性；不要遮挡门窗等关键结构。`,
    ``,
    `【内容意图】`,
    params.userDescription,
    params.goal ? `- 发布目标：${params.goal}` : null,
    ``,
    optionLines.length > 0 ? `【用户指定偏好（已选才生效）】` : null,
    ...optionLines,
    optionLines.length > 0 ? `` : null,
    `【必须画在封面上的中文文字（照此或微调更顺口，但信息不能丢）】`,
    `- 左上角小角标：实景工地 / ${params.topic}`,
    `- 主标题（超大、≤2 行）：${primary}`,
    `- 副标题或卖点承接（一行或短句）：${secondary}`,
    `- 中部 2～3 个彩色卖点胶囊：${selling.map((item, index) => `${index + 1}.${item}`).join("；")}`,
    `- 可选强调句：${tertiary}`,
    `- 底部窄条：优质水电改造 · 规范施工 · 预约咨询`,
    ``,
    `【排版与风格】`,
    `- 主标题放画面中上部（优先天空或干净墙面），信息流一眼可读。`,
    `- 卖点胶囊横排或纵列，颜色区分但不花哨；底部信任条贴底。`,
    `- 整体专业家装品牌风，干净克制，禁止花哨贴纸堆叠、禁止英文乱码。`,
    ``,
    `【输出】`,
    `直接生成最终封面图；文字锐利清晰；不要解释过程。`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/** 解析模型 JSON；对外只保证 pastePrompt。 */
export function parseCoverBriefOutput(raw: unknown): CoverBriefOutput {
  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const imageAnalysis = asString(data.imageAnalysis);
  const titlesRaw = Array.isArray(data.titles) ? data.titles : [];
  const titles = titlesRaw
    .map((item) => asString(item))
    .filter(Boolean)
    .slice(0, 5);

  const pasteFromModel =
    asString(data.pastePrompt) ||
    asString(data.imagePrompt) ||
    asString(data.prompt);

  if (pasteFromModel && titles.length > 0) {
    return { pastePrompt: pasteFromModel, titles };
  }
  if (pasteFromModel) {
    return {
      pastePrompt: pasteFromModel,
      titles: titles.length > 0 ? titles : defaultTitles("视频号封面", []),
    };
  }

  const fallbackTitles =
    titles.length > 0 ? titles : defaultTitles("视频号封面", []);
  return {
    pastePrompt: buildPastePrompt({
      topic: fallbackTitles[0] ?? "视频号封面",
      userDescription: "根据背景图生成专业封面",
      tags: [],
      goal: null,
      imageAnalysis: imageAnalysis || "保留上传实景照片为主体背景。",
      titles: fallbackTitles,
    }),
    titles: fallbackTitles,
  };
}

export function buildMockCoverBrief(
  input: CoverBriefGenerateInput,
): CoverBriefOutput {
  const topic = pickTopic(input);
  const titles = defaultTitles(topic, input.context.tags);
  const imageAnalysis =
    "画面为用户上传的实景照片：保留主体建筑/场景与日照光影；标题优先放在天空或较干净的立面上方，避开门窗细节。";
  return {
    titles,
    pastePrompt: buildPastePrompt({
      topic,
      userDescription: input.userDescription,
      tags: input.context.tags,
      goal: input.context.goal,
      imageAnalysis,
      titles,
      options: input.options,
    }),
  };
}

export class MockCoverBriefProvider implements CoverBriefProvider {
  readonly name = "mock";
  async generate(input: CoverBriefGenerateInput): Promise<CoverBriefOutput> {
    return buildMockCoverBrief(input);
  }
}

/** 多模态：分析图片后只产出一段可粘贴提示词。 */
export function buildCoverBriefSystemPrompt(
  input: CoverBriefGenerateInput,
): string {
  const { context, userDescription, options } = input;
  const optionLines = formatCoverBriefOptions(options);
  const aspect = options?.aspectRatio || "3:4";
  return [
    "你是视频号封面提示词工程师。",
    "用户会附一张实景图，并把你输出的【整段 pastePrompt】连同同一张图发给 GPT 生图。",
    "因此你必须只准备「一段完整、可直接粘贴」的中文提示词，不要拆成多段给用户拼。",
    "",
    "工作步骤（写进 pastePrompt 里，不要另开字段给用户）：",
    "1) 先简述你看到的背景（主体、光线、可放字区域）；",
    "2) 把用户粗糙描述扩成成片要求；",
    "3) 写明必须上屏的标题/卖点/信任条原文；",
    `4) 写明竖版 ${aspect}、保留原图、排版位置；若用户指定了风格/主题色/调性/压暗，必须遵守。`,
    "",
    "只输出一个 JSON 对象，不要 Markdown：",
    `{
  "imageAnalysis": string,
  "titles": string[],
  "pastePrompt": string
}`,
    "",
    "pastePrompt 硬性标准：",
    "- 一段完整中文，用户复制后无需再拼标题或排版；",
    "- 明确要求基于附带照片，禁止换楼；",
    "- 含角标、主标题、卖点胶囊、底部信任条的具体文案；",
    "- 结尾要求直接出成片图。",
    "",
    `审片标题：${context.title ?? "无"}`,
    `标签：${context.tags.length ? context.tags.join("、") : "无"}`,
    `发布目标：${context.goal ?? "无"}`,
    `诊断摘要：${context.diagnosisSummary ?? "无"}`,
    `主要问题类别：${
      context.problemCategories.length
        ? context.problemCategories.join("、")
        : "无"
    }`,
    `用户粗糙描述：${userDescription}`,
    optionLines.length > 0
      ? `用户可选偏好（未写则表示不强制）：\n${optionLines.join("\n")}`
      : "用户未指定风格/主题色等可选偏好，请按专业家装实景封面常识处理。",
  ].join("\n");
}
