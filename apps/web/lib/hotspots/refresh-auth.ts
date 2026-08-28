import { normalizeOwnerId } from "@/lib/data/owner";
import { requestOwnerId } from "@/lib/data/repository";

function readRefreshToken(request: Request): string {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return request.headers.get("x-hotspot-refresh-token")?.trim() ?? "";
}

/** 计划任务带 token 时可绕过浏览器会话；未配置 token 时返回 null。 */
export function hotspotRefreshOwnerId(request: Request): string | null {
  const expected = process.env.HOTSPOT_REFRESH_TOKEN?.trim();
  if (!expected) return null;
  const provided = readRefreshToken(request);
  if (!provided || provided !== expected) return null;
  return normalizeOwnerId(
    process.env.HOTSPOT_REFRESH_OWNER_ID?.trim() || "local-user",
  );
}

export function resolveHotspotRequestOwnerId(request: Request): string {
  return hotspotRefreshOwnerId(request) ?? requestOwnerId(request);
}

/** POST 专用：带了错误 token 时明确 401，避免误当成普通 owner。 */
export function rejectInvalidHotspotRefreshToken(
  request: Request,
): Response | null {
  const expected = process.env.HOTSPOT_REFRESH_TOKEN?.trim();
  if (!expected) return null;
  const provided = readRefreshToken(request);
  if (!provided) return null;
  if (provided === expected) return null;
  return new Response(JSON.stringify({ error: "热点刷新 token 无效" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}
