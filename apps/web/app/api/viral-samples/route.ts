import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { viralSampleCreateSchema } from "@video-diagnosis/shared-types";
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

export async function GET(request: Request) {
  if (!localOnly()) return unsupportedResponse();
  try {
    const ownerId = requestOwnerId(request);
    const items = await repository.listViralSamples(ownerId);
    return NextResponse.json({ items }, { headers: privateResponse });
  } catch {
    return NextResponse.json(
      { error: "读取爆款样本失败" },
      { status: 500, headers: privateResponse },
    );
  }
}

export async function POST(request: Request) {
  if (!localOnly()) return unsupportedResponse();
  try {
    const ownerId = requestOwnerId(request);
    const input = viralSampleCreateSchema.parse(await request.json());
    if (input.platform === "other" && !input.platformOther?.trim()) {
      return NextResponse.json(
        { error: "平台选择「其他」时请填写平台名称" },
        { status: 400, headers: privateResponse },
      );
    }
    const sample = await repository.createViralSample(ownerId, input);
    return NextResponse.json({ sample }, { status: 201, headers: privateResponse });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ZodError
            ? "样本参数无效"
            : error instanceof Error
              ? error.message
              : "保存爆款样本失败",
      },
      {
        status: error instanceof ZodError ? 400 : 500,
        headers: privateResponse,
      },
    );
  }
}
