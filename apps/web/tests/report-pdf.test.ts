import { afterEach, describe, expect, it, vi } from "vitest";
import { markdownToHtml } from "@/lib/reports/markdown-html";
import { exportMarkdownAsPdf } from "@/lib/reports/export-pdf";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("markdownToHtml", () => {
  it("转换标题、列表与粗体", () => {
    const html = markdownToHtml(`# 报告

## 摘要

- **完播**偏低
- 建议重剪开头

正文一句。
`);
    expect(html).toContain("<h1>报告</h1>");
    expect(html).toContain("<h2>摘要</h2>");
    expect(html).toContain("<li><strong>完播</strong>偏低</li>");
    expect(html).toContain("<p>正文一句。</p>");
  });

  it("转义 HTML 特殊字符", () => {
    const html = markdownToHtml("风险 <script> 与 & 符号");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<script>");
  });

  it("保留可写弹窗句柄并主动断开 opener", () => {
    const document = {
      readyState: "complete",
      open: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
    };
    const popup = {
      opener: {} as unknown,
      document,
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      onafterprint: null as (() => void) | null,
    };
    const open = vi.fn(() => popup);
    vi.stubGlobal("window", {
      open,
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });

    exportMarkdownAsPdf("# 测试报告", "报告.pdf");

    expect(open).toHaveBeenCalledWith("", "_blank", "width=920,height=720");
    expect(popup.opener).toBeNull();
    expect(document.write).toHaveBeenCalledWith(
      expect.stringContaining("<h1>测试报告</h1>"),
    );
    expect(popup.print).toHaveBeenCalledOnce();
  });
});
