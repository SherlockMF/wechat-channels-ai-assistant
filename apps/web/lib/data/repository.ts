import { CloudRepository } from "@/lib/data/cloud-repository";

export const repository = new CloudRepository();

export function requestOwnerId(request: Request): string {
  return request.headers.get("x-owner-id")?.trim() || "local-user";
}
