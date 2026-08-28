import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";

const privateResponse = { "Cache-Control": "private, no-store" };

function unsupportedResponse() {
  return NextResponse.json(
    {
      error:
        "爆款样本库当前仅支持本地 LOCAL 模式，Sites/REAL 部署请等待后续版本。",
    },
    { status: 501, headers: privateResponse },
  );
}

function localOnly(): boolean {
  if (process.env.SITES_DEPLOYMENT === "true") return false;
  return (process.env.REPOSITORY_BACKEND ?? "cloud").trim().toLowerCase() === "local";
}

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  if (!localOnly()) return unsupportedResponse();
  try {
    const ownerId = requestOwnerId(request);
    const { id } = await context.params;
    const removed = await repository.deleteViralSample(ownerId, id);
    if (!removed) {
      return NextResponse.json(
        { error: "样本不存在" },
        { status: 404, headers: privateResponse },
      );
    }
    return NextResponse.json({ ok: true }, { headers: privateResponse });
  } catch {
    return NextResponse.json(
      { error: "删除爆款样本失败" },
      { status: 500, headers: privateResponse },
    );
  }
}
