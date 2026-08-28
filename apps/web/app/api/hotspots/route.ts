import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  rejectInvalidHotspotRefreshToken,
  resolveHotspotRequestOwnerId,
} from "@/lib/hotspots/refresh-auth";

export const runtime = "nodejs";

const privateResponse = { "Cache-Control": "private, no-store" };

const hotspotResearchRequestSchema = z
  .object({ forceRefresh: z.boolean().optional() })
  .default({});

/** 空 body 等价于不带参数的刷新；非法 JSON 交给 zod 判 400。 */
async function parseRequestBody(request: Request): Promise<unknown> {
  const raw = (await request.text()).trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (process.env.SITES_DEPLOYMENT === "true") {
    return NextResponse.json(
      {
        error: "Sites/D1 暂不支持持久化热点研究，请使用本地或 Docker 部署。",
      },
      { status: 501, headers: privateResponse },
    );
  }
  const tokenRejected = rejectInvalidHotspotRefreshToken(request);
  if (tokenRejected) return tokenRejected;
  try {
    const ownerId = resolveHotspotRequestOwnerId(request);
    const input = hotspotResearchRequestSchema.parse(
      await parseRequestBody(request),
    );
    const [{ researchHotspots }, { resolveHotspotConfig }] = await Promise.all([
      import("@/lib/hotspots/service"),
      import("@/lib/hotspots/config"),
    ]);
    const result = await researchHotspots(ownerId, input, {
      config: await resolveHotspotConfig(),
    });
    return NextResponse.json(result, { headers: privateResponse });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ZodError
            ? "请求参数无效"
            : "热点抓取失败，请稍后重试",
      },
      { status: error instanceof ZodError ? 400 : 500, headers: privateResponse },
    );
  }
}
