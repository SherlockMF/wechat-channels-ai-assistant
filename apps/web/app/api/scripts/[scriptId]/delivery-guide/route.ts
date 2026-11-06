import { NextResponse } from "next/server";
import { z } from "zod";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { guideForCurrentText } from "@/lib/script-workbench/delivery-guide";

export const runtime = "nodejs";
const bodySchema = z.object({ text: z.string().min(1).max(200_000) });

export async function POST(request: Request, context: { params: Promise<{ scriptId: string }> }) {
  try {
    const { scriptId } = await context.params;
    const draft = await repository.getScriptDraft(requestOwnerId(request), scriptId);
    if (!draft) return NextResponse.json({ error: "脚本不存在" }, { status: 404 });
    const { text } = bodySchema.parse(await request.json());
    const guide = guideForCurrentText(draft.output, text);
    if (!guide) return NextResponse.json({ error: "当前没有可排练的口播正文，请先填写口播稿。" }, { status: 400 });
    return NextResponse.json({ guide });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "正文不能为空，且不能超过 200000 字。" : "口播提示生成失败，请稍后重试。" }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
