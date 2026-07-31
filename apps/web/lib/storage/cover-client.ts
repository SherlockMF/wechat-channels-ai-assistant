/** Browser-safe helpers mirrored from server cover utils. */

const coverExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function fileBasename(filename: string): string {
  const base = filename.includes("/") || filename.includes("\\")
    ? filename.split(/[/\\]/u).pop() ?? filename
    : filename;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).toLocaleLowerCase();
}

export function isCoverImageFile(file: File): boolean {
  const name = file.name.toLocaleLowerCase();
  const extension = name.slice(name.lastIndexOf("."));
  if (!coverExtensions.has(extension)) return false;
  if (file.type && !file.type.startsWith("image/") && file.type !== "application/octet-stream") {
    return false;
  }
  return true;
}
