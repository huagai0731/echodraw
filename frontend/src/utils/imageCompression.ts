/**
 * 图片压缩工具函数
 * 将图片压缩到指定大小以下（如600KB）
 */

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
      const length = view.byteLength;

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
 * 压缩图片到指定大小以下
 * @param file 原始图片文件
 * @param maxSizeBytes 最大文件大小（字节），默认600KB
 * @param maxDimension 最大边长（像素），默认2048
 * @returns 压缩后的文件
 */
export async function compressImageToSize(
  file: File,
  maxSizeBytes: number = 600 * 1024, // 默认600KB
  maxDimension: number = 2048
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      try {
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

        // 确定输出格式
        const outputType = file.type || "image/jpeg";
        const isJpeg = outputType === "image/jpeg" || outputType === "image/jpg";
        
        // 如果原图是PNG且有透明通道，尝试使用WebP（如果浏览器支持）
        // 否则转换为JPEG
        let finalType = outputType;
        if (!isJpeg && outputType !== "image/webp") {
          // 对于PNG等格式，如果文件太大，转换为JPEG
          finalType = "image/jpeg";
        }

        // 循环压缩，直到文件大小小于目标大小
        let quality = 0.9;
        const minQuality = 0.3;
        const qualityStep = 0.05;
        let compressedBlob: Blob | null = null;

        while (quality >= minQuality) {
          compressedBlob = await new Promise<Blob | null>((resolveBlob) => {
            compressedCanvas.toBlob(
              (blob) => resolveBlob(blob),
              finalType,
              quality
            );
          });

          if (!compressedBlob) {
            reject(new Error("压缩失败"));
            return;
          }

          // 如果文件大小已经小于目标大小，退出循环
          if (compressedBlob.size <= maxSizeBytes) {
            break;
          }

          // 降低质量继续压缩
          quality -= qualityStep;
        }

        if (!compressedBlob) {
          reject(new Error("压缩失败"));
          return;
        }

        // 如果仍然大于目标大小，尝试进一步缩小尺寸
        if (compressedBlob.size > maxSizeBytes && quality < minQuality) {
          // 按比例缩小尺寸
          const scaleFactor = Math.sqrt(maxSizeBytes / compressedBlob.size);
          const newWidth = Math.floor(width * scaleFactor);
          const newHeight = Math.floor(height * scaleFactor);

          const resizedCanvas = document.createElement("canvas");
          resizedCanvas.width = newWidth;
          resizedCanvas.height = newHeight;
          const resizedCtx = resizedCanvas.getContext("2d");

          if (!resizedCtx) {
            reject(new Error("无法创建调整尺寸的 canvas context"));
            return;
          }

          resizedCtx.drawImage(compressedCanvas, 0, 0, newWidth, newHeight);

          // 使用最低质量再次压缩
          compressedBlob = await new Promise<Blob | null>((resolveBlob) => {
            resizedCanvas.toBlob(
              (blob) => resolveBlob(blob),
              finalType,
              minQuality
            );
          });

          if (!compressedBlob) {
            reject(new Error("最终压缩失败"));
            return;
          }
        }

        // 保持原始文件名和类型
        const compressedFile = new File([compressedBlob], file.name, {
          type: finalType,
          lastModified: file.lastModified,
        });

        resolve(compressedFile);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片加载失败"));
    };

    img.src = objectUrl;
  });
}

/**
 * 将文件转换为DataURL
 * @param file 文件对象
 * @returns DataURL字符串
 */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      resolve(dataUrl);
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

