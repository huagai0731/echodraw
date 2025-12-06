// 视觉分析服务模块 - 处理服务器保存逻辑

import { createVisualAnalysisResult, fetchVisualAnalysisResults, deleteVisualAnalysisResult } from "@/services/api";
import type { VisualAnalysisResult } from "../types";

/**
 * 删除所有旧的视觉分析结果（确保最多只保留一个）
 */
const deleteAllExistingResults = async (): Promise<void> => {
  try {
    const existingResults = await fetchVisualAnalysisResults();
    console.log("[VisualAnalysis] 发现", existingResults.length, "个旧结果，准备删除...");
    
    // 删除所有旧结果
    const deletePromises = existingResults.map(result => 
      deleteVisualAnalysisResult(result.id).catch(err => {
        console.warn(`[VisualAnalysis] 删除结果 ${result.id} 失败:`, err);
      })
    );
    
    await Promise.all(deletePromises);
    console.log("[VisualAnalysis] 已删除所有旧结果");
  } catch (err) {
    console.warn("[VisualAnalysis] 查询或删除旧结果时出错:", err);
    // 不抛出错误，继续创建新结果
  }
};

/**
 * 保存基础分析结果到服务器
 */
export const saveBasicResultsToServer = async (
  basicResults: Partial<VisualAnalysisResult>
): Promise<{ id: number }> => {
  if (!basicResults.originalImage || !basicResults.step1Binary) {
    throw new Error("基础结果不完整，无法保存");
  }

  // 先删除所有旧结果，确保最多只保留一个
  await deleteAllExistingResults();

  console.log("[VisualAnalysis] 开始保存基础结果到服务器...");
  const savedResult = await createVisualAnalysisResult({
    original_image: basicResults.originalImage,
    step1_binary: basicResults.step1Binary,
    step2_grayscale: basicResults.step2Grayscale || "",
    step3_lab_l: basicResults.step3LabL || "",
    step4_hsv_s: basicResults.step4HsvS || "",
    step4_hls_s: basicResults.step4HlsS || "",
    step5_hue: basicResults.step5Hue || "",
    step2_grayscale_3_level: basicResults.step2Grayscale3Level || "",
    step2_grayscale_4_level: basicResults.step2Grayscale4Level || "",
    binary_threshold: basicResults.binaryThreshold || 140,
  });
  
  console.log("[VisualAnalysis] 基础结果已保存到服务器，ID:", savedResult.id);
  return savedResult;
};

/**
 * 更新服务器上的专业分析结果
 */
