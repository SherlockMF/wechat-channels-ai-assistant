const emojiPattern =
  /[\p{Extended_Pictographic}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}]/gu;
const hashtagPattern = /#[^#\s]+/gu;
const copySuffixPattern =
  /(?:[_\-\s]*(?:副本|copy|final|最终版|修改版|修订版|定稿|v\d+|xWT\d+))+$/giu;

export function normalizePlatformVideoId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.replace(/^export\//i, "").trim() || null;
}

export function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\.(mp4|mov|webm)$/i, "")
    .replace(/^[\s【\[(（]*(?:\d{1,4}|[一二三四五六七八九十]+)[\s._、\-）)\]】]+/u, "")
    .replace(hashtagPattern, " ")
    .replace(emojiPattern, "")
    .replace(/[，。！？；：“”‘’《》【】（）]/gu, (character) => {
      const map: Record<string, string> = {
        "，": ",",
        "。": ".",
        "！": "!",
        "？": "?",
        "；": ";",
        "：": ":",
        "“": '"',
        "”": '"',
        "‘": "'",
        "’": "'",
        "《": "<",
        "》": ">",
        "【": "[",
        "】": "]",
        "（": "(",
        "）": ")",
      };
      return map[character] ?? character;
    })
    .replace(copySuffixPattern, "")
    .replace(/[\s\r\n\t]+/gu, "")
    .replace(/[^\p{Script=Han}a-zA-Z0-9]/gu, "")
    .toLocaleLowerCase("zh-CN");
}
