// 图片上传区域组件
import { useRef } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "../../VisualAnalysis.css";

type ImageUploadAreaProps = {
  onFileSelect: (file: File) => void;
  preview?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
  opencvReady?: boolean;
  loading?: boolean;
  compressing?: boolean;
  disabled?: boolean;
};

/**
 * 图片上传区域组件
 * 处理图片选择和预览
 */
export function ImageUploadArea({
  onFileSelect,
  preview,
  onConfirm,
  onCancel,
  opencvReady = true,
  loading = false,
  compressing = false,
  disabled = false,
}: ImageUploadAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onFileSelect(file);
  };

  // 上传区域（无预览）
  if (!preview) {
    return (
      <div className="visual-analysis__upload">
        <div className="visual-analysis__upload-area">
          <MaterialIcon name="image" className="visual-analysis__upload-icon" />
          <p className="visual-analysis__upload-text">上传图片进行视觉分析</p>
          <button
            type="button"
            className="visual-analysis__upload-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            选择图片
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
        </div>
      </div>
    );
  }

  // 预览区域（有预览）
  return (
    <div className="visual-analysis__upload">
      <div className="visual-analysis__upload-area" style={{ padding: "1.5rem" }}>
        <p className="visual-analysis__upload-text" style={{ marginBottom: "1rem" }}>
          已选择图片
        </p>
        <img
          src={preview}
          alt="预览"
          style={{
            maxWidth: "100%",
            maxHeight: "400px",
            borderRadius: "0.5rem",
            marginBottom: "1.5rem",
          }}
        />
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          {onCancel && (
            <button
              type="button"
              className="visual-analysis__upload-button"
              onClick={onCancel}
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                color: "rgba(239, 234, 231, 0.9)",
              }}
              disabled={compressing || loading || disabled}
            >
              重新选择
            </button>
          )}
          {onConfirm && (
            <button
              type="button"
              className="visual-analysis__upload-button"
              onClick={onConfirm}
              disabled={loading || compressing || disabled}
            >
              {compressing ? "压缩中..." : loading ? "处理中..." : "确认并开始分析"}
            </button>
          )}
        </div>
      </div>
      {compressing && (
        <p className="visual-analysis__loading-text">正在压缩图片到600k以下...</p>
      )}
    </div>
  );
}