export const updateComprehensiveResultsToServer = async (
  comprehensiveResults: any,
  savedResultId: number | null,
  originalImage: string | null,
  step2Grayscale: string | null,
  selectedThreshold: number
): Promise<{ id: number } | null> => {
  if (!savedResultId) {
    console.warn("[VisualAnalysis] savedResultId 尚未设置，创建新结果...");
    // 如果没有savedResultId，先删除所有旧结果，然后创建新结果
    await deleteAllExistingResults();
    
    try {
      const newResult = await createVisualAnalysisResult({
        original_image: originalImage || "",
        step1_binary: comprehensiveResults?.step1?.binary || "",
        step2_grayscale: step2Grayscale || "", // 必需字段
        step2_grayscale_3_level: comprehensiveResults?.step1?.grayscale_3_level || "",
        step2_grayscale_4_level: comprehensiveResults?.step1?.grayscale_4_level || "",
        step3_lab_l: comprehensiveResults?.step2?.lab_luminance || "",
        step4_hls_s: comprehensiveResults?.step3?.hls_saturation || "",
        step4_hls_s_inverted: comprehensiveResults?.step3?.hls_saturation_inverted || "",
        step5_hue: comprehensiveResults?.step4?.hue_map || "",
        kmeans_segmentation_image: comprehensiveResults?.step5?.kmeans_segmentation || "",
        binary_threshold: selectedThreshold,
        comprehensive_analysis: {
          step1: {},
          step2: {},
          step3: {},
          step4: {
            hue_histogram: comprehensiveResults?.step4?.hue_histogram || [],
          },
          step5: {
            dominant_palette: comprehensiveResults?.step5?.dominant_palette || {},
          },
        },
      });
      console.log("[VisualAnalysis] 创建新结果成功，ID:", newResult.id);
      return newResult;
    } catch (err) {
      console.error("[VisualAnalysis] 创建新结果失败:", err);
      return null;
    }
  }

  try {
    console.log("[VisualAnalysis] 开始更新分析结果到服务器，ID:", savedResultId);
    
    // 先删除所有旧结果（包括当前的），确保最多只保留一个
    // 因为我们会创建新结果，所以需要删除所有旧结果
    await deleteAllExistingResults();
    
    // 从comprehensiveResults中提取图片和结构化数据
    const structuredAnalysis = JSON.parse(JSON.stringify(comprehensiveResults || {}));
    
    // 提取图片数据
    const step1Binary = structuredAnalysis.step1?.binary;
    const step1Grayscale3Level = structuredAnalysis.step1?.grayscale_3_level;
    const step1Grayscale4Level = structuredAnalysis.step1?.grayscale_4_level;
    const step2LabLuminance = structuredAnalysis.step2?.lab_luminance;
    const step3HlsSaturation = structuredAnalysis.step3?.hls_saturation;
    const step3HlsSaturationInverted = structuredAnalysis.step3?.hls_saturation_inverted;
    const step4HueMap = structuredAnalysis.step4?.hue_map;
    const step5KmeansSegmentation8 = structuredAnalysis.step5?.kmeans_segmentation_8 || structuredAnalysis.step5?.kmeans_segmentation;
    const step5KmeansSegmentation12 = structuredAnalysis.step5?.kmeans_segmentation_12;
    
    // 从JSON中移除图片数据，只保留结构化数据
    if (structuredAnalysis.step1) {
      delete structuredAnalysis.step1.binary;
      delete structuredAnalysis.step1.grayscale_3_level;
      delete structuredAnalysis.step1.grayscale_4_level;
    }
    if (structuredAnalysis.step2) {
      delete structuredAnalysis.step2.rgb_luminance;
      delete structuredAnalysis.step2.lab_luminance;
    }
    if (structuredAnalysis.step3) {
      delete structuredAnalysis.step3.hls_saturation;
      delete structuredAnalysis.step3.hls_saturation_inverted;
    }
    if (structuredAnalysis.step4) {
      delete structuredAnalysis.step4.hue_map;
    }
    if (structuredAnalysis.step5) {
      delete structuredAnalysis.step5.kmeans_segmentation_8;
      delete structuredAnalysis.step5.kmeans_segmentation;
    }
    
    // 检查字符串是否是URL
    const isUrl = (str: string | undefined): boolean => {
      if (!str) return false;
      return str.startsWith('http://') || str.startsWith('https://');
    };
    
    // 获取图片数据，如果是URL则返回空字符串（跳过发送）
    const getImageData = (imageData: string | undefined): string => {
      if (!imageData) return "";
      if (isUrl(imageData)) return "";
      return imageData;
    };
    
    // 创建新结果（因为后端没有提供更新接口）
    // 我们已经删除了所有旧结果，所以最多只会有一个结果
    const updatedResult = await createVisualAnalysisResult({
      original_image: getImageData(originalImage || undefined),
      step1_binary: getImageData(step1Binary),
      step2_grayscale: step2Grayscale || "",
      step2_grayscale_3_level: getImageData(step1Grayscale3Level),
      step2_grayscale_4_level: getImageData(step1Grayscale4Level),
      step3_lab_l: getImageData(step2LabLuminance),
      step4_hls_s: getImageData(step3HlsSaturation),
      step4_hls_s_inverted: getImageData(step3HlsSaturationInverted),
      step5_hue: getImageData(step4HueMap),
      kmeans_segmentation_image: getImageData(step5KmeansSegmentation8),
      binary_threshold: selectedThreshold,
      comprehensive_analysis: structuredAnalysis,
    });
    
    console.log("[VisualAnalysis] 专业分析结果已更新到服务器，新ID:", updatedResult.id);
    return updatedResult;
  } catch (err) {
    console.error("[VisualAnalysis] 更新专业分析结果失败:", err);
    return null;
  }
};
