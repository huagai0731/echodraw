/**
 * Canvas 导出工具函数
 * 处理移动端和桌面端的 Canvas 导出，包括错误处理和尺寸限制检查
 */

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || window.innerWidth < 768;
}

/**
 * 检查 Canvas 尺寸是否超过移动设备限制
 * @param canvas Canvas 元素
 * @returns 是否超过限制
 */
export function checkCanvasSizeLimit(canvas: HTMLCanvasElement): {
  exceedsLimit: boolean;
  size: number;
  maxSize: number;
  message?: string;
} {
  const canvasSize = canvas.width * canvas.height;
  // 移动设备通常限制在 4096x4096 = 16777216 像素
  // 但为了安全，我们使用更保守的限制：2048x2048 = 4194304 像素
  const maxCanvasSize = isMobileDevice() ? 4194304 : 16777216;
  
  if (canvasSize > maxCanvasSize) {
    return {
      exceedsLimit: true,
      size: canvasSize,
      maxSize: maxCanvasSize,
      message: `Canvas 尺寸过大 (${canvas.width}x${canvas.height})，移动设备可能不支持。请尝试使用较小的图片尺寸。`,
    };
  }
  
  return {
    exceedsLimit: false,
    size: canvasSize,
    maxSize: maxCanvasSize,
  };
}

/**
 * 安全地导出 Canvas 为 Data URL
 * 包含移动端特殊处理和错误检查
 * 
 * @param canvas Canvas 元素
 * @param format 图片格式，默认 "image/png"
 * @param quality 图片质量（仅对 JPEG 有效），默认 0.92
 * @returns Data URL 字符串
 * @throws Error 如果导出失败
 */
export function exportCanvasToDataURL(
  canvas: HTMLCanvasElement,
  format: string = "image/png",
  quality: number = 0.92
): string {
  // 检查 Canvas 尺寸限制
  const sizeCheck = checkCanvasSizeLimit(canvas);
  if (sizeCheck.exceedsLimit) {
    throw new Error(sizeCheck.message || "Canvas 尺寸过大");
  }

  // 在移动设备上，等待更长时间确保绘制完成
  // 注意：这个函数是同步的，调用者应该在绘制完成后等待一段时间再调用
  if (isMobileDevice()) {
    // 移动设备上，toDataURL 可能需要更多时间
    // 但这里我们不能等待，因为这是同步函数
    // 调用者应该在调用前等待
  }

  let dataURL: string;
  try {
    if (format === "image/jpeg" || format === "image/jpg") {
      dataURL = canvas.toDataURL(format, quality);
    } else {
      dataURL = canvas.toDataURL(format);
    }

    // 检查是否成功生成（某些浏览器在失败时返回空字符串或 "data:,"）
    if (!dataURL || dataURL === "data:," || dataURL.length < 100) {
      throw new Error("Canvas 导出失败：生成的数据为空或无效");
    }

    return dataURL;
  } catch (error) {
    console.error("toDataURL 失败:", error);
    
    // 提供更详细的错误信息
    if (error instanceof DOMException) {
      if (error.name === "SecurityError") {
        throw new Error("导出失败：Canvas 被污染（可能是跨域图片）。请确保所有图片都允许跨域访问（CORS）。");
      } else if (error.name === "IndexSizeError") {
        throw new Error("导出失败：Canvas 尺寸无效。");
      } else {
        throw new Error(`导出失败：${error.message}`);
      }
    }
    
    // 检查是否是 Canvas 尺寸限制
    if (sizeCheck.size > sizeCheck.maxSize) {
      throw new Error(sizeCheck.message || "Canvas 尺寸过大");
    }
    
    throw new Error(
      `导出失败：${error instanceof Error ? error.message : "未知错误"}`
    );
  }
}

/**
 * 等待绘制完成的辅助函数
 * 在移动设备上等待更长时间
 * 
 * @param delay 额外延迟时间（毫秒），默认 0
 * @returns Promise
 */
export async function waitForCanvasRender(delay: number = 0): Promise<void> {
  const baseDelay = isMobileDevice() ? 500 : 200;
  await new Promise((resolve) => setTimeout(resolve, baseDelay + delay));
}

