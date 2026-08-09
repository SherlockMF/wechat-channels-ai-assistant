import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/settings/health";

export const runtime = "nodejs";

export async function GET() {
  const checks = await runHealthChecks();
  const ok = checks.every((check) => check.ok || check.id === "api");
  return NextResponse.json({
    ok,
    checks,
    allCriticalOk: checks
      .filter((check) => check.id !== "api")
      .every((check) => check.ok),
  });
}
