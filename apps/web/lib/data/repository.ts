import { CloudRepository } from "@/lib/data/cloud-repository";

const sitesDeployment = process.env.SITES_DEPLOYMENT === "true";

function createLocalRepository() {
  if (process.env.APP_MODE === "REAL") {
    const { PostgresRepository } = require(
      "@/lib/data/postgres-repository",
    ) as typeof import("@/lib/data/postgres-repository");
    return new PostgresRepository();
  }
  const { LocalRepository } = require(
    "@/lib/data/local-repository",
  ) as typeof import("@/lib/data/local-repository");
  return new LocalRepository();
}

// Sites uses D1/R2; LOCAL reads the workbook/video directory; REAL shares PostgreSQL with Worker.
export const repository = sitesDeployment
  ? new CloudRepository()
  : createLocalRepository();

export function requestOwnerId(request: Request): string {
  return request.headers.get("x-owner-id")?.trim() || "local-user";
}
