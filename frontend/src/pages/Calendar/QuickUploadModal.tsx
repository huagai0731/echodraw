import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import MaterialIcon from "@/components/MaterialIcon";
import { createUserUpload, checkUploadLimit } from "@/services/api";
import { USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";
import "./QuickUploadModal.css";

type QuickUploadModalProps = {
  open: boolean;
  date?: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export function QuickUploadModal({ open, date, onClose, onSuccess }: QuickUploadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // 控制动画
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsOpen(true);
        });
      });
    } else {
      setIsOpen(false);
    }
  }, [open]);

  // 重置状态
  useEffect(() => {
    if (!open) {
      setImageFile(null);
      setPreviewUrl(null);
      setText("");
      setError(null);
      setIsUploading(false);
    }
  }, [open]);

  const handleFileSelect = useCallback((file: File) => {
    setImageFile(file);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleRemoveImage = useCallback(() => {
    setImageFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    // 允许只上传文字或只上传图片或两者都有
    if (!imageFile && !text.trim()) {
      setError("请至少输入文字或上传一张图片");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // 检查每日上传限制
      const limitInfo = await checkUploadLimit();
      if (!limitInfo.can_upload) {
        setError(
          `今日已上传 ${limitInfo.today_count} 张图片，已达到每日上限 ${limitInfo.max_daily_uploads} 张。删除已上传的图片后可以继续上传。`
        );
        setIsUploading(false);
        return;
      }
      
      // 如果没有图片，创建一个1x1的透明PNG图片
      let fileToUpload = imageFile;
      if (!fileToUpload) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // 创建透明背景
          ctx.clearRect(0, 0, 1, 1);
        }
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            resolve(blob || new Blob());
          }, 'image/png');
        });
        fileToUpload = new File([blob], 'empty.png', { type: 'image/png' });
      }

      // 在description字段开头添加特殊标记，用于区分灵感小记和画集内容
      const inspirationMarker = "__INSPIRATION_NOTE__";
      const descriptionText = text.trim();
      const markedDescription = descriptionText 
        ? `${inspirationMarker}\n${descriptionText}` 
        : inspirationMarker;

      await createUserUpload({
        file: fileToUpload,
        title: text.trim() || "新的小记",
        description: markedDescription,
        tags: [],
        moodId: null,
        selfRating: 0,
        durationMinutes: 0,
        uploadedAt: date, // 传递日期参数
      });

      // 触发更新事件
      window.dispatchEvent(new CustomEvent(USER_ARTWORKS_CHANGED_EVENT));

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("上传失败:", err);
      console.error("错误详情:", err?.response?.data);
      
      // 尝试提取更详细的错误信息
      let errorMessage = "上传失败，请稍后重试";
      if (err?.response?.data) {
        const data = err.response.data;
        // 处理字段级错误
        if (typeof data === 'object') {
          const fieldErrors = Object.entries(data)
            .filter(([key]) => key !== 'detail')
            .map(([key, value]) => {
              if (Array.isArray(value)) {
                return `${key}: ${value.join(', ')}`;
              }
              return `${key}: ${value}`;
            });
          if (fieldErrors.length > 0) {
            errorMessage = fieldErrors.join('; ');
          } else if (data.detail) {
            errorMessage = data.detail;
          } else if (typeof data === 'string') {
            errorMessage = data;
          }
        } else if (typeof data === 'string') {
          errorMessage = data;
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  }, [imageFile, text, date, onClose, onSuccess]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      onClose();
    }
  }, [onClose]);

  if (!open && !isOpen) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={clsx("quick-upload-modal", isOpen && "quick-upload-modal--open")}
      onClick={handleBackdropClick}
    >
      <div ref={sheetRef} className="quick-upload-modal__sheet">
        <header className="quick-upload-modal__header">
          <h2>新的小记</h2>
          <button
            type="button"
            className="quick-upload-modal__close-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" className="quick-upload-modal__close-icon" />
          </button>
        </header>

        <div className="quick-upload-modal__content">
          {/* 可滚动内容区域 */}
          <div className="quick-upload-modal__scrollable-content">
            {/* 图片上传区域 */}
            <div className="quick-upload-modal__image-section">
              {previewUrl ? (
                <div className="quick-upload-modal__preview-wrapper">
                  <img
                    src={previewUrl}
                    alt="预览"
                    className="quick-upload-modal__preview"
                  />
                  <button
                    type="button"
                    className="quick-upload-modal__remove-button"
                    onClick={handleRemoveImage}
                    aria-label="移除图片"
                  >
                    <MaterialIcon name="close" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="quick-upload-file"
                  className="quick-upload-modal__upload-area"
                >
                  <MaterialIcon name="add_photo_alternate" className="quick-upload-modal__upload-icon" />
                  <span>选择图片（可选）</span>
                </label>
              )}
              <input
                id="quick-upload-file"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="quick-upload-modal__file-input"
                onChange={handleFileChange}
              />
            </div>

            {/* 文字输入区域 */}
            <div className="quick-upload-modal__text-section">
              <textarea
                className="quick-upload-modal__textarea"
                placeholder="记录这一刻的想法...（可选）"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
              />
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="quick-upload-modal__error">
                {error}
              </div>
            )}
          </div>

          {/* 提交按钮 - 固定在底部 */}
          <button
            type="button"
            className={clsx(
              "quick-upload-modal__submit-button",
              (!imageFile && !text.trim() || isUploading) && "quick-upload-modal__submit-button--disabled"
            )}
            onClick={handleSubmit}
            disabled={(!imageFile && !text.trim()) || isUploading}
          >
            {isUploading ? "上传中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

