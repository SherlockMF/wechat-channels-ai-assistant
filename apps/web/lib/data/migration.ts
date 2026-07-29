import type { AppState } from "@/lib/data/types";
import {
  migrateState as migrateCloudState,
  migrateVideo as migrateCloudVideo,
  migrationStatus as cloudMigrationStatus,
} from "@/lib/data/cloud-migration";

const sitesDeployment = process.env.SITES_DEPLOYMENT === "true";

export async function migrateState(state: AppState) {
  if (!sitesDeployment) throw new Error("Migration is only available on Sites");
  return migrateCloudState(state);
}

export async function migrateVideo(
  assetId: string,
  body: ReadableStream<Uint8Array>,
) {
  if (!sitesDeployment) throw new Error("Migration is only available on Sites");
  return migrateCloudVideo(assetId, body);
}

export async function migrationStatus() {
  return sitesDeployment
    ? cloudMigrationStatus()
    : { available: false };
}
