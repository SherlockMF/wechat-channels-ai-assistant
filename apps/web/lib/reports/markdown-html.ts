/** 将诊断报告常用 Markdown 子集转为 HTML（标题 / 列表 / 粗体 / 段落）。 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function inlineMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/gu, "<strong>$1</strong>")
    .replace(/`([^`]+)`/gu, "<code>$1</code>");
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/gu, "\n").split("\n");
  const html: string[] = [];
  let inList = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/u.exec(trimmed);
    if (heading) {
      closeList();
      const level = heading[1]!.length;
      html.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`);
      continue;
    }

    const listItem = /^[-*•]\s+(.+)$/u.exec(trimmed);
    if (listItem) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(listItem[1]!)}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  closeList();
  return html.join("\n");
}

export function buildReportPrintDocument(
  documentTitle: string,
  markdown: string,
): string {
  const body = markdownToHtml(markdown);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1f2a24;
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif;
      font-size: 12.5px;
      line-height: 1.7;
    }
    h1 { font-size: 22px; margin: 0 0 16px; line-height: 1.35; }
    h2 { font-size: 16px; margin: 22px 0 10px; border-bottom: 1px solid #d7e0da; padding-bottom: 6px; }
    h3 { font-size: 14px; margin: 16px 0 8px; }
    h4 { font-size: 13px; margin: 12px 0 6px; }
    p { margin: 0 0 10px; }
    ul { margin: 0 0 12px; padding-left: 1.25em; }
    li { margin: 0 0 6px; }
    strong { font-weight: 700; }
    code {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 11.5px;
      background: #f3f6f4;
      padding: 0 4px;
      border-radius: 3px;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}
