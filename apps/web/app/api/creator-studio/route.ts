import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOwnerId, repository } from "@/lib/data/repository";
import { applyStudioAction, loadStudio } from "@/lib/creator-studio/service";
import { StudioError, studioActionSchema } from "@/lib/creator-studio/types";

export const runtime = "nodejs";

function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "资料格式无效" }, { status: 400 });
  if (error instanceof StudioError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "创作资料操作失败，请稍后重试；现有样本和素材已保留。" }, { status: 500 });
}

export async function GET(request: Request) {
  try { return NextResponse.json({ state: await loadStudio(requestOwnerId(request)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 100_000) throw new StudioError("请求内容过长", 413);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new StudioError("请求内容不是有效 JSON"); }
    const action = studioActionSchema.parse(raw);
    const ownerId = requestOwnerId(request);
    if ((action.action === "saveSample" || action.action === "saveTopic") && action.draftId) {
      if (!(await repository.getScriptDraft(ownerId, action.draftId))) throw new StudioError("关联稿件不存在", 404);
    }
    return NextResponse.json({ state: await applyStudioAction(ownerId, action) });
  } catch (error) { return failure(error); }
}
