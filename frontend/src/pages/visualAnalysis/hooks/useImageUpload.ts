// 图片上传 Hook - 管理图片选择、预览、压缩

import { useState, useRef, useCallback } from "react";
import { compressImageToSize, fileToDataURL } from "@/utils/imageCompression";

type UseImageUploadOptions = {
  maxSize?: number; // 最大文件大小（字节），默认 400KB
  maxDimension?: number; // 最大尺寸（像素），默认 2048
};

type UseImageUploadReturn = {
  imageFile: File | null;
  imagePreview: string | null;
  isCompressing: boolean;
  error: string | null;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleFileSelectDirect: (file: File) => void;
  handleConfirm: () => Promise<{ file: File; dataUrl: string }>;
  clear: () => void;
  setError: (error: string | null) => void;
};

/**
 * 管理图片上传、预览和压缩的 Hook
 */
export function useImageUpload(
  options: UseImageUploadOptions = {}
): UseImageUploadReturn {
  const { maxSize = 400 * 1024, maxDimension = 2048 } = options;

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setError("请选择图片文件");
        return;
      }

      setError(null);
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImagePreview(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const handleFileSelectDirect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }

    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!imagePreview || !imageFile) {
      setError("请先上传图片");
      throw new Error("请先上传图片");
    }

    setIsCompressing(true);
    setError(null);

    try {
      // 压缩图片
      const compressedFile = await compressImageToSize(
        imageFile,
        maxSize,
        maxDimension
      );
      const compressedDataUrl = await fileToDataURL(compressedFile);

      setImageFile(compressedFile);
      setImagePreview(compressedDataUrl);

      return {
        file: compressedFile,
        dataUrl: compressedDataUrl,
      };
    } catch (err) {
      console.error("图片压缩失败:", err);
      const errorMessage = err instanceof Error ? err.message : "图片压缩失败";
      setError(errorMessage);
      throw err;
    } finally {
      setIsCompressing(false);
    }
  }, [imageFile, imagePreview, maxSize, maxDimension]);

  const clear = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    setError(null);
    setIsCompressing(false);
  }, []);

  return {
    imageFile,
    imagePreview,
    isCompressing,
    error,
    handleFileSelect,
    handleFileSelectDirect,
    handleConfirm,
    clear,
    setError,
  };
}

