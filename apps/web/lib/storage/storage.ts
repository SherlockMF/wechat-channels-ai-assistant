import type { VideoAsset } from "@video-diagnosis/shared-types";
import * as cloud from "@/lib/storage/cloud-storage";

type LocalStorage = typeof import("@/lib/storage/private-storage");

const sitesDeployment = process.env.SITES_DEPLOYMENT === "true";

function localStorage(): LocalStorage {
  return require("@/lib/storage/private-storage") as LocalStorage;
}

export function createAssetSignature(
  assetId: string,
  ownerId: string,
  expires: number,
): string {
  return sitesDeployment
    ? cloud.createAssetSignature(assetId, ownerId, expires)
    : localStorage().createAssetSignature(assetId, ownerId, expires);
}

export function verifyAssetSignature(
  assetId: string,
  ownerId: string,
  expires: number,
  signature: string,
): boolean {
  return sitesDeployment
    ? cloud.verifyAssetSignature(assetId, ownerId, expires, signature)
    : localStorage().verifyAssetSignature(assetId, ownerId, expires, signature);
}

export async function savePrivateVideo(
  ownerId: string,
  importId: string,
  file: File,
): Promise<VideoAsset> {
  return sitesDeployment
    ? cloud.savePrivateVideo(ownerId, importId, file)
    : localStorage().savePrivateVideo(ownerId, importId, file);
}

export async function servePrivateVideo(
  request: Request,
  asset: VideoAsset,
): Promise<Response> {
  return sitesDeployment
    ? cloud.servePrivateVideo(request, asset)
    : localStorage().servePrivateVideo(request, asset);
}
