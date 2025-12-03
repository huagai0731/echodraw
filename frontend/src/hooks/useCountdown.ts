// 倒计时 Hook - 处理倒计时逻辑
import { useState, useEffect, useCallback } from "react";

type UseCountdownOptions = {
  initialValue?: number;
  onComplete?: () => void;
  interval?: number; // 倒计时间隔（毫秒），默认 1000ms
};

type UseCountdownReturn = {
  countdown: number;
  start: (seconds: number) => void;
  reset: () => void;
  isActive: boolean;
};

/**
 * 管理倒计时状态
 * 
 * @example
 * const { countdown, start, reset, isActive } = useCountdown({
 *   initialValue: 0,
 *   onComplete: () => console.log('倒计时结束')
 * });
 * 
 * // 开始 60 秒倒计时
 * start(60);
 */
export function useCountdown(
  options: UseCountdownOptions = {}
): UseCountdownReturn {
  const { initialValue = 0, onComplete, interval = 1000 } = options;

  const [countdown, setCountdown] = useState(initialValue);

  useEffect(() => {
    if (countdown <= 0) {
      if (countdown === 0 && onComplete) {
        onComplete();
      }
      return;
    }

    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, interval);

    return () => window.clearInterval(timer);
  }, [countdown, onComplete, interval]);

  const start = useCallback((seconds: number) => {
    setCountdown(seconds);
  }, []);

  const reset = useCallback(() => {
    setCountdown(initialValue);
  }, [initialValue]);

  return {
    countdown,
    start,
    reset,
    isActive: countdown > 0,
  };
}

