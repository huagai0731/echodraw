// API 错误处理工具 Hook
import { isAxiosError } from "axios";

/**
 * 从 API 错误中提取错误消息
 * 
 * @param err - 错误对象
 * @param defaultMessage - 默认错误消息
 * @returns 错误消息字符串
 * 
 * @example
 * try {
 *   await api.post('/endpoint', data);
 * } catch (err) {
 *   const errorMessage = extractApiError(err, '操作失败');
 *   setError(errorMessage);
 * }
 */
export function extractApiError(
  err: unknown,
  defaultMessage: string = "操作失败，请稍后再试"
): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }

    const message = err.response?.data?.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }

    const error = err.response?.data?.error;
    if (typeof error === "string" && error.length > 0) {
      return error;
    }
  }

  if (err instanceof Error) {
    return err.message || defaultMessage;
  }

  return defaultMessage;
}

/**
 * 从 API 错误中提取重试等待时间（秒）
 * 
 * @param err - 错误对象
 * @returns 等待时间（秒），如果没有则返回 undefined
 */
export function extractRetryAfter(err: unknown): number | undefined {
  if (isAxiosError(err)) {
    const retryAfter = err.response?.data?.retry_after;
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return retryAfter;
    }
  }
  return undefined;
}

