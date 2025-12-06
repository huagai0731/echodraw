import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveUserEmail } from "@/services/authStorage";
import {
  buildTagOptionsAsync,
  loadTagPreferencesAsync,
  clearTagsCache,
  TAG_PREFERENCES_CHANGED_EVENT,
  type TagOption,
} from "@/services/tagPreferences";
import { createTag } from "@/services/api";

export function useTagManager() {
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<(string | number)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);

  const loadTags = useCallback(async () => {
    try {
      setIsLoading(true);
      const email = getActiveUserEmail();
      const preferences = await loadTagPreferencesAsync(email);
      const options = await buildTagOptionsAsync(preferences);
      setTagOptions(options);
      setSelectedTags((prev) => {
        const optionIds = new Set(options.map((option) => option.id));
        // 只保留已经选择的tag
        const retained = prev.filter((id) => optionIds.has(id));
        
        // 如果是首次加载且没有已选择的标签，自动选中defaultActive为true的标签
        if (isInitialLoadRef.current && retained.length === 0) {
          const defaultActiveTags = options
            .filter((option) => option.defaultActive)
            .map((option) => option.id);
          if (defaultActiveTags.length > 0) {
            isInitialLoadRef.current = false;
            return defaultActiveTags;
          }
        }
        
        isInitialLoadRef.current = false;
        return retained;
      });
    } catch (error) {
      console.warn("[useTagManager] Failed to load tags:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();

    if (typeof window === "undefined") {
      return;
    }

    const tagEventListener = async (_event: Event) => {
      await loadTags();
    };

    const storageListener = async (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith("echo.tag-preferences.")) {
        return;
      }
      await loadTags();
    };

    window.addEventListener(TAG_PREFERENCES_CHANGED_EVENT, tagEventListener);
    window.addEventListener("storage", storageListener);

    return () => {
      window.removeEventListener(
        TAG_PREFERENCES_CHANGED_EVENT,
        tagEventListener
      );
      window.removeEventListener("storage", storageListener);
    };
  }, [loadTags]);

  const toggleTag = useCallback((id: string | number) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((tagId) => tagId !== id) : [...prev, id]
    );
  }, []);

  const addCustomTag = useCallback(
    async (name: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!trimmed) {
        window.alert("标签名称不能为空");
        return false;
      }

      if (trimmed.length > 12) {
        window.alert("标签名称请控制在 12 个字符以内");
        return false;
      }

      // 检查是否与现有标签重名
      const normalized = trimmed.toLowerCase();
      const existingNames = new Set<string>(
        tagOptions.map((tag) => tag.name.toLowerCase())
      );
      if (existingNames.has(normalized)) {
        window.alert("标签名称已存在，请使用其他名称");
        return false;
      }

      try {
        const createdTag = await createTag({ name: trimmed });
        clearTagsCache();

        // 延迟刷新标签列表（去抖）
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
          loadTags();
        }, 300);

        // 自动选中新创建的标签
        setSelectedTags((prev) => {
          if (prev.includes(createdTag.id)) {
            return prev;
          }
          return [...prev, createdTag.id];
        });

        window.alert("标签已添加，可在上传时直接使用。");
        return true;
      } catch (error) {
        console.warn("[useTagManager] Failed to create tag:", error);
        window.alert("添加失败，请重试。");
        return false;
      }
    },
    [tagOptions, loadTags]
  );

  const handleAddTagShortcut = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    const input = window.prompt("输入自定义标签名称（12 个字符以内）");
    if (input === null) {
      return;
    }

    await addCustomTag(input);
  }, [addCustomTag]);

  return {
    tagOptions,
    selectedTags,
    isLoading,
    toggleTag,
    addCustomTag,
    handleAddTagShortcut,
    setSelectedTags,
  };
}

