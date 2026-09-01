import type {
  ScriptDraftOutput,
  ScriptDraftProcessKind,
  ScriptDraftTopic,
} from "@video-diagnosis/shared-types";
import { isKouboFormat, smartSubTopicLabels, topicLabel } from "@/lib/script-workbench/catalog";
import { shortHook } from "@/lib/script-workbench/display";
import {
  buildProductionGuide,
  guideSectionsFromOutput,
  type ScriptGenerateRequest,
} from "@/lib/script-workbench/production-guide";
import { outputToPlainText } from "@/lib/script-workbench/plain-text";
import { ensureDeliveryGuide } from "@/lib/script-workbench/delivery-guide";
import { ensureViralEnhancements } from "@/lib/script-workbench/viral-plan";
import { normalizeContentProfile } from "@/lib/settings/content-profile";
import { platformPromptGuidance } from "@/lib/platforms/catalog";

export type { ScriptGenerateRequest } from "@/lib/script-workbench/production-guide";

function topicPhrase(topic: ScriptDraftTopic | null, topicOther?: string): string {
  return topicLabel(topic, topicOther);
}

function withProductionGuide(
  request: ScriptGenerateRequest,
  output: ScriptDraftOutput,
): ScriptDraftOutput {
  let next: ScriptDraftOutput = {
    ...output,
    productionGuide: buildProductionGuide(
      request,
      guideSectionsFromOutput(output),
    ),
    plainText: "",
  };
  next = ensureViralEnhancements(request, next);
  next = ensureDeliveryGuide(next);
  next.plainText = outputToPlainText(next);
  return next;
}

function buildKoubo(request: ScriptGenerateRequest): ScriptDraftOutput {
  const { input, format, topic, subTopics } = request;
  const idea = input.idea.trim();
  const existing = input.existingScript?.trim();
  const points = input.sellingPoints?.trim();
  const topicText = topicPhrase(topic, input.topicOther);
  const subLabels = smartSubTopicLabels(subTopics);
  const subText =
    subLabels.length > 0
      ? subLabels.join("、")
      : format === "service_intro"
        ? "一站式服务"
        : topicText;
  const seconds = input.targetSeconds ?? (format === "showroom_koubo" ? 60 : 30);
  const titleSeed = shortHook(idea, 20);
  const rewriteMode = input.rewriteMode ?? "polish";
  const profile = normalizeContentProfile(request.contentProfile);
  const cta = input.ctaGoal?.trim() || profile.ctaPolicy;
  const audience = input.audience?.trim() || profile.audiences[0] || "目标受众";

  const generatedScript = format === "service_intro"
      ? [
          `很多人选择${topicText}相关服务时，信息不少，但需求、方案和交付常常对不上。`,
          `${profile.brandName}围绕${topicText}提供从需求梳理到交付复盘的一站式服务。`,
          points
            ? `这次重点说：${points}。`
            : `把范围、成本和验收方式提前说清，减少来回沟通。`,
          cta,
        ].join("")
      : [
          `${idea}——这是${audience}经常遇到的具体问题。`,
          `先把${topicText}的真实场景和结果讲清，不堆概念。`,
          points
            ? `关键就这几点：${points}。`
            : `用一个具体问题、一段过程演示和一个可复核结论，把价值讲明白。`,
          format === "showroom_koubo"
            ? `你就站在场景里演示一遍：进门、开关、模式切换，让人一眼看懂。`
            : `拍的时候口播短一点，中间插过程、细节和结果画面。`,
          cta,
        ].join("");
  const script = existing
    ? rewriteMode === "preserve"
      ? existing
      : rewriteMode === "deep"
        ? generatedScript
        : [
            `先说结果：${titleSeed || idea}。`,
            existing,
            input.ctaGoal?.trim() ||
              "如果你也遇到同类问题，可以把现场情况发来一起判断。",
          ].join("\n")
    : generatedScript;

  const output: ScriptDraftOutput = {
    pipeline: "koubo",
    titles: existing
      ? [
          titleSeed || `${subText}小改造`,
          `${topicText}｜${subText}`,
          `${audience}最关心什么｜${subText}`,
        ]
      : [
          titleSeed,
          `${topicText}｜${shortHook(idea, 14) || "实用分享"}`,
          format === "service_intro"
            ? `${topicText}怎么选｜一站式服务`
            : `这个问题怎么解决｜${subText}`,
        ],
    tags: [
      topicText,
      ...subLabels,
      profile.region,
      format === "service_intro" ? "一站式服务" : "实用分享",
    ].filter(Boolean),
    script,
    brollCues: existing
      ? [
          { section: "开头痛点", cue: "按你稿里的画面思路拍痛点特写" },
          { section: "过程展示", cue: "按稿中步骤、对象或关键动作穿插" },
          { section: "收束转化", cue: "结果画面 + 一句 CTA" },
        ]
      : [
          { section: "开头痛点", cue: "生活痛点画面或手部操作特写" },
          {
            section: "方案/产品",
            cue:
              format === "showroom_koubo"
                ? "展厅场景中人站在智能场景里操作"
                : "过程特写、结果对比或必要示意图",
          },
          { section: "收束CTA", cue: "品牌/服务露出或联系方式画面" },
        ],
    subtitleBeats: existing
      ? [titleSeed || "痛点一句", points?.slice(0, 18) || subText, "解放双手更舒心"]
      : [
          shortHook(idea, 18) || "先说痛点",
          points?.slice(0, 18) || "关键卖点一句",
          cta.slice(0, 18),
        ],
    altHooks: [
      `先看这个问题：${titleSeed || subText}`,
      `一个具体办法：${subText}`,
    ],
    positioning: null,
    timeline: [],
    gapsOrWarnings: existing
      ? [
          rewriteMode === "preserve"
            ? "已按保留原稿模式锁定口播正文；改进项仅写入逐句质检"
            : rewriteMode === "deep"
              ? "已按深度改写模式重组口播；发布前需复核事实与承诺边界"
              : "已按适度润色模式优化开头、衔接与 CTA，保留原稿核心事实",
          `目标时长约 ${seconds} 秒；口播拍 2～3 条选一条`,
        ]
      : format === "showroom_koubo"
        ? [`建议站位：人在场景中；目标时长约 ${seconds} 秒`]
        : [`目标时长约 ${seconds} 秒；口播拍 2～3 条选一条`],
    plainText: "",
  };
  if (request.referenceHints?.length) {
    output.gapsOrWarnings.push(
      `可参考历史片：${request.referenceHints.slice(0, 2).join("；")}`,
    );
  }
  const platformGuidance = platformPromptGuidance(
    input.targetPlatforms ?? profile.defaultPlatforms,
    input.platformOther || profile.otherPlatformName,
  );
  if (platformGuidance) {
    output.gapsOrWarnings.push(`平台适配：${platformGuidance.replace(/\n/gu, "；")}`);
  }
  return withProductionGuide(request, output);
}

