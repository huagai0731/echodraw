// 图片处理工具函数 - OpenCV 图像处理逻辑

import type { GrayscaleLevels, VisualAnalysisResult } from "../types";
import { matToDataUrl } from "./opencvUtils";

/**
 * 从灰度图生成3阶和4阶灰度图
 */
export const generateGrayscaleLevels = async (
  grayscaleImageUrl: string,
  opencvReady: boolean
): Promise<GrayscaleLevels> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let gray: any = null;
    let gray3Level: any = null;
    let gray4Level: any = null;
    let canvas: HTMLCanvasElement | null = null;
    
    // 资源清理函数
    const cleanup = () => {
      try {
        if (gray3Level) {
          gray3Level.delete();
          gray3Level = null;
        }
        if (gray4Level) {
          gray4Level.delete();
          gray4Level = null;
        }
        if (gray) {
          gray.delete();
          gray = null;
        }
        if (canvas) {
          canvas.remove();
          canvas = null;
        }
      } catch (err) {
        console.warn("[VisualAnalysis] 清理OpenCV资源时出错:", err);
      }
    };
    
    img.onload = () => {
      try {
        const cv = (window as any).cv;
        if (!cv || !opencvReady) {
          cleanup();
          reject(new Error("图像处理功能未就绪"));
          return;
        }

        // 创建canvas
        canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("无法创建canvas上下文"));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // 转换为OpenCV Mat
        gray = cv.imread(canvas);
        if (!gray || gray.empty()) {
          cleanup();
          reject(new Error("无法读取图片数据"));
          return;
        }

        // 生成3阶层灰度
        gray3Level = new cv.Mat();
        gray.copyTo(gray3Level);
        const data3 = gray3Level.data;
        for (let i = 0; i < data3.length; i++) {
          const val = data3[i];
          if (val < 85) {
            data3[i] = 0;
          } else if (val < 170) {
            data3[i] = 127;
          } else {
            data3[i] = 255;
          }
        }
        const level3 = matToDataUrl(gray3Level);

        // 生成4阶层灰度
        gray4Level = new cv.Mat();
        gray.copyTo(gray4Level);
        const data4 = gray4Level.data;
        for (let i = 0; i < data4.length; i++) {
          const val = data4[i];
          if (val < 64) {
            data4[i] = 0;
          } else if (val < 128) {
            data4[i] = 85;
          } else if (val < 192) {
            data4[i] = 170;
          } else {
            data4[i] = 255;
          }
        }
        const level4 = matToDataUrl(gray4Level);

        // 清理资源
        cleanup();

        resolve({ level3, level4 });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    
    img.onerror = () => {
      cleanup();
      reject(new Error("图片加载失败"));
    };
    
    img.src = grayscaleImageUrl;
  });
};

/**
 * 处理图像的基础分析（二值化、灰度等）
 */
