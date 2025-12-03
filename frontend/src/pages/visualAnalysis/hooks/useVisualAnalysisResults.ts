// 视觉分析结果加载 Hook - 管理结果加载和状态

import { useState, useCallback, useRef, useEffect } from "react";
import type { VisualAnalysisResult, SavedResultData } from "../types";
import { processImageUrl, processSavedResultUrls, convertUrlToBase64 } from "../utils/imageUrlUtils";
import { generateGrayscaleLevels } from "../utils/imageProcessing";

export type UseVisualAnalysisResultsReturn = {
  results: Partial<VisualAnalysisResult> | null;
  savedResultData: SavedResultData | null;
  comprehensiveResults: any;
  selectedThreshold: number;
  setResults: (results: Partial<VisualAnalysisResult> | null) => void;
  setSelectedThreshold: (threshold: number) => void;
  setComprehensiveResults: (results: any) => void;
  setSavedResultData: (data: SavedResultData | null) => void;
  loadResultWithGrayscaleLevels: (savedResult: any) => Promise<void>;
  loadResultWithGrayscaleLevelsRef: React.MutableRefObject<((savedResult: any) => Promise<void>) | null>;
};

/**
 * 管理视觉分析结果的加载和状态
 */
export function useVisualAnalysisResults(
  opencvReady: boolean
): UseVisualAnalysisResultsReturn {
  const [results, setResults] = useState<Partial<VisualAnalysisResult> | null>(null);
  const [savedResultData, setSavedResultData] = useState<SavedResultData | null>(null);
  const [comprehensiveResults, setComprehensiveResults] = useState<any>(null);
  const [selectedThreshold, setSelectedThreshold] = useState<number>(140);
  const loadResultWithGrayscaleLevelsRef = useRef<((savedResult: any) => Promise<void>) | null>(null);

  // 加载结果并生成3阶4阶灰度图的辅助函数
  const loadResultWithGrayscaleLevels = useCallback(async (savedResult: any) => {
    console.log("[VisualAnalysis] loadResultWithGrayscaleLevels 开始，结果ID:", savedResult.id);
    
    // 处理 savedResult 中的所有图片URL，然后保存完整的结果数据，用于传递给子组件
    const processedSavedResult = processSavedResultUrls(savedResult);
    setSavedResultData(processedSavedResult);
    
    // 先设置基础结果，不等待3阶4阶灰度图生成
    const resultData: Partial<VisualAnalysisResult> = {
      originalImage: processImageUrl(savedResult.original_image),
      step1Binary: processImageUrl(savedResult.step1_binary),
      step2Grayscale: processImageUrl(savedResult.step2_grayscale),
      step2Grayscale3Level: processImageUrl(savedResult.step2_grayscale_3_level) || "",
      step2Grayscale4Level: processImageUrl(savedResult.step2_grayscale_4_level) || "",
      step3LabL: processImageUrl(savedResult.step3_lab_l),
      step4HsvS: processImageUrl(savedResult.step4_hsv_s),
      step4HlsS: processImageUrl(savedResult.step4_hls_s),
      step5Hue: processImageUrl(savedResult.step5_hue),
      binaryThreshold: savedResult.binary_threshold,
      timestamp: savedResult.created_at,
    };
    
    console.log("[VisualAnalysis] 设置结果数据:", {
      hasOriginalImage: !!resultData.originalImage,
      hasStep1Binary: !!resultData.step1Binary,
      hasStep2Grayscale: !!resultData.step2Grayscale,
    });
    
    setResults(resultData);
    setSelectedThreshold(savedResult.binary_threshold);
    
    console.log("[VisualAnalysis] 状态已设置: results");
    
    // 处理专业分析结果
    if (savedResult.comprehensive_analysis && Object.keys(savedResult.comprehensive_analysis).length > 0) {
      console.log("[VisualAnalysis] 设置专业分析结果", {
        hasComprehensiveAnalysis: true,
        keys: Object.keys(savedResult.comprehensive_analysis),
        comprehensiveAnalysisType: typeof savedResult.comprehensive_analysis,
      });
      
      let comprehensiveData = savedResult.comprehensive_analysis;
      if (typeof comprehensiveData === 'string') {
        try {
          comprehensiveData = JSON.parse(comprehensiveData);
          console.log("[VisualAnalysis] 解析了字符串格式的专业分析结果");
        } catch (err) {
          console.error("[VisualAnalysis] 解析专业分析结果失败:", err);
          comprehensiveData = null;
        }
      }
      
      if (comprehensiveData && Object.keys(comprehensiveData).length > 0) {
        console.log("[VisualAnalysis] 专业分析结果已设置", {
          keys: Object.keys(comprehensiveData),
        });
        setComprehensiveResults(comprehensiveData);
      } else {
        console.warn("[VisualAnalysis] 专业分析结果为空或无效");
      }
    } else {
      console.log("[VisualAnalysis] 没有专业分析结果");
      // 即使没有comprehensiveResults状态，也要从savedResult加载comprehensive_analysis
      if (savedResult.comprehensive_analysis && typeof savedResult.comprehensive_analysis === 'object' && Object.keys(savedResult.comprehensive_analysis).length > 0) {
        console.log("[VisualAnalysis] 从savedResult加载comprehensive_analysis");
        setComprehensiveResults(savedResult.comprehensive_analysis);
      }
    }

    // 如果缺少3阶4阶灰度图，从step2Grayscale重新生成（异步，不阻塞显示）
    if (savedResult.step2_grayscale && (!savedResult.step2_grayscale_3_level || !savedResult.step2_grayscale_4_level)) {
      const generateLevels = async () => {
        // 等待OpenCV加载完成（最多等待30秒）
        let attempts = 0;
        const maxAttempts = 60; // 最多尝试60次，每次等待500ms，总共30秒
        while (!opencvReady && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        
        if (!opencvReady) {
          console.warn("[VisualAnalysis] OpenCV 加载超时，无法生成3阶4阶灰度图");
          return;
        }
        
        try {
          console.log("[VisualAnalysis] OpenCV 已就绪，开始生成3阶4阶灰度图");
          // 先转换URL为base64（如果需要）
          const base64Image = await convertUrlToBase64(savedResult.step2_grayscale);
          const levels = await generateGrayscaleLevels(base64Image, opencvReady);
          console.log("[VisualAnalysis] 3阶4阶灰度图生成完成");
          
          setResults((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              step2Grayscale3Level: levels.level3,
              step2Grayscale4Level: levels.level4,
            };
          });
        } catch (err) {
          console.warn("[VisualAnalysis] 生成3阶4阶灰度图失败:", err);
        }
      };
      
      // 立即开始生成（不阻塞）
      generateLevels().catch((err) => {
        console.error("[VisualAnalysis] 生成3阶4阶灰度图过程出错:", err);
      });
    } else {
      console.log("[VisualAnalysis] 没有 step2_grayscale，跳过生成3阶4阶灰度图");
    }
    
    console.log("[VisualAnalysis] loadResultWithGrayscaleLevels 完成");
  }, [opencvReady]);

  // 更新 ref，确保总是使用最新的函数
  useEffect(() => {
    loadResultWithGrayscaleLevelsRef.current = loadResultWithGrayscaleLevels;
  }, [loadResultWithGrayscaleLevels]);

  // 当opencvReady变为true时，如果已有结果但缺少3阶4阶灰度图，重新生成
  useEffect(() => {
    if (opencvReady && results && results.step2Grayscale) {
      const needsGeneration = !results.step2Grayscale3Level || !results.step2Grayscale4Level;
      if (needsGeneration) {
        console.log("[VisualAnalysis] OpenCV 已就绪，开始生成缺失的3阶4阶灰度图");
        
        convertUrlToBase64(results.step2Grayscale)
          .then((base64Image) => {
            return generateGrayscaleLevels(base64Image, opencvReady);
          })
          .then((levels) => {
            console.log("[VisualAnalysis] 3阶4阶灰度图生成完成（OpenCV就绪后）");
            setResults((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                step2Grayscale3Level: levels.level3,
                step2Grayscale4Level: levels.level4,
              };
            });
          })
          .catch((err) => {
            console.warn("[VisualAnalysis] 生成3阶4阶灰度图失败（OpenCV就绪后）:", err);
          });
      }
    }
  }, [opencvReady, results?.step2Grayscale, results?.step2Grayscale3Level, results?.step2Grayscale4Level]);

  return {
    results,
    savedResultData,
    comprehensiveResults,
    selectedThreshold,
    setResults,
    setSelectedThreshold,
    setComprehensiveResults,
    setSavedResultData,
    loadResultWithGrayscaleLevels,
    loadResultWithGrayscaleLevelsRef,
  };
}
