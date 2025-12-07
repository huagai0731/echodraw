// 检查已有结果 Hook - 管理已有结果和任务检查逻辑

import { useEffect, useRef, useState } from "react";
import {
  getPendingImageAnalysisTask,
  getImageAnalysisTaskStatus,
  fetchVisualAnalysisResult,
  fetchVisualAnalysisResults,
} from "@/services/api";
import { processSavedResultUrls, processImageUrl } from "../utils/imageUrlUtils";
import type { SavedResultData } from "../types";

export type ExistingResultCheckCallbacks = {
  onLoadResult: (savedResult: SavedResultData) => Promise<void>;
  onSetSavedResultId: (id: number) => void;
  onSetSavedResultData: (data: SavedResultData) => void;
  onSetComprehensiveResults: (results: any) => void;
  onSetShowComprehensive: (show: boolean) => void;
  onSetIsViewMode: (isViewMode: boolean) => void;
  onSetComprehensiveLoading: (loading: boolean) => void;
  onSetComprehensiveProgress: (progress: number) => void;
  onSetError: (error: string | null) => void;
  onSetLoadingSavedResult: (loading: boolean) => void;
  onSetCheckingExistingResult: (checking: boolean) => void;
  onStartPolling: (taskId: string, initialProgress: number) => void;
  onSetCurrentTaskId: (taskId: string | null) => void;
  onSetOriginalImage?: (imageUrl: string | null) => void;
};

/**
 * 管理已有结果和任务检查的 Hook
 */
export function useExistingResultCheck(
  resultId: number | undefined,
  callbacks: ExistingResultCheckCallbacks
) {
  const [checkingExistingResult, setCheckingExistingResult] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (resultId) {
      // 如果提供了resultId，不需要检查
      console.log("[VisualAnalysis] 提供了 resultId，跳过检查:", resultId);
      setCheckingExistingResult(false);
      callbacks.onSetCheckingExistingResult(false);
      return;
    }

    let isMounted = true;

    async function checkExistingResult() {
      console.log("[VisualAnalysis] 开始检查已有结果和进行中的任务...");
      try {
        // 并行执行：同时检查进行中的任务和已有结果
        const [pendingTaskResponse, results] = await Promise.all([
          getPendingImageAnalysisTask().catch((err) => {
            console.warn("[VisualAnalysis] 查询进行中任务失败:", err);
            return { task: null };
          }),
          fetchVisualAnalysisResults().catch((err) => {
            console.warn("[VisualAnalysis] 查询结果列表失败:", err);
            return [];
          }),
        ]);

        if (!isMounted) {
          console.log("[VisualAnalysis] 组件已卸载，取消检查");
          return;
        }

        const pendingTask = pendingTaskResponse?.task || null;

        // 获取用户的分析结果列表
        console.log("[VisualAnalysis] 获取到结果列表:", results?.length || 0, "个结果");
        
        // 优先级：进行中的任务 > 已有结果 > 上传页面
        // 如果有进行中的任务，优先显示加载动画（不管是否有部分结果）
        if (pendingTask) {
          await handlePendingTask(
            pendingTask,
            results,
            callbacks,
            isMountedRef,
            () => {
              setCheckingExistingResult(false);
              callbacks.onSetCheckingExistingResult(false);
            },
            false // 非静默模式：显示加载动画
          );
        } else if (results && results.length > 0) {
          // 没有进行中的任务，但有已有结果，显示结果
          await handleExistingResults(
            results,
            pendingTask,
            callbacks,
            isMountedRef,
            () => {
              setCheckingExistingResult(false);
              callbacks.onSetCheckingExistingResult(false);
            }
          );
        } else {
          // 没有任务也没有结果，显示上传页面
          handleNoResults(pendingTask, callbacks, isMountedRef, () => {
            setCheckingExistingResult(false);
            callbacks.onSetCheckingExistingResult(false);
          });
        }
      } catch (err) {
        if (!isMounted) {
          console.log("[VisualAnalysis] 组件已卸载，取消错误处理");
          return;
        }
        console.error("[VisualAnalysis] 检查已有结果失败:", err);
        const error = err as any;
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          console.warn("[VisualAnalysis] 认证失败，可能需要重新登录");
        }
        if (isMounted) {
          setCheckingExistingResult(false);
          callbacks.onSetCheckingExistingResult(false);
        }
      }
    }

    checkExistingResult();

    return () => {
      console.log("[VisualAnalysis] 清理检查逻辑");
      isMounted = false;
    };
  }, [resultId]); // 只在 resultId 变化时执行
}

/**
 * 处理进行中的任务
 * @param silentMode 静默模式：如果为true，不改变UI状态（用于已有结果显示后的后台轮询）
 */
