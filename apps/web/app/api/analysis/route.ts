import { z } from "zod";
import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

const createSchema = z.object({
  videoRecordIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function GET(request: Request) {
  return NextResponse.json({
    rows: await repository.listQueue(requestOwnerId(request)),
  });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "请选择至少一条已匹配视频", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const jobs = await repository.createAnalysisJobs(
    requestOwnerId(request),
    parsed.data.videoRecordIds,
  );
  return NextResponse.json({ jobs }, { status: 201 });
}
