import type { AppState } from "@/lib/data/types";

export async function migrateState(_state: AppState): Promise<never> {
  throw new Error("?????? Sites ??????");
}

export async function migrateVideo(
  _assetId: string,
  _body: ReadableStream<Uint8Array>,
): Promise<never> {
  throw new Error("?????? Sites ??????");
}

export async function migrationStatus() {
  return { available: false };
}
