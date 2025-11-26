import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import TopNav, { type TopNavAction } from "@/components/TopNav";
import { fetchVisualAnalysisResult, analyzeImageComprehensive, getImageAnalysisTaskStatus, deleteVisualAnalysisResult, createVisualAnalysisResult, fetchVisualAnalysisResults } from "@/services/api";
import VisualAnalysisComprehensive from "./VisualAnalysisComprehensive";
import { compressImageToSize, fileToDataURL } from "@/utils/imageCompression";
import "./VisualAnalysis.css";
import "./ArtworkDetails.css";

type VisualAnalysisProps = {
  onBack: () => void;
  onSave?: (result: VisualAnalysisResult) => void;
  resultId?: number; // 如果提供resultId，则显示已保存的结果
};

type VisualAnalysisResult = {
  originalImage: string;
  step1Binary: string;
  step2Grayscale: string;
  step2Grayscale3Level: string; // 3阶层灰度
  step2Grayscale4Level: string; // 4阶层灰度
  step3LabL: string;
  step4HsvS: string;
  step4HlsS: string;
  step5Hue: string;
  binaryThreshold: number;
  timestamp: string;
  comprehensive_analysis?: any; // 专业分析结果
};

// 二值化阈值选项（6个等级，从高到低）
const BINARY_THRESHOLD_OPTIONS = [
  { label: "等级1（最高）", value: 200 },
  { label: "等级2", value: 170 },
  { label: "等级3", value: 140 },
  { label: "等级4", value: 110 },
  { label: "等级5", value: 80 },
  { label: "等级6（最低）", value: 50 },
];

