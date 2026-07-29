import { NextResponse } from "next/server";
import { repository, requestOwnerId } from "@/lib/data/repository";
import { createAssetSignature } from "@/lib/storage/storage";

export const runtime = "nodejs";

type Context = { params: Promise<{ importId: string }> };

export async function GET(request: Request, context: Context) {
  const { importId } = await context.params;
  const ownerId = requestOwnerId(request);
  const bundle = await repository.getImport(ownerId, importId);
  if (!bundle) {
    return NextResponse.json({ error: "导入批次不存在" }, { status: 404 });
  }
  const expires = Date.now() + 15 * 60_000;
  return NextResponse.json({
    ...bundle,
    assets: bundle.assets.map((asset) => ({
      ...asset,
      previewUrl: `/api/assets/${asset.id}?owner=${encodeURIComponent(
        ownerId,
      )}&expires=${expires}&signature=${createAssetSignature(
        asset.id,
        ownerId,
        expires,
      )}`,
    })),
  });
}

export async function DELETE(request: Request, context: Context) {
  const { importId } = await context.params;
  const rolledBack = await repository.rollbackImport(
    requestOwnerId(request),
    importId,
  );
  return rolledBack
    ? NextResponse.json({ rolledBack: true })
    : NextResponse.json({ error: "导入批次不存在" }, { status: 404 });
}
