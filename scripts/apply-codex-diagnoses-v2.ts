import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { diagnosisResultSchema } from "@video-diagnosis/shared-types";

const root = path.resolve(import.meta.dirname, "..");
const statePath = path.join(root, ".data", "local-state.json");
const evidenceDir = path.join(root, ".data", "codex-analysis", "recent-10");

type Seed = {
  id: string;
  summary: string;
  observations: string[];
  hook: [number, number, string[], string, string];
  structure: [number, number, string[], string, string];
  sources: [[number, number], [number, number]];
  opening: [string, string, string];
  hooks: [string, string, string];
  original: string;
  script: string;
  subtitles: string;
  cta: string;
};

const seeds: Seed[] = [
  {
    id: "614da200-4930-50a6-86de-bbed5b561e42",
    summary: "真实施工反差是最强内容资产，但首段先口播再讲墙面问题，厨下乱线与规范布线没有在首屏形成对比；应把“一站式服务”收束成一个可见的前后反差故事。",
    observations: ["0–1 秒为人物口播，约 2 秒出现“装修后最后悔的事”，5–6 秒才出现厨下乱线。", "35–44 秒已有专业开槽布线、整洁管线和完工住宅等强结果镜头。"],
    hook: [0, 6, ["首秒是人物口播。", "厨下乱线到 5–6 秒才出现。"], "首屏没有立即兑现装修后悔的具体原因。", "用乱线与规范布线分屏冷开场，1 秒内给出后果。"],
    structure: [6, 44, ["中段连续展示团队、窗帘、净水、灯光和布线。", "整洁布线结果集中在 35–44 秒。"], "服务点过多使主线变成业务目录，强证据晚于平均观看窗口。", "先完成一个水电案例闭环，再用三项字幕收束一站式能力。"],
    sources: [[4.8, 7.4], [35.1, 44.4]],
    opening: ["水电没提前规划，入住后就是这种补丁。", "同样的房子，前期一次规划就能做到这样。", "开远装修，别等装完才后悔。"],
    hooks: ["水电没规划好，装修完只能到处打补丁。", "水电、净水、智能一次规划，完工能有多干净？", "为什么有些房子装完，还要再拆一次？"],
    original: "以装修后悔点引出水电、净水和智能家居一站式服务。",
    script: "水电没提前规划，入住后就是补丁和明线。我们把水电、净水、智能控制在装修前一次排好：线路怎么走、厨下留什么、设备放哪里，都在施工前确认。这里不是效果图，而是开远本地施工现场。",
    subtitles: "入住后全是补丁？｜问题出在装修前｜水电·净水·智能一次规划｜真实施工现场",
    cta: "准备装修的开远业主，把户型和需求发来，先做一次点位检查。",
  },
  {
    id: "8223344a-4b43-5f09-897d-0fe6f377456f",
    summary: "这是最近 10 条中表现较强的一条，频繁换景和生活感有效；但标题承诺工作成片，前 8 秒主要是早餐，应保留 vlog 人设并更早交付工作内容。",
    observations: ["0–3 秒为出门与“企二代高能量 vlog”，4–8 秒连续展示早餐和吃饭。", "9–36 秒才进入公司、记笔记、智能面板和换场拍摄。"],
    hook: [0, 9, ["标题承诺工作和成片。", "前 8 秒主要为早餐。"], "生活感成立，但工作承诺兑现偏慢。", "把疯狂输入、智能面板和换场拍摄前移，早餐压成一个转场。"],
    structure: [9, 54.1, ["有“疯狂做笔记”“疯狂输入中”等字幕。", "结尾是鱼池等生活碎片，没有成片预览。"], "观众能感知忙碌，却不易理解任务，也没看到成果闭环。", "首屏明确今日任务，结尾放成片一闪或下一条预告。"],
    sources: [[13.5, 31.6], [31.6, 49.5]],
    opening: ["今天要把这套全屋智能内容拍完。", "结果两杯咖啡才撑到收工。", "先补能量，开始今天的工作 vlog。"],
    hooks: ["拍视频最累的不是出镜，是同一句重来十遍。", "两杯咖啡之后，我终于把今天的成片拍完了。", "企二代的一天，到底是在上班还是一直重拍？"],
    original: "记录企二代从早餐到工作、拍摄和生活收尾的一天。",
    script: "今天的任务，是把这套全屋智能内容拍完。做方案、记重点、换场拍摄，同一句话反复重来；两杯咖啡之后，总算收工。生活镜头可以轻松，但主线只有一个：成片怎么被做出来。",
    subtitles: "今日任务：拍完成片｜做方案｜疯狂输入｜换场重拍｜两杯咖啡后收工",
    cta: "想看今天拍出的成片，关注下一条。",
  },
  {
    id: "3601a960-6467-5cd3-87a9-0aece69d2d33",
    summary: "软水利益点清楚，但首屏先人物与复杂系统图，随后长时间重复洗手演示；应先展示泡沫或少水垢的结果，再用短实验解释。",
    observations: ["0 秒人物出镜，1–2 秒为信息较密的全屋用水图。", "3–16 秒持续洗手、起泡和冲洗，全片明显场景变化很少。"],
    hook: [0, 3, ["首秒人物口播。", "复杂系统图先于可感知效果。"], "观众要先理解系统，才能获得利益点。", "用泡沫或水垢对比冷开场，系统图后置。"],
    structure: [3, 16, ["主要画面持续为同一洗手与冲洗动作。", "场景变化明显少于其他视频。"], "同质画面持续十余秒，信息增量下降。", "实验压至 4–5 秒，补入水垢或花洒等第二种证据。"],
    sources: [[5, 9], [9, 14]],
    opening: ["同样的洗护用品，为什么这边泡沫更细？", "关键不是洗剂，是家里的水。", "软水减少水垢，洗护也更舒服。"],
    hooks: ["花洒白垢擦不完，问题可能不是你没打扫。", "用了软水后，我最先感受到的不是设备，是皮肤。", "同样的洗护用品，为什么一边更容易起泡？"],
    original: "通过洗手演示讲解软水机带来的起泡、冲洗和少水垢体验。",
    script: "同样的洗护用品，软水为什么更容易起泡、也更好冲净？因为它减少了水中容易形成水垢的硬度成分。别先记参数，先看每天能感受到的两件事：花洒少水垢，洗护更舒服。",
    subtitles: "同样用量｜为什么泡沫更细？｜差别在水里｜少水垢｜洗护更舒服",
    cta: "想判断你家是否需要软水，留言所在地区和用水困扰。",
  },
  {
    id: "df05f3b6-0d59-5d01-8ab7-df0ffe61ef7e",
    summary: "出境参展本身稀缺，互动和转粉也有信号；但真正新鲜的展会设备集中在 60 秒以后，远晚于平均观看 20.85 秒，应以最强见闻冷开场再补行程。",
    observations: ["0–4 秒能看到马来西亚、会场与中马活动信息。", "60–85 秒才出现火焰设备、净水和饮水设备。"],
    hook: [0, 34, ["前段按机场、夜间到达、自拍说明的时间顺序展开。", "平均观看 20.85 秒。"], "旅行过程占据主要留存窗口，稀缺行业见闻被埋在后段。", "首 5 秒先放火焰与净水设备，再用 5 秒交代参展背景。"],
    structure: [34, 93.8, ["展会、演讲、展位与设备依时间顺序出现。", "全片超过 100 秒。"], "信息价值不低，但看点之间距离过长。", "围绕现场三个发现重组，每个看点控制在 6–8 秒。"],
    sources: [[68, 76], [76, 86]],
    opening: ["马来西亚展会上，这个装置先把我看愣了。", "还有两套国内不常见的用水方案。", "这次企二代来参展，带你只看重点。"],
    hooks: ["逛展最怕拍了一堆素材，却没有一个真正能落地。", "飞到马来西亚，我只挑了三个值得带回来的发现。", "这个会喷火的设备到底是做什么的？"],
    original: "按行程记录企二代赴马来西亚参展、看设备和体验当地生活。",
    script: "这次来马来西亚参展，我只挑三个值得看的现场发现：火焰演示对应什么场景，用水设备解决什么问题，海外市场在意的功能和国内有什么不同。行程只交代背景，重点看产品和能不能落地。",
    subtitles: "马来西亚展会现场｜3 个值得看的发现｜①火焰设备｜②用水方案｜③需求差异",
    cta: "这三项最想看哪一个完整拆解？评论区选 1、2 或 3。",
  },
  {
    id: "75b5cf50-a041-5c41-89f1-1d77e4dc0ebb",
    summary: "“一天拍 800 个视频”和失败素材有真实张力，平均观看 30.36 秒也不差；应把冲突从第 4 秒前移，再用任务—失败—重拍—成果完成闭环。",
    observations: ["0–3 秒为植物、咖啡和电梯等通用氛围镜头。", "4–8 秒出现“一天拍 800 个视频”与拍摄失败片段。"],
    hook: [0, 4, ["开头是通用 vlog 氛围镜头。", "具体冲突到约 4 秒出现。"], "最有辨识度的工作压力被氛围镜头延后。", "直接用失败片段和 800 个视频开场。"],
    structure: [12, 64, ["中段含出门、咖啡、设备体验、失败素材、吃饭和做饭。"], "生活切片丰富，但超忙工作日主线不够集中。", "按任务—失败—重拍—交付分章，通勤吃饭仅作短转场。"],
    sources: [[38, 44.5], [4, 9]],
    opening: ["我今天已经把这句话拍废了十遍。", "企二代的一天，目标是拍完 800 个素材。", "先补一口咖啡，开始赶进度。"],
    hooks: ["拍视频最崩溃的，是同一句话废掉十遍。", "一天拍 800 个素材，最后交出了什么？", "今天收工前，我能把这些素材拍完吗？"],
    original: "记录企二代在通勤、拍摄、体验和生活之间切换的忙碌一天。",
    script: "今天的目标是拍完 800 个素材，但第一句就连续 NG。到现场、对方案、换机位、重拍，咖啡和吃饭都穿插在任务之间。忙碌不是镜头多，而是最后有没有把成片交出来。",
    subtitles: "今日任务：800 个素材｜第一句就 NG｜换场｜重拍｜终于交付",
    cta: "想看这些失败素材最后变成什么成片，关注下一条。",
  },
  {
    id: "16618625-ecf7-5636-86bc-c3c5a7f20882",
    summary: "播放样本仅 95，结论置信度低；“继承家业”的冲突没有在首屏落地，礼品、活动、业务介绍和羽毛球更像散点记录，需要明确任务串联。",
    observations: ["0–2 秒为走路和会场画面，仅以“企二代 VLOG”概括。", "随后出现礼品袋、宣传、活动、咖啡和羽毛球，任务不明确。"],
    hook: [0, 6, ["首屏为通用走路与活动画面。", "标题没有说明今天要完成什么。"], "角色冲突没有被任务兑现，首屏辨识度弱。", "明确今日任务和失败条件，例如第一次独立接待活动。"],
    structure: [6, 88.2, ["礼品、活动、宣传、咖啡和运动连续出现。", "片段间缺少目标或进度连接。"], "观众难判断哪些镜头在推动继承家业故事。", "只保留准备、现场、结果；运动仅留 1 秒彩蛋。"],
    sources: [[14, 30], [44, 58]],
    opening: ["第一次自己扛这场活动，老板今天不救场。", "礼品、流程、客户，一个都不能漏。", "看看今天能不能顺利交差。"],
    hooks: ["接活动最怕的不是人多，是漏一个细节全场返工。", "从准备到收场，这次终于没让老板救场。", "老板不在，企二代能把活动独立扛下来吗？"],
    original: "记录企二代参与公司活动、业务展示与下班生活的一天。",
    script: "今天不是普通上班，而是第一次独立把活动扛下来。先核礼品和资料，再确认现场流程，最后看客户有没有顺利体验。咖啡和羽毛球只是彩蛋，真正的结果是有没有不靠老板完成交付。",
    subtitles: "今日任务：独立完成活动｜核物料｜跑流程｜现场交付｜结果怎么样？",
    cta: "想看企二代下一次独立任务，关注这个系列。",
  },
  {
    id: "7707164d-f74a-504d-8a82-32caad08ee68",
    summary: "黑暗走廊和摸黑开灯是具体痛点，解决方案也清楚；主要问题是首秒先问问题、9 秒就出现咨询 CTA，打断痛点—方案—效果的证明链。",
    observations: ["0–1 秒人物提问，2–8 秒展示黑暗走廊和摸黑关灯。", "约 9 秒已出现定制 CTA，之后才展示智能开关与一键控制。"],
    hook: [0, 2, ["首秒人物口播。", "具体摸黑画面从约 2 秒开始。"], "口头问题不如摸黑动作直观。", "0 秒直接放摸黑找开关，再补一句问题。"],
    structure: [8, 24.5, ["约 9 秒出现定制 CTA。", "解决方案证明在 CTA 后继续。"], "转化要求早于价值证明，可能中断观看。", "把 CTA 移到 22 秒以后，先完成痛点—方案—效果闭环。"],
    sources: [[2, 8], [10.5, 18]],
    opening: ["进门第一件事，是先摸黑找开关？", "躺下了，还得爬起来关灯。", "一个小改动，两个麻烦一起解决。"],
    hooks: ["每天进门摸黑、上床再爬起来，这个开关装错了。", "一个智能开关，让你进门不摸黑、上床不折返。", "这个小面板为什么越住越离不开？"],
    original: "通过摸黑开灯和上床关灯的痛点，推荐智能开关与语音控制。",
    script: "进门摸黑找开关，躺下后还要爬起来关灯，这两个麻烦能一起解决。玄关和床边按真实动线配置智能开关，再搭配语音或一键场景，不是为了炫技，是为了每天少折返两次。",
    subtitles: "进门不摸黑｜上床不折返｜智能开关＋场景控制｜按真实动线配置",
    cta: "把你家最难用的开关位置留言，我帮你判断怎么改。",
  },
  {
    id: "64c832e1-dc4f-5340-8fc7-d03b7ab3a23e",
    summary: "家庭影院完成效果最具传播力，但开头先解释“融界”和苹果店类比，产品结果出现偏晚；应先让观众看到“设备消失、效果留下”。",
    observations: ["0–2 秒人物口播，3–6 秒解释“融界、功能藏进美学”。", "约 9 秒出现苹果店，影院和完成空间主要在 24 秒以后。"],
    hook: [0, 9, ["首段使用需要解释的行业词。", "苹果店类比先于影院完成效果。"], "观众要先理解概念，才能知道实际价值。", "先展示完成空间，再用白话解释像苹果店一样干净。"],
    structure: [9, 58.3, ["苹果店、电视、激光电视、影院和卡拉 OK 依次铺陈。", "平均观看 10.44 秒。"], "最强结果没进入多数观众的观看区间，功能面也过宽。", "把 24–44 秒空间前移，本条只讲设备隐形后的影院。"],
    sources: [[34, 44], [24, 38]],
    opening: ["真正高级的家庭影院，第一眼看不到设备。", "屏幕、主机和线路都藏进空间。", "像逛苹果店一样干净，但效果一点没少。"],
    hooks: ["设备堆满墙，再贵也很难有高级感。", "真正高级的家庭影院，是设备消失，效果留下。", "这个房间的影院设备都藏在哪里？"],
    original: "借苹果店的极简体验解释家庭影院设备与空间融合。",
    script: "真正高级的家庭影院，第一眼不是设备，而是干净完整的空间。屏幕、主机和线路藏进设计里，像苹果店一样舒服，但亮度、画面和声音不能牺牲。所谓融界，用白话说就是：设备消失，效果留下。",
    subtitles: "设备消失｜效果留下｜屏幕·主机·线路隐入空间｜极简不牺牲效果",
    cta: "想看这套影院的设备藏在哪里，评论区回复“拆解”。",
  },
  {
    id: "fa482a2e-1664-50a0-8949-ac83a9feb116",
    summary: "施工细节真实、镜头推进快，可信度较高；首 5 秒的大标题和五点清单较难读，应让整齐管线近景先说服观众，再用三个可检查标准解释“精工”。",
    observations: ["0–2 秒为别墅外观和大标题，3–5 秒叠加较密的五点信息。", "6–21 秒连续展示线管、接线盒、排水和材料。"],
    hook: [0, 6, ["首屏同时出现大标题、多项服务和五点清单。", "最清晰管线近景约从 6 秒开始。"], "移动端阅读负担高，精工先被宣称后被证明。", "0 秒用整齐管线近景，只保留“精工水电看三点”。"],
    structure: [6, 28, ["施工细节真实。", "后段用“只做精工水电”等口号。"], "证据有效，但精工仍偏抽象。", "逐镜标记走线清楚、强弱电分离、点位预留。"],
    sources: [[6, 10], [9, 18]],
    opening: ["别墅水电做得好不好，先看这三处。", "走线清楚、强弱电分开、点位提前留。", "项目越复杂，前期标准越不能省。"],
    hooks: ["线路看着多不代表专业，乱一处以后都难修。", "别墅水电做得好不好，封墙前先看这三点。", "这套别墅的水电为什么敢把细节全拍出来？"],
    original: "用别墅真实施工现场展示水电、智能与净水一站式能力。",
    script: "别墅水电不是线越多越专业，先看三个可检查的细节：走线是否清楚，强弱电是否分开，智能和净水点位是否提前预留。项目越复杂，越要在封墙前把标准做明白。这里都是真实施工现场。",
    subtitles: "精工水电看 3 点｜走线清楚｜强弱电分离｜设备点位预留｜封墙前检查",
    cta: "正在做水电的业主，拍下现场这三处，我帮你一起看。",
  },
  {
    id: "6aa27481-5bb0-5440-89c2-727a1eadddd9",
    summary: "完播率和平均观看均偏弱；首 4 秒是较暗电影片段，随后长时间人物解释，真正证明影院效果的亮屏、空间和声音层次在 15 秒后才出现，应先结果再讲设备选错的代价。",
    observations: ["0–4 秒为较暗电影画面和“看片太爽了”字幕。", "15–42 秒才出现屏幕、激光电视、完整空间和声音层次。"],
    hook: [0, 5, ["首段电影画面较暗。", "没有立即展示家庭影院本身。"], "首屏可读性和原创空间识别度不足。", "用明亮影院全景与画质对比起片。"],
    structure: [5, 63, ["5–15 秒主要为人物解释。", "平均观看 10.71 秒；后段同时讲画质、设备和声场。"], "多数观众尚未看到证明就先接收解释，且卖点过多。", "把 15–42 秒证据前移，本条聚焦设备选错会糊。"],
    sources: [[15.5, 31.5], [31.5, 42]],
    opening: ["设备选错，花再多钱，家庭影院也会糊。", "真正的差别，不只在屏幕尺寸。", "先按房间选方案，再谈设备清单。"],
    hooks: ["设备选错，花再多钱，家庭影院也会糊。", "这才是沙丘该有的观影效果。", "为什么同样预算，有人装成影院，有人只得到大电视？"],
    original: "用电影观感引出家庭影院设备、画质和声音层次。",
    script: "设备选错，花再多钱，家庭影院也可能只剩一块大屏。先看房间亮度、观看距离和空间条件，再决定屏幕与主机；画面清楚之后，再谈声音层次。重点不是设备堆得多，而是每项都和房间匹配。",
    subtitles: "预算高不等于效果好｜先看空间｜再选设备｜画质先过关｜声场再匹配",
    cta: "准备装家庭影院，留言房间尺寸和采光，我告诉你第一步看什么。",
  },
];