function VisualAnalysis({ onBack, onSave, resultId }: VisualAnalysisProps) {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSavedResult, setLoadingSavedResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedThreshold, setSelectedThreshold] = useState<number>(140); // 默认等级3
  const [results, setResults] = useState<Partial<VisualAnalysisResult> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [opencvReady, setOpencvReady] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false); // 是否为查看模式
  const [showComprehensive, setShowComprehensive] = useState(false); // 是否显示专业分析
  const [comprehensiveLoading, setComprehensiveLoading] = useState(false);
  const [comprehensiveResults, setComprehensiveResults] = useState<any>(null);
  const [comprehensiveProgress, setComprehensiveProgress] = useState(0); // 分析进度
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null); // 轮询定时器引用
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null); // 上传后的预览图
  const [savedResultId, setSavedResultId] = useState<number | null>(null); // 保存的结果ID
  const savedResultIdRef = useRef<number | null>(null); // 使用 ref 跟踪 savedResultId，确保能访问最新值
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null); // 当前分析任务ID
  const [checkingExistingResult, setCheckingExistingResult] = useState(true); // 是否正在检查已有结果
  const [isCompressing, setIsCompressing] = useState(false); // 是否正在压缩图片
  const loadResultWithGrayscaleLevelsRef = useRef<((savedResult: any) => Promise<void>) | null>(null);
  
  // 同步 savedResultId 到 ref
  useEffect(() => {
    savedResultIdRef.current = savedResultId;
  }, [savedResultId]);

  // 从灰度图生成3阶和4阶灰度图的辅助函数
  const generateGrayscaleLevels = useCallback(async (grayscaleImageUrl: string): Promise<{ level3: string; level4: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const cv = (window as any).cv;
          if (!cv || !opencvReady) {
            reject(new Error("OpenCV未就绪"));
            return;
          }

          // 创建canvas
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("无法创建canvas上下文"));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // 转换为OpenCV Mat
          const gray = cv.imread(canvas);
          if (!gray || gray.empty()) {
            reject(new Error("无法读取图片数据"));
            return;
          }

          // 生成3阶层灰度
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
          const level3 = matToDataUrl(gray3Level);
          gray3Level.delete();

          // 生成4阶层灰度
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
          const level4 = matToDataUrl(gray4Level);
          gray4Level.delete();

          gray.delete();
          canvas.remove();

          resolve({ level3, level4 });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("图片加载失败"));
      img.src = grayscaleImageUrl;
    });
  }, [opencvReady]);

  // 加载结果并生成3阶4阶灰度图的辅助函数
  const loadResultWithGrayscaleLevels = useCallback(async (savedResult: any) => {
    console.log("[VisualAnalysis] loadResultWithGrayscaleLevels 开始，结果ID:", savedResult.id);
    // 先设置基础结果，不等待3阶4阶灰度图生成
    const resultData = {
      originalImage: savedResult.original_image,
      step1Binary: savedResult.step1_binary,
      step2Grayscale: savedResult.step2_grayscale,
      step2Grayscale3Level: "", // 先设为空，后面会生成
      step2Grayscale4Level: "", // 先设为空，后面会生成
      step3LabL: savedResult.step3_lab_l,
      step4HsvS: savedResult.step4_hsv_s,
      step4HlsS: savedResult.step4_hls_s,
      step5Hue: savedResult.step5_hue,
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
    setOriginalImage(savedResult.original_image);
    console.log("[VisualAnalysis] 状态已设置: originalImage 和 results");
    
    if (savedResult.comprehensive_analysis && Object.keys(savedResult.comprehensive_analysis).length > 0) {
      console.log("[VisualAnalysis] 设置专业分析结果", {
        hasComprehensiveAnalysis: true,
        keys: Object.keys(savedResult.comprehensive_analysis),
        comprehensiveAnalysisType: typeof savedResult.comprehensive_analysis,
      });
      // 确保 comprehensive_analysis 是对象而不是字符串
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
        setComprehensiveResults(comprehensiveData);
        setShowComprehensive(true);
        console.log("[VisualAnalysis] 专业分析结果已设置");
      } else {
        console.warn("[VisualAnalysis] 专业分析结果为空或无效");
      }
    } else {
      console.log("[VisualAnalysis] 没有专业分析结果", {
        hasComprehensiveAnalysis: !!savedResult.comprehensive_analysis,
        isObject: savedResult.comprehensive_analysis && typeof savedResult.comprehensive_analysis === 'object',
        keysCount: savedResult.comprehensive_analysis && typeof savedResult.comprehensive_analysis === 'object' 
          ? Object.keys(savedResult.comprehensive_analysis).length 
          : 0,
      });
    }

    // 如果缺少3阶4阶灰度图，从step2Grayscale重新生成（异步，不阻塞显示）
    // 注意：即使 opencvReady 为 false，也要尝试生成（会在 opencvReady 变为 true 时自动重试）
    if (savedResult.step2_grayscale) {
      if (opencvReady) {
        console.log("[VisualAnalysis] OpenCV 已就绪，开始生成3阶4阶灰度图");
        generateGrayscaleLevels(savedResult.step2_grayscale)
          .then((levels) => {
            console.log("[VisualAnalysis] 3阶4阶灰度图生成完成");
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
            console.warn("[VisualAnalysis] 生成3阶4阶灰度图失败:", err);
          });
      } else {
        console.log("[VisualAnalysis] OpenCV 未就绪，等待 OpenCV 加载后再生成3阶4阶灰度图");
        // OpenCV 加载完成后，useEffect 会自动生成
      }
    } else {
      console.log("[VisualAnalysis] 没有 step2_grayscale，跳过生成3阶4阶灰度图");
    }
    console.log("[VisualAnalysis] loadResultWithGrayscaleLevels 完成");
  }, [opencvReady, generateGrayscaleLevels]);

  // 更新 ref，确保总是使用最新的函数
  useEffect(() => {
    loadResultWithGrayscaleLevelsRef.current = loadResultWithGrayscaleLevels;
  }, [loadResultWithGrayscaleLevels]);

  // 如果提供了resultId，加载已保存的结果
  useEffect(() => {
    if (resultId) {
      setLoadingSavedResult(true);
      setIsViewMode(true);
      setError(null);
      setSavedResultId(resultId);
      savedResultIdRef.current = resultId;
      fetchVisualAnalysisResult(resultId)
        .then(async (savedResult) => {
          // 验证结果是否有效
          if (!savedResult.original_image || !savedResult.step1_binary) {
            throw new Error("结果无效");
          }

          // 加载结果（包括生成3阶4阶灰度图）
          await loadResultWithGrayscaleLevels(savedResult);
          console.log("[VisualAnalysis] 已加载专业分析结果");
        })
        .catch((err) => {
          console.error("加载视觉分析结果失败:", err);
          setError("加载保存的结果失败，请稍后重试");
        })
        .finally(() => {
          setLoadingSavedResult(false);
          setCheckingExistingResult(false);
        });
    }
  }, [resultId, loadResultWithGrayscaleLevels]);

  // 当opencvReady变为true时，如果已有结果但缺少3阶4阶灰度图，重新生成
  useEffect(() => {
    if (opencvReady && results && results.step2Grayscale) {
      const needsGeneration = !results.step2Grayscale3Level || !results.step2Grayscale4Level;
      if (needsGeneration) {
        console.log("[VisualAnalysis] OpenCV 已就绪，开始生成缺失的3阶4阶灰度图");
        generateGrayscaleLevels(results.step2Grayscale)
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
  }, [opencvReady, results, generateGrayscaleLevels]);

  // 组件加载时检查是否有最新的分析结果或任务
  useEffect(() => {
    if (resultId) {
      // 如果提供了resultId，不需要检查
      console.log("[VisualAnalysis] 提供了 resultId，跳过检查:", resultId);
      setCheckingExistingResult(false);
      return;
    }

    let isMounted = true;

    async function checkExistingResult() {
      console.log("[VisualAnalysis] 开始检查已有结果...");
      try {
        // 获取用户的分析结果列表
        const results = await fetchVisualAnalysisResults();
        console.log("[VisualAnalysis] 获取到结果列表:", results?.length || 0, "个结果");
        if (!isMounted) {
          console.log("[VisualAnalysis] 组件已卸载，取消检查");
          return;
        }
        
        if (results && results.length > 0) {
          // 获取最新的结果（按创建时间排序，最新的在前）
          const latestResult = results.sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0];
          
          console.log("[VisualAnalysis] 找到最新结果，ID:", latestResult.id, "创建时间:", latestResult.created_at);
          
          // 直接获取完整的结果详情，因为列表中的字段可能是 URL 或空
          // 加载结果（不管是否完成）
          if (isMounted) {
            console.log("[VisualAnalysis] 开始加载结果，ID:", latestResult.id);
            setSavedResultId(latestResult.id);
            savedResultIdRef.current = latestResult.id;
            setIsViewMode(true);
            setLoadingSavedResult(true);
            // 注意：不要在这里设置 checkingExistingResult = false
            // 应该等到结果加载完成后再设置
          }
          
          try {
            const savedResult = await fetchVisualAnalysisResult(latestResult.id);
            console.log("[VisualAnalysis] 成功获取结果详情", {
              hasOriginalImage: !!savedResult.original_image,
              hasStep1Binary: !!savedResult.step1_binary,
              hasStep2Grayscale: !!savedResult.step2_grayscale,
              hasComprehensiveAnalysis: !!savedResult.comprehensive_analysis,
              originalImageType: typeof savedResult.original_image,
              step1BinaryType: typeof savedResult.step1_binary,
              step2GrayscaleType: typeof savedResult.step2_grayscale,
              comprehensiveAnalysisType: typeof savedResult.comprehensive_analysis,
            });
            if (!isMounted) {
              console.log("[VisualAnalysis] 组件已卸载，取消加载");
              return;
            }
            
            // 验证结果是否有效（检查字段是否存在且不为空）
            // 注意：original_image 和 step1_binary 可能是 URL 字符串或 base64 数据
            const hasOriginalImage = savedResult.original_image && 
              (typeof savedResult.original_image === 'string') && 
              savedResult.original_image.trim().length > 0;
            const hasStep1Binary = savedResult.step1_binary && 
              (typeof savedResult.step1_binary === 'string') && 
              savedResult.step1_binary.trim().length > 0;
            
            if (!hasOriginalImage || !hasStep1Binary) {
              console.warn("[VisualAnalysis] 结果无效，缺少必要字段", {
                hasOriginalImage,
                hasStep1Binary,
              });
              throw new Error("结果无效：缺少必要字段");
            }

            // 加载结果（包括生成3阶4阶灰度图）
            if (loadResultWithGrayscaleLevelsRef.current) {
              console.log("[VisualAnalysis] 开始加载结果数据...");
              await loadResultWithGrayscaleLevelsRef.current(savedResult);
              console.log("[VisualAnalysis] 结果数据加载完成");
            } else {
              console.warn("[VisualAnalysis] loadResultWithGrayscaleLevelsRef.current 为 null");
            }
            
            // 只有在成功加载结果后才设置 checkingExistingResult = false
            if (isMounted) {
              console.log("[VisualAnalysis] 检查完成，结果已加载");
              setCheckingExistingResult(false);
            }
          } catch (err) {
            if (!isMounted) {
              console.log("[VisualAnalysis] 组件已卸载，取消错误处理");
              return;
            }
            console.error("[VisualAnalysis] 加载最新结果失败:", err);
            // 如果加载失败（可能是已删除），清除状态并显示上传页面
            if (isMounted) {
              setLoadingSavedResult(false);
              setCheckingExistingResult(false);
              setIsViewMode(false);
              setSavedResultId(null);
              savedResultIdRef.current = null;
            }
          } finally {
            if (isMounted) {
              setLoadingSavedResult(false);
            }
          }
        } else {
          // 没有找到结果，显示上传页面
          console.log("[VisualAnalysis] 没有找到已有结果，显示上传页面");
          if (isMounted) {
            setCheckingExistingResult(false);
          }
        }
      } catch (err) {
        if (!isMounted) {
          console.log("[VisualAnalysis] 组件已卸载，取消错误处理");
          return;
        }
        console.error("[VisualAnalysis] 检查已有结果失败:", err);
        // 检查失败的原因可能是：
        // 1. 网络错误
        // 2. 认证错误（未登录）
        // 3. 服务器错误
        // 在这些情况下，显示上传页面是合理的
        const error = err as any;
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          console.warn("[VisualAnalysis] 认证失败，可能需要重新登录");
        }
        if (isMounted) {
          setCheckingExistingResult(false);
        }
      }
    }

    checkExistingResult();

    return () => {
      console.log("[VisualAnalysis] 清理检查逻辑");
      isMounted = false;
    };
  }, [resultId]); // 移除 loadResultWithGrayscaleLevels 依赖，只在 resultId 变化时执行

  // 加载 OpenCV.js
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkOpencv = () => {
      const cv = (window as any).cv;
      if (cv && cv.Mat) {
        setOpencvReady(true);
        return true;
      }
      return false;
    };

    if (checkOpencv()) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.async = true;
    script.onload = () => {
      const cv = (window as any).cv;
      if (cv) {
        if (cv.onRuntimeInitialized) {
          cv.onRuntimeInitialized = () => {
            setOpencvReady(true);
          };
        } else {
          // 如果已经初始化，直接设置ready
          setTimeout(() => {
            if (checkOpencv()) {
              setOpencvReady(true);
            }
          }, 100);
        }
      }
    };
    script.onerror = () => {
      setError("无法加载 OpenCV 库，请检查网络连接");
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
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
      // 不再自动处理，等待用户点击确认
    };
    reader.readAsDataURL(file);
  };

  // 用户点击确认按钮后开始处理
  const handleConfirmAndProcess = async () => {
    if (!imagePreview || !imageFile) {
      setError("请先上传图片");
      return;
    }
    
    // 清除之前的状态，开始新的分析
    setResults(null);
    setComprehensiveResults(null);
    setShowComprehensive(false);
    setComprehensiveLoading(false);
    setComprehensiveProgress(0);
    setSavedResultId(null);
    savedResultIdRef.current = null;
    setCurrentTaskId(null);
    setIsViewMode(false);
    setError(null);
    
    // 清理之前的轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    // 先压缩图片到600k以下（像画集上传一样）
    setIsCompressing(true);
    try {
      const compressedFile = await compressImageToSize(imageFile, 600 * 1024, 2048);
      const compressedDataUrl = await fileToDataURL(compressedFile);
      
      setImageFile(compressedFile);
      setImagePreview(compressedDataUrl);
      setOriginalImage(compressedDataUrl);
      
      // 使用压缩后的图片进行处理
      processImage(compressedDataUrl, compressedFile);
    } catch (err) {
      console.error("图片压缩失败:", err);
      setError("图片压缩失败，请重试");
      // 如果压缩失败，使用原始图片继续处理
      setOriginalImage(imagePreview);
      processImage(imagePreview, imageFile);
    } finally {
      setIsCompressing(false);
    }
  };

  const processImage = async (imageDataUrl: string, _file?: File) => {
    if (!opencvReady) {
      setError("OpenCV 库尚未加载完成，请稍候");
      return;
    }

    setLoading(true);
    setError(null);

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
      const cv = (window as any).cv;
      if (!cv) {
        throw new Error("OpenCV 未加载");
      }
      
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

      // 第二步扩展：3阶层灰度（将0-255分为3个等级：0-85, 85-170, 170-255）
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

      // 第二步扩展：4阶层灰度（将0-255分为4个等级：0-64, 64-128, 128-192, 192-255）
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

      // 第四步：HLS的S通道（HSV饱和度已删除）
      hls = new cv.Mat();
      cv.cvtColor(src, hls, cv.COLOR_RGBA2RGB);
      cv.cvtColor(hls, hls, cv.COLOR_RGB2HLS);
      hlsChannels = new cv.MatVector();
      cv.split(hls, hlsChannels);
      const step4HlsS = matToDataUrl(hlsChannels.get(2)); // S通道（HLS中S是第三个通道）

      // 第五步：纯色相图（固定饱和度和亮度）
      // 需要重新计算HSV（因为删除了之前的HSV计算）
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

      const result: Partial<VisualAnalysisResult> = {
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

      setResults(result);
      
      // 保存基础分析结果到服务器
      saveBasicResultsToServer(result, imageDataUrl);
      
      // 自动开始专业分析（直接传递图片数据，不依赖状态）
      setTimeout(() => {
        handleComprehensiveAnalysis(imageDataUrl);
      }, 100);
    } catch (err: any) {
      console.error("图像处理错误:", err);
      
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
        // OpenCV 错误代码
        errorMessage = `OpenCV 错误代码: ${err}`;
        if (err === 7083872 || err === -215) {
          errorMessage = "图片尺寸过大或格式不支持，请尝试使用较小的图片";
        } else if (err === -27) {
          errorMessage = "内存不足，请尝试使用较小的图片";
        }
      } else if (err && typeof err === "object" && "message" in err) {
        errorMessage = String(err.message);
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const matToDataUrl = (mat: any): string => {
    const cv = (window as any).cv;
    const canvas = document.createElement("canvas");
    cv.imshow(canvas, mat);
    return canvas.toDataURL("image/png");
  };

  const handleThresholdChange = (threshold: number) => {
    setSelectedThreshold(threshold);
    if (originalImage) {
      processImage(originalImage, imageFile || undefined);
    }
  };

  const handleSave = () => {
    if (results && onSave) {
      // 保存时包含专业分析结果（如果有）
      const saveData = {
        ...results,
        comprehensive_analysis: comprehensiveResults || null,
      } as VisualAnalysisResult & { comprehensive_analysis?: any };
      onSave(saveData);
    }
  };

  // 保存基础分析结果到服务器
  const saveBasicResultsToServer = async (basicResults: Partial<VisualAnalysisResult>, imageDataUrl: string) => {
    if (!basicResults.originalImage || !basicResults.step1Binary) {
      console.warn("[VisualAnalysis] 基础结果不完整，跳过保存");
      return;
    }

    try {
      console.log("[VisualAnalysis] 开始保存基础结果到服务器...");
      const savedResult = await createVisualAnalysisResult({
        original_image: basicResults.originalImage,
        step1_binary: basicResults.step1Binary,
        step2_grayscale: basicResults.step2Grayscale || "",
        step3_lab_l: basicResults.step3LabL || "",
        step4_hsv_s: basicResults.step4HsvS || "",
        step4_hls_s: basicResults.step4HlsS || "",
        step5_hue: basicResults.step5Hue || "",
        binary_threshold: basicResults.binaryThreshold || 140,
      });
      
      console.log("[VisualAnalysis] 基础结果已保存到服务器，ID:", savedResult.id);
      // 立即设置 savedResultId，确保后续操作可以使用
      setSavedResultId(savedResult.id);
      savedResultIdRef.current = savedResult.id; // 同时更新 ref
      // 保存后设置为查看模式，这样刷新后能正确加载
      setIsViewMode(true);
      console.log("[VisualAnalysis] savedResultId 已设置为:", savedResult.id);
    } catch (err) {
      console.error("[VisualAnalysis] 保存基础结果失败:", err);
      // 不显示错误给用户，因为分析可以继续进行
    }
  };

  // 更新服务器上的分析结果（添加专业分析结果）
  const updateComprehensiveResultsToServer = async (comprehensiveResults: any) => {
    // 使用 ref 获取最新的 savedResultId
    let currentSavedResultId = savedResultIdRef.current;
    if (!currentSavedResultId) {
      console.warn("[VisualAnalysis] savedResultId 尚未设置，等待 500ms 后重试...");
      // 等待一下，因为 saveBasicResultsToServer 是异步的
      await new Promise(resolve => setTimeout(resolve, 500));
      // 再次从 ref 获取最新值
      currentSavedResultId = savedResultIdRef.current;
      if (!currentSavedResultId) {
        console.warn("[VisualAnalysis] 仍然没有 savedResultId，无法更新专业分析结果");
        return;
      }
    }

    try {
      console.log("[VisualAnalysis] 开始更新专业分析结果到服务器，ID:", currentSavedResultId);
      // 重新保存完整结果（包括专业分析）
      if (results) {
        const updatedResult = await createVisualAnalysisResult({
          original_image: results.originalImage || "",
          step1_binary: results.step1Binary || "",
          step2_grayscale: results.step2Grayscale || "",
          step3_lab_l: results.step3LabL || "",
          step4_hsv_s: results.step4HsvS || "",
          step4_hls_s: results.step4HlsS || "",
          step5_hue: results.step5Hue || "",
          binary_threshold: results.binaryThreshold || 140,
          comprehensive_analysis: comprehensiveResults,
        });
        console.log("[VisualAnalysis] 专业分析结果已更新到服务器，新ID:", updatedResult.id);
        // 更新 savedResultId（虽然通常是同一个，但为了确保一致性）
        setSavedResultId(updatedResult.id);
        savedResultIdRef.current = updatedResult.id;
      } else {
        console.warn("[VisualAnalysis] results 为空，无法更新专业分析结果");
      }
    } catch (err) {
      console.error("[VisualAnalysis] 更新专业分析结果失败:", err);
    }
  };

  const handleComprehensiveAnalysis = async (imageData?: string) => {
    const imageToAnalyze = imageData || originalImage;
    if (!imageToAnalyze) {
      setError("缺少图片数据，无法进行分析");
      return;
    }
    
    // 清理之前的轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    setComprehensiveLoading(true);
    setShowComprehensive(true);
    setComprehensiveResults(null);
    setComprehensiveProgress(0);
    setError(null);
    
    console.log("[专业分析] 开始分析，图片数据长度:", imageToAnalyze.length);
    
    try {
      // 创建异步任务
      const taskResponse = await analyzeImageComprehensive(imageToAnalyze);
      console.log("[专业分析] 任务创建成功:", taskResponse);
      
      // 如果返回的是任务ID（异步模式），则轮询任务状态
      if (taskResponse.task_id) {
        const taskId = taskResponse.task_id;
        setCurrentTaskId(taskId);
        
        // 轮询任务状态
        let pollCount = 0;
        const maxPolls = 180; // 最多轮询180次（6分钟，每2秒一次）
        
        pollIntervalRef.current = setInterval(async () => {
          pollCount++;
          
          // 超时检查
          if (pollCount > maxPolls) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setComprehensiveLoading(false);
            setError("分析超时（超过6分钟）。可能的原因：\n1. Celery worker 未运行\n2. 服务器负载过高\n3. 图片处理时间过长\n\n请检查后端日志或联系管理员");
            return;
          }
          
          try {
            const statusResponse = await getImageAnalysisTaskStatus(taskId);
            
            console.log(`[专业分析] 任务状态: ${statusResponse.status}, 进度: ${statusResponse.progress}%`);
            
            // 更新进度
            if (statusResponse.progress !== undefined) {
              setComprehensiveProgress(statusResponse.progress);
            }
            
            // 任务完成
            if (statusResponse.status === "success" && statusResponse.result) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setComprehensiveResults(statusResponse.result);
              setComprehensiveLoading(false);
              setComprehensiveProgress(100);
              console.log("[专业分析] 任务完成，结果已保存到状态");
              
              // 自动更新results，确保保存时包含专业分析结果
              if (results) {
                setResults({
                  ...results,
                  comprehensive_analysis: statusResponse.result,
                });
              }
              
              // 更新服务器上的结果
              await updateComprehensiveResultsToServer(statusResponse.result);
            }
            // 任务失败
            else if (statusResponse.status === "failure") {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setComprehensiveLoading(false);
              const errorMsg = statusResponse.error || "未知错误";
              setError(`专业分析失败: ${errorMsg}`);
              console.error("[专业分析] 任务失败:", errorMsg);
            }
            // 任务仍在进行中，继续轮询
            // status === "pending" 或 "started" 时继续等待
            else if (statusResponse.status === "pending" || statusResponse.status === "started") {
              // 如果超过2分钟还是pending，可能是worker没有运行
              if (pollCount > 60 && statusResponse.status === "pending") {
                console.warn("[专业分析] 任务已创建2分钟但仍未开始，可能 Celery worker 未运行");
                // 显示警告但继续等待
                setError("任务正在等待处理中...如果长时间无响应，请检查 Celery worker 是否运行");
              }
            }
          } catch (err) {
            console.error("查询任务状态失败:", err);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setComprehensiveLoading(false);
            setError(`查询任务状态失败: ${err instanceof Error ? err.message : "未知错误"}`);
          }
        }, 2000); // 每2秒轮询一次
      } 
      // 如果返回的是直接结果（同步模式，向后兼容）
      else if ((taskResponse as any).value_structure || (taskResponse as any).color_quality) {
        setComprehensiveResults(taskResponse);
        setComprehensiveLoading(false);
        setComprehensiveProgress(100);
        
        // 更新服务器上的结果
        await updateComprehensiveResultsToServer(taskResponse);
      }
      else {
        throw new Error("未知的响应格式");
      }
    } catch (err) {
      console.error("专业分析失败:", err);
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      setError(`专业分析失败: ${errorMessage}`);
      setComprehensiveLoading(false);
      setShowComprehensive(true); // 确保显示错误信息
    }
  };
  
  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const handleToggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const handleDelete = useCallback(async () => {
    const idToDelete = resultId || savedResultId;
    if (!idToDelete || isDeleting) return;
    
    setIsDeleting(true);
    try {
      await deleteVisualAnalysisResult(idToDelete);
      setShowDeleteConfirm(false);
      
      // 清除所有状态，回到上传页面
      setOriginalImage(null);
      setImagePreview(null);
      setImageFile(null);
      setResults(null);
      setComprehensiveResults(null);
      setShowComprehensive(false);
      setComprehensiveLoading(false);
      setComprehensiveProgress(0);
      setSavedResultId(null);
      savedResultIdRef.current = null;
      setCurrentTaskId(null);
      setIsViewMode(false);
      setError(null);
      setCheckingExistingResult(false);
      
      // 清理轮询
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      // 清除文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // 清除API缓存（如果使用了缓存）
      try {
        const { clearCache } = await import("@/utils/apiCache");
        // 清除所有视觉分析相关的缓存
        clearCache("/visual-analysis/");
      } catch (err) {
        // 忽略缓存清除错误
        console.warn("[VisualAnalysis] 清除缓存失败:", err);
      }
    } catch (err) {
      console.error("[VisualAnalysis] Failed to delete result:", err);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("删除失败，请稍后重试");
      }
    } finally {
      setIsDeleting(false);
    }
  }, [resultId, savedResultId, isDeleting]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        target.closest(".visual-analysis-menu") ||
        target.closest(".visual-analysis-menu__trigger")
      ) {
        return;
      }
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!showDeleteConfirm) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDeleteConfirm(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [showDeleteConfirm]);

  const topNavActions = useMemo<TopNavAction[]>(
    () => resultId ? [
      {
        icon: "more_vert",
        label: "更多操作",
        onClick: handleToggleMenu,
        className: "visual-analysis-menu__trigger",
      },
    ] : [],
    [handleToggleMenu, resultId],
  );

  return (
    <div className="visual-analysis">
      <div className="visual-analysis__topbar">
        <TopNav
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onBack,
          }}
          title="视觉分析"
          subtitle="Visual Analysis"
          trailingActions={topNavActions}
          trailingSlot={
            results && !isViewMode && !resultId && (
              <button
                type="button"
                className="visual-analysis__save-button"
                onClick={handleSave}
                aria-label="保存结果"
                title="保存结果"
              >
                <MaterialIcon name="save" />
              </button>
            )
          }
        />
        {menuOpen && resultId ? (
          <div className="visual-analysis-menu artwork-details-menu" role="menu">
            <button
              type="button"
              className="artwork-details-menu__item"
              onClick={() => {
                setMenuOpen(false);
                setShowDeleteConfirm(true);
              }}
            >
              <MaterialIcon name="delete" className="artwork-details-menu__icon artwork-details-menu__icon--danger" />
              删除报告
            </button>
          </div>
        ) : null}
      </div>

      <main className="visual-analysis__content">
        {checkingExistingResult ? (
          <div className="visual-analysis__loading">
            <MaterialIcon name="hourglass_empty" className="visual-analysis__loading-icon" />
            <p>正在检查已有分析...</p>
          </div>
        ) : loadingSavedResult ? (
          <div className="visual-analysis__loading">
            <MaterialIcon name="hourglass_empty" className="visual-analysis__loading-icon" />
            <p>正在加载保存的结果...</p>
          </div>
        ) : !originalImage && !results && !imagePreview && !loadingSavedResult ? (
          <div className="visual-analysis__upload">
            <div className="visual-analysis__upload-area">
              <MaterialIcon name="image" className="visual-analysis__upload-icon" />
              <p className="visual-analysis__upload-text">上传图片进行视觉分析</p>
              <button
                type="button"
                className="visual-analysis__upload-button"
                onClick={() => fileInputRef.current?.click()}
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
            {!opencvReady && (
              <p className="visual-analysis__loading-text">正在加载 OpenCV 库...</p>
            )}
          </div>
        ) : imagePreview && !originalImage && !results ? (
          <div className="visual-analysis__upload">
            <div className="visual-analysis__upload-area" style={{ padding: "1.5rem" }}>
              <p className="visual-analysis__upload-text" style={{ marginBottom: "1rem" }}>已选择图片</p>
              <img 
                src={imagePreview} 
                alt="预览" 
                style={{ 
                  maxWidth: "100%", 
                  maxHeight: "400px", 
                  borderRadius: "0.5rem",
                  marginBottom: "1.5rem"
                }} 
              />
              <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                <button
                  type="button"
                  className="visual-analysis__upload-button"
                  onClick={() => {
                    setImagePreview(null);
                    setImageFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  style={{ background: "rgba(255, 255, 255, 0.1)", color: "rgba(239, 234, 231, 0.9)" }}
                  disabled={isCompressing}
                >
                  重新选择
                </button>
                <button
                  type="button"
                  className="visual-analysis__upload-button"
                  onClick={handleConfirmAndProcess}
                  disabled={!opencvReady || loading || isCompressing}
                >
                  {isCompressing ? "压缩中..." : loading ? "处理中..." : "确认并开始分析"}
                </button>
              </div>
            </div>
            {!opencvReady && (
              <p className="visual-analysis__loading-text">正在加载 OpenCV 库...</p>
            )}
            {isCompressing && (
              <p className="visual-analysis__loading-text">正在压缩图片到600k以下...</p>
            )}
          </div>
        ) : (
          <>
            {error && (
              <div className="visual-analysis__error" role="alert">
                {error}
              </div>
            )}

            {loading && (
              <div className="visual-analysis__loading">
                <MaterialIcon name="hourglass_empty" className="visual-analysis__loading-icon" />
                <p>正在处理图像（基础分析）...</p>
              </div>
            )}

            {/* 专业分析结果 */}
            {(showComprehensive || comprehensiveLoading || (isViewMode && (comprehensiveResults || results))) && (
              <div style={{ marginTop: "2rem" }}>
                {comprehensiveLoading ? (
                  <div className="visual-analysis__loading">
                    <MaterialIcon name="hourglass_empty" className="visual-analysis__loading-icon" />
                    <p>正在进行专业分析，请稍候...</p>
                    {comprehensiveProgress > 0 && (
                      <div style={{ marginTop: "1rem", width: "100%", maxWidth: "400px" }}>
                        <div style={{ 
                          width: "100%", 
                          height: "8px", 
                          backgroundColor: "rgba(255, 255, 255, 0.1)", 
                          borderRadius: "4px",
                          overflow: "hidden"
                        }}>
                          <div style={{
                            width: `${comprehensiveProgress}%`,
                            height: "100%",
                            backgroundColor: "#98dbc6",
                            transition: "width 0.3s ease"
                          }} />
                        </div>
                        <p style={{ marginTop: "0.5rem", fontSize: "0.9rem", color: "rgba(239, 234, 231, 0.7)" }}>
                          {comprehensiveProgress}%
                        </p>
                      </div>
                    )}
                  </div>
                ) : (comprehensiveResults || results) ? (
                  <VisualAnalysisComprehensive 
                    results={comprehensiveResults}
                    basicResults={results}
                    selectedThreshold={selectedThreshold}
                    onThresholdChange={handleThresholdChange}
                    onDeleteAndRestart={() => setShowDeleteConfirm(true)}
                  />
                ) : isViewMode && results ? (
                  <div style={{ marginTop: "2rem" }}>
                    <div className="visual-analysis__error" role="alert" style={{ marginBottom: "1rem" }}>
                      此报告没有专业分析结果。只显示基础分析数据。
                    </div>
                    {/* 即使没有专业分析，也显示基础分析结果 */}
                    {(() => {
                      const basicResults = results as Partial<VisualAnalysisResult>;
                      return basicResults.originalImage && (
                        <div style={{ 
                          display: "grid", 
                          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", 
                          gap: "1.5rem",
                          marginTop: "1rem"
                        }}>
                          <div>
                            <h3 style={{ marginBottom: "0.5rem", color: "rgba(239, 234, 231, 0.8)" }}>原图</h3>
                            <img src={basicResults.originalImage} alt="原图" style={{ width: "100%", borderRadius: "0.5rem" }} />
                          </div>
                          {basicResults.step1Binary && (
                            <div>
                              <h3 style={{ marginBottom: "0.5rem", color: "rgba(239, 234, 231, 0.8)" }}>二值化</h3>
                              <img src={basicResults.step1Binary} alt="二值化" style={{ width: "100%", borderRadius: "0.5rem" }} />
                            </div>
                          )}
                          {basicResults.step2Grayscale && (
                            <div>
                              <h3 style={{ marginBottom: "0.5rem", color: "rgba(239, 234, 231, 0.8)" }}>灰度</h3>
                              <img src={basicResults.step2Grayscale} alt="灰度" style={{ width: "100%", borderRadius: "0.5rem" }} />
                            </div>
                          )}
                          {basicResults.step3LabL && (
                            <div>
                              <h3 style={{ marginBottom: "0.5rem", color: "rgba(239, 234, 231, 0.8)" }}>LAB L通道</h3>
                              <img src={basicResults.step3LabL} alt="LAB L" style={{ width: "100%", borderRadius: "0.5rem" }} />
                            </div>
                          )}
                          {basicResults.step4HlsS && (
                            <div>
                              <h3 style={{ marginBottom: "0.5rem", color: "rgba(239, 234, 231, 0.8)" }}>HLS饱和度</h3>
                              <img src={basicResults.step4HlsS} alt="HLS S" style={{ width: "100%", borderRadius: "0.5rem" }} />
                            </div>
                          )}
                          {basicResults.step5Hue && (
                            <div>
                              <h3 style={{ marginBottom: "0.5rem", color: "rgba(239, 234, 231, 0.8)" }}>色相</h3>
                              <img src={basicResults.step5Hue} alt="色相" style={{ width: "100%", borderRadius: "0.5rem" }} />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </main>

      {showDeleteConfirm && (resultId || savedResultId) ? (
        <div className="artwork-delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="artwork-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="artwork-delete-confirm-title">要删除这份报告吗？</h2>
            <div className="artwork-delete-confirm-content">
              <p className="artwork-delete-confirm-text">
                删除后，这份视觉分析结果将无法恢复。
              </p>
              <p className="artwork-delete-confirm-text artwork-delete-confirm-text--highlight">
                确认要删除吗？
              </p>
            </div>
            <div className="artwork-delete-confirm-actions">
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--confirm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default VisualAnalysis;

