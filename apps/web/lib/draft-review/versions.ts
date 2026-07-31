import type {
  DraftReview,
  DraftReviewResult,
  DraftReviewVersion,
} from "@video-diagnosis/shared-types";
import { DRAFT_REVIEW_MAX_VERSIONS } from "@video-diagnosis/shared-types";
import { createId } from "@/lib/id";

export { DRAFT_REVIEW_MAX_VERSIONS };

export function versionFromDraftFields(
  draft: DraftReview,
  versionId = createId(),
  versionNumber = 1,
): DraftReviewVersion {
  return {
    id: versionId,
    draftReviewId: draft.id,
    versionNumber,
    originalFilename: draft.originalFilename,
    storagePath: draft.storagePath,
    mimeType: draft.mimeType,
    fileSize: draft.fileSize,
    durationSeconds: draft.durationSeconds,
    width: draft.width,
    height: draft.height,
    fps: draft.fps,
    coverPath: draft.coverPath,
    coverSource: draft.coverSource,
    coverFrameSecond: draft.coverFrameSecond,
    evidencePath: draft.evidencePath,
    status: draft.status,
    progress: draft.progress,
    currentStep: draft.currentStep,
    errorMessage: draft.errorMessage,
    createdAt: draft.createdAt,
    completedAt: draft.completedAt,
  };
}

export function applyVersionToDraft(
  draft: DraftReview,
  version: DraftReviewVersion,
  versionCount: number,
): void {
  draft.currentVersionId = version.id;
  draft.versionCount = versionCount;
  draft.originalFilename = version.originalFilename;
  draft.storagePath = version.storagePath;
  draft.mimeType = version.mimeType;
  draft.fileSize = version.fileSize;
  draft.durationSeconds = version.durationSeconds;
  draft.width = version.width;
  draft.height = version.height;
  draft.fps = version.fps;
  draft.coverPath = version.coverPath;
  draft.coverSource = version.coverSource;
  draft.coverFrameSecond = version.coverFrameSecond;
  draft.evidencePath = version.evidencePath;
  draft.status = version.status;
  draft.progress = version.progress;
  draft.currentStep = version.currentStep;
  draft.errorMessage = version.errorMessage;
  draft.completedAt = version.completedAt;
}

/** 将旧版无 versions 的审片迁移为 v1；结果补上 versionId。 */
export function migrateDraftReviewVersions(state: {
  draftReviews: DraftReview[];
  draftReviewVersions: DraftReviewVersion[];
  draftResults: DraftReviewResult[];
}): boolean {
  if (!state.draftReviewVersions) state.draftReviewVersions = [];
  if (!state.draftResults) state.draftResults = [];
  let changed = false;

  for (const draft of state.draftReviews) {
    if (draft.currentVersionId == null) {
      draft.currentVersionId = null;
      changed = true;
    }
    if (typeof draft.versionCount !== "number") {
      draft.versionCount = 0;
      changed = true;
    }

    const existing = state.draftReviewVersions.filter(
      (item) => item.draftReviewId === draft.id,
    );
    if (existing.length === 0 && draft.storagePath) {
      const versionId = createId();
      const version = versionFromDraftFields(draft, versionId, 1);
      state.draftReviewVersions.push(version);
      draft.currentVersionId = version.id;
      draft.versionCount = 1;
      changed = true;

      for (const result of state.draftResults) {
        if (result.draftReviewId === draft.id && !result.draftReviewVersionId) {
          result.draftReviewVersionId = version.id;
          if (result.changelog === undefined) result.changelog = null;
          changed = true;
        }
      }
    } else if (existing.length > 0) {
      const sorted = [...existing].sort(
        (a, b) => a.versionNumber - b.versionNumber,
      );
      if (!draft.currentVersionId) {
        draft.currentVersionId = sorted[sorted.length - 1]!.id;
        changed = true;
      }
      if (draft.versionCount !== sorted.length) {
        draft.versionCount = sorted.length;
        changed = true;
      }
    }
  }

  for (const result of state.draftResults) {
    if (result.changelog === undefined) {
      result.changelog = null;
      changed = true;
    }
    if (!result.draftReviewVersionId) {
      const versions = state.draftReviewVersions
        .filter((item) => item.draftReviewId === result.draftReviewId)
        .sort((a, b) => a.versionNumber - b.versionNumber);
      if (versions[0]) {
        result.draftReviewVersionId = versions[0].id;
        changed = true;
      }
    }
  }

  return changed;
}

export function canAddDraftVersion(
  versions: DraftReviewVersion[],
  draftStatus: DraftReview["status"],
): { ok: true } | { ok: false; status: 409 | 422; error: string } {
  if (draftStatus === "processing" || versions.some((item) => item.status === "processing")) {
    return { ok: false, status: 409, error: "正在分析中，请稍后再传新版本" };
  }
  if (versions.length >= DRAFT_REVIEW_MAX_VERSIONS) {
    return {
      ok: false,
      status: 422,
      error: `每条审片最多 ${DRAFT_REVIEW_MAX_VERSIONS} 个版本`,
    };
  }
  return { ok: true };
}
