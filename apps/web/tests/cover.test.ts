import { describe, expect, it } from "vitest";
import {
  defaultCoverFrameSecond,
  fileBasename,
  pairCoversByBasename,
} from "@/lib/storage/cover";

describe("cover pairing", () => {
  it("按 basename 忽略扩展名配对", () => {
    const videos = [
      new File(["v"], "宣传片.mp4", { type: "video/mp4" }),
      new File(["v"], "其他.mp4", { type: "video/mp4" }),
    ];
    const covers = [new File(["c"], "宣传片.jpg", { type: "image/jpeg" })];
    const paired = pairCoversByBasename(videos, covers);
    expect(paired.has("宣传片.mp4")).toBe(true);
    expect(paired.has("其他.mp4")).toBe(false);
    expect(fileBasename("Foo.BAR.MP4")).toBe("foo.bar");
  });

  it("默认截帧落在 1 秒或片尾前", () => {
    expect(defaultCoverFrameSecond(30)).toBe(1);
    expect(defaultCoverFrameSecond(0.4)).toBeCloseTo(0.35, 2);
  });
});
