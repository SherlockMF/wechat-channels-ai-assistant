import { NextResponse } from "next/server";
import { z } from "zod";
import {
  scriptDraftFormatSchema,
  scriptDraftInputSchema,
  scriptDraftProcessKindSchema,
  scriptDraftSmartSubTopicSchema,
  scriptDraftTopicSchema,
} from "@video-diagnosis/shared-types";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { topicRequired } from "@/lib/script-workbench/catalog";

export const runtime = "nodejs";

const createBodySchema = z.object({
  format: scriptDraftFormatSchema,
  topic: scriptDraftTopicSchema.nullable().optional(),
  subTopics: z.array(scriptDraftSmartSubTopicSchema).optional(),
  processKinds: z.array(scriptDraftProcessKindSchema).optional(),
  input: scriptDraftInputSchema,
  title: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  const ownerId = requestOwnerId(request);
  const items = await repository.listScriptDrafts(ownerId);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const ownerId = requestOwnerId(request);
  try {
    const body = createBodySchema.parse(await request.json());
    if (topicRequired(body.format) && !body.topic) {
      return NextResponse.json(
        { error: "该制作形态需要选择业务主题" },
        { status: 400 },
      );
    }
    const draft = await repository.generateScriptDraft(ownerId, {
      format: body.format,
      topic: body.topic ?? null,
      subTopics: body.subTopics,
      processKinds: body.processKinds,
      input: body.input,
      title: body.title,
    });
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "参数无效" },
        { status: 400 },
      );
    }
    const status =
      typeof error === "object" &&
      error &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 422;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "脚本生成失败" },
      { status },
    );
  }
}
