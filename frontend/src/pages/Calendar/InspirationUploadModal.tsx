import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import MaterialIcon from "@/components/MaterialIcon";
import { createInspirationNote } from "@/services/api";
import { formatISODateInShanghai, getTodayInShanghai } from "@/utils/dateUtils";
import "./InspirationUploadModal.css";

// 灵感记录专用事件，与画集上传完全分离
export const INSPIRATION_RECORDS_CHANGED_EVENT = "inspiration-records-changed";

type InspirationUploadModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function InspirationUploadModal({ open, onClose, onSuccess }: InspirationUploadModalProps) {
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
      // 使用今天的日期
      const today = getTodayInShanghai();
      const todayDateStr = formatISODateInShanghai(new Date(today)) || today;

      // 上传灵感记录（完全独立的API，与画集无关）
      await createInspirationNote({
        file: imageFile || null, // 图片可选
        text: text.trim(), // 正文
        uploadedAt: todayDateStr,
      });

      // 触发灵感记录更新事件（与画集上传事件完全分离）
      window.dispatchEvent(new CustomEvent(INSPIRATION_RECORDS_CHANGED_EVENT));

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("灵感上传失败:", err);
      
      let errorMessage = "上传失败，请稍后重试";
      if (err?.response?.data) {
        const data = err.response.data;
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
  }, [imageFile, text, onClose, onSuccess]);

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
      className={clsx("inspiration-upload-modal", isOpen && "inspiration-upload-modal--open")}
      onClick={handleBackdropClick}
    >
      <div ref={sheetRef} className="inspiration-upload-modal__sheet">
        <header className="inspiration-upload-modal__header">
          <h2>新的灵感</h2>
          <button
            type="button"
            className="inspiration-upload-modal__close-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" className="inspiration-upload-modal__close-icon" />
          </button>
        </header>

        <div className="inspiration-upload-modal__content">
          <div className="inspiration-upload-modal__scrollable-content">
            {/* 图片上传区域 */}
            <div className="inspiration-upload-modal__image-section">
              {previewUrl ? (
                <div className="inspiration-upload-modal__preview-wrapper">
                  <img
                    src={previewUrl}
                    alt="预览"
                    className="inspiration-upload-modal__preview"
                  />
                  <button
                    type="button"
                    className="inspiration-upload-modal__remove-button"
                    onClick={handleRemoveImage}
                    aria-label="移除图片"
                  >
                    <MaterialIcon name="close" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="inspiration-upload-file"
                  className="inspiration-upload-modal__upload-area"
                >
                  <MaterialIcon name="add_photo_alternate" className="inspiration-upload-modal__upload-icon" />
                  <span>选择图片（可选）</span>
                </label>
              )}
              <input
                id="inspiration-upload-file"
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="inspiration-upload-modal__file-input"
                onChange={handleFileChange}
              />
            </div>

            {/* 文字输入区域 */}
            <div className="inspiration-upload-modal__text-section">
              <textarea
                className="inspiration-upload-modal__textarea"
                placeholder="记录这一刻的想法...（可选）"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
              />
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="inspiration-upload-modal__error">
                {error}
              </div>
            )}
          </div>

          {/* 提交按钮 */}
          <button
            type="button"
            className={clsx(
              "inspiration-upload-modal__submit-button",
              (!imageFile && !text.trim() || isUploading) && "inspiration-upload-modal__submit-button--disabled"
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

