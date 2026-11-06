"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";

export const inputClass = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-pine focus:ring-2 focus:ring-pine/10 disabled:bg-fog";
export type StudioActionHandler = (input: Record<string, unknown>, success: string) => Promise<boolean>;

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1.5"><span className="text-sm font-semibold text-ink">{label}</span>{children}{hint ? <span className="block text-xs leading-5 text-[#78857e]">{hint}</span> : null}</label>;
}

export function DeleteButton({ label, disabled, onDelete }: { label: string; disabled: boolean; onDelete: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[#edc2bc] bg-[#fff0ee] p-2">
      <span className="text-xs text-coral">确定删除{label}？</span>
      <Button type="button" variant="danger" size="sm" disabled={disabled} onClick={async () => { if (await onDelete()) setConfirming(false); }}>删除</Button>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setConfirming(false)}>取消</Button>
    </span>
  ) : <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setConfirming(true)}>删除</Button>;
}

export function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("zh-CN") : value;
}
