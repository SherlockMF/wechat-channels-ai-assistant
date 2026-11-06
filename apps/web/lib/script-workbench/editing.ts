export interface ScriptSelection {
  document: string;
  start: number;
  end: number;
  text: string;
}

export function captureSelection(document: string, start: number, end: number): ScriptSelection {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > document.length || start >= end) {
    throw new Error("请先在全文编辑框里选中需要改写的文字");
  }
  const text = document.slice(start, end);
  if (!text.trim()) throw new Error("选区不能只有空白");
  if (text.length > 4_000) throw new Error("每次最多改写 4000 字，请缩小选区");
  return { document, start, end, text };
}

export function applySelectionEdit(document: string, selection: ScriptSelection, replacement: string): string {
  if (document !== selection.document || document.slice(selection.start, selection.end) !== selection.text) {
    throw new Error("正文已修改，请重新选择文字并生成建议");
  }
  if (!replacement.trim()) throw new Error("改写建议为空");
  return document.slice(0, selection.start) + replacement + document.slice(selection.end);
}

export const EDIT_ACTIONS = {
  natural: "更口语",
  shorten: "精简",
  expand: "讲清楚",
  professional: "更专业",
} as const;

export type EditAction = keyof typeof EDIT_ACTIONS;

export interface SaveSnapshot {
  value: string;
  saved: string;
  status: "saved" | "unsaved" | "saving" | "error";
  error: string;
}

/** Single writer: never issue the next PATCH until the previous response settles. */
export function createSerialTextSaver(initialText: string, persist: (text: string) => Promise<void>) {
  let value = initialText;
  let saved = initialText;
  let error = "";
  let active: Promise<boolean> | null = null;
  let disposed = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const snapshot = (): SaveSnapshot => ({
    value, saved, error,
    status: active ? "saving" : error ? "error" : value === saved ? "saved" : "unsaved",
  });
  return {
    snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update(next: string) {
      value = next;
      if (value === saved) error = "";
      notify();
    },
    flush(): Promise<boolean> {
      if (active) return active;
      if (disposed) return Promise.resolve(false);
      if (value === saved) return Promise.resolve(true);
      error = "";
      active = (async () => {
        while (!disposed && value !== saved) {
          const submitted = value;
          try {
            await persist(submitted);
            saved = submitted;
            notify();
          } catch (failure) {
            error = failure instanceof Error ? failure.message : "保存失败";
            return false;
          }
        }
        return !disposed;
      })().finally(() => { active = null; notify(); });
      notify();
      return active;
    },
    dispose() { disposed = true; listeners.clear(); },
  };
}

/** No fallback to the original output: deleted spoken content must stay deleted. */
export function extractPrompterText(text: string): string {
  const trimmed = text.trim();
  const spokenSection = trimmed.match(/(?:^|\n)【口播稿】[ \t]*(?:\r?\n|$)([\s\S]*?)(?=\n【[^\n】]+】|$)/u);
  if (spokenSection) return spokenSection[1]?.trim() ?? "";
  const spokenBlocks: string[] = [];
  let current: string[] | null = null;
  const finish = () => {
    const block = current?.join("\n").trim();
    if (block) spokenBlocks.push(block);
    current = null;
  };
  for (const line of trimmed.split(/\r?\n/u)) {
    const spoken = /^\s*说[：:][ \t]*(.*)$/u.exec(line);
    if (spoken) { finish(); current = [spoken[1] ?? ""]; }
    else if (/^\s*(?:【[^】]+】|(?:\d+[.、)]\s*)?拍[：:]|字幕[：:]|画面[：:]|转场[：:])/u.test(line)) finish();
    else if (current) current.push(line);
  }
  finish();
  if (spokenBlocks.length) return spokenBlocks.join("\n\n");
  if (/^【[^\n】]+】/mu.test(trimmed)) return "";
  return trimmed;
}

export interface ScriptRecovery {
  version: 1;
  text: string;
  baseText: string;
  updatedAt: string;
}
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function recoveryKey(ownerId: string, scriptId: string): string {
  return `script-recovery-v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(scriptId)}`;
}

export function readScriptRecovery(storage: RecoveryStorage, ownerId: string, scriptId: string, serverText: string): ScriptRecovery | null {
  const key = recoveryKey(ownerId, scriptId);
  const raw = storage.getItem(key);
  if (!raw) return null;
  let record: ScriptRecovery;
  try { record = JSON.parse(raw) as ScriptRecovery; } catch { return null; }
  if (record.version !== 1 || typeof record.text !== "string" || typeof record.baseText !== "string" || typeof record.updatedAt !== "string") return null;
  if (record.text === serverText) { storage.removeItem(key); return null; }
  return record;
}

export function clearScriptRecovery(storage: RecoveryStorage, ownerId: string, scriptId: string, savedText?: string): void {
  const key = recoveryKey(ownerId, scriptId);
  if (savedText === undefined) { storage.removeItem(key); return; }
  const raw = storage.getItem(key);
  if (!raw) return;
  try { if (JSON.parse(raw).text === savedText) storage.removeItem(key); } catch { /* Leave an unknown draft intact. */ }
}

export function writeScriptRecovery(storage: RecoveryStorage, ownerId: string, scriptId: string, state: SaveSnapshot): void {
  if (state.value === state.saved && state.status !== "saving") {
    clearScriptRecovery(storage, ownerId, scriptId, state.value);
    return;
  }
  const recovery: ScriptRecovery = { version: 1, text: state.value, baseText: state.saved, updatedAt: new Date().toISOString() };
  storage.setItem(recoveryKey(ownerId, scriptId), JSON.stringify(recovery));
}
