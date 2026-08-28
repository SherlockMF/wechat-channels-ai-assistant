import { NextResponse } from "next/server";
import { requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";

const privateResponse = { "Cache-Control": "private, no-store" };

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (process.env.SITES_DEPLOYMENT === "true") {
    return NextResponse.json(
      {
        error: "Sites/D1 暂不支持持久化热点研究，请使用本地或 Docker 部署。",
      },
      { status: 501, headers: privateResponse },
    );
  }
  try {
    const ownerId = requestOwnerId(request);
    const { id } = await context.params;
    const { isHotspotSnapshotExpired, readHotspotSnapshot } = await import(
      "@/lib/hotspots/cache"
    );
    const snapshot = await readHotspotSnapshot(ownerId, id);
    if (!snapshot) {
      return NextResponse.json(
        { error: "热点快照不存在" },
        { status: 404, headers: privateResponse },
      );
    }
    const expired = isHotspotSnapshotExpired(snapshot);
    return NextResponse.json(
      { snapshot, stale: expired, expired },
      { headers: privateResponse },
    );
  } catch {
    return NextResponse.json(
      { error: "热点抓取失败，请稍后重试" },
      { status: 500, headers: privateResponse },
    );
  }
}
