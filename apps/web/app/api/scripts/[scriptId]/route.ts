import { NextResponse } from "next/server";
import { z } from "zod";
import {
  scriptDraftInputSchema,
  scriptDraftOutputSchema,
  scriptDraftStatusSchema,
} from "@video-diagnosis/shared-types";
import { repository, requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().nullable().optional(),
  ideaSummary: z.string().optional(),
  input: scriptDraftInputSchema.optional(),
  output: scriptDraftOutputSchema.nullable().optional(),
  status: scriptDraftStatusSchema.optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ scriptId: string }> },
) {
  const ownerId = requestOwnerId(request);
  const { scriptId } = await context.params;
  const draft = await repository.getScriptDraft(ownerId, scriptId);
  if (!draft) {
    return NextResponse.json({ error: "脚本不存在" }, { status: 404 });
  }
  return NextResponse.json({ draft });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ scriptId: string }> },
) {
  const ownerId = requestOwnerId(request);
  const { scriptId } = await context.params;
  try {
    const body = patchSchema.parse(await request.json());
    const draft = await repository.updateScriptDraft(ownerId, scriptId, body);
    if (!draft) {
      return NextResponse.json({ error: "脚本不存在" }, { status: 404 });
    }
    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "参数无效" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 422 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ scriptId: string }> },
) {
  const ownerId = requestOwnerId(request);
  const { scriptId } = await context.params;
  const ok = await repository.deleteScriptDraft(ownerId, scriptId);
  if (!ok) {
    return NextResponse.json({ error: "脚本不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
