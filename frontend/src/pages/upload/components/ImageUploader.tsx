import { useId, useRef } from "react";
import MaterialIcon from "@/components/MaterialIcon";

type ImageUploaderProps = {
  previewUrl: string | null;
  isProcessing: boolean;
  onFileSelect: (file: File) => void;
  onFileChange: (file: File | null) => void;
};

export function ImageUploader({
  previewUrl,
  isProcessing,
  onFileSelect,
  onFileChange: _onFileChange,
}: ImageUploaderProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    onFileSelect(file);

    // 清空文件输入，允许重复选择同一文件
    setTimeout(() => {
      try {
        if (input && input.value) {
          input.value = "";
        }
      } catch (error) {
        console.warn("[ImageUploader] 重置文件输入框失败（可忽略）", error);
      }
    }, 0);
  };

  return (
    <div className="upload-dropzone__wrapper">
      <label
        htmlFor={fileInputId}
        className={`upload-dropzone${previewUrl ? " upload-dropzone--with-preview" : ""}`}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="已选择的作品"
            className="upload-dropzone__preview"
          />
        ) : (
          <>
            <MaterialIcon name="add_photo_alternate" />
            <div>
              <p>轻触以添加作品</p>
              <p>上传你的创作图片</p>
            </div>
          </>
        )}
      </label>
      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="upload-dropzone__input"
        onChange={handleFileChange}
        onInput={handleFileChange}
        disabled={isProcessing}
      />
    </div>
  );
}

