import { describe, expect, it } from "vitest";
import {
  applySelectionEdit,
  createSerialTextSaver,
  captureSelection,
  extractPrompterText,
  readScriptRecovery,
  writeScriptRecovery,
  clearScriptRecovery,
} from "@/lib/script-workbench/editing";

describe("选区编辑", () => {
  it("只替换选中的那一处，保留其余内容", () => {
    const text = "第一句。重复。第二句。重复。";
    const selection = captureSelection(text, 4, 7);
    expect(applySelectionEdit(text, selection, "新句。")).toBe("第一句。新句。第二句。重复。");
  });
  it("文档任意位置变更后拒绝使用旧选区", () => {
    const selection = captureSelection("前文正文后文", 2, 4);
    expect(() => applySelectionEdit("改文正文后文", selection, "替换")).toThrow("已修改");
  });
  it("拒绝空选区和越界位置", () => {
    expect(() => captureSelection("正文", 1, 1)).toThrow();
    expect(() => captureSelection("正文", 0, 3)).toThrow();
  });
});

describe("串行自动保存", () => {
  it("保存期间的新输入排到下一次，不发生并行或丢失", async () => {
    const calls: string[] = [];
    let release!: () => void;
    const saver = createSerialTextSaver("初稿", async (text) => {
      calls.push(text);
      if (calls.length === 1) await new Promise<void>((resolve) => { release = resolve; });
    });
    saver.update("第一版");
    const first = saver.flush();
    saver.update("第二版");
    const second = saver.flush();
    expect(calls).toEqual(["第一版"]);
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(calls).toEqual(["第一版", "第二版"]);
    expect(saver.snapshot()).toMatchObject({ status: "saved", saved: "第二版", value: "第二版" });
  });
  it("失败后保留未保存文本，手动重试可恢复", async () => {
    let attempts = 0;
    const saver = createSerialTextSaver("旧稿", async () => {
      if (++attempts === 1) throw new Error("网络断开");
    });
    saver.update("新稿");
    expect(await saver.flush()).toBe(false);
    expect(saver.snapshot()).toMatchObject({ status: "error", value: "新稿", saved: "旧稿" });
    expect(await saver.flush()).toBe(true);
    expect(saver.snapshot().status).toBe("saved");
  });
});

describe("提词正文", () => {
  it("从编辑后的制作包只提取口播，不读标题和拍摄提示", () => {
    expect(extractPrompterText("【标题备选】\n标题\n【口播稿】\n新的口播\n【穿插素材】\n拍摄提示")).toBe("新的口播");
  });
  it("跟拍稿只保留说的内容", () => {
    expect(extractPrompterText("【拍摄/剪辑顺序】\n1. 拍：镜头\n  说：第一句话\n  字幕：字卡\n2. 拍：现场\n  说：第二句话")).toBe("第一句话\n\n第二句话");
  });
  it("跟拍稿保留说的多行续句，遇到字幕和下一镜头才结束", () => {
    expect(extractPrompterText("【拍摄/剪辑顺序】\n1. 拍：水管\n  说：先看这个接口。\n这里还有一处接缝，\n要一起检查。\n  字幕：检查接口\n2. 拍：测试\n  说：再测水压。\n确认没有渗漏。\n【补拍/注意】\n不要念这条")).toBe("先看这个接口。\n这里还有一处接缝，\n要一起检查。\n\n再测水压。\n确认没有渗漏。");
  });
  it("制作包中的口播被删除后不回退到旧稿", () => {
    expect(extractPrompterText("【口播稿】\n\n【穿插素材】\n镜头")).toBe("");
    expect(extractPrompterText("【标题备选】\n标题\n【剪辑建议】\n切镜头")).toBe("");
  });
  it("用户仅保留纯正文时直接使用", () => {
    expect(extractPrompterText("用户手写的新正文")).toBe("用户手写的新正文");
  });
});

describe("失败离开后的恢复稿", () => {
  function storage() {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    };
  }
  it("保存失败离开再返回仍能找回修改，按owner及脚本隔离", async () => {
    const disk = storage();
    const saver = createSerialTextSaver("服务器旧稿", async () => { throw new Error("离线"); });
    saver.update("未保存的新稿");
    writeScriptRecovery(disk, "alice", "script-a", saver.snapshot());
    expect(await saver.flush()).toBe(false);
    saver.dispose();
    expect(readScriptRecovery(disk, "alice", "script-a", "服务器旧稿")?.text).toBe("未保存的新稿");
    expect(readScriptRecovery(disk, "bob", "script-a", "服务器旧稿")).toBeNull();
    expect(readScriptRecovery(disk, "alice", "script-b", "服务器旧稿")).toBeNull();
  });
  it("迟到的旧保存成功不会清除更新的恢复稿", () => {
    const disk = storage();
    writeScriptRecovery(disk, "alice", "script", { value: "新输入", saved: "旧稿", status: "unsaved", error: "" });
    clearScriptRecovery(disk, "alice", "script", "已提交的旧输入");
    expect(readScriptRecovery(disk, "alice", "script", "旧稿")?.text).toBe("新输入");
    clearScriptRecovery(disk, "alice", "script", "新输入");
    expect(readScriptRecovery(disk, "alice", "script", "新输入")).toBeNull();
  });
  it("服务端已保存同一内容时不再要求恢复", () => {
    const disk = storage();
    writeScriptRecovery(disk, "alice", "script", { value: "新稿", saved: "旧稿", status: "unsaved", error: "" });
    expect(readScriptRecovery(disk, "alice", "script", "新稿")).toBeNull();
  });
});
