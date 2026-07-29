import { NextResponse } from "next/server";
import type { AppState } from "@/lib/data/types";
import {
  migrateState,
  migrateVideo,
  migrationStatus,
} from "@/lib/data/migration";

export const runtime = "nodejs";

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<AppState>;
  return [
    state.imports,
    state.records,
    state.assets,
    state.matches,
    state.jobs,
    state.results,
  ].every(Array.isArray);
}

export async function GET() {
  return NextResponse.json(await migrationStatus());
}

export async function POST(request: Request) {
  try {
    const state = await request.json();
    if (!isAppState(state)) {
      return NextResponse.json({ error: "????????" }, { status: 400 });
    }
    return NextResponse.json(await migrateState(state));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "??????" },
      { status: 422 },
    );
  }
}

export async function PUT(request: Request) {
  const assetId = new URL(request.url).searchParams.get("assetId")?.trim();
  if (!assetId || !request.body) {
    return NextResponse.json(
      { error: "?? assetId ?????" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await migrateVideo(assetId, request.body));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "??????" },
      { status: 422 },
    );
  }
}
