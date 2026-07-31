import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestTagsFromTitle } from "@/lib/draft-review/suggest-tags";

export const runtime = "nodejs";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "需要提供视频标题" }, { status: 400 });
  }
  try {
    const result = await suggestTagsFromTitle(parsed.data.title);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "标签归纳失败" },
      { status: 422 },
    );
  }
}
