// Toast 提示组件
import { useEffect, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "./Toast.css";

type ToastProps = {
  message: string;
  type?: "info" | "warning" | "error" | "success";
  duration?: number;
  onClose?: () => void;
};

/**
 * Toast 提示组件
 * 用于显示临时提示消息
 */
export function Toast({
  message,
  type = "info",
  duration = 3000,
  onClose,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => {
          onClose?.();
        }, 300); // 等待动画完成
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => {
      onClose?.();
    }, 300);
  };

  const iconMap = {
    info: "info",
    warning: "warning",
    error: "error",
    success: "check_circle",
  };

  return (
    <div
      className={`toast toast--${type} ${visible ? "toast--visible" : ""}`}
      role="alert"
    >
      <div className="toast__content">
        <MaterialIcon name={iconMap[type]} className="toast__icon" />
        <span className="toast__message">{message}</span>
      </div>
      <button
        type="button"
        className="toast__close"
        onClick={handleClose}
        aria-label="关闭"
      >
        <MaterialIcon name="close" />
      </button>
    </div>
  );
}

type ToastItem = {
  id: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  duration?: number;
};

type ToastContainerProps = {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
};

/**
 * Toast 容器组件
 * 用于管理多个 Toast 提示
 */
export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}

