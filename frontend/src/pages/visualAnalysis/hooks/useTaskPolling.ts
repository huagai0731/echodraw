// 任务轮询 Hook - 管理异步任务的状态轮询

import { useRef, useCallback } from "react";
import { getImageAnalysisTaskStatus } from "@/services/api";
import { fetchVisualAnalysisResult } from "@/services/api";
import type { SavedResultData } from "../types";
import { processSavedResultUrls } from "../utils/imageUrlUtils";

export type TaskPollingCallbacks = {
  onProgress?: (progress: number) => void;
  onSuccess?: (result: SavedResultData) => void;
  onError?: (error: string) => void;
};

/**
 * 管理任务轮询的 Hook
 */
export function useTaskPolling() {
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startPolling = useCallback((
    taskId: string,
    callbacks: TaskPollingCallbacks,
    isMountedRef: { current: boolean } = { current: true }
  ) => {
    // 清理之前的轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    let pollCount = 0;
    const maxPolls = 180; // 最多轮询180次（6分钟，每2秒一次）
    const maxPendingPolls = 30; // 如果一直是pending，最多轮询30次（1分钟）
    let pendingCount = 0;

    pollIntervalRef.current = setInterval(async () => {
      // 检查组件是否已卸载
      if (!isMountedRef.current) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return;
      }

      pollCount++;

      // 超时检查
      if (pollCount > maxPolls) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (isMountedRef.current) {
          callbacks.onError?.("分析超时（超过6分钟）。可能的原因：\n1. Celery worker 未运行\n2. 服务器负载过高\n3. 图片处理时间过长\n\n请检查后端日志或联系管理员");
        }
        return;
      }

      try {
        const statusResponse = await getImageAnalysisTaskStatus(taskId);
        
        console.log(`[VisualAnalysis] 任务状态: ${statusResponse.status}, 进度: ${statusResponse.progress}%, 轮询次数: ${pollCount}`);
        
        if (!isMountedRef.current) return;

        // 更新进度
        if (statusResponse.progress !== undefined) {
          callbacks.onProgress?.(statusResponse.progress);
        }

        // 如果一直是pending且没有进度，增加pending计数
        if (statusResponse.status === "pending" && (!statusResponse.progress || statusResponse.progress === 0)) {
          pendingCount++;
          if (pendingCount > maxPendingPolls) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (isMountedRef.current) {
              callbacks.onError?.("任务一直处于等待状态，可能的原因：\n1. Celery worker 未运行\n2. 服务器负载过高\n\n请检查后端日志或联系管理员，或尝试重新上传图片");
            }
            return;
          }
        } else {
          pendingCount = 0;
        }

        // 任务完成
        if (statusResponse.status === "success") {
          console.log("[VisualAnalysis] 检测到任务成功状态");
          
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          const resultId = statusResponse.result?.result_id;
          if (resultId) {
            try {
              const savedResult = await fetchVisualAnalysisResult(resultId);
              const processedResult = processSavedResultUrls(savedResult);
              callbacks.onSuccess?.(processedResult);
            } catch (err) {
              console.error("[VisualAnalysis] 加载结果失败:", err);
              callbacks.onError?.("分析完成，但加载结果失败，请刷新页面重试");
            }
          }
        }
        // 任务失败
        else if (statusResponse.status === "failure") {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (isMountedRef.current) {
            const errorMsg = statusResponse.error || "未知错误";
            callbacks.onError?.(`图像分析失败: ${errorMsg}`);
          }
        }
        // 任务仍在进行中，继续轮询
        else if (statusResponse.status === "pending" || statusResponse.status === "started") {
          if (pollCount > 60 && statusResponse.status === "pending") {
            console.warn("[图像分析] 任务已创建2分钟但仍未开始，可能 Celery worker 未运行");
            callbacks.onError?.("任务正在等待处理中...如果长时间无响应，请检查 Celery worker 是否运行");
          }
        }
      } catch (err) {
        console.error("查询任务状态失败:", err);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (isMountedRef.current) {
          callbacks.onError?.(`查询任务状态失败: ${err instanceof Error ? err.message : "未知错误"}`);
        }
      }
    }, 2000); // 每2秒轮询一次
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  return { startPolling, stopPolling };
}
