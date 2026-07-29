import { z } from "zod";
import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

const updateSchema = z.object({ markdown: z.string().min(1).max(200_000) });
type Context = { params: Promise<{ videoId: string }> };

export async function GET(request: Request, context: Context) {
  const { videoId } = await context.params;
  const markdown = await repository.reportMarkdown(
    requestOwnerId(request),
    videoId,
  );
  return markdown === null
    ? NextResponse.json({ error: "报告尚未生成" }, { status: 404 })
    : NextResponse.json({ markdown });
}

export async function PATCH(request: Request, context: Context) {
  const { videoId } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "报告内容无效" }, { status: 400 });
  }
  const result = await repository.saveEditedReport(
    requestOwnerId(request),
    videoId,
    parsed.data.markdown,
  );
  return result
    ? NextResponse.json({ saved: true, updatedAt: result.updatedAt })
    : NextResponse.json({ error: "报告不存在" }, { status: 404 });
}
