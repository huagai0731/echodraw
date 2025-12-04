/**
 * VisualAnalysis 组件 - 重构版本
 * 使用模块化的 hooks 和工具函数，大幅简化代码
 * 
 * 重构效果：
 * - 代码量：从 2231 行减少到约 700 行（减少 68%）
 * - 可维护性：显著提升
 * - 可测试性：显著提升
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import TopNav, { type TopNavAction } from "@/components/TopNav";
import {
  fetchVisualAnalysisResult,
  analyzeImageComprehensive,
  deleteVisualAnalysisResult,
} from "@/services/api";
import VisualAnalysisComprehensive from "./VisualAnalysisComprehensive";
import { compressImageToSize, fileToDataURL } from "@/utils/imageCompression";
import { DeleteConfirmModal } from "./visualAnalysis/components/DeleteConfirmModal";
import { VisualAnalysisMenu } from "./visualAnalysis/components/VisualAnalysisMenu";
import { ImageUploadArea } from "./visualAnalysis/components/ImageUploadArea";
import { useMenuActions } from "./visualAnalysis/hooks/useMenuActions";
import { useImageUpload } from "./visualAnalysis/hooks/useImageUpload";
import "./VisualAnalysis.css";
import "./ArtworkDetails.css";

// 导入模块化的 hooks 和工具函数
import {
  useOpenCV,
  useVisualAnalysisResults,
  useTaskPolling,
  useExistingResultCheck,
  processImageBasic,
  saveBasicResultsToServer,
  updateComprehensiveResultsToServer,
  processSavedResultUrls,
  type VisualAnalysisProps,
  type VisualAnalysisResult,
} from "./visualAnalysis/index";

function VisualAnalysis({ onBack, onSave, resultId }: VisualAnalysisProps) {
  // ==================== 基础状态 ====================
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSavedResult, setLoadingSavedResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isViewMode, setIsViewMode] = useState(false);
  const [showComprehensive, setShowComprehensive] = useState(false);
  const [comprehensiveLoading, setComprehensiveLoading] = useState(false);
  const [comprehensiveProgress, setComprehensiveProgress] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savedResultId, setSavedResultId] = useState<number | null>(null);
  const savedResultIdRef = useRef<number | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [checkingExistingResult, setCheckingExistingResult] = useState(true);
  const isMountedRef = useRef(true);
  
  // 使用图片上传 Hook
  const {
    imageFile,
    imagePreview,
    isCompressing,
    error: uploadError,
    handleFileSelect: handleFileSelectFromHook,
    handleFileSelectDirect,
    handleConfirm: handleImageConfirm,
    clear: clearUpload,
    setError: setUploadError,
  } = useImageUpload();
  
  // 使用菜单操作 Hook
  const {
    menuOpen,
    showDeleteConfirm,
    handleToggleMenu,
    handleOpenDeleteConfirm,
    handleCloseDeleteConfirm,
  } = useMenuActions();

  // ==================== 使用模块化的 Hooks ====================
  
  // OpenCV 加载管理
  const { opencvReady, error: opencvError } = useOpenCV();
  
  // 上传错误处理
  useEffect(() => {
    if (uploadError) {
      setError(uploadError);
    }
  }, [uploadError]);
  
  useEffect(() => {
    if (opencvError && !error) {
      setError(opencvError);
    }
  }, [opencvError, error]);

  // 结果管理
  const {
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
  } = useVisualAnalysisResults(opencvReady);

  // 任务轮询管理
  const { startPolling, stopPolling } = useTaskPolling();

  // 同步 savedResultId 到 ref
  useEffect(() => {
    savedResultIdRef.current = savedResultId;
  }, [savedResultId]);

  // ==================== 已有结果检查 ====================
  useExistingResultCheck(resultId, {
    onLoadResult: loadResultWithGrayscaleLevels,
    onSetSavedResultId: (id: number) => {
      setSavedResultId(id);
      savedResultIdRef.current = id;
    },
    onSetSavedResultData: setSavedResultData,
    onSetComprehensiveResults: setComprehensiveResults,
    onSetShowComprehensive: setShowComprehensive,
    onSetIsViewMode: setIsViewMode,
    onSetComprehensiveLoading: setComprehensiveLoading,
    onSetComprehensiveProgress: setComprehensiveProgress,
    onSetError: setError,
    onSetLoadingSavedResult: setLoadingSavedResult,
    onSetCheckingExistingResult: setCheckingExistingResult,
    onStartPolling: (taskId: string, progress: number) => {
      setCurrentTaskId(taskId);
      setComprehensiveProgress(progress);
      startPolling(taskId, {
        onProgress: (progress: number) => {
          setComprehensiveProgress(progress);
        },
        onSuccess: async (result: import("./visualAnalysis/index").SavedResultData) => {
          await loadResultWithGrayscaleLevels(result);
          setComprehensiveLoading(false);
          setComprehensiveProgress(100);
          setIsViewMode(true);
        },
        onError: (err: string) => {
          setError(err);
          setComprehensiveLoading(false);
        },
      }, isMountedRef);
    },
    onSetCurrentTaskId: setCurrentTaskId,
  });

  // ==================== 如果提供了 resultId，加载已保存的结果 ====================
  useEffect(() => {
    if (resultId) {
      setLoadingSavedResult(true);
      setIsViewMode(true);
      setError(null);
      setSavedResultId(resultId);
      savedResultIdRef.current = resultId;
      fetchVisualAnalysisResult(resultId)
        .then(async (savedResult) => {
          if (!savedResult.original_image || !savedResult.step1_binary) {
            throw new Error("结果无效");
          }
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

  // ==================== 文件处理 ====================
  // 处理文件选择（包装 useImageUpload 的 handleFileSelectDirect）
  const handleFileSelectWrapped = useCallback((file: File) => {
    handleFileSelectDirect(file);
    // 清除之前的错误
    if (uploadError) {
      setUploadError(null);
    }
    setError(null);
  }, [handleFileSelectDirect, uploadError, setUploadError]);

  // ==================== 专业分析处理（使用模块化的轮询） ====================
  const handleComprehensiveAnalysis = useCallback(async (imageFileOrDataUrl?: File | string) => {
    let fileToAnalyze: File | null = null;

    if (imageFileOrDataUrl instanceof File) {
      fileToAnalyze = imageFileOrDataUrl;
    } else {
      fileToAnalyze = imageFile;
    }

    if (!fileToAnalyze) {
      setError("缺少图片文件，无法进行分析");
      return;
    }

    // 清理之前的轮询
    stopPolling();

    setComprehensiveLoading(true);
    setShowComprehensive(true);
    setComprehensiveResults(null);
    setComprehensiveProgress(0);
    setError(null);

    console.log("[图像分析] 开始分析，图片文件:", fileToAnalyze.name, "大小:", fileToAnalyze.size);

    try {
      const taskResponse = await analyzeImageComprehensive(fileToAnalyze, selectedThreshold);
      console.log("[专业分析] 任务创建成功:", taskResponse);

      if (taskResponse.result_id) {
        setSavedResultId(taskResponse.result_id);
        savedResultIdRef.current = taskResponse.result_id;
      }

      if (taskResponse.task_id) {
        const taskId = taskResponse.task_id;
        setCurrentTaskId(taskId);

        // 使用模块化的轮询
        startPolling(taskId, {
          onProgress: (progress: number) => {
            setComprehensiveProgress(progress);
          },
          onSuccess: async (result: import("./visualAnalysis/index").SavedResultData) => {
            setSavedResultId(result.id);
            savedResultIdRef.current = result.id;
            await loadResultWithGrayscaleLevels(result);
            setSavedResultData(processSavedResultUrls(result));
            if (result.comprehensive_analysis) {
              setComprehensiveResults(result.comprehensive_analysis);
            }
            setComprehensiveLoading(false);
            setComprehensiveProgress(100);
            setIsViewMode(true);
            console.log("[图像分析] 任务完成，结果已加载");
          },
          onError: (err: string) => {
            setError(err);
            setComprehensiveLoading(false);
          },
        }, isMountedRef);
      } else if ((taskResponse as any).step1 || (taskResponse as any).step2) {
        // 同步模式（向后兼容）
        setComprehensiveResults(taskResponse);
        setComprehensiveLoading(false);
        setComprehensiveProgress(100);
        await updateComprehensiveResultsToServer(
          taskResponse,
          savedResultIdRef.current,
          originalImage,
          results?.step2Grayscale || null,
          selectedThreshold
        );
      } else {
        throw new Error("未知的响应格式");
      }
    } catch (err) {
      console.error("图像分析失败:", err);
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      setError(`图像分析失败: ${errorMessage}`);
      setComprehensiveLoading(false);
      setShowComprehensive(true);
    }
  }, [imageFile, selectedThreshold, stopPolling, startPolling, loadResultWithGrayscaleLevels, setSavedResultData, processSavedResultUrls, setComprehensiveResults, originalImage, results?.step2Grayscale, isMountedRef]);

  // ==================== 图片处理（使用模块化的工具函数） ====================
  const processImage = async (imageDataUrl: string, _file?: File) => {
    if (!opencvReady) {
      setError("OpenCV 库尚未加载完成，请稍候");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await processImageBasic(imageDataUrl, selectedThreshold, opencvReady);
      setResults(result);
      setOriginalImage(imageDataUrl);

      // 保存基础分析结果到服务器
      try {
        const savedResult = await saveBasicResultsToServer(result);
        setSavedResultId(savedResult.id);
        savedResultIdRef.current = savedResult.id;
        setIsViewMode(true);
      } catch (err) {
        console.error("[VisualAnalysis] 保存基础结果失败:", err);
        // 不显示错误给用户，因为分析可以继续进行
      }

      // 自动开始专业分析
      setTimeout(() => {
        if (imageFile) {
          handleComprehensiveAnalysis(imageFile);
        }
      }, 100);
    } catch (err) {
      console.error("图像处理错误:", err);
      setError(err instanceof Error ? err.message : "处理图像时出错");
    } finally {
      setLoading(false);
    }
  };

  // ==================== 用户点击确认按钮后开始处理 ====================
  const handleConfirmAndProcess = useCallback(async () => {
    if (!imagePreview || !imageFile) {
      setError("请先上传图片");
      return;
    }

    // 清除之前的状态，开始新的分析
    setResults(null);
    setComprehensiveResults(null);
    setShowComprehensive(true);
    setComprehensiveLoading(true);
    setComprehensiveProgress(0);
    setSavedResultId(null);
    savedResultIdRef.current = null;
    setCurrentTaskId(null);
    setIsViewMode(false);
    setError(null);

    // 清理之前的轮询
    stopPolling();

    try {
      // 使用 useImageUpload Hook 的压缩功能
      const { file: compressedFile, dataUrl: compressedDataUrl } = await handleImageConfirm();

      // 设置原始图片
      setOriginalImage(compressedDataUrl);

      // 直接调用后端分析API（固定5步流程）- 使用文件而不是 base64
      await handleComprehensiveAnalysis(compressedFile);
    } catch (err) {
      console.error("图片处理失败:", err);
      // 错误已经在 useImageUpload Hook 中处理
      // 如果压缩失败，尝试使用原始文件继续处理
      if (imageFile) {
        try {
          const originalDataUrl = await fileToDataURL(imageFile);
          setOriginalImage(originalDataUrl);
          await handleComprehensiveAnalysis(imageFile);
        } catch (fallbackErr) {
          console.error("使用原始文件也失败:", fallbackErr);
          setError("图片处理失败，请重新上传");
        }
      }
    }
  }, [imagePreview, imageFile, handleImageConfirm, handleComprehensiveAnalysis, stopPolling]);

  // ==================== 阈值变更处理 ====================
  const handleThresholdChange = (threshold: number) => {
    setSelectedThreshold(threshold);
    if (originalImage) {
      processImage(originalImage, imageFile || undefined);
    }
  };

  // ==================== 保存处理 ====================
  const handleSave = () => {
    if (results && onSave) {
      const saveData = {
        ...results,
        comprehensive_analysis: comprehensiveResults || null,
      } as VisualAnalysisResult & { comprehensive_analysis?: any };
      onSave(saveData);
    }
  };

  // ==================== 删除处理 ====================
  const handleDelete = useCallback(async () => {
    const idToDelete = resultId || savedResultId;
    if (!idToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteVisualAnalysisResult(idToDelete);
      handleCloseDeleteConfirm();

      // 清除所有状态，回到上传页面
      setOriginalImage(null);
      clearUpload();
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

      stopPolling();
    } catch (err) {
      console.error("[VisualAnalysis] Failed to delete result:", err);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("删除失败，请稍后重试");
      }
    } finally {
      setIsDeleting(false);
    }
  }, [resultId, savedResultId, isDeleting, handleCloseDeleteConfirm, clearUpload, stopPolling]);

  // ==================== 组件卸载清理 ====================
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopPolling();
      setOriginalImage(null);
      clearUpload();
      setResults(null);
      setComprehensiveResults(null);
      setSavedResultData(null);
    };
  }, [stopPolling, clearUpload]);

  // UI 交互处理已由 useMenuActions Hook 处理

  // ==================== TopNav Actions ====================
  const topNavActions = useMemo<TopNavAction[]>(
    () =>
      resultId
        ? [
            {
              icon: "more_vert",
              label: "更多操作",
              onClick: handleToggleMenu,
              className: "visual-analysis-menu__trigger",
            },
          ]
        : [],
    [handleToggleMenu, resultId]
  );

  // ==================== 渲染 ====================
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
            results && !isViewMode && !resultId ? (
              <button
                type="button"
                className="visual-analysis__save-button"
                onClick={handleSave}
                aria-label="保存结果"
                title="保存结果"
              >
                <MaterialIcon name="save" />
              </button>
            ) : null
          }
        />
        {resultId && (
          <VisualAnalysisMenu
            open={menuOpen}
            onDelete={handleOpenDeleteConfirm}
          />
        )}
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
        ) : !originalImage && !results && !loadingSavedResult ? (
          <ImageUploadArea
            onFileSelect={handleFileSelectWrapped}
            preview={imagePreview}
            onConfirm={handleConfirmAndProcess}
            onCancel={clearUpload}
            opencvReady={opencvReady}
            loading={loading}
            compressing={isCompressing}
          />
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
            {(showComprehensive ||
              comprehensiveLoading ||
              (isViewMode && (comprehensiveResults || results))) && (
              <div style={{ marginTop: "2rem" }}>
                {comprehensiveLoading ? (
                  <div className="visual-analysis__loading">
                    <MaterialIcon
                      name="hourglass_empty"
                      className="visual-analysis__loading-icon"
                    />
                    <p>正在进行专业分析，请稍候...</p>
                    {comprehensiveProgress > 0 && (
                      <div style={{ marginTop: "1rem", width: "100%", maxWidth: "400px" }}>
                        <div
                          style={{
                            width: "100%",
                            height: "8px",
                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                            borderRadius: "4px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${comprehensiveProgress}%`,
                              height: "100%",
                              backgroundColor: "#98dbc6",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                        <p
                          style={{
                            marginTop: "0.5rem",
                            fontSize: "0.9rem",
                            color: "rgba(239, 234, 231, 0.7)",
                          }}
                        >
                          {comprehensiveProgress}%
                        </p>
                      </div>
                    )}
                  </div>
                ) : comprehensiveResults || results ? (
                  <VisualAnalysisComprehensive
                    results={comprehensiveResults}
                    basicResults={results}
                    savedResult={savedResultData}
                    selectedThreshold={selectedThreshold}
                    onThresholdChange={handleThresholdChange}
                    onDeleteAndRestart={handleOpenDeleteConfirm}
                  />
                ) : isViewMode && results ? (
                  <div style={{ marginTop: "2rem" }}>
                    <div
                      className="visual-analysis__error"
                      role="alert"
                      style={{ marginBottom: "1rem" }}
                    >
                      此报告没有专业分析结果。只显示基础分析数据。
                    </div>
                    {(() => {
                      const basicResults = results as Partial<VisualAnalysisResult>;
                      return (
                        basicResults.originalImage && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                              gap: "1.5rem",
                              marginTop: "1rem",
                            }}
                          >
                            <div>
                              <h3
                                style={{
                                  marginBottom: "0.5rem",
                                  color: "rgba(239, 234, 231, 0.8)",
                                }}
                              >
                                原图
                              </h3>
                              <img
                                src={basicResults.originalImage}
                                alt="原图"
                                style={{ width: "100%", borderRadius: "0.5rem" }}
                              />
                            </div>
                            {basicResults.step1Binary && (
                              <div>
                                <h3
                                  style={{
                                    marginBottom: "0.5rem",
                                    color: "rgba(239, 234, 231, 0.8)",
                                  }}
                                >
                                  二值化
                                </h3>
                                <img
                                  src={basicResults.step1Binary}
                                  alt="二值化"
                                  style={{ width: "100%", borderRadius: "0.5rem" }}
                                />
                              </div>
                            )}
                            {basicResults.step2Grayscale && (
                              <div>
                                <h3
                                  style={{
                                    marginBottom: "0.5rem",
                                    color: "rgba(239, 234, 231, 0.8)",
                                  }}
                                >
                                  灰度
                                </h3>
                                <img
                                  src={basicResults.step2Grayscale}
                                  alt="灰度"
                                  style={{ width: "100%", borderRadius: "0.5rem" }}
                                />
                              </div>
                            )}
                            {basicResults.step3LabL && (
                              <div>
                                <h3
                                  style={{
                                    marginBottom: "0.5rem",
                                    color: "rgba(239, 234, 231, 0.8)",
                                  }}
                                >
                                  LAB L通道
                                </h3>
                                <img
                                  src={basicResults.step3LabL}
                                  alt="LAB L"
                                  style={{ width: "100%", borderRadius: "0.5rem" }}
                                />
                              </div>
                            )}
                            {basicResults.step4HlsS && (
                              <div>
                                <h3
                                  style={{
                                    marginBottom: "0.5rem",
                                    color: "rgba(239, 234, 231, 0.8)",
                                  }}
                                >
                                  HLS饱和度
                                </h3>
                                <img
                                  src={basicResults.step4HlsS}
                                  alt="HLS S"
                                  style={{ width: "100%", borderRadius: "0.5rem" }}
                                />
                              </div>
                            )}
                            {basicResults.step5Hue && (
                              <div>
                                <h3
                                  style={{
                                    marginBottom: "0.5rem",
                                    color: "rgba(239, 234, 231, 0.8)",
                                  }}
                                >
                                  色相
                                </h3>
                                <img
                                  src={basicResults.step5Hue}
                                  alt="色相"
                                  style={{ width: "100%", borderRadius: "0.5rem" }}
                                />
                              </div>
                            )}
                          </div>
                        )
                      );
                    })()}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </main>

      <DeleteConfirmModal
        open={showDeleteConfirm && !!(resultId || savedResultId)}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onCancel={handleCloseDeleteConfirm}
      />
    </div>
  );
}

export default VisualAnalysis;
