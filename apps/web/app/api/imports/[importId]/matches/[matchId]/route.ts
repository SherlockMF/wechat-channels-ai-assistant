import { z } from "zod";
import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";

const bodySchema = z.object({ videoRecordId: z.string().uuid().nullable() });
type Context = {
  params: Promise<{ importId: string; matchId: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const { importId, matchId } = await context.params;
  const ownerId = requestOwnerId(request);
  const bundle = await repository.getImport(ownerId, importId);
  if (!bundle) {
    return NextResponse.json({ error: "导入批次不存在" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "请求参数无效", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (
    parsed.data.videoRecordId &&
    !bundle.records.some((record) => record.id === parsed.data.videoRecordId)
  ) {
    return NextResponse.json({ error: "候选记录不属于该导入批次" }, { status: 403 });
  }
  const match = await repository.confirmMatch(
    ownerId,
    matchId,
    parsed.data.videoRecordId,
  );
  return match
    ? NextResponse.json({ match })
    : NextResponse.json({ error: "匹配记录不存在" }, { status: 404 });
}
