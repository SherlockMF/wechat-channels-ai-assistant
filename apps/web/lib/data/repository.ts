import { CloudRepository } from "@/lib/data/cloud-repository";
import { ownerIdFromRequest } from "@/lib/data/owner";

export const repository = new CloudRepository();

export function requestOwnerId(request: Request): string {
  return ownerIdFromRequest(request);
}
