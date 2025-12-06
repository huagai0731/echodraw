import { useCallback, useEffect, useRef } from "react";
import localforage from "localforage";
import type { UploadState } from "./useUploadState";

const DRAFT_STORAGE_KEY = "echo-upload-draft";

type DraftData = {
  title: string;
  description: string;
  tags: (string | number)[];
  mood: number | null; // 改为 number | null 以匹配 UploadState
  rating: number;
  durationHours: number;
  durationMinutes: number;
  collectionId: string | null;
  collectionName: string | null;
  imageInfo: {
    name: string;
    size: number;
    type: string;
  } | null;
  timestamp: number;
};

const draftStore = localforage.createInstance({
  name: "echo-upload",
  storeName: "drafts",
});

export function useDraft(
  state: UploadState,
  onLoadDraft: (draft: Partial<UploadState>) => void
) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const saveDraft = useCallback(
    async (uploadState: UploadState) => {
      if (isSavingRef.current) {
        return;
      }

      isSavingRef.current = true;

      try {
        const draft: DraftData = {
          title: uploadState.title,
          description: uploadState.description,
          tags: uploadState.tags,
          mood: uploadState.mood,
          rating: uploadState.rating,
          durationHours: uploadState.durationHours,
          durationMinutes: uploadState.durationMinutes,
          collectionId: uploadState.collectionId ?? null,
          collectionName: uploadState.collectionName ?? null,
          imageInfo: uploadState.file
            ? {
                name: uploadState.file.name,
                size: uploadState.file.size,
                type: uploadState.file.type,
              }
            : null,
          timestamp: Date.now(),
        };

        await draftStore.setItem(DRAFT_STORAGE_KEY, draft);
      } catch (error) {
        console.warn("[useDraft] Failed to save draft:", error);
      } finally {
        isSavingRef.current = false;
      }
    },
    []
  );

  const loadDraft = useCallback(async (): Promise<Partial<UploadState> | null> => {
    try {
      const draft = await draftStore.getItem<DraftData>(DRAFT_STORAGE_KEY);
      if (!draft) {
        return null;
      }

      // 检查草稿是否过期（7天）
      const now = Date.now();
      const draftAge = now - draft.timestamp;
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天

      if (draftAge > maxAge) {
        await draftStore.removeItem(DRAFT_STORAGE_KEY);
        return null;
      }

      return {
        title: draft.title,
        description: draft.description,
        tags: draft.tags,
        mood: draft.mood,
        rating: draft.rating,
        durationHours: draft.durationHours,
        durationMinutes: draft.durationMinutes,
        collectionId: draft.collectionId,
        collectionName: draft.collectionName,
        file: null, // 文件不能保存，需要重新选择
      };
    } catch (error) {
      console.warn("[useDraft] Failed to load draft:", error);
      return null;
    }
  }, []);

  const clearDraft = useCallback(async () => {
    try {
      await draftStore.removeItem(DRAFT_STORAGE_KEY);
    } catch (error) {
      console.warn("[useDraft] Failed to clear draft:", error);
    }
  }, []);

  // 自动保存草稿（去抖，500ms）
  // 使用 useRef 存储上一次的 state 关键字段，避免不必要的保存
  const prevStateRef = useRef<string>("");
  
  useEffect(() => {
    // 只比较关键字段，避免对象引用变化导致的频繁保存
    const stateKey = JSON.stringify({
      title: state.title,
      description: state.description,
      tags: state.tags,
      mood: state.mood,
      rating: state.rating,
      durationHours: state.durationHours,
      durationMinutes: state.durationMinutes,
      collectionId: state.collectionId,
      collectionName: state.collectionName,
    });
    
    // 如果关键字段没有变化，不保存
    if (stateKey === prevStateRef.current) {
      return;
    }
    
    prevStateRef.current = stateKey;
    
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveDraft(state);
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    state.title,
    state.description,
    state.tags,
    state.mood,
    state.rating,
    state.durationHours,
    state.durationMinutes,
    state.collectionId,
    state.collectionName,
    saveDraft,
  ]);

  // 组件挂载时加载草稿
  useEffect(() => {
    loadDraft().then((draft) => {
      if (draft) {
        onLoadDraft(draft);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    saveDraft,
    loadDraft,
    clearDraft,
  };
}

