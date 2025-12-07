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
  const initialWaitTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 初始等待的定时器
  const startTimeRef = useRef<number | null>(null); // 记录开始时间
  
  const minWaitTimeMs = 3 * 60 * 1000; // 最小等待时间：3分钟（毫秒）
  const slowPollInterval = 15000; // 慢速轮询间隔：15秒

  const startPolling = useCallback((
    taskId: string,
    callbacks: TaskPollingCallbacks,
    isMountedRef: { current: boolean } = { current: true }
  ) => {
    // 清理之前的轮询和等待
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (initialWaitTimeoutRef.current) {
      clearTimeout(initialWaitTimeoutRef.current);
      initialWaitTimeoutRef.current = null;
    }

    // 重置状态
    startTimeRef.current = Date.now();

    console.log("[VisualAnalysis] 开始等待3分钟后再开始轮询任务状态...");

    // 先等待3分钟，然后再开始轮询
    initialWaitTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;

      console.log("[VisualAnalysis] 已等待3分钟，开始轮询任务状态（15秒间隔）");

      let pollCount = 0;
      const maxPolls = 588; // 最多轮询588次（147分钟，每15秒一次）

      // 开始轮询
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
            callbacks.onError?.("分析超时（超过150分钟）。可能的原因：\n1. Celery worker 未运行\n2. 服务器负载过高\n3. 图片处理时间过长\n\n请检查后端日志或联系管理员");
          }
          return;
        }

        try {
          const statusResponse = await getImageAnalysisTaskStatus(taskId);
          
          const elapsedTime = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
          console.log(`[VisualAnalysis] 任务状态: ${statusResponse.status}, 进度: ${statusResponse.progress}%, 轮询次数: ${pollCount}, 总等待时间: ${Math.round(elapsedTime / 1000)}秒`);
          
          if (!isMountedRef.current) return;

          // 更新进度
          if (statusResponse.progress !== undefined) {
            callbacks.onProgress?.(statusResponse.progress);
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
          // （pending 或 started 状态，继续等待）
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
      }, slowPollInterval); // 每15秒轮询一次

      // 立即执行一次轮询（不等待第一个间隔）
      const initialPoll = async () => {
        if (!isMountedRef.current) return;
        
        try {
          const statusResponse = await getImageAnalysisTaskStatus(taskId);
          
          const elapsedTime = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
          console.log(`[VisualAnalysis] 首次轮询 - 任务状态: ${statusResponse.status}, 进度: ${statusResponse.progress}%, 总等待时间: ${Math.round(elapsedTime / 1000)}秒`);
          
          if (!isMountedRef.current) return;

          // 更新进度
          if (statusResponse.progress !== undefined) {
            callbacks.onProgress?.(statusResponse.progress);
          }

          // 如果任务已经完成，直接显示结果
          if (statusResponse.status === "success") {
            console.log("[VisualAnalysis] 首次轮询即检测到任务成功状态");
            
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
          } else if (statusResponse.status === "failure") {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (isMountedRef.current) {
              const errorMsg = statusResponse.error || "未知错误";
              callbacks.onError?.(`图像分析失败: ${errorMsg}`);
            }
          }
          // 如果还在 pending 或 started，继续轮询（已经在上面设置了）
        } catch (err) {
          console.error("首次查询任务状态失败:", err);
          // 即使首次查询失败，也继续轮询
        }
      };
      
      initialPoll();
    }, minWaitTimeMs); // 等待3分钟
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (initialWaitTimeoutRef.current) {
      clearTimeout(initialWaitTimeoutRef.current);
      initialWaitTimeoutRef.current = null;
    }
    // 清理状态
    startTimeRef.current = null;
  }, []);

  return { startPolling, stopPolling };
}
