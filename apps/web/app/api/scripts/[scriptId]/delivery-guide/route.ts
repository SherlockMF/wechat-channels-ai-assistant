import { NextResponse } from "next/server";
import { z } from "zod";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { guideForCurrentText } from "@/lib/script-workbench/delivery-guide";
import { generateAiDeliveryGuide } from "@/lib/script-workbench/ai-delivery-guide";

export const runtime = "nodejs";
const bodySchema = z.object({ text: z.string().min(1).max(200_000), mode: z.enum(["ai", "basic"]).default("ai") });

export async function POST(request: Request, context: { params: Promise<{ scriptId: string }> }) {
  try {
    const { scriptId } = await context.params;
    const owner = requestOwnerId(request);
    const draft = await repository.getScriptDraft(owner, scriptId);
    if (!draft) return NextResponse.json({ error: "脚本不存在" }, { status: 404 });
    const { text, mode } = bodySchema.parse(await request.json());
    if (mode === "ai") {
      if ((draft.editedPlainText ?? draft.output?.plainText ?? "") !== text) return NextResponse.json({ error: "正文尚未保存或已在别处修改，请保存并刷新后重试。" }, { status: 409 });
      const guide = await generateAiDeliveryGuide(draft, text, request.signal);
      const latest = await repository.getScriptDraft(owner, scriptId);
      if (!latest) return NextResponse.json({ error: "脚本已删除" }, { status: 404 });
      if ((latest.editedPlainText ?? latest.output?.plainText ?? "") !== text) return NextResponse.json({ error: "生成期间正文已变化，请按最新正文重新生成。" }, { status: 409 });
      const saved = await repository.updateScriptDraft(owner, scriptId, { rehearsalGuide: guide }, text);
      if (!saved) return NextResponse.json({ error: "脚本已删除，提示未保存。" }, { status: 404 });
      return NextResponse.json({ guide });
    }
    const guide = guideForCurrentText(draft.output, text);
    if (!guide) return NextResponse.json({ error: "当前没有可排练的口播正文，请先填写口播稿。" }, { status: 400 });
    return NextResponse.json({ guide });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : Number((error as { status?: number })?.status) || 502;
    return NextResponse.json({ error: error instanceof z.ZodError ? "正文不能为空，且不能超过 200000 字。" : error instanceof Error ? error.message : "口播提示生成失败，请稍后重试。" }, { status });
  }
}
