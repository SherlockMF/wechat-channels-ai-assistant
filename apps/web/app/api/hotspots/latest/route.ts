import { NextResponse } from "next/server";
import { requestOwnerId } from "@/lib/data/repository";

export const runtime = "nodejs";

const privateResponse = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
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
    const [
      { hotspotConfigKey, isHotspotSnapshotExpired, isHotspotRefreshDue, readLatestHotspotSnapshot },
      { resolveHotspotConfig },
      { resolveHotspotRuntimeConfig },
    ] = await Promise.all([
      import("@/lib/hotspots/cache"),
      import("@/lib/hotspots/config"),
      import("@/lib/hotspots/sources"),
    ]);
    const config = resolveHotspotRuntimeConfig(await resolveHotspotConfig());
    const snapshot = await readLatestHotspotSnapshot(
      ownerId,
      hotspotConfigKey(config),
    );
    const expired = snapshot ? isHotspotSnapshotExpired(snapshot) : false;
    const refreshDue = snapshot ? isHotspotRefreshDue(snapshot) : false;
    // 没有快照也返回 200，由前端决定是否触发抓取，避免把「首次使用」当成错误。
    return NextResponse.json(
      // 本路由不抓取，stale 与 expired 同义，保留两个字段是为了和 POST 返回体对齐。
      { snapshot, stale: expired, expired, refreshDue },
      { headers: privateResponse },
    );
  } catch {
    return NextResponse.json(
      { error: "热点抓取失败，请稍后重试" },
      { status: 500, headers: privateResponse },
    );
  }
}
