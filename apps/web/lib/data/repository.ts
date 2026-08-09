import { repository as cloudRepository } from "@/lib/data/cloud-repository";
import { LocalRepository } from "@/lib/data/local-repository";
import { ownerIdFromRequest } from "@/lib/data/owner";

function resolveRepositoryBackend(): "cloud" | "local" {
  const raw = (process.env.REPOSITORY_BACKEND ?? "cloud").trim().toLowerCase();
  return raw === "local" ? "local" : "cloud";
}

export const repository =
  resolveRepositoryBackend() === "local"
    ? new LocalRepository()
    : cloudRepository;

export function requestOwnerId(request: Request): string {
  return ownerIdFromRequest(request);
}
