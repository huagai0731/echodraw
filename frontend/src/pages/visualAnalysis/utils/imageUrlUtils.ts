// 图片URL处理工具函数

import { API_BASE_URL } from "@/services/api";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";
import type { SavedResultData } from "../types";

/**
 * 处理图片URL的辅助函数（与画集使用相同的逻辑）
 */
export const processImageUrl = (url: string | null | undefined): string => {
  if (!url || typeof url !== 'string') {
    return url || "";
  }
  
  // 如果是base64数据URL，直接返回
  if (url.startsWith('data:')) {
    return url;
  }
  
  // 如果是相对路径 /api/...，说明后端返回的是代理URL，需要拼接API base
  if (url.startsWith("/api/") && !url.startsWith("http")) {
    const apiBase = API_BASE_URL.replace(/\/api\/?$/, "");
    url = apiBase ? `${apiBase}${url}` : url;
  }
  
  // 如果URL包含127.0.0.1或localhost，且当前页面不是localhost，则替换为当前hostname
  if (typeof window !== "undefined" && window.location?.hostname) {
    url = replaceLocalhostInUrl(url);
  }
  
  return url;
};

/**
 * 处理 savedResult 中的所有图片URL
 */
export const processSavedResultUrls = (savedResult: any): SavedResultData => {
  if (!savedResult) return savedResult;
  return {
    ...savedResult,
    original_image: processImageUrl(savedResult.original_image),
    step1_binary: processImageUrl(savedResult.step1_binary),
    step2_grayscale: processImageUrl(savedResult.step2_grayscale),
    step2_grayscale_3_level: processImageUrl(savedResult.step2_grayscale_3_level),
    step2_grayscale_4_level: processImageUrl(savedResult.step2_grayscale_4_level),
    step3_lab_l: processImageUrl(savedResult.step3_lab_l),
    step4_hsv_s: processImageUrl(savedResult.step4_hsv_s),
    step4_hls_s: processImageUrl(savedResult.step4_hls_s),
    step4_hls_s_inverted: processImageUrl(savedResult.step4_hls_s_inverted),
    step5_hue: processImageUrl(savedResult.step5_hue),
    kmeans_segmentation_image: processImageUrl(savedResult.kmeans_segmentation_image),
  };
};

/**
 * 将URL转换为base64（如果需要）
 */
export const convertUrlToBase64 = async (url: string): Promise<string> => {
  // 如果已经是base64数据URL，直接返回
  if (url.startsWith('data:')) {
    return url;
  }
  // 如果是URL，需要先加载图片再转换为base64
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("[VisualAnalysis] 转换URL到base64失败:", err);
    throw err;
  }
};
