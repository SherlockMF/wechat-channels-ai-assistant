import { buildReportPrintDocument } from "@/lib/reports/markdown-html";

/**
 * 将 Markdown 报告导出为 PDF：打开打印预览，用户在对话框中选择「另存为 PDF」。
 * 使用系统中文字体，避免嵌入字体依赖。
 */
export function exportMarkdownAsPdf(
  markdown: string,
  filenameBase: string,
): void {
  if (typeof window === "undefined") {
    throw new Error("PDF 导出仅可在浏览器中使用");
  }
  const title = filenameBase.replace(/\.pdf$/iu, "") || "诊断报告";
  const html = buildReportPrintDocument(title, markdown);
  // `noopener` may intentionally make window.open return null in some browsers,
  // which prevents us from writing the print document even though the tab opened.
  const popup = window.open("", "_blank", "width=920,height=720");
  if (!popup) {
    throw new Error("浏览器拦截了弹窗，请允许后重试，或在打印对话框中选择「另存为 PDF」");
  }
  popup.opener = null;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();

  const triggerPrint = () => {
    try {
      popup.print();
    } catch {
      // ignore; user can still print manually
    }
  };

  // 等样式与字体就绪再打印；onafterprint 后关闭窗口
  popup.onafterprint = () => {
    try {
      popup.close();
    } catch {
      // ignore
    }
  };

  if (popup.document.readyState === "complete") {
    window.setTimeout(triggerPrint, 250);
  } else {
    popup.addEventListener("load", () => {
      window.setTimeout(triggerPrint, 250);
    });
  }
}
