import { describe, expect, it } from "vitest";
import {
  HOTSPOT_MAX_SOURCES,
  addHotspotSource,
  canAddHotspotSource,
  hotspotSourceLimitHint,
  nextHotspotSourceId,
  removeHotspotSource,
  resolveEditableHotspotSources,
  restoreDefaultHotspotSources,
  updateHotspotSource,
} from "@/lib/settings/hotspot-source-editor";

describe("hotspot source editor", () => {
  it("新增源 id 唯一且恢复默认与上限 30", () => {
    const first = addHotspotSource([], { name: "Demo Feed" });
    expect(first).toHaveLength(1);
    expect(first[0]?.id).toBe("demo-feed");
    const second = addHotspotSource(first, { name: "Demo Feed" });
    expect(second[1]?.id).toBe("demo-feed-2");

    let list = restoreDefaultHotspotSources();
    expect(list.length).toBeGreaterThan(0);
    expect(resolveEditableHotspotSources([]).usingDefaults).toBe(true);

    while (canAddHotspotSource(list)) {
      list = addHotspotSource(list, { name: `源 ${list.length}` });
    }
    expect(list.length).toBe(HOTSPOT_MAX_SOURCES);
    expect(canAddHotspotSource(list)).toBe(false);
    expect(hotspotSourceLimitHint(list)).toContain(String(HOTSPOT_MAX_SOURCES));
  });

  it("编辑与删除源", () => {
    const list = addHotspotSource([], { name: "IT之家", kind: "rss" });
    const id = list[0]!.id;
    const edited = updateHotspotSource(list, id, {
      name: "改名",
      kind: "rsshub",
      url: "/weibo/search/hot",
    });
    expect(edited[0]?.name).toBe("改名");
    expect(edited[0]?.kind).toBe("rsshub");
    expect(removeHotspotSource(edited, id)).toEqual([]);
  });

  it("nextHotspotSourceId 处理 slug 冲突", () => {
    const taken = [{ id: "foo" }, { id: "foo-2" }];
    expect(nextHotspotSourceId("Foo Bar", taken)).toBe("foo-bar");
    expect(nextHotspotSourceId("foo", taken)).toBe("foo-3");
  });
});
