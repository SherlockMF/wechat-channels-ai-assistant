import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, context: Context) {
  const { jobId } = await context.params;
  const job = await repository.retryJob(requestOwnerId(request), jobId);
  return job
    ? NextResponse.json({ job })
    : NextResponse.json({ error: "任务不存在" }, { status: 404 });
}
