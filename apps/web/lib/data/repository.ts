import { CloudRepository } from "@/lib/data/cloud-repository";
import { LocalRepository } from "@/lib/data/local-repository";
import { PostgresRepository } from "@/lib/data/postgres-repository";

const sitesDeployment = process.env.SITES_DEPLOYMENT === "true";

// Sites uses D1/R2; LOCAL reads the workbook/video directory; REAL shares PostgreSQL with Worker.
export const repository = sitesDeployment
  ? new CloudRepository()
  : process.env.APP_MODE === "REAL"
    ? new PostgresRepository()
    : new LocalRepository();

export function requestOwnerId(request: Request): string {
  return request.headers.get("x-owner-id")?.trim() || "local-user";
}
