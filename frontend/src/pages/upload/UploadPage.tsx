import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import TopNav from "@/components/TopNav";
import { ImageUploader } from "./components/ImageUploader";
import { TagManager } from "./components/TagManager";
import { MoodSelector } from "./components/MoodSelector";
import { DurationPicker } from "./components/DurationPicker";
import { ScoreSlider } from "./components/ScoreSlider";
import { ArtworkInfoEditor } from "./components/ArtworkInfoEditor";
import { GroupSelectorModal } from "./components/GroupSelectorModal";
import { UploadActions } from "./components/UploadActions";
import { useUploadState } from "./hooks/useUploadState";
import { useImageProcessing } from "./hooks/useImageProcessing";
import { useTagManager } from "./hooks/useTagManager";
import { useDuration } from "./hooks/useDuration";
import { useMood } from "./hooks/useMood";
import { useGroupManager } from "./hooks/useGroupManager";
import { useDraft } from "./hooks/useDraft";

import "../Upload.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB（用于提示，不阻止选择）

export type UploadResult = {
  file: File;
  title: string;
  description: string;
  tags: (string | number)[]; // 支持字符串ID（预设标签）和数字ID（自定义标签）
  moodId: number | null; // 使用ID而不是字符串
  rating: number;
  durationMinutes: number;
  previewDataUrl: string | null;
  // 套图相关字段
  collectionId?: string | null;
  collectionName?: string | null;
  collectionIndex?: number | null;
  incrementalDurationMinutes?: number | null; // 增量时长（分钟）
};

type UploadPageProps = {
  onClose: () => void;
  onSave: (result: UploadResult) => void | Promise<void>;
};

