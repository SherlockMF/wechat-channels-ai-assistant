import { createHash } from "node:crypto";

const safeOwnerId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

/**
 * Owner IDs are also used as local storage path segments. Preserve ordinary
 * IDs, but map unsafe header values to a stable, non-reversible path segment.
 */
export function normalizeOwnerId(value: string | null | undefined): string {
  const raw = value?.trim() || "local-user";
  if (safeOwnerId.test(raw)) return raw;
  return `owner-${createHash("sha256").update(raw).digest("hex")}`;
}

export function ownerIdFromRequest(request: Request): string {
  return normalizeOwnerId(request.headers.get("x-owner-id"));
}