export const processImageBasic = async (
  imageDataUrl: string,
  selectedThreshold: number,
  opencvReady: boolean
): Promise<Partial<VisualAnalysisResult>> => {
  if (!opencvReady) {
    throw new Error("图像处理功能尚未就绪，请稍候");
  }

  const cv = (window as any).cv;
  if (!cv) {
    throw new Error("图像处理功能未就绪");
  }

  let src: any = null;
  let gray: any = null;
  let binary: any = null;
  let lab: any = null;
  let labChannels: any = null;
  let hls: any = null;
  let hlsChannels: any = null;
  let hueOnly: any = null;
  let rgbHue: any = null;
  let maxS: any = null;
  let maxV: any = null;
  let merged: any = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    // 创建图像对象
    const img = new Image();
    img.src = imageDataUrl;
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片加载失败"));
      // 设置超时
      setTimeout(() => reject(new Error("图片加载超时")), 10000);
    });

    // 检查图片尺寸，如果太大则先压缩
    const MAX_DIMENSION = 2048;
    let targetWidth = img.width;
    let targetHeight = img.height;
    
    if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
      const scale = Math.min(MAX_DIMENSION / targetWidth, MAX_DIMENSION / targetHeight);
      targetWidth = Math.floor(targetWidth * scale);
      targetHeight = Math.floor(targetHeight * scale);
    }

    // 创建 canvas 用于处理
    canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法创建 canvas 上下文");
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // 转换为 OpenCV Mat
    src = cv.imread(canvas);
    if (!src || src.empty()) {
      throw new Error("无法读取图片数据");
    }
    
    // 第一步：二值化（黑白）
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    binary = new cv.Mat();
    cv.threshold(gray, binary, selectedThreshold, 255, cv.THRESH_BINARY);
    const step1Binary = matToDataUrl(binary);

    // 第二步：RGB转灰度
    const step2Grayscale = matToDataUrl(gray);

    // 第二步扩展：3阶层灰度
    const gray3Level = new cv.Mat();
    gray.copyTo(gray3Level);
    const data3 = gray3Level.data;
    for (let i = 0; i < data3.length; i++) {
      const val = data3[i];
      if (val < 85) {
        data3[i] = 0;
      } else if (val < 170) {
        data3[i] = 127;
      } else {
        data3[i] = 255;
      }
    }
    const step2Grayscale3Level = matToDataUrl(gray3Level);
    gray3Level.delete();

    // 第二步扩展：4阶层灰度
    const gray4Level = new cv.Mat();
    gray.copyTo(gray4Level);
    const data4 = gray4Level.data;
    for (let i = 0; i < data4.length; i++) {
      const val = data4[i];
      if (val < 64) {
        data4[i] = 0;
      } else if (val < 128) {
        data4[i] = 85;
      } else if (val < 192) {
        data4[i] = 170;
      } else {
        data4[i] = 255;
      }
    }
    const step2Grayscale4Level = matToDataUrl(gray4Level);
    gray4Level.delete();

    // 第三步：LAB的L通道
    lab = new cv.Mat();
    cv.cvtColor(src, lab, cv.COLOR_RGBA2RGB);
    cv.cvtColor(lab, lab, cv.COLOR_RGB2Lab);
    labChannels = new cv.MatVector();
    cv.split(lab, labChannels);
    const step3LabL = matToDataUrl(labChannels.get(0)); // L通道

    // 第四步：HLS的S通道
    hls = new cv.Mat();
    cv.cvtColor(src, hls, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hls, hls, cv.COLOR_RGB2HLS);
    hlsChannels = new cv.MatVector();
    cv.split(hls, hlsChannels);
    const step4HlsS = matToDataUrl(hlsChannels.get(2)); // S通道（HLS中S是第三个通道）

    // 第五步：纯色相图（固定饱和度和亮度）
    const hsvForHue = new cv.Mat();
    cv.cvtColor(src, hsvForHue, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsvForHue, hsvForHue, cv.COLOR_RGB2HSV);
    const hsvChannelsForHue = new cv.MatVector();
    cv.split(hsvForHue, hsvChannelsForHue);
    
    maxS = new cv.Mat(hsvForHue.rows, hsvForHue.cols, cv.CV_8UC1, new cv.Scalar(255));
    maxV = new cv.Mat(hsvForHue.rows, hsvForHue.cols, cv.CV_8UC1, new cv.Scalar(255));
    merged = new cv.MatVector();
    merged.push_back(hsvChannelsForHue.get(0)); // H
    merged.push_back(maxS); // S = 255
    merged.push_back(maxV); // V = 255
    hueOnly = new cv.Mat();
    cv.merge(merged, hueOnly);
    rgbHue = new cv.Mat();
    cv.cvtColor(hueOnly, rgbHue, cv.COLOR_HSV2RGB);
    const step5Hue = matToDataUrl(rgbHue);
    
    // 清理临时HSV变量
    hsvForHue.delete();
    hsvChannelsForHue.delete();

    // 清理资源
    if (src) src.delete();
    if (gray) gray.delete();
    if (binary) binary.delete();
    if (lab) lab.delete();
    if (labChannels) labChannels.delete();
    if (hls) hls.delete();
    if (hlsChannels) hlsChannels.delete();
    if (hueOnly) hueOnly.delete();
    if (rgbHue) rgbHue.delete();
    if (maxS) maxS.delete();
    if (maxV) maxV.delete();
    if (merged) merged.delete();
    if (canvas) canvas.remove();

    return {
      originalImage: imageDataUrl,
      step1Binary,
      step2Grayscale,
      step2Grayscale3Level,
      step2Grayscale4Level,
      step3LabL,
      step4HsvS: "", // 已删除，保留字段以兼容
      step4HlsS,
      step5Hue,
      binaryThreshold: selectedThreshold,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    // 清理资源（即使出错也要清理）
    try {
      if (src) src.delete();
      if (gray) gray.delete();
      if (binary) binary.delete();
      if (lab) lab.delete();
      if (labChannels) labChannels.delete();
      if (hls) hls.delete();
      if (hlsChannels) hlsChannels.delete();
      if (hueOnly) hueOnly.delete();
      if (rgbHue) rgbHue.delete();
      if (maxS) maxS.delete();
      if (maxV) maxV.delete();
      if (merged) merged.delete();
      if (canvas) canvas.remove();
    } catch (cleanupErr) {
      console.error("清理资源时出错:", cleanupErr);
    }
    
    // 提供更详细的错误信息
    let errorMessage = "处理图像时出错";
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (typeof err === "number") {
      // 图像处理错误代码
      if (err === 7083872 || err === -215) {
        errorMessage = "图片尺寸过大或格式不支持，请尝试使用较小的图片";
      } else if (err === -27) {
        errorMessage = "内存不足，请尝试使用较小的图片";
      } else {
        errorMessage = "处理图像时出错，请重试";
      }
    } else if (err && typeof err === "object" && "message" in err) {
      errorMessage = String(err.message);
    }
    
    throw new Error(errorMessage);
  }
};
