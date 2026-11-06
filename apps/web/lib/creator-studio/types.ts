import { z } from "zod";

const idSchema = z.string().uuid("资料 ID 无效");
const fieldIdSchema = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u, "栏目字段 ID 无效");
const dateSchema = z.string().refine((value) => {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}, "排期日期无效");
const timestampSchema = z.string().datetime();
export const materialKinds = ["经历", "数据", "案例", "金句", "观察"] as const;
export const materialKindSchema = z.enum(materialKinds);

const sampleInput = z.object({
  title: z.string().trim().min(1, "请填写样本标题").max(180),
  content: z.string().trim().max(20_000, "样本最多 20000 字").refine((value) => value.replace(/\s/gu, "").length >= 100, "样本至少需要 100 字"),
  draftId: idSchema.nullable().optional(),
});
const materialInput = z.object({
  title: z.string().trim().min(1, "请填写素材标题").max(180),
  kind: materialKindSchema,
  body: z.string().trim().min(1, "请填写真实素材").max(10_000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export const sectionFieldSchema = z.object({
  id: fieldIdSchema,
  label: z.string().trim().min(1, "请填写栏目字段名称").max(80),
  required: z.boolean().default(false),
});
const sectionFields = z.array(sectionFieldSchema).max(12).refine(
  (fields) => new Set(fields.map((field) => field.id)).size === fields.length,
  "栏目字段 ID 不能重复",
);
const sectionInput = z.object({
  name: z.string().trim().min(1, "请填写栏目名称").max(80),
  purpose: z.string().trim().max(500).default(""),
  guide: z.string().trim().max(3000).default(""),
  fields: sectionFields.default([]),
});
const topicInput = z.object({
  subject: z.string().trim().min(1, "请填写选题").max(180),
  note: z.string().trim().max(3000).default(""),
  source: z.string().trim().max(80).default("手动"),
  planDate: dateSchema.default(""),
  status: z.enum(["idea", "planned", "done"]).default("idea"),
  draftId: idSchema.nullable().optional(),
});

export const studioActionSchema = z.discriminatedUnion("action", [
  sampleInput.extend({ action: z.literal("saveSample") }),
  materialInput.extend({ action: z.literal("saveMaterial"), id: idSchema.optional() }),
  sectionInput.extend({ action: z.literal("saveSection"), id: idSchema.optional() }),
  topicInput.extend({ action: z.literal("saveTopic"), id: idSchema.optional() }),
  z.object({ action: z.literal("delete"), kind: z.enum(["sample", "material", "section", "topic"]), id: idSchema }),
  z.object({ action: z.literal("learnStyle") }),
]);
export type StudioAction = z.infer<typeof studioActionSchema>;

export const styleSampleSchema = sampleInput.extend({ id: idSchema, createdAt: timestampSchema });
export const materialSchema = materialInput.extend({ id: idSchema, createdAt: timestampSchema, updatedAt: timestampSchema });
export const sectionSchema = sectionInput.extend({ id: idSchema, createdAt: timestampSchema, updatedAt: timestampSchema });
export const topicSchema = topicInput.extend({ id: idSchema, draftId: idSchema.nullable(), createdAt: timestampSchema, updatedAt: timestampSchema });
export const studioStateSchema = z.object({
  version: z.literal(1),
  samples: z.array(styleSampleSchema).max(30),
  styleDigest: z.string().max(4000),
  styleUpdatedAt: timestampSchema.nullable(),
  materials: z.array(materialSchema).max(500),
  sections: z.array(sectionSchema).max(100),
  topics: z.array(topicSchema).max(1000),
});
export type StyleSample = z.infer<typeof styleSampleSchema>;
export type CreatorMaterial = z.infer<typeof materialSchema>;
export type CreatorSection = z.infer<typeof sectionSchema>;
export type CreatorTopic = z.infer<typeof topicSchema>;
export type StudioState = z.infer<typeof studioStateSchema>;

export function emptyStudioState(): StudioState {
  return { version: 1, samples: [], styleDigest: "", styleUpdatedAt: null, materials: [], sections: [], topics: [] };
}

export interface CreatorContextSnapshot {
  capturedAt: string;
  styleDigest: string;
  styleExcerpts: string[];
  materials: Array<{ id: string; title: string; kind: string; body: string }>;
  section: Pick<CreatorSection, "id" | "name" | "purpose" | "guide" | "fields"> | null;
  sectionInputs: Record<string, string>;
}

export class StudioError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
