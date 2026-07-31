import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/draft-review/dashscope-provider";

describe("extractJsonObject", () => {
  it("解析纯 JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("解析 Markdown 代码块中的 JSON", () => {
    expect(extractJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
});
