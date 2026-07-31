import fs from "node:fs";
import path from "node:path";

let loaded = false;

/** Next 默认只读 apps/web/.env；仓库根目录 .env 在运行时补载一次。 */
export function ensureRepoEnvLoaded(): void {
  if (loaded) return;
  loaded = true;
  if (process.env.DASHSCOPE_API_KEY || process.env.VISION_API_KEY) return;

  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../.env"),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const text = fs.readFileSync(filePath, "utf8");
      for (const line of text.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env) || !process.env[key]) {
          process.env[key] = value;
        }
      }
      break;
    } catch {
      // try next candidate
    }
  }
}