function processLabels(kinds: ScriptDraftProcessKind[]): string {
  const map: Record<ScriptDraftProcessKind, string> = {
    plan_meeting: "谈方案",
    install_inspect: "验标准",
    progress_check: "看进度",
  };
  return (kinds.length ? kinds : (["plan_meeting"] as ScriptDraftProcessKind[]))
    .map((kind) => map[kind])
    .join("+");
}

function buildFollow(request: ScriptGenerateRequest): ScriptDraftOutput {
  const { format, topic, input, processKinds } = request;
  const idea = input.idea.trim();
  const topicText = topicPhrase(topic, input.topicOther);
  const profile = normalizeContentProfile(request.contentProfile);

  if (format === "vlog") {
    const day = input.dayPlan?.trim() || idea;
    const output: ScriptDraftOutput = {
      pipeline: "follow",
      titles: [day.slice(0, 28) || "今日日常", `${profile.accountName}日常｜${day.slice(0, 12)}`],
      tags: topic ? [topicText, "vlog", "日常"] : ["vlog", "日常", profile.accountName],
      script: "",
      brollCues: [],
      subtitleBeats: [],
      altHooks: [],
      positioning: `今日轻记录：${day}`,
      timeline: [
        {
          order: 1,
          shoot: "出门/到场开场自拍或环境",
          say: "今天大概要干啥一句带过",
          subtitle: day.slice(0, 16) || "今日开始",
        },
        {
          order: 2,
          shoot: "工作或生活碎片 2～3 段",
          say: "有什么拍什么，少硬广",
          subtitle: "过程碎片",
        },
        {
          order: 3,
          shoot: "收尾一句心情或明日预告",
          say: topic
            ? `若自然露出「${topicText}」最多一次，不硬塞`
            : "自然收束即可",
          subtitle: "今日收工",
        },
      ],
      gapsOrWarnings: topic
        ? [`主题「${topicText}」仅作标签；不要硬套产品口播结构`]
        : ["未选业务主题：按生活流剪即可"],
      plainText: "",
    };
    return withProductionGuide(request, output);
  }

  if (format === "service_process") {
    const kinds = processKinds.length
      ? processKinds
      : input.processKinds ?? ["plan_meeting"];
    const label = processLabels(kinds);
    const must = input.mustShoot?.trim() || "关键检查点";
    const scene = input.clientScene?.trim() || idea;
    const timeline = [
      {
        order: 1,
        shoot: "到场/碰面环境（注意门牌打码）",
        say: "今天来做什么，一句话说清",
        subtitle: label,
      },
      {
        order: 2,
        shoot: kinds.includes("plan_meeting")
          ? "方案沟通：图纸/平板/手势讲解（避免合同细节入镜）"
          : kinds.includes("install_inspect")
            ? "逐项验标准：关键步骤、验收点与最终观感"
            : "进度对照：已完成 vs 待完成区域",
        say: `围绕「${must}」讲清楚为什么重要`,
        subtitle: must.slice(0, 18),
      },
      {
        order: 3,
        shoot: "问题或亮点特写",
        say: "真实过程优先，少口号",
        subtitle: "现场细节",
      },
      {
        order: 4,
        shoot: "结论与下一步",
        say: "下次上门/整改/交付节点",
        subtitle: "下一步",
      },
    ];
    const output: ScriptDraftOutput = {
      pipeline: "follow",
      titles: [
        `${label}｜${scene.slice(0, 16)}`,
        `服务现场｜${must.slice(0, 14)}`,
      ],
      tags: [topicText, "服务过程", label],
      script: "",
      brollCues: [],
      subtitleBeats: [],
      altHooks: [],
      positioning: `服务过程片：突出信任与专业（${label}）——${scene}`,
      timeline,
      gapsOrWarnings: [
        "门牌、合同金额、客户正脸需打码或征得同意",
        "过程真实优先，避免写成硬广口播",
        input.highlight ? `本片突出：${input.highlight}` : "补拍缺失的关键节点",
      ],
      plainText: "",
    };
    return withProductionGuide(request, output);
  }

  if (format === "hydro_site") {
    const notes = input.siteNotes?.trim() || idea;
    const standards = input.standardPoints?.trim() || "线管间距、固定、观感";
    const output: ScriptDraftOutput = {
      pipeline: "follow",
      titles: [`精品水电｜${notes.slice(0, 14)}`, "看不见的工程也要标准"],
      tags: ["水电工程", "施工", "隐蔽工程", topicText],
      script: "",
      brollCues: [],
      subtitleBeats: [],
      altHooks: [],
      positioning: `工地展示：用标准化细节证明专业——${notes}`,
      timeline: [
        {
          order: 1,
          shoot: "工地外景或入户过渡",
          say: "一句话说明今天看什么",
          subtitle: "工地实拍",
        },
        {
          order: 2,
          shoot: "线管/配电/隐蔽工程整齐排布特写",
          say: `强调标准：${standards}`,
          subtitle: standards.slice(0, 18),
        },
        {
          order: 3,
          shoot: "细节对比或工人/工装品牌露出",
          say: "把看不见的工程交给看得见的标准",
          subtitle: "标准化施工",
        },
        {
          order: 4,
          shoot: "收束服务能力",
          say: "水电/智能可一站式对接",
          subtitle: "找专业的",
        },
      ],
      gapsOrWarnings: ["补拍缺失的标准点特写；注意安全与客户隐私"],
      plainText: "",
    };
    return withProductionGuide(request, output);
  }

  // project_finish
  const highlight = input.highlight?.trim() || idea;
  const shots = input.shotNotes?.trim() || "空间漫游、功能演示、细节特写";
  const projectType = input.projectType?.trim() || topicText;
  const output: ScriptDraftOutput = {
    pipeline: "follow",
    titles: [
      `新项目落地｜${highlight.slice(0, 14)}`,
      `${projectType}｜${highlight.slice(0, 12)}`,
    ],
    tags: [topicText, "项目完工", projectType, profile.region],
    script: "",
    brollCues: [],
    subtitleBeats: [],
    altHooks: [],
    positioning: `完工成片突出「${highlight}」；项目类型：${projectType}`,
    timeline: [
      {
        order: 1,
        shoot: "空间开场：客厅/主场景氛围",
        say: "先给结果感",
        subtitle: highlight.slice(0, 16),
      },
      {
        order: 2,
        shoot: `功能演示（${shots}）`,
        say: "演示核心功能或成果，让人一眼看懂价值",
        subtitle: "随心控制",
      },
      {
        order: 3,
        shoot: "产品与工艺细节",
        say: "点出本次和以往不同的卖点",
        subtitle: "细节",
      },
      {
        order: 4,
        shoot: "品牌角标收尾",
        say: "欢迎咨询同款方案",
        subtitle: profile.brandName,
      },
    ],
    // internalNote 仅存于 input，不进入可复制 gaps/plainText
    gapsOrWarnings: ["缺镜头就补拍功能演示与空间建立感"],
    plainText: "",
  };
  return withProductionGuide(request, output);
}

export function buildMockScriptOutput(
  request: ScriptGenerateRequest,
): ScriptDraftOutput {
  return isKouboFormat(request.format)
    ? buildKoubo(request)
    : buildFollow(request);
}
