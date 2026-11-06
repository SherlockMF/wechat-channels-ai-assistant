export function SpokenCueText({ text, emphasis, dark = false }: { text: string; emphasis: string[]; dark?: boolean }) {
  const words = [...new Set(emphasis.filter(word => word.trim() && text.includes(word)))].sort((a, b) => b.length - a.length);
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(`(${words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return <>{text.split(pattern).map((part, index) => words.includes(part)
    ? <strong key={index} className={`font-semibold underline decoration-2 underline-offset-4 ${dark ? "text-[#f2c574] decoration-[#f2c574]" : "text-pine decoration-[#559b7b]"}`}>{part}</strong>
    : part)}</>;
}