export function UploadPage({ onClose, onSave }: UploadPageProps) {
  const [showRating, setShowRating] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<"create" | "select" | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasUnsavedChangesRef = useRef(false);

  const {
    state,
    updateState,
    resetState,
    totalMinutes,
    validateFile,
    validateAll,
  } = useUploadState();

  const {
    previewUrl,
    processedFile,
    isProcessing,
    error: imageProcessingError,
    processImage,
    clearImage,
  } = useImageProcessing();

  const {
    tagOptions,
    selectedTags,
    isLoading: tagsLoading,
    toggleTag,
    handleAddTagShortcut,
    setSelectedTags: _setSelectedTags,
  } = useTagManager();

  const { moodMatrix, selectedMood, isLoading: moodsLoading, selectMood } = useMood(state.mood, (moodId) => {
    updateState({ mood: moodId });
  });

  const {
    totalMinutes: durationTotalMinutes,
    formattedDuration,
    setHours: _setHours,
    setMinutes: _setMinutes,
  } = useDuration(state.durationHours, state.durationMinutes, (hours, minutes) => {
    updateState({ durationHours: hours, durationMinutes: minutes });
  });

  const {
    collections,
    getCollectionMaxDuration,
    getNextCollectionIndex,
    generateCollectionId,
    refreshCollections,
  } = useGroupManager();

  // 计算增量时长
  const incrementalDurationMinutes = useMemo(() => {
    if (
      state.collectionMaxDurationMinutes !== null &&
      totalMinutes >= state.collectionMaxDurationMinutes
    ) {
      return totalMinutes - state.collectionMaxDurationMinutes;
    }
    return null;
  }, [state.collectionMaxDurationMinutes, totalMinutes]);

  const formattedIncrementalDuration = useMemo(() => {
    if (incrementalDurationMinutes === null || incrementalDurationMinutes <= 0) {
      return null;
    }
    const hours = Math.floor(incrementalDurationMinutes / 60);
    const minutes = incrementalDurationMinutes % 60;
    if (hours > 0 && minutes > 0) {
      return `${hours} 小时 ${minutes} 分钟`;
    }
    if (hours > 0) {
      return `${hours} 小时`;
    }
    return `${minutes} 分钟`;
  }, [incrementalDurationMinutes]);

  // 限制画布时长不能小于套图最大时长
  useEffect(() => {
    if (
      state.collectionMaxDurationMinutes !== null &&
      totalMinutes < state.collectionMaxDurationMinutes
    ) {
      const requiredHours = Math.floor(state.collectionMaxDurationMinutes / 60);
      const requiredMinutes = state.collectionMaxDurationMinutes % 60;
      
      // 只有当当前时长确实小于要求时才更新，避免循环
      if (
        state.durationHours !== requiredHours ||
        state.durationMinutes !== requiredMinutes
      ) {
        updateState({ durationHours: requiredHours, durationMinutes: requiredMinutes });
      }
    }
  }, [state.collectionMaxDurationMinutes, state.durationHours, state.durationMinutes, totalMinutes, updateState]);

  // 草稿管理
  const { clearDraft } = useDraft(state, (draft) => {
    updateState(draft);
    hasUnsavedChangesRef.current = true;
  });

  // 标记有未保存的更改
  useEffect(() => {
    if (state.file || state.title || state.description || state.tags.length > 0 || state.mood !== null) {
      hasUnsavedChangesRef.current = true;
    }
  }, [state]);

  // beforeunload 提示
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current && !isUploading) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isUploading]);

  // 处理文件选择
  const handleFileSelect = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        window.alert(error.message);
        return;
      }

      // 如果文件很大，给出提示但不阻止选择（因为我们会压缩）
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        console.log(`[UploadPage] 大文件检测：${sizeMB}MB，将自动压缩`);
      }

      updateState({ file });
      await processImage(file);
      hasUnsavedChangesRef.current = true;
    },
    [validateFile, updateState, processImage]
  );

  // 处理套图选择
  const handleSelectCollection = useCallback(
    (collectionId: string) => {
      const collection = collections.find((c) => c.id === collectionId);
      if (!collection) {
        return;
      }

      const maxDuration = getCollectionMaxDuration(collectionId);
      updateState({
        collectionId: collectionId,
        collectionName: null,
        collectionMaxDurationMinutes: maxDuration,
      });

      // 更新标题格式
      if (state.title.trim() && !state.title.includes(collection.name)) {
        updateState({ title: `${collection.name}·${state.title}` });
      }

      // 如果当前时长小于套图最大时长，自动调整
      if (totalMinutes < maxDuration) {
        const hours = Math.floor(maxDuration / 60);
        const minutes = maxDuration % 60;
        updateState({ durationHours: hours, durationMinutes: minutes });
      }
    },
    [
      collections,
      getCollectionMaxDuration,
      updateState,
      state.title,
      totalMinutes,
    ]
  );

  const handleCreateCollection = useCallback(
    (name: string) => {
      updateState({
        collectionName: name,
        collectionId: null,
        collectionMaxDurationMinutes: null,
      });
    },
    [updateState]
  );

  const handleClearCollection = useCallback(() => {
    updateState({
      collectionId: null,
      collectionName: null,
      collectionMaxDurationMinutes: null,
    });
  }, [updateState]);

  // 处理保存
  const handleSave = useCallback(async () => {
    if (!processedFile || isUploading) {
      if (!processedFile) {
        // 触发文件选择
        const input = document.querySelector<HTMLInputElement>(
          'input[type="file"]'
        );
        input?.click();
      }
      return;
    }

    // 验证所有数据
    const errors = validateAll();
    if (errors.length > 0) {
      const errorMessages = errors.map((e) => e.message).join("\n");
      window.alert(errorMessages);
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    // 创建 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 处理套图逻辑
      let finalCollectionId: string | null = null;
      let finalCollectionName: string | null = null;
      let finalCollectionIndex: number | null = null;
      let finalTitle = state.title.trim();

      if (state.collectionId) {
        const collection = collections.find(
          (c) => c.id === state.collectionId
        );
        if (collection) {
          finalCollectionId = state.collectionId;
          finalCollectionName = collection.name;
          finalCollectionIndex = getNextCollectionIndex(state.collectionId);
          if (finalTitle && !finalTitle.includes(collection.name)) {
            finalTitle = `${collection.name}·${finalTitle}`;
          } else if (!finalTitle) {
            finalTitle = collection.name;
          }
        }
      } else if (state.collectionName?.trim()) {
        const newCollectionId = generateCollectionId();
        finalCollectionId = newCollectionId;
        finalCollectionName = state.collectionName.trim();
        finalCollectionIndex = 1;
        const baseTitle = state.title.trim();
        if (baseTitle && !baseTitle.includes(finalCollectionName)) {
          finalTitle = `${finalCollectionName}·${baseTitle}`;
        } else if (baseTitle) {
          finalTitle = baseTitle;
        } else {
          finalTitle = finalCollectionName;
        }
      }

      // 创建预览 URL（用于保存）
      const previewDataUrl = previewUrl;

      const result: UploadResult = {
        file: processedFile,
        title: finalTitle,
        description: state.description.trim(),
        tags: selectedTags,
        moodId: state.mood,
        rating: state.rating,
        durationMinutes: totalMinutes,
        previewDataUrl,
        collectionId: finalCollectionId,
        collectionName: finalCollectionName,
        collectionIndex: finalCollectionIndex,
        incrementalDurationMinutes: incrementalDurationMinutes,
      };

      // 模拟上传进度（实际应该从 onSave 中获取）
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev === null) return 10;
          if (prev >= 90) return prev;
          return prev + 10;
        });
      }, 200);

      await onSave(result);

      clearInterval(progressInterval);
      setUploadProgress(100);

      // 保存成功后清理（使用startTransition确保不在渲染过程中更新状态）
      startTransition(() => {
        hasUnsavedChangesRef.current = false;
        clearDraft().catch(console.warn);
        resetState();
        clearImage();
        setGroupModalMode(null);
      });
    } catch (error) {
      console.warn("[UploadPage] Save failed:", error);
      setUploadError(
        error instanceof Error ? error.message : "上传失败，请重试"
      );
      // 上传失败时不清除状态，保留所有输入
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      abortControllerRef.current = null;
    }
  }, [
    processedFile,
    isUploading,
    validateAll,
    state,
    collections,
    getNextCollectionIndex,
    generateCollectionId,
    previewUrl,
    selectedTags,
    totalMinutes,
    incrementalDurationMinutes,
    onSave,
    clearDraft,
    resetState,
    clearImage,
  ]);

  const handleCancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setUploadProgress(null);
    setUploadError(null);
  }, []);

  const canSave = useMemo(() => {
    return !!processedFile && !isProcessing;
  }, [processedFile, isProcessing]);

  return (
    <div className="upload-screen">
      <div className="upload-screen__background">
        <div className="upload-screen__glow upload-screen__glow--mint" />
        <div className="upload-screen__glow upload-screen__glow--brown" />
        <div className="upload-screen__glow upload-screen__glow--accent" />
      </div>

      <TopNav
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onClose,
        }}
        title="Upload"
        subtitle="New Work"
      />

      <main className="upload-screen__content">
        <ImageUploader
          previewUrl={previewUrl}
          isProcessing={isProcessing}
          onFileSelect={handleFileSelect}
          onFileChange={(file) => {
            if (!file) {
              updateState({ file: null });
              clearImage();
            }
          }}
        />

        {imageProcessingError && (
          <div
            style={{
              padding: "1rem",
              background: "rgba(255, 0, 0, 0.1)",
              color: "rgba(255, 0, 0, 0.8)",
              borderRadius: "0.5rem",
              marginTop: "1rem",
            }}
          >
            图片处理失败：{imageProcessingError}
          </div>
        )}

        {uploadError && (
          <div
            style={{
              padding: "1rem",
              background: "rgba(255, 0, 0, 0.1)",
              color: "rgba(255, 0, 0, 0.8)",
              borderRadius: "0.5rem",
              marginTop: "1rem",
            }}
          >
            上传失败：{uploadError}
            <button
              type="button"
              onClick={handleSave}
              style={{
                marginLeft: "1rem",
                padding: "0.5rem 1rem",
                background: "#98dbc6",
                color: "#221b1b",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              重试
            </button>
          </div>
        )}

        <DurationPicker
          hours={state.durationHours}
          minutes={state.durationMinutes}
          totalMinutes={durationTotalMinutes}
          formattedDuration={formattedDuration}
          incrementalDuration={formattedIncrementalDuration}
          onChange={(hours, minutes) => {
            updateState({ durationHours: hours, durationMinutes: minutes });
          }}
        />

        <TagManager
          tagOptions={tagOptions}
          selectedTags={selectedTags}
          isLoading={tagsLoading}
          onToggleTag={toggleTag}
          onAddTag={handleAddTagShortcut}
        />

        <MoodSelector
          moodMatrix={moodMatrix}
          selectedMood={selectedMood}
          isLoading={moodsLoading}
          onSelect={selectMood}
        />

        <ScoreSlider
          rating={state.rating}
          showRating={showRating}
          onRatingChange={(rating) => updateState({ rating })}
          onToggleVisibility={() => setShowRating((prev) => !prev)}
        />

        <ArtworkInfoEditor
          title={state.title}
          description={state.description}
          onTitleChange={(title) => updateState({ title })}
          onDescriptionChange={(description) => updateState({ description })}
        />

        <UploadActions
          collectionId={state.collectionId}
          collectionName={state.collectionName}
          collections={collections}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          canSave={canSave}
          onCreateCollection={() => setGroupModalMode("create")}
          onSelectCollection={() => setGroupModalMode("select")}
          onClearCollection={handleClearCollection}
          onSave={handleSave}
          onCancel={isUploading ? handleCancelUpload : undefined}
        />

        <GroupSelectorModal
          mode={groupModalMode}
          collections={collections}
          onClose={() => setGroupModalMode(null)}
          onSelectCollection={handleSelectCollection}
          onCreateCollection={handleCreateCollection}
          onRefreshCollections={refreshCollections}
        />
      </main>
    </div>
  );
}