async function handlePendingTask(
  pendingTask: any,
  results: any[],
  callbacks: ExistingResultCheckCallbacks,
  isMountedRef: { current: boolean },
  onComplete: () => void,
  silentMode: boolean = false
) {
  console.log("[VisualAnalysis] 发现进行中的任务，先检查任务状态");

  try {
    const statusResponse = await getImageAnalysisTaskStatus(pendingTask.task_id);
    console.log(`[VisualAnalysis] 任务状态检查: ${statusResponse.status}, 进度: ${statusResponse.progress}%`);

    // 如果任务已完成，直接加载结果
    if (statusResponse.status === "success") {
      const resultId = statusResponse.result?.result_id;
      if (resultId) {
        try {
          const savedResult = await fetchVisualAnalysisResult(resultId);
          const processedResult = processSavedResultUrls(savedResult);
          
          callbacks.onSetSavedResultId(resultId);
          callbacks.onSetSavedResultData(processedResult);
          
          if (savedResult.comprehensive_analysis) {
            callbacks.onSetComprehensiveResults(savedResult.comprehensive_analysis);
          }
          
          callbacks.onSetShowComprehensive(true);
          callbacks.onSetIsViewMode(true);
          callbacks.onSetComprehensiveLoading(false);
          callbacks.onSetComprehensiveProgress(100);
          
          await callbacks.onLoadResult(processedResult);
          onComplete();
          return;
        } catch (err) {
          console.error("[VisualAnalysis] 加载已完成任务的结果失败:", err);
          // 即使加载失败，任务已完成，也应该显示错误而不是加载动画
          callbacks.onSetError("任务已完成，但加载结果失败，请刷新页面重试");
          callbacks.onSetComprehensiveLoading(false);
          onComplete();
          return;
        }
      }
    } else if (statusResponse.status === "failure") {
      console.log("[VisualAnalysis] 任务已失败，显示错误");
      callbacks.onSetError(statusResponse.error || "分析任务失败");
      callbacks.onSetComprehensiveLoading(false);
      onComplete();
      return;
    }
    
    // 任务仍在进行中（pending 或 started），必须显示加载动画
    // 即使已有部分结果，也不能显示，因为任务还未完成

    // 检查任务是否真的在进行中
    const taskCreatedAt = pendingTask.created_at ? new Date(pendingTask.created_at).getTime() : Date.now();
    const taskAge = Date.now() - taskCreatedAt;
    const maxTaskAge = 5 * 60 * 1000; // 5分钟

    // 如果任务创建时间超过5分钟但一直是 pending
    if (statusResponse.status === "pending" && taskAge > maxTaskAge) {
      const latestResult = getLatestResult(results);
      // 如果有已有结果，说明任务可能已经完成或卡住，但已有结果已经显示了，静默处理
      if (latestResult || silentMode) {
        console.log("[VisualAnalysis] 任务卡住但已有结果已显示，静默处理");
        // 静默恢复轮询，不显示错误
        callbacks.onSetCurrentTaskId(pendingTask.task_id);
        callbacks.onStartPolling(pendingTask.task_id, statusResponse.progress || 0);
        onComplete();
        return;
      }
      // 没有已有结果且任务卡住，显示错误（只在非静默模式下）
      if (!silentMode) {
        console.warn("[VisualAnalysis] 任务创建时间超过5分钟但仍是pending，且没有已完成的结果");
        callbacks.onSetError("任务似乎卡住了。可能的原因：\n1. Celery worker 未运行\n2. 服务器负载过高\n\n请检查后端日志或联系管理员，或尝试重新上传图片");
        callbacks.onSetComprehensiveLoading(false);
      }
      onComplete();
      return;
    }

    // 任务仍在进行中，恢复轮询
    if (silentMode) {
      // 静默模式：不改变UI状态，只恢复轮询
      console.log("[VisualAnalysis] 静默恢复任务轮询（已有结果已显示）");
      callbacks.onSetCurrentTaskId(pendingTask.task_id);
      callbacks.onStartPolling(pendingTask.task_id, statusResponse.progress || 0);
    } else {
      // 非静默模式：显示加载状态并恢复轮询
      console.log("[VisualAnalysis] 任务仍在进行中，恢复轮询");
      callbacks.onSetCurrentTaskId(pendingTask.task_id);
      callbacks.onSetComprehensiveLoading(true);
      callbacks.onSetShowComprehensive(true);
      callbacks.onSetComprehensiveProgress(statusResponse.progress || 0);
      callbacks.onSetIsViewMode(true);
      callbacks.onStartPolling(pendingTask.task_id, statusResponse.progress || 0);
    }
  } catch (err) {
    console.error("[VisualAnalysis] 检查任务状态失败:", err);
  }
}

