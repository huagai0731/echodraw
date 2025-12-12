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
      setCheckingExistingResult(false);
      callbacks.onSetCheckingExistingResult(false);
      return;
    }

    let isMounted = true;

    async function checkExistingResult() {
      // 添加超时机制，避免长时间阻塞（最多等待10秒）
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 10000);
      });

      try {
        // 优化：先快速检查进行中的任务，如果发现任务，立即显示进度条
        // 这样可以避免用户看到"正在检查已有分析..."的提示
        const pendingTaskPromise = getPendingImageAnalysisTask().catch((err) => {
          return { task: null };
        });

        // 先检查任务（优先级最高）
        const pendingTaskResponse = await Promise.race([
          pendingTaskPromise,
          timeoutPromise.then(() => ({ task: null })),
        ]);

        if (!isMounted) {
          return;
        }

        const pendingTask = pendingTaskResponse?.task || null;

        // 如果发现进行中的任务，先检查是否超时
        if (pendingTask) {
          // 先检查任务是否超时（30分钟）
          const taskCreatedAt = pendingTask.created_at ? new Date(pendingTask.created_at).getTime() : Date.now();
          const taskAge = Date.now() - taskCreatedAt;
          const maxTaskAge = 30 * 60 * 1000; // 30分钟
          
          // 如果任务超时，直接显示错误，不继续处理
          if (taskAge > maxTaskAge) {
            setCheckingExistingResult(false);
            callbacks.onSetCheckingExistingResult(false);
            const minutesAgo = Math.floor(taskAge / (60 * 1000));
            callbacks.onSetError(`分析任务已超时（创建于${minutesAgo}分钟前）。任务可能已失败，请重新上传图片进行分析。\n\n可能的原因：\n1. Celery worker 未运行\n2. 服务器负载过高\n3. 图片处理异常\n\n建议：请尝试重新上传图片，或联系管理员检查后端日志`);
            callbacks.onSetComprehensiveLoading(false);
            callbacks.onSetCurrentTaskId(null);
            callbacks.onSetComprehensiveProgress(0);
            return;
          }
          
          // 立即停止显示检查状态，开始显示进度条
          setCheckingExistingResult(false);
          callbacks.onSetCheckingExistingResult(false);
          
          // 立即设置进度条状态，让用户看到进度条而不是检查提示
          callbacks.onSetCurrentTaskId(pendingTask.task_id);
          callbacks.onSetComprehensiveLoading(true);
          callbacks.onSetShowComprehensive(true);
          callbacks.onSetComprehensiveProgress(0); // 初始进度为0，等待获取实际进度
          
          // 在后台继续获取结果列表（用于任务完成后的处理）
          const resultsPromise = fetchVisualAnalysisResults().catch((err) => {
            console.warn("[VisualAnalysis] 获取结果列表失败:", err);
            return [];
          });
          
          // 处理进行中的任务，同时获取结果列表
          let results: any[] = [];
          try {
            results = await Promise.race([
              resultsPromise,
              timeoutPromise.then(() => []),
            ]);
          } catch (err) {
            console.warn("[VisualAnalysis] 获取结果列表超时或失败:", err);
            results = [];
          }

          if (!isMounted) {
            return;
          }

          try {
            await handlePendingTask(
              pendingTask,
              results,
              callbacks,
              isMountedRef,
              () => {
                // 任务处理完成
              },
              false // 非静默模式：显示加载动画
            );
          } catch (err) {
            // handlePendingTask 内部已经有错误处理，但这里作为最后的保险
            console.error("[VisualAnalysis] 处理进行中任务失败:", err);
            if (isMounted && isMountedRef.current) {
              callbacks.onSetError("处理任务时发生错误，请刷新页面重试");
              callbacks.onSetComprehensiveLoading(false);
              callbacks.onSetCurrentTaskId(null);
              callbacks.onSetComprehensiveProgress(0);
            }
          }
          return;
        }

        // 没有进行中的任务，检查已有结果
        const resultsPromise = fetchVisualAnalysisResults().catch((err) => {
          return [];
        });

        const results = await Promise.race([
          resultsPromise,
          timeoutPromise.then(() => []),
        ]);

        if (!isMounted) {
          return;
        }

        // 优先级：进行中的任务 > 已有结果 > 上传页面
        if (results && results.length > 0) {
          // 没有进行中的任务，但有已有结果，显示结果
          await handleExistingResults(
            results,
            null,
            callbacks,
            isMountedRef,
            () => {
              setCheckingExistingResult(false);
              callbacks.onSetCheckingExistingResult(false);
            }
          );
        } else {
          // 没有任务也没有结果，显示上传页面
          handleNoResults(null, callbacks, isMountedRef, () => {
            setCheckingExistingResult(false);
            callbacks.onSetCheckingExistingResult(false);
          });
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const error = err as any;
        if (error?.response?.status === 401 || error?.response?.status === 403) {
        }
        if (isMounted) {
          setCheckingExistingResult(false);
          callbacks.onSetCheckingExistingResult(false);
        }
      }
    }

    checkExistingResult();

    return () => {
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
  try {
    const statusResponse = await getImageAnalysisTaskStatus(pendingTask.task_id);

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
          // 即使加载失败，任务已完成，也应该显示错误而不是加载动画
          callbacks.onSetError("任务已完成，但加载结果失败，请刷新页面重试");
          callbacks.onSetComprehensiveLoading(false);
          onComplete();
          return;
        }
      }
    } else if (statusResponse.status === "failure") {
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
    const maxTaskAge = 30 * 60 * 1000; // 30分钟

    // 如果任务创建时间超过30分钟但一直是 pending 或 started，直接告知失败
    if ((statusResponse.status === "pending" || statusResponse.status === "started") && taskAge > maxTaskAge) {
      const latestResult = getLatestResult(results);
      // 如果有已有结果，说明任务可能已经完成或卡住，但已有结果已经显示了，静默处理
      if (latestResult || silentMode) {
        // 静默恢复轮询，不显示错误
        callbacks.onSetCurrentTaskId(pendingTask.task_id);
        callbacks.onStartPolling(pendingTask.task_id, statusResponse.progress || 0);
        onComplete();
        return;
      }
      // 没有已有结果且任务超时，显示错误（只在非静默模式下）
      if (!silentMode) {
        const minutesAgo = Math.floor(taskAge / (60 * 1000));
        callbacks.onSetError(`分析任务已超时（创建于${minutesAgo}分钟前）。任务可能已失败，请重新上传图片进行分析。\n\n可能的原因：\n1. Celery worker 未运行\n2. 服务器负载过高\n3. 图片处理异常\n\n建议：请尝试重新上传图片，或联系管理员检查后端日志`);
        callbacks.onSetComprehensiveLoading(false);
        callbacks.onSetCurrentTaskId(null);
        callbacks.onSetComprehensiveProgress(0);
      }
      onComplete();
      return;
    }

    // 任务仍在进行中，恢复轮询
    if (silentMode) {
      // 静默模式：不改变UI状态，只恢复轮询
      callbacks.onSetCurrentTaskId(pendingTask.task_id);
      callbacks.onStartPolling(pendingTask.task_id, statusResponse.progress || 0);
    } else {
      // 非静默模式：显示加载状态并恢复轮询
      callbacks.onSetCurrentTaskId(pendingTask.task_id);
      callbacks.onSetComprehensiveLoading(true);
      callbacks.onSetShowComprehensive(true);
      callbacks.onSetComprehensiveProgress(statusResponse.progress || 0);
      callbacks.onSetIsViewMode(true);
      callbacks.onStartPolling(pendingTask.task_id, statusResponse.progress || 0);
    }
    onComplete();
  } catch (err) {
    // 查询任务状态失败，显示错误并清理状态
    console.error("[VisualAnalysis] 查询任务状态失败:", err);
    
    if (!isMountedRef.current) {
      return;
    }
    
    const errorMessage = err instanceof Error 
      ? err.message 
      : (err && typeof err === 'object' && 'response' in err)
        ? (err as any).response?.data?.detail || (err as any).response?.data?.message || "查询任务状态失败"
        : "查询任务状态失败，请稍后重试";
    
    // 检查是否有已有结果可以显示
    const latestResult = getLatestResult(results);
    
    if (latestResult && !silentMode) {
      // 如果有已有结果，尝试加载它而不是显示错误
      try {
        const savedResult = await fetchVisualAnalysisResult(latestResult.id);
        const processedResult = processSavedResultUrls(savedResult);
        
        callbacks.onSetSavedResultId(latestResult.id);
        callbacks.onSetSavedResultData(processedResult);
        
        if (savedResult.comprehensive_analysis) {
          callbacks.onSetComprehensiveResults(savedResult.comprehensive_analysis);
        }
        
        callbacks.onSetShowComprehensive(true);
        callbacks.onSetIsViewMode(true);
        callbacks.onSetComprehensiveLoading(false);
        callbacks.onSetComprehensiveProgress(100);
        callbacks.onSetCurrentTaskId(null);
        
        await callbacks.onLoadResult(processedResult);
        onComplete();
        return;
      } catch (loadErr) {
        // 加载已有结果也失败，显示错误
        console.error("[VisualAnalysis] 加载已有结果失败:", loadErr);
      }
    }
    
    // 没有已有结果或加载失败，显示错误
    if (!silentMode) {
      callbacks.onSetError(`无法查询任务状态: ${errorMessage}\n\n可能的原因：\n1. 网络连接问题\n2. 服务器暂时不可用\n3. 任务可能已失效\n\n建议：请刷新页面重试，或尝试重新上传图片`);
      callbacks.onSetComprehensiveLoading(false);
      callbacks.onSetCurrentTaskId(null);
    }
    onComplete();
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
    
    // 关键：设置 savedResultData 和 comprehensiveResults，确保刷新后能正确显示
    callbacks.onSetSavedResultData(processedResult);
    if (savedResult.comprehensive_analysis) {
      callbacks.onSetComprehensiveResults(savedResult.comprehensive_analysis);
    }
    
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
    const maxTaskAge = 30 * 60 * 1000; // 30分钟

    if (taskAge > maxTaskAge) {
      const minutesAgo = Math.floor(taskAge / (60 * 1000));
      callbacks.onSetError(`分析任务已超时（创建于${minutesAgo}分钟前）。任务可能已失败，请重新上传图片进行分析。`);
      callbacks.onSetComprehensiveLoading(false);
      callbacks.onSetCurrentTaskId(null);
      callbacks.onSetComprehensiveProgress(0);
    }
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
    // Failed to load result
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
