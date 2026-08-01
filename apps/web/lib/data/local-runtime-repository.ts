import { LocalRepository } from "@/lib/data/local-repository";
import { PostgresRepository } from "@/lib/data/postgres-repository";
import { ownerIdFromRequest } from "@/lib/data/owner";

export const repository =
  process.env.APP_MODE === "REAL"
    ? new PostgresRepository()
    : new LocalRepository();

export function requestOwnerId(request: Request): string {
  return ownerIdFromRequest(request);
}
