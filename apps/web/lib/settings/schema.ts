import {
  contentPlatformSchema,
  hotspotSourceKindSchema,
  trackIdSchema,
} from "@video-diagnosis/shared-types";
import { z } from "zod";

const providerBlockSchema = z.object({
  provider: z.string().default(""),
  apiKey: z.string().default(""),
  apiBaseUrl: z.string().default(""),
  model: z.string().default(""),
});

const webResearchProviderSchema = z.object({
  enabled: z.boolean().default(true),
  apiKey: z.string().default(""),
  apiBaseUrl: z
    .string()
    .default("https://dashscope.aliyuncs.com/api/v1"),
  model: z.string().default("qwen-plus"),
  freshnessDays: z.number().int().min(1).max(30).default(30),
});

const hotspotSourceSettingSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  /** rsshub 类型存路由（如 /weibo/search/hot），其余存完整地址。 */
  url: z.string().trim().min(1).max(2048),
  kind: hotspotSourceKindSchema,
  enabled: z.boolean().default(true),
});

/** 热点抓取不引入独立密钥：选题生成复用全局百炼配置，只允许覆盖模型。 */
const hotspotsProviderSchema = z.object({
  enabled: z.boolean().default(true),
  rsshubBaseUrl: z.string().default(""),
  freshnessDays: z.number().int().min(1).max(30).default(7),
  maxItemsPerSource: z.number().int().min(5).max(50).default(20),
  trackIds: z.array(trackIdSchema).default([...trackIdSchema.options]),
  /** 内置赛道之外的账号主题词；命中后允许 trackIds 为空。 */
  customKeywords: z.array(z.string().trim().min(1).max(40)).max(80).default([]),
  /** 为空表示使用内置默认源清单。 */
  sources: z.array(hotspotSourceSettingSchema).max(30).default([]),
  topicModel: z.string().default(""),
});

export const contentProfileSchema = z.object({
  accountName: z.string().trim().max(80).default("恒远内容账号"),
  brandName: z.string().trim().max(80).default("恒远"),
  region: z.string().trim().max(80).default("开远及周边"),
  positioning: z
    .string()
    .trim()
    .max(300)
    .default("本地智能家居、净水与水电服务内容"),
  audiences: z
    .array(z.string().trim().min(1).max(80))
    .max(12)
    .default(["本地装修与改善居住体验的人群"]),
  toneGuide: z.string().trim().max(300).default("真实、专业、口语自然，不夸大"),
  ctaPolicy: z
    .string()
    .trim()
    .max(300)
    .default("自然承接内容价值，不强行索取私信"),
  themeKeywords: z
    .array(z.string().trim().min(1).max(40))
    .max(80)
    .default(["智能家居", "全屋智能", "净水", "水电", "家电"]),
  defaultPlatforms: z
    .array(contentPlatformSchema)
    .min(1)
    .max(4)
    .default(["weixin_channels"]),
  otherPlatformName: z.string().trim().max(60).default(""),
});

export const userSettingsSchema = z.object({
  setupCompleted: z.boolean().default(false),
  dismissWizard: z.boolean().default(false),
  contentProfile: contentProfileSchema.default({}),
  providers: z
    .object({
      dashscopeApiKey: z.string().default(""),
      dashscopeApiBaseUrl: z
        .string()
        .default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
      speech: providerBlockSchema.default({}),
      vision: providerBlockSchema.default({}),
      llm: providerBlockSchema.default({}),
      webResearch: webResearchProviderSchema.default({}),
      hotspots: hotspotsProviderSchema.default({}),
    })
    .default({}),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;
export type ContentProfileSettings = z.infer<typeof contentProfileSchema>;
export type ProviderBlock = z.infer<typeof providerBlockSchema>;
export type HotspotsProviderSettings = z.infer<typeof hotspotsProviderSchema>;
export type HotspotSourceSetting = z.infer<typeof hotspotSourceSettingSchema>;

export function defaultUserSettings(): UserSettings {
  return userSettingsSchema.parse({});
}
