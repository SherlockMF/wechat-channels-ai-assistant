import {
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
  /** 为空表示使用内置默认源清单。 */
  sources: z.array(hotspotSourceSettingSchema).max(30).default([]),
  topicModel: z.string().default(""),
});

export const userSettingsSchema = z.object({
  setupCompleted: z.boolean().default(false),
  dismissWizard: z.boolean().default(false),
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
export type ProviderBlock = z.infer<typeof providerBlockSchema>;
export type HotspotsProviderSettings = z.infer<typeof hotspotsProviderSchema>;
export type HotspotSourceSetting = z.infer<typeof hotspotSourceSettingSchema>;

export function defaultUserSettings(): UserSettings {
  return userSettingsSchema.parse({});
}
