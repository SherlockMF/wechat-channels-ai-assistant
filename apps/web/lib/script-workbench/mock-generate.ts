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

export type { ScriptGenerateRequest } from "@/lib/script-workbench/production-guide";

function topicPhrase(topic: ScriptDraftTopic | null): string {
  return topicLabel(topic);
}

function withProductionGuide(
  request: ScriptGenerateRequest,
  output: ScriptDraftOutput,
): ScriptDraftOutput {
  const next: ScriptDraftOutput = {
    ...output,
    productionGuide: buildProductionGuide(
      request,
      guideSectionsFromOutput(output),
    ),
    plainText: "",
  };
  next.plainText = outputToPlainText(next);
  return next;
}

function buildKoubo(request: ScriptGenerateRequest): ScriptDraftOutput {
  const { input, format, topic, subTopics } = request;
  const idea = input.idea.trim();
  const existing = input.existingScript?.trim();
  const points = input.sellingPoints?.trim();
  const topicText = topicPhrase(topic);
  const subLabels = smartSubTopicLabels(subTopics);
  const subText =
    subLabels.length > 0
      ? subLabels.join("、")
      : format === "service_intro"
        ? "一站式服务"
        : topicText;
  const seconds = input.targetSeconds ?? (format === "showroom_koubo" ? 60 : 30);
  const titleSeed = shortHook(idea, 20);

  const script = existing
    ? existing
    : format === "service_intro"
      ? [
          `很多人装修要找好几家，智能、净水、水电分开对接，又累又容易对不上。`,
          `我们做的是${topicText}相关的一站式服务：方案、施工、交付一条线跟到底。`,
          points
            ? `这次重点说：${points}。`
            : `省事、省钱、还省心，不用你来回对接三拨人。`,
          `想了解自己家适不适合，私信我发户型/需求，我帮你看看。`,
        ].join("")
      : [
          `${idea}——这种日常糟心，其实挺多人懂。`,
          `不用全屋大拆，用${subText}就能先把体验拉起来。`,
          points
            ? `关键就这几点：${points}。`
            : `比如场景模式、自动感应、少动手，住着会轻松很多。`,
          format === "showroom_koubo"
            ? `你就站在场景里演示一遍：进门、开关、模式切换，让人一眼看懂。`
            : `拍的时候口播短一点，中间插产品特写和效果对比就够。`,
          `需要方案或报价，私信我，按你家情况给建议。`,
        ].join("");

  const output: ScriptDraftOutput = {
    pipeline: "koubo",
    titles: existing
      ? [
          titleSeed || `${subText}小改造`,
          `${topicText}｜${subText}`,
          `做饭时谁懂｜${subText || "智能小改造"}`,
        ]
      : [
          titleSeed,
          `${topicText}｜${shortHook(idea, 14) || "实用分享"}`,
          format === "service_intro"
            ? `装修别找三家｜${topicText}一站式`
            : `谁懂这种痛｜${subText}`,
        ],
    tags: [
      topicText,
      ...subLabels,
      "开远",
      format === "service_intro" ? "一站式服务" : "装修",
    ].filter(Boolean),
    script,
    brollCues: existing
      ? [
          { section: "开头痛点", cue: "按你稿里的画面思路拍痛点特写" },
          { section: "产品展示", cue: "按稿中产品/电机运行画面穿插" },
          { section: "收束种草", cue: "效果演示 + 一句 CTA" },
        ]
      : [
          { section: "开头痛点", cue: "生活痛点画面或手部操作特写" },
          {
            section: "方案/产品",
            cue:
              format === "showroom_koubo"
                ? "展厅场景中人站在智能场景里操作"
                : "产品特写、效果对比或示意图",
          },
          { section: "收束CTA", cue: "品牌/服务露出或联系方式画面" },
        ],
    subtitleBeats: existing
      ? [titleSeed || "痛点一句", points?.slice(0, 18) || subText, "解放双手更舒心"]
      : [
          shortHook(idea, 18) || "先说痛点",
          points?.slice(0, 18) || "关键卖点一句",
          "私信了解方案",
        ],
    altHooks: [
      `谁懂这种麻烦：${titleSeed || subText}`,
      `花小钱先解决：${subText}`,
    ],
    positioning: null,
    timeline: [],
    gapsOrWarnings: existing
      ? [
          "已采用你提供的当前脚本作为口播正文；标题/素材/字幕为配套建议",
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
  const topicText = topicPhrase(topic);

  if (format === "vlog") {
    const day = input.dayPlan?.trim() || idea;
    const output: ScriptDraftOutput = {
      pipeline: "follow",
      titles: [day.slice(0, 28) || "今日日常", `企二代日常｜${day.slice(0, 12)}`],
      tags: topic ? [topicText, "vlog", "日常"] : ["vlog", "日常", "企二代"],
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
            ? "逐项验标准：线管、固定、间距、观感"
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
    tags: [topicText, "项目完工", "全屋智能", "开远"],
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
        say: "手机/面板控制，让人看懂好用",
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
        subtitle: "恒远智能",
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
