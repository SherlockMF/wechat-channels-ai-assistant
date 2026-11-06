import type { ContentProfileSettings } from "@/lib/settings/schema";
import type { ScriptCreatorContextSnapshot, ScriptDraft, ScriptDraftInput } from "@video-diagnosis/shared-types";
import { normalizeContentProfile } from "@/lib/settings/content-profile";
import { buildCreatorContext, loadStudio, markTopicWritten } from "@/lib/creator-studio/service";

export function captureScriptContext(
  profile: Partial<ContentProfileSettings>,
  context: ScriptCreatorContextSnapshot,
) {
  return {
    accountProfileSnapshot: structuredClone(normalizeContentProfile(profile)),
    creatorContextSnapshot: structuredClone(context),
  };
}

export type CapturedScriptContext = ReturnType<typeof captureScriptContext>;

export function contextForRegeneration(draft: Pick<ScriptDraft, "accountProfileSnapshot" | "creatorContextSnapshot">): CapturedScriptContext | undefined {
  return draft.accountProfileSnapshot && draft.creatorContextSnapshot
    ? captureScriptContext(draft.accountProfileSnapshot, draft.creatorContextSnapshot)
    : undefined;
}

export async function prepareScriptContext(
  ownerId: string,
  input: ScriptDraftInput,
  profile: ContentProfileSettings,
) {
  if (input.creatorTopicId) {
    const state = await loadStudio(ownerId);
    if (!state.topics.some((topic) => topic.id === input.creatorTopicId)) {
      throw Object.assign(new Error("选题已删除或不属于当前账号，请重新选择"), { status: 404 });
    }
  }
  const context = await buildCreatorContext(ownerId, {
    topic: input.idea,
    sectionId: input.creatorSectionId,
    sectionInputs: input.creatorSectionInputs,
  });
  return captureScriptContext(profile, context);
}

/** 选题关联失败不能让已保存的稿件变成失败并诱发重复生成。 */
export async function linkWrittenTopic(draft: ScriptDraft): Promise<string | null> {
  if (!draft.input.creatorTopicId || draft.provider?.startsWith("mock")) return null;
  try {
    const linked = await markTopicWritten(draft.ownerId, draft.input.creatorTopicId, draft.id);
    return linked ? null : "稿件已保存，但原选题已删除，未关联选题池。";
  } catch {
    return "稿件已保存，但选题池关联失败，请在创作资料中手动关联。";
  }
}
