import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { loadUserSettings } from "@/lib/settings/store";
import { loadViralSamplesForResearch } from "@/lib/viral-research/samples";
import { viralResearchRequestSchema } from "@/lib/viral-research/types";

export const runtime = "nodejs";

const privateResponse = { "Cache-Control": "private, no-store" };

function sitesUnsupportedResponse() {
  return NextResponse.json(
    {
      error: "Sites/D1 暂不支持持久化联网研究，请使用本地或 Docker 部署。",
    },
    { status: 501, headers: privateResponse },
  );
}

async function runResearch(request: Request, body: unknown) {
  if (process.env.SITES_DEPLOYMENT === "true") {
    return sitesUnsupportedResponse();
  }
  const ownerId = requestOwnerId(request);
  const input = viralResearchRequestSchema.parse(body);
  const profile = (await loadUserSettings()).contentProfile;
  const enrichedInput = {
    ...input,
    query: {
      ...input.query,
      audience:
        input.query.audience || profile.audiences.join("、").slice(0, 120),
      contentGoal:
        input.query.contentGoal || profile.positioning.slice(0, 120),
      region: input.query.region || profile.region.slice(0, 120),
      targetPlatforms:
        input.query.targetPlatforms?.length
          ? input.query.targetPlatforms
          : profile.defaultPlatforms,
      platformOther:
        input.query.platformOther ||
        (profile.defaultPlatforms.includes("other")
          ? profile.otherPlatformName || undefined
          : undefined),
    },
  };
  const { researchViralVideos } = await import("@/lib/viral-research/service");
  const result = await researchViralVideos(ownerId, enrichedInput, {
    loadOwnedHistory: () => repository.listOwnerVideoRecords(ownerId),
    loadViralSamples: () =>
      loadViralSamplesForResearch(() => repository.listViralSamples(ownerId)),
  });
  return NextResponse.json(result, { headers: privateResponse });
}

export async function POST(request: Request) {
  if (process.env.SITES_DEPLOYMENT === "true") {
    return sitesUnsupportedResponse();
  }
  try {
    return await runResearch(request, await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ZodError
            ? "研究条件无效"
            : "联网爆款研究失败，请稍后重试",
      },
      { status: error instanceof ZodError ? 400 : 500, headers: privateResponse },
    );
  }
}

/** Query-string compatibility for callers that cannot issue a JSON POST. */
export async function GET(request: Request) {
  if (process.env.SITES_DEPLOYMENT === "true") {
    return sitesUnsupportedResponse();
  }
  const parameters = new URL(request.url).searchParams;
  const topic = parameters.get("topic")?.trim();
  if (!topic) {
    return NextResponse.json(
      { error: "缺少 topic" },
      { status: 400, headers: privateResponse },
    );
  }
  const optional = (key: string) => parameters.get(key)?.trim() || undefined;
  const targetPlatforms = optional("targetPlatforms")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  try {
    return await runResearch(request, {
      query: {
        topic,
        format: optional("format"),
        audience: optional("audience"),
        contentGoal: optional("contentGoal"),
        region: optional("region"),
        targetPlatforms,
        platformOther: optional("platformOther"),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ZodError
            ? "研究条件无效"
            : "联网爆款研究失败，请稍后重试",
      },
      { status: error instanceof ZodError ? 400 : 500, headers: privateResponse },
    );
  }
}
