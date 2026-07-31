import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ scriptId: string }> },
) {
  const ownerId = requestOwnerId(request);
  const { scriptId } = await context.params;
  try {
    const draft = await repository.regenerateScriptDraft(ownerId, scriptId);
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    const status =
      typeof error === "object" &&
      error &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 422;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "再生成失败" },
      { status },
    );
  }
}
