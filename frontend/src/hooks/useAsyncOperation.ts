// 异步操作 Hook - 处理 loading、error 状态
import { useState, useCallback } from "react";

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
        const errorMessage =
          err instanceof Error ? err.message : defaultError;
        setError(errorMessage);
        onError?.(errorMessage);
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

