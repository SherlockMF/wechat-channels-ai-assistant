import { z } from "zod";

const providerBlockSchema = z.object({
  provider: z.string().default(""),
  apiKey: z.string().default(""),
  apiBaseUrl: z.string().default(""),
  model: z.string().default(""),
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
    })
    .default({}),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;
export type ProviderBlock = z.infer<typeof providerBlockSchema>;

export function defaultUserSettings(): UserSettings {
  return userSettingsSchema.parse({});
}