function quantile(values: number[], at: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * at;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return low === high ? sorted[low]! : sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const rate = (value: number | null, views: number | null) => value === null || !views ? null : value / views;

function metricFacts(record: any, recent: any[]) {
  const completionMedian = quantile(recent.map((x) => x.completionRate).filter(Number.isFinite), .5);
  const watchMedian = quantile(recent.map((x) => x.averageWatchSeconds).filter(Number.isFinite), .5);
  return [
    `播放量 ${record.views ?? "—"}；完播率 ${percent(record.completionRate)}，最近 10 条中位数 ${percent(completionMedian)}。`,
    `平均观看 ${record.averageWatchSeconds?.toFixed(2) ?? "—"} 秒，最近 10 条中位数 ${watchMedian.toFixed(2)} 秒。`,
    `互动率：点赞 ${percent(rate(record.likes, record.views))}、评论 ${percent(rate(record.comments, record.views))}、分享 ${percent(rate(record.shares, record.views))}、关注 ${percent(rate(record.follows, record.views))}。`,
  ];
}

function build(seed: Seed, record: any, recent: any[], records: any[], media: any) {
  const views = records.map((x) => x.views).filter(Number.isFinite);
  const confidence = record.views < quantile(views, .25) ? "low" : record.views > quantile(views, .75) ? "high" : "medium";
  const completions = records.map((x) => x.completionRate).filter(Number.isFinite);
  const performanceLevel = record.completionRate <= quantile(completions, .25) ? "low" : record.completionRate >= quantile(completions, .75) ? "high" : "normal";
  const facts = metricFacts(record, recent);
  const problem = (category: "hook" | "structure", seedProblem: Seed["hook"], metric: "average_watch_seconds" | "completion_rate") => ({
    category, severity: "high" as const, startSecond: seedProblem[0], endSecond: seedProblem[1],
    contentEvidence: seedProblem[2], dataEvidence: facts.slice(0, 2),
    inference: seedProblem[3], recommendation: seedProblem[4], expectedMetric: metric, confidence,
  });
  const segment = (index: number, source: [number, number]) => ({
    startSecond: index * 2, endSecond: index * 2 + 2,
    visual: index === 0 ? "前置最强问题或结果镜头。" : index === 1 ? "用第二组真实素材完成反差或证明。" : "进入人物或场景解释。",
    voiceover: seed.opening[index]!, subtitle: seed.opening[index]!,
    audio: "保留现场声，配乐在字幕落点轻推，不覆盖人声。",
    editingRhythm: "2 秒内完成一个信息单元，硬切进入下一证据。",
    sourceAssetStartSecond: source[0], sourceAssetEndSecond: source[1], requiresReshoot: false,
  });
  return diagnosisResultSchema.parse({
    executiveSummary: seed.summary,
    dataAssessment: {
      performanceLevel, sampleConfidence: confidence,
      facts: [...facts, ...seed.observations, `视频时长 ${media.durationSeconds.toFixed(1)} 秒，检测到 ${media.sceneChangeTimes.length} 个明显场景变化；AAC 音轨存在，未检测到超过阈值的长静音段。`],
    },
    primaryProblems: [problem("hook", seed.hook, "average_watch_seconds"), problem("structure", seed.structure, "completion_rate")],
    editingPlan: [
      { startSecond: seed.hook[0], endSecond: seed.hook[1], originalContent: seed.hook[2].join("；"), problem: seed.hook[3], action: "replace", replacementContent: seed.hook[4], sourceAsset: { sourceStartSecond: seed.sources[0][0], sourceEndSecond: seed.sources[0][1] }, requiresReshoot: false },
      { startSecond: seed.structure[0], endSecond: seed.structure[1], originalContent: seed.structure[2].join("；"), problem: seed.structure[3], action: "trim", replacementContent: seed.structure[4], sourceAsset: { sourceStartSecond: seed.sources[1][0], sourceEndSecond: seed.sources[1][1] }, requiresReshoot: false },
    ],
    revisedOpening: [segment(0, seed.sources[0]), segment(1, seed.sources[1]), segment(2, seed.sources[1])],
    hookAlternatives: [
      { type: "pain_point", voiceover: seed.hooks[0], subtitle: seed.hooks[0], visual: "直接展示问题近景。" },
      { type: "result", voiceover: seed.hooks[1], subtitle: seed.hooks[1], visual: "直接展示完成结果。" },
      { type: "suspense", voiceover: seed.hooks[2], subtitle: seed.hooks[2], visual: "问题与结果快速对照。" },
    ],
    copySuggestions: { originalSummary: seed.original, revisedFullScript: seed.script, subtitleVersion: seed.subtitles, cta: seed.cta },
    audioSuggestions: {
      currentIssues: ["已确认 AAC 双声道音轨和无明显长静音；未做语音转写，不能断言具体口播或混音缺陷。", "上线前需人工完整试听首 6 秒的人声、底噪和配乐遮蔽。"],
      musicMood: "克制、清晰、服从内容节奏。", bpmRange: "88–112",
      openingAudioAction: "首个强画面保留动作或环境声，1 秒内进入清晰人声。",
      voiceMusicBalance: "人声优先；配乐比口播低约 12–16 dB。",
      transitionSuggestions: ["问题与结果用一次干净硬切或轻冲击音。", "同类镜头用现场声变化区分。"],
      avoid: ["大音量音乐掩盖人声。", "每个镜头都叠转场音效。", "未试听前宣称具体音质问题。"],
    },
    limitations: ["基于源 Excel 真实指标、视频元信息、关键帧、可见字幕和场景变化，不是逐字语音转写。", "本机无可用 ASR，未引用不可见的完整口播；上线前需人工完整试听。", "指标仅支持相关性判断，不能把某镜头表述为流失的确定因果；低播放样本更需复测。"],
  });
}

async function main() {
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  const manifest = JSON.parse(await fs.readFile(path.join(evidenceDir, "manifest.json"), "utf8"));
  const recent = [...state.records].sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() ||
    a.spreadsheetRow - b.spreadsheetRow).slice(0, 10);
  if (recent.map((x) => x.id).join("|") !== seeds.map((x) => x.id).join("|")) throw new Error("最近 10 条已变化，拒绝写入不匹配记录。");

  const now = new Date().toISOString();
  const backupDir = path.join(root, ".data", "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `local-state-before-codex-${now.replace(/[:.]/g, "-")}.json`);
  await fs.copyFile(statePath, backupPath);
  const targetIds = new Set(seeds.map((x) => x.id));
  const oldIds = new Set(state.jobs.filter((x: any) =>
    targetIds.has(x.videoRecordId) && x.currentStep === "codex_multimodal_completed").map((x: any) => x.id));
  state.results = state.results.filter((x: any) => !oldIds.has(x.analysisJobId));
  state.jobs = state.jobs.filter((x: any) => !oldIds.has(x.id));

  const output = [];
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]!;
    const record = recent[i]!;
    const evidence = manifest.find((x: any) => x.recordId === record.id);
    const match = state.matches.find((x: any) => x.videoRecordId === record.id && x.status === "matched");
    const asset = match && state.assets.find((x: any) => x.id === match.videoAssetId);
    const ownerId = state.imports.find((x: any) => x.id === record.importId)?.ownerId;
    if (!evidence || !asset || !ownerId) throw new Error(`缺少证据或资产：${record.id}`);
    const stream = evidence.media.streams.find((x: any) => x.codec_type === "video");
    const [num, den] = (stream?.r_frame_rate ?? "0/1").split("/").map(Number);
    Object.assign(asset, { durationSeconds: evidence.media.durationSeconds, width: stream?.width ?? null, height: stream?.height ?? null, fps: den ? num / den : null });
    const result = build(seed, record, recent, state.records, evidence.media);
    const jobId = randomUUID();
    state.jobs.push({ id: jobId, ownerId, videoRecordId: record.id, videoAssetId: asset.id, status: "completed", progress: 100, currentStep: "codex_multimodal_completed", retryCount: 0, errorCode: null, errorMessage: null, startedAt: now, completedAt: now, createdAt: now });
    state.results.push({ id: randomUUID(), analysisJobId: jobId, result, editedMarkdown: null, createdAt: now, updatedAt: now });
    output.push({ rank: i + 1, recordId: record.id, result });
  }
  const temp = `${statePath}.codex-${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`);
  await fs.rename(temp, statePath);
  await fs.writeFile(path.join(evidenceDir, "diagnoses.json"), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ written: output.length, statePath, backupPath }, null, 2));
}

await main();
