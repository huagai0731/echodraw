import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 读取 EXIF 方向信息并返回需要旋转的角度
 */
function getOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result;
      if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
        resolve(0);
        return;
      }

      const view = new DataView(arrayBuffer);
      if (view.getUint16(0, false) !== 0xffd8) {
        resolve(0);
        return;
      }

      let offset = 2;
      let length = view.byteLength;

      while (offset < length) {
        if (view.getUint16(offset, false) !== 0xffe1) {
          offset += 2;
          continue;
        }

        if (view.getUint16(offset + 2, false) !== 0x4578) {
          offset += 2;
          continue;
        }

        const exifLength = view.getUint16(offset + 4, false);
        if (exifLength < 18) {
          offset += 2 + exifLength;
          continue;
        }

        const tiffOffset = offset + 8;
        const isLittleEndian = view.getUint16(tiffOffset, false) === 0x4949;
        const ifdOffset = view.getUint32(tiffOffset + 4, !isLittleEndian);

        if (ifdOffset === 0) {
          resolve(0);
          return;
        }

        const ifdStart = tiffOffset + ifdOffset;
        const entryCount = view.getUint16(ifdStart, !isLittleEndian);

        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifdStart + 2 + i * 12;
          const tag = view.getUint16(entryOffset, !isLittleEndian);

          if (tag === 0x0112) {
            // Orientation tag
            const type = view.getUint16(entryOffset + 2, !isLittleEndian);
            const count = view.getUint32(entryOffset + 4, !isLittleEndian);

            if (type === 3 && count === 1) {
              const orientation = view.getUint16(entryOffset + 8, !isLittleEndian);
              resolve(orientation);
              return;
            }
          }
        }

        resolve(0);
        return;
      }

      resolve(0);
    };
    reader.onerror = () => resolve(0);
    reader.readAsArrayBuffer(file.slice(0, 64 * 1024));
  });
}

/**
 * 根据 EXIF 方向信息旋转图片
 */
function rotateImage(
  image: HTMLImageElement,
  orientation: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("无法创建 canvas context");
  }

  let width = image.width;
  let height = image.height;
  let rotation = 0;
  let flipX = false;
  let flipY = false;

  switch (orientation) {
    case 2:
      flipX = true;
      break;
    case 3:
      rotation = 180;
      break;
    case 4:
      flipY = true;
      break;
    case 5:
      rotation = 90;
      flipX = true;
      [width, height] = [height, width];
      break;
    case 6:
      rotation = 90;
      [width, height] = [height, width];
      break;
    case 7:
      rotation = -90;
      flipX = true;
      [width, height] = [height, width];
      break;
    case 8:
      rotation = -90;
      [width, height] = [height, width];
      break;
  }

  canvas.width = width;
  canvas.height = height;

  ctx.translate(width / 2, height / 2);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }
  if (flipX) {
    ctx.scale(-1, 1);
  }
  if (flipY) {
    ctx.scale(1, -1);
  }
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  return canvas;
}

/**
 * 压缩图片
 */
function compressImage(
  file: File,
  maxDimension: number = 2000,
  quality: number = 0.9
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      // 获取 EXIF 方向
      const orientation = await getOrientation(file);
      let canvas: HTMLCanvasElement;

      // 如果需要旋转，先旋转
      if (orientation > 1) {
        canvas = rotateImage(img, orientation);
      } else {
        canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("无法创建 canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
      }

      // 计算压缩后的尺寸
      let { width, height } = canvas;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        } else {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }
      }

      // 创建压缩后的 canvas
      const compressedCanvas = document.createElement("canvas");
      compressedCanvas.width = width;
      compressedCanvas.height = height;
      const compressedCtx = compressedCanvas.getContext("2d");

      if (!compressedCtx) {
        reject(new Error("无法创建压缩 canvas context"));
        return;
      }

      compressedCtx.drawImage(canvas, 0, 0, width, height);

      // 转换为 Blob
      compressedCanvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("压缩失败"));
            return;
          }

          // 保持原始文件名和类型
          const compressedFile = new File([blob], file.name, {
            type: file.type || "image/jpeg",
            lastModified: file.lastModified,
          });

          resolve(compressedFile);
        },
        file.type || "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片加载失败"));
    };

    img.src = objectUrl;
  });
}

export function useImageProcessing() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedFile, setProcessedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // 清理预览 URL
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const processImage = useCallback(async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      // 压缩图片
      const compressed = await compressImage(file, 2000, 0.9);
      setProcessedFile(compressed);

      // 创建预览 URL
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }

      const url = URL.createObjectURL(compressed);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "图片处理失败";
      setError(message);
      console.error("[useImageProcessing] 图片处理失败:", err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clearImage = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setProcessedFile(null);
    setError(null);
  }, []);

  return {
    previewUrl,
    processedFile,
    isProcessing,
    error,
    processImage,
    clearImage,
  };
}

