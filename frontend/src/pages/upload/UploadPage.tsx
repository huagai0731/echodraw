import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import TopNav from "@/components/TopNav";
import MaterialIcon from "@/components/MaterialIcon";
import { ImageUploader } from "./components/ImageUploader";
import { TagManager } from "./components/TagManager";
import { MoodSelector } from "./components/MoodSelector";
import { DurationPicker } from "./components/DurationPicker";
import { ScoreSlider } from "./components/ScoreSlider";
import { ArtworkInfoEditor } from "./components/ArtworkInfoEditor";
import { useUploadState } from "./hooks/useUploadState";
import { useImageProcessing } from "./hooks/useImageProcessing";
import { useTagManager } from "./hooks/useTagManager";
import { useDuration } from "./hooks/useDuration";
import { useMood } from "./hooks/useMood";
import { useDraft } from "./hooks/useDraft";
import { UploadLimitConfirmModal } from "../visualAnalysis/components/UploadLimitConfirmModal";
import type { Artwork } from "../Gallery";

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
};

type UploadPageProps = {
  onClose: () => void;
  onSave: (result: UploadResult) => void | Promise<void>;
  userArtworks?: Artwork[];
  isMember?: boolean;
  onJoinMembership?: () => void;
};

export function UploadPage({ onClose, onSave, userArtworks = [], isMember = true, onJoinMembership }: UploadPageProps) {
  const [showRating, setShowRating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUploadLimitConfirm, setShowUploadLimitConfirm] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);

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


  // 实际执行保存的函数
  const executeSave = useCallback(async () => {
    if (!processedFile) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    // 创建 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 创建预览 URL（用于保存）
      const previewDataUrl = previewUrl;

      const result: UploadResult = {
        file: processedFile,
        title: state.title.trim(),
        description: state.description.trim(),
        tags: selectedTags,
        moodId: state.mood,
        rating: state.rating,
        durationMinutes: totalMinutes,
        previewDataUrl,
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
      });
    } catch (error) {
      console.warn("[UploadPage] Save failed:", error);
      let errorMessage = "上传失败，请重试";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error && typeof error === 'object' && 'response' in error) {
        // 处理axios错误响应
        const axiosError = error as any;
        if (axiosError.response?.data?.detail) {
          errorMessage = axiosError.response.data.detail;
        } else if (axiosError.response?.data?.message) {
          errorMessage = axiosError.response.data.message;
        } else if (Array.isArray(axiosError.response?.data)) {
          // 处理字段级错误数组
          errorMessage = axiosError.response.data.map((e: any) => e.message || e).join("\n");
        } else {
          errorMessage = axiosError.message || "上传失败，请重试";
        }
      }
      setUploadError(errorMessage);
      // 上传失败时不清除状态，保留所有输入
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      abortControllerRef.current = null;
    }
  }, [
    processedFile,
    validateAll,
    state,
    previewUrl,
    selectedTags,
    totalMinutes,
    onSave,
    clearDraft,
    resetState,
    clearImage,
  ]);

  // 处理保存（添加限制检查）
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

    // 检查非会员用户是否已经有作品
    const hasExistingArtworks = userArtworks.length > 0;
    const isNonMember = !isMember;

    if (hasExistingArtworks && isNonMember) {
      // 显示限制确认弹窗
      setShowUploadLimitConfirm(true);
      // 保存待执行的保存函数
      pendingSaveRef.current = executeSave;
      return;
    }

    // 否则直接执行保存
    await executeSave();
  }, [
    processedFile,
    isUploading,
    validateAll,
    userArtworks.length,
    isMember,
    executeSave,
  ]);

  // 确认按钮：关闭弹窗，其他什么都不变
  const handleConfirmUploadLimit = useCallback(() => {
    setShowUploadLimitConfirm(false);
    pendingSaveRef.current = null;
  }, []);

  // 取消上传限制弹窗（点击遮罩层关闭）
  const handleCancelUploadLimit = useCallback(() => {
    setShowUploadLimitConfirm(false);
    pendingSaveRef.current = null;
    // 清除上传状态并关闭上传页面
    resetState();
    clearImage();
    onClose();
  }, [resetState, clearImage, onClose]);
  
  // 前往加入会员
  const handleJoinMembership = useCallback(() => {
    setShowUploadLimitConfirm(false);
    pendingSaveRef.current = null;
    if (onJoinMembership) {
      onJoinMembership();
    }
  }, [onJoinMembership]);

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
        title="新的画作"
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
          onChange={(hours, minutes) => {
            updateState({ durationHours: hours, durationMinutes: minutes });
          }}
        />

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          margin: "1.5rem 0",
          padding: "0 0.5rem"
        }}>
          <div style={{
            flex: 1,
            height: "1px",
            background: "rgba(239, 234, 231, 0.15)"
          }} />
          <span style={{
            fontSize: "0.7rem",
            color: "rgba(239, 234, 231, 0.4)",
            letterSpacing: "0.05em",
            whiteSpace: "nowrap"
          }}>可选填</span>
          <div style={{
            flex: 1,
            height: "1px",
            background: "rgba(239, 234, 231, 0.15)"
          }} />
        </div>

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

        <section className="upload-section">
          {isUploading && handleCancelUpload && (
            <button
              type="button"
              className="upload-save"
              onClick={handleCancelUpload}
              style={{
                background: "rgba(239, 234, 231, 0.1)",
                color: "rgba(239, 234, 231, 0.85)",
                marginBottom: "0.5rem",
              }}
            >
              <MaterialIcon name="cancel" />
              取消上传
            </button>
          )}
          <button
            type="button"
            className="upload-save"
            onClick={handleSave}
            disabled={!canSave || isUploading}
          >
            {isUploading ? (
              <>
                <MaterialIcon name="sync" />
                {uploadProgress !== null
                  ? `上传中... ${uploadProgress}%`
                  : "上传中..."}
              </>
            ) : (
              "保存"
            )}
          </button>
        </section>
      </main>

      <UploadLimitConfirmModal
        open={showUploadLimitConfirm}
        onConfirm={handleConfirmUploadLimit}
        onCancel={handleCancelUploadLimit}
        onJoinMembership={onJoinMembership ? handleJoinMembership : undefined}
      />
    </div>
  );
}

