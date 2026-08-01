import { repository as cloudRepository } from "@/lib/data/cloud-repository";
import { ownerIdFromRequest } from "@/lib/data/owner";

export const repository = cloudRepository;

export function requestOwnerId(request: Request): string {
  return ownerIdFromRequest(request);
}
