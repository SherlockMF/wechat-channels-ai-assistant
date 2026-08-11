import { NextResponse } from "next/server";
import { requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (process.env.SITES_DEPLOYMENT === "true") {
    return NextResponse.json(
      {
        error: "Sites/D1 暂不支持持久化联网研究，请使用本地或 Docker 部署。",
      },
      { status: 501, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const ownerId = requestOwnerId(request);
  const { id } = await context.params;
  const {
    isViralResearchSnapshotExpired,
    readViralResearchSnapshot,
  } = await import("@/lib/viral-research/cache");
  const snapshot = await readViralResearchSnapshot(ownerId, id);
  if (!snapshot) {
    return NextResponse.json(
      { error: "研究快照不存在或无权访问" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.json(
    {
      snapshot,
      expired: isViralResearchSnapshotExpired(snapshot),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
