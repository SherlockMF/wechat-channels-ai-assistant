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
    })
    .default({}),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;
export type ProviderBlock = z.infer<typeof providerBlockSchema>;

export function defaultUserSettings(): UserSettings {
  return userSettingsSchema.parse({});
}
