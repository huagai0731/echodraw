// Toast Hook - 管理 Toast 提示
import { useState, useCallback } from "react";

type ToastType = "info" | "warning" | "error" | "success";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
};

/**
 * Toast Hook
 * 用于管理 Toast 提示的显示和移除
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = "info",
      duration: number = 3000
    ) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const newToast: Toast = { id, message, type, duration };
      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    showToast,
    removeToast,
    clearAll,
  };
}

