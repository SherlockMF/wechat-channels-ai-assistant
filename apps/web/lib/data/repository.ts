import { LocalRepository } from "@/lib/data/local-repository";
import { PostgresRepository } from "@/lib/data/postgres-repository";

// LOCAL 直接读取用户指定的工作簿和视频目录；REAL 与 Worker 共享 PostgreSQL。
export const repository =
  process.env.APP_MODE === "REAL"
    ? new PostgresRepository()
    : new LocalRepository();

export function requestOwnerId(request: Request): string {
  return request.headers.get("x-owner-id")?.trim() || "local-user";
}