/**
 * 处理已有结果
 */
async function handleExistingResults(
  results: any[],
  pendingTask: any | null,
  callbacks: ExistingResultCheckCallbacks,
  isMountedRef: { current: boolean },
  onComplete: () => void
) {
  const latestResult = getLatestResult(results);
  if (!latestResult) return;

  console.log("[VisualAnalysis] 找到最新结果，ID:", latestResult.id, "创建时间:", latestResult.created_at);

  if (!isMountedRef.current) return;

  if (!pendingTask) {
    callbacks.onSetSavedResultId(latestResult.id);
    callbacks.onSetIsViewMode(true);
    callbacks.onSetLoadingSavedResult(true);
  } else {
    callbacks.onSetSavedResultId(latestResult.id);
  }

  try {
    const savedResult = await fetchVisualAnalysisResult(latestResult.id);
    if (!isMountedRef.current) return;

    // 验证结果是否有效
    const hasOriginalImage = savedResult.original_image && 
      typeof savedResult.original_image === 'string' && 
      savedResult.original_image.trim().length > 0;
    const hasStep1Binary = savedResult.step1_binary && 
      typeof savedResult.step1_binary === 'string' && 
      savedResult.step1_binary.trim().length > 0;

    if (!hasOriginalImage || !hasStep1Binary) {
      throw new Error("结果无效：缺少必要字段");
    }

    // 加载结果
    const processedResult = processSavedResultUrls(savedResult);
    await callbacks.onLoadResult(processedResult);

    if (!isMountedRef.current) return;

    // 加载结果后，设置必要的状态以正确显示
    // 设置 originalImage 状态（如果回调存在）
    if (callbacks.onSetOriginalImage && savedResult.original_image) {
      callbacks.onSetOriginalImage(processImageUrl(savedResult.original_image));
    }

    // 如果有专业分析结果或基础结果，设置 showComprehensive
    // 这样即使没有专业分析结果，也能显示基础分析结果
    if (savedResult.comprehensive_analysis || savedResult.original_image) {
      callbacks.onSetShowComprehensive(true);
    }

    if (isMountedRef.current) {
      onComplete();
    }
  } catch (err) {
    if (!isMountedRef.current) return;
    
    console.error("[VisualAnalysis] 加载最新结果失败:", err);
    if (!pendingTask) {
      callbacks.onSetLoadingSavedResult(false);
      callbacks.onSetIsViewMode(false);
      callbacks.onSetSavedResultId(null as any);
    }
  } finally {
    if (isMountedRef.current) {
      if (!pendingTask) {
        callbacks.onSetLoadingSavedResult(false);
      }
    }
  }
}

/**
 * 处理没有结果的情况
 */
function handleNoResults(
  pendingTask: any | null,
  callbacks: ExistingResultCheckCallbacks,
  isMountedRef: { current: boolean },
  onComplete: () => void
) {
  if (!isMountedRef.current) return;

  if (pendingTask) {
    const taskCreatedAt = pendingTask.created_at ? new Date(pendingTask.created_at).getTime() : Date.now();
    const taskAge = Date.now() - taskCreatedAt;
    const maxTaskAge = 5 * 60 * 1000; // 5分钟

    if (taskAge > maxTaskAge) {
      console.log("[VisualAnalysis] 任务超过5分钟但没有结果，显示上传页面");
      callbacks.onSetComprehensiveLoading(false);
    }
  } else {
    console.log("[VisualAnalysis] 没有找到已有结果，显示上传页面");
  }
  
  onComplete();
}

/**
 * 尝试加载结果
 */
async function tryLoadResult(
  resultId: number,
  callbacks: ExistingResultCheckCallbacks,
  onComplete: () => void
) {
  try {
    const savedResult = await fetchVisualAnalysisResult(resultId);
    const processedResult = processSavedResultUrls(savedResult);
    
    callbacks.onSetSavedResultId(resultId);
    callbacks.onSetSavedResultData(processedResult);
    
    if (savedResult.comprehensive_analysis) {
      callbacks.onSetComprehensiveResults(savedResult.comprehensive_analysis);
    }
    
    callbacks.onSetShowComprehensive(true);
    callbacks.onSetIsViewMode(true);
    callbacks.onSetComprehensiveLoading(false);
    callbacks.onSetComprehensiveProgress(100);
    
    await callbacks.onLoadResult(processedResult);
    onComplete();
  } catch (err) {
    console.error("[VisualAnalysis] 加载结果失败:", err);
  }
}

/**
 * 获取最新的结果
 */
function getLatestResult(results: any[]): any | null {
  if (!results || results.length === 0) return null;
  
  return [...results].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
}
