// 异步操作 Hook - 处理 loading、error 状态
import { useState, useCallback } from "react";
import { extractApiError } from "./useApiError";

type UseAsyncOperationOptions<T> = {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  defaultError?: string;
};

type UseAsyncOperationReturn<T> = {
  loading: boolean;
  error: string | null;
  execute: (asyncFn: () => Promise<T>) => Promise<T | undefined>;
  reset: () => void;
  setError: (error: string | null) => void;
};

/**
 * 管理异步操作的状态（loading、error）
 * 
 * @example
 * const { loading, error, execute } = useAsyncOperation({
 *   onSuccess: (data) => console.log('成功', data),
 *   defaultError: '操作失败'
 * });
 * 
 * const handleSubmit = async () => {
 *   await execute(async () => {
 *     return await api.post('/endpoint', data);
 *   });
 * };
 */
export function useAsyncOperation<T = unknown>(
  options: UseAsyncOperationOptions<T> = {}
): UseAsyncOperationReturn<T> {
  const { onSuccess, onError, defaultError = "操作失败" } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (asyncFn: () => Promise<T>): Promise<T | undefined> => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFn();
        onSuccess?.(result);
        return result;
      } catch (err) {
        // 使用 extractApiError 提取后端返回的详细错误信息
        const errorMessage = extractApiError(err, defaultError);
        setError(errorMessage);
        onError?.(errorMessage);
        // 在开发环境下输出详细错误信息，便于调试
        if (import.meta.env.DEV) {
          console.error("[useAsyncOperation] 操作失败:", {
            error: err,
            errorMessage,
            response: (err as { response?: { data?: unknown } })?.response?.data,
          });
        }
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError, defaultError]
  );

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return {
    loading,
    error,
    execute,
    reset,
    setError,
  };
}

