import { NextResponse } from "next/server";
import { userSettingsSchema } from "@/lib/settings/schema";
import {
  loadUserSettings,
  maskUserSettings,
  mergeProviderUpdate,
  saveUserSettings,
} from "@/lib/settings/store";

export const runtime = "nodejs";

export async function GET() {
  const settings = await loadUserSettings();
  return NextResponse.json({ settings: maskUserSettings(settings) });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const patch = userSettingsSchema.parse(body);
    const current = await loadUserSettings();
    const merged = mergeProviderUpdate(current, patch);
    const saved = await saveUserSettings(merged);
    return NextResponse.json({ settings: maskUserSettings(saved) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "保存设置失败",
      },
      { status: 400 },
    );
  }
}
