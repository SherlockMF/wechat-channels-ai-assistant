"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearScriptRecovery, createSerialTextSaver, readScriptRecovery, writeScriptRecovery, type SaveSnapshot, type ScriptRecovery } from "@/lib/script-workbench/editing";

const EMPTY: SaveSnapshot = { value: "", saved: "", status: "saved", error: "" };

export function useScriptAutosave(
  scriptId: string,
  initialText: string | null,
  value: string,
  generatedText: string,
  ownerId: string | null,
) {
  const saverRef = useRef<ReturnType<typeof createSerialTextSaver> | null>(null);
  const currentRef = useRef(value);
  currentRef.current = value;
  const [snapshot, setSnapshot] = useState<SaveSnapshot>(EMPTY);
  const [recovery, setRecovery] = useState<ScriptRecovery | null>(null);
  const [recoveryStorageError, setRecoveryStorageError] = useState("");
  const pendingRecovery = useRef<ScriptRecovery | null>(null);
  const ready = initialText !== null && ownerId !== null;

  useEffect(() => {
    if (!ready) return;
    let recovered: ScriptRecovery | null = null;
    try {
      recovered = readScriptRecovery(localStorage, ownerId!, scriptId, initialText!);
      setRecoveryStorageError("");
    } catch { setRecoveryStorageError("浏览器恢复副本不可用，保存失败时请复制正文备份后再离开。"); }
    pendingRecovery.current = recovered;
    setRecovery(recovered);
    const saver = createSerialTextSaver(initialText!, async (submitted) => {
      const response = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editedPlainText: submitted === generatedText ? null : submitted }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      try { clearScriptRecovery(localStorage, ownerId!, scriptId, submitted); } catch { /* Server save succeeded; keep editing available. */ }
    });
    saverRef.current = saver;
    setSnapshot(saver.snapshot());
    const unsubscribe = saver.subscribe(() => {
      const next = saver.snapshot();
      setSnapshot(next);
      if (pendingRecovery.current) return;
      try {
        writeScriptRecovery(localStorage, ownerId!, scriptId, next);
        setRecoveryStorageError("");
      } catch { setRecoveryStorageError("浏览器恢复副本写入失败，保存失败时请复制正文备份后再离开。"); }
    });
    return () => {
      unsubscribe();
      // Finish only this document's queue; the detached saver cannot update the next editor.
      void saver.flush().finally(() => saver.dispose());
      if (saverRef.current === saver) saverRef.current = null;
    };
    // The initial server copy belongs to this document; save responses never reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, ownerId, ready]);

  useEffect(() => {
    const saver = saverRef.current;
    if (!saver || pendingRecovery.current) return;
    saver.update(value);
    if (value === saver.snapshot().saved) return;
    const timer = setTimeout(() => { void saver.flush(); }, 1_200);
    return () => clearTimeout(timer);
  }, [value, scriptId, ready, recovery]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const state = saverRef.current?.snapshot();
      if (!state || (currentRef.current === state.saved && state.status !== "saving")) return;
      event.preventDefault();
      event.returnValue = "";
    };
    // Next links do not trigger beforeunload; retain the editor if a save fails.
    const beforeNavigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const state = saverRef.current?.snapshot();
      if (!state || (currentRef.current === state.saved && state.status !== "saving")) return;
      const destination = new URL(target.href, location.href);
      if (destination.pathname === location.pathname && destination.search === location.search) return;
      event.preventDefault();
      event.stopPropagation();
      saverRef.current?.update(currentRef.current);
      void saverRef.current?.flush().then((ok) => { if (ok) location.assign(target.href); });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, []);

  const flush = useCallback(async () => {
    const saver = saverRef.current;
    if (!saver || pendingRecovery.current) return false;
    saver.update(currentRef.current);
    return saver.flush();
  }, []);
  function restoreRecovery(): string | null {
    const recovered = pendingRecovery.current;
    if (!recovered) return null;
    pendingRecovery.current = null;
    setRecovery(null);
    currentRef.current = recovered.text;
    saverRef.current?.update(recovered.text);
    return recovered.text;
  }
  function discardRecovery() {
    if (ownerId) {
      try { clearScriptRecovery(localStorage, ownerId, scriptId); }
      catch { setRecoveryStorageError("无法清除浏览器恢复副本，请检查浏览器存储权限。"); return; }
    }
    pendingRecovery.current = null;
    setRecovery(null);
  }
  return { ...snapshot, flush, recovery, recoveryStorageError, restoreRecovery, discardRecovery };
}
