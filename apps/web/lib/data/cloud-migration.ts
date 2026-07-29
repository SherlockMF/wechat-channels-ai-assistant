import type { AppState } from "@/lib/data/types";
import {
  cloudStateCounts,
  repository,
  seedCloudState,
} from "@/lib/data/cloud-repository";
import {
  migratedVideoInventory,
  putMigratedVideo,
} from "@/lib/storage/cloud-storage";

export async function migrateState(state: AppState) {
  return {
    state: await seedCloudState(state),
  };
}

export async function migrateVideo(
  assetId: string,
  body: ReadableStream<Uint8Array>,
) {
  const asset = await repository.getAsset("local-user", assetId);
  if (!asset) throw new Error(`视频资产 ${assetId} 不存在`);
  return putMigratedVideo(asset, body);
}

export async function migrationStatus() {
  const [state, videos] = await Promise.all([
    cloudStateCounts(),
    migratedVideoInventory(),
  ]);
  return { available: true, state, videos };
}
