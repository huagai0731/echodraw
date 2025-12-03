import { useEffect, useRef, useState, useCallback } from "react";
import type { AxiosError } from "axios";
import {
  AUTH_CHANGED_EVENT,
  CHECK_IN_STATUS_CHANGED_EVENT,
  fetchCheckInStatus,
  hasAuthToken,
  submitCheckIn,
  type CheckInStatus,
} from "@/services/api";
import { getTodayInShanghai } from "@/utils/dateUtils";
import {
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
} from "@/utils/storageUtils";
import { STORAGE_KEYS, getCheckInLockKey } from "@/constants/storageKeys";

/**
 * 计算下一个午夜（上海时区）的时间戳
 */
function getNextMidnightShanghai(): number {
  const now = new Date();

  try {
    // 获取上海时区的当前时间
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
    const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "0", 10) - 1;
    const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "0", 10);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const second = parseInt(parts.find((p) => p.type === "second")?.value ?? "0", 10);

    // 创建上海时区的今天0点（本地时间）
    const todayMidnight = new Date(year, month, day, 0, 0, 0, 0);

    // 计算当前时间与今天0点的差值（毫秒）
    const nowInShanghai = new Date(year, month, day, hour, minute, second, 0);
    const msSinceMidnight = nowInShanghai.getTime() - todayMidnight.getTime();

    // 计算到下一个午夜的毫秒数
    const msUntilNextMidnight = 24 * 60 * 60 * 1000 - msSinceMidnight;

    return Date.now() + msUntilNextMidnight;
  } catch {
    // Fallback: 使用简单的24小时计算
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }
}

export function useCheckIn(authVersion: number) {
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    // 如果没有认证信息，不读取缓存，避免读取到其他用户的数据
    if (!hasAuthToken()) {
      return null;
    }
    try {
      const today = getTodayInShanghai();
      const localLastCheckinDate = window.localStorage.getItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
      // 检查本地存储的打卡日期是否是今天
      if (localLastCheckinDate === today) {
        const cached = getLocalStorageItem<CheckInStatus>(STORAGE_KEYS.CHECKIN_STATUS);
        if (cached && typeof cached.total_checkins === "number") {
          return cached;
        }
      }
    } catch {
      // ignore storage errors
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadStatus = useCallback(async () => {
    if (!hasAuthToken()) {
      // 未登录时不加载打卡状态，也不显示错误信息
      setCheckInStatus(null);
      setRequested(false);
      setError(null);
      return;
    }

    try {
      const status = await fetchCheckInStatus();
      setCheckInStatus(status);
      setError(null);
      try {
        if (typeof window !== "undefined") {
          setLocalStorageItem(STORAGE_KEYS.CHECKIN_STATUS, status);
        }
      } catch {
        // ignore storage errors
      }
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 401 || status === 403) {
        // 未登录时静默失败，不显示错误信息
        setError(null);
        setCheckInStatus(null);
      } else {
        console.warn("Failed to load check-in status", err);
        setError("获取打卡状态失败，请稍后重试。");
      }
    }
  }, []);

  const handleCheckIn = useCallback(async () => {
    // 防止重复提交
    if (loading) {
      return;
    }

    // 如果已经打卡，直接返回
    if (checkInStatus?.checked_today) {
      return;
    }

    // 额外检查：使用localStorage防止多标签页同时打卡
    const today = getTodayInShanghai();
    const checkInLockKey = getCheckInLockKey(today);
    try {
      const lockValue = window.localStorage.getItem(checkInLockKey);
      if (lockValue) {
        const lockTime = parseInt(lockValue, 10);
        const now = Date.now();
        // 如果锁在1分钟内，说明可能正在打卡，直接返回
        if (now - lockTime < 60000) {
          setError("正在打卡中，请稍候...");
          return;
        }
      }
      // 设置锁，有效期1分钟
      window.localStorage.setItem(checkInLockKey, String(Date.now()));
    } catch {
      // 如果localStorage不可用，继续执行（降级处理）
    }

    // 取消之前的请求（如果有）
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);

    try {
      const result = await submitCheckIn({ source: "app" });

      // 检查请求是否被取消
      if (abortController.signal.aborted) {
        return;
      }

      const { created: _created, checked_date: _checkedDate, ...status } = result;
      setCheckInStatus(status);
      setError(null);

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEYS.LAST_CHECKIN_DATE, today);
          setLocalStorageItem(STORAGE_KEYS.CHECKIN_STATUS, status);
          // 清除打卡锁
          window.localStorage.removeItem(checkInLockKey);
        }
      } catch {
        // ignore storage errors
      }
    } catch (err) {
      // 如果请求被取消，不处理错误
      if (abortController.signal.aborted) {
        return;
      }

      console.warn("Failed to submit check-in", err);

      // 区分不同类型的错误
      const axiosError = err as AxiosError;
      if (axiosError.response) {
        const status = axiosError.response.status;
        if (status === 400) {
          const detail = (axiosError.response.data as any)?.detail;
          if (detail && typeof detail === "string" && detail.includes("已打卡")) {
            setError("您今天已经打卡过了。");
            // 刷新状态
            try {
              const status = await fetchCheckInStatus();
              setCheckInStatus(status);
            } catch {
              // ignore refresh error
            }
          } else {
            setError("打卡失败，请检查网络连接后重试。");
          }
        } else if (status === 401 || status === 403) {
          setError("请登录后打卡。");
        } else if (status >= 500) {
          setError("服务器错误，请稍后再试。");
        } else {
          setError("打卡失败，请稍后再试。");
        }
      } else if (axiosError.code === "ECONNABORTED" || axiosError.message.includes("timeout")) {
        setError("请求超时，请检查网络连接后重试。");
      } else if (axiosError.code === "ERR_NETWORK") {
        setError("网络错误，请检查网络连接。");
      } else if (axiosError.response) {
        const response = axiosError.response as { status: number; data: any };
        if (response.status === 429) {
          // 处理频率限制错误
          const detail = response.data?.detail;
          setError(detail || "请求过于频繁，请稍后再试。");
          // 如果是因为重复打卡，刷新状态
          if (
            detail &&
            typeof detail === "string" &&
            (detail.includes("已经打卡") || detail.includes("刚刚已经打卡"))
          ) {
            try {
              const status = await fetchCheckInStatus();
              setCheckInStatus(status);
            } catch {
              // ignore refresh error
            }
          }
        } else {
          setError("打卡失败，请稍后再试。");
        }
      } else {
        setError("打卡失败，请稍后再试。");
      }
    } finally {
      // 只有在请求没有被取消时才清除loading状态
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
      // 清除AbortController引用
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      // 清除打卡锁（无论成功或失败）
      try {
        if (typeof window !== "undefined") {
          const today = getTodayInShanghai();
          const checkInLockKey = getCheckInLockKey(today);
          window.localStorage.removeItem(checkInLockKey);
        }
      } catch {
        // ignore storage errors
      }
    }
  }, [loading, checkInStatus]);

  // 监听认证变化
  useEffect(() => {
    const handleAuthChange = () => {
      setCheckInStatus(null);
      setRequested(false);
      setError(null);
    };

    const handleCheckInStatusChange = () => {
      setRequested(true);
      loadStatus();
    };

    // 处理多标签页同步：监听storage事件
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.CHECKIN_STATUS && e.newValue) {
        try {
          const status = JSON.parse(e.newValue) as CheckInStatus;
          setCheckInStatus(status);
          setError(null);
        } catch {
          // ignore parse errors
        }
      } else if (e.key === STORAGE_KEYS.LAST_CHECKIN_DATE) {
        // 如果日期变化，清除缓存并刷新状态
        const today = getTodayInShanghai();
        if (e.newValue !== today) {
          setCheckInStatus(null);
          setRequested(false);
          handleCheckInStatusChange();
        }
      }
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    window.addEventListener(CHECK_IN_STATUS_CHANGED_EVENT, handleCheckInStatusChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener(CHECK_IN_STATUS_CHANGED_EVENT, handleCheckInStatusChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadStatus]);

  // 初始加载状态
  useEffect(() => {
    if (checkInStatus || requested) {
      return;
    }

    setRequested(true);

    // 乐观：如果本地记录了当天已打卡，则先行置位，避免刷新后短暂可点击
    try {
      if (typeof window !== "undefined") {
        const today = getTodayInShanghai();
        const localLastCheckinDate = window.localStorage.getItem(STORAGE_KEYS.LAST_CHECKIN_DATE);

        // 检查本地存储的打卡日期是否是今天，如果不是，清除缓存
        const isCacheValid = localLastCheckinDate === today;

        if (!isCacheValid) {
          // 如果缓存日期不是今天，清除相关缓存
          removeLocalStorageItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
          removeLocalStorageItem(STORAGE_KEYS.CHECKIN_STATUS);
        } else {
          // 先读取缓存的打卡统计，避免请求期间显示为 0
          const cached = getLocalStorageItem<CheckInStatus>(STORAGE_KEYS.CHECKIN_STATUS);
          if (cached && typeof cached.total_checkins === "number") {
            // 如果缓存显示今天已打卡，但日期记录不是今天，清除缓存
            if (cached.checked_today && localLastCheckinDate !== today) {
              removeLocalStorageItem(STORAGE_KEYS.CHECKIN_STATUS);
              removeLocalStorageItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
            } else {
              setCheckInStatus(cached);
            }
          }
        }
      }
    } catch {
      // ignore storage errors
    }

    loadStatus();
  }, [checkInStatus, requested, authVersion, loadStatus]);

  // 每天0点自动刷新打卡状态
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextRefresh = () => {
      const nextMidnight = getNextMidnightShanghai();
      const delay = Math.max(0, nextMidnight - Date.now());

      timeoutId = setTimeout(() => {
        // 触发打卡状态刷新事件
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(CHECK_IN_STATUS_CHANGED_EVENT));
          // 清除过期缓存
          try {
            const today = getTodayInShanghai();
            const localLastCheckinDate = window.localStorage.getItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
            if (localLastCheckinDate && localLastCheckinDate !== today) {
              removeLocalStorageItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
              removeLocalStorageItem(STORAGE_KEYS.CHECKIN_STATUS);
            }
          } catch {
            // ignore storage errors
          }
        }
        // 设置定时器，每24小时刷新一次
        intervalId = setInterval(() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(CHECK_IN_STATUS_CHANGED_EVENT));
            // 清除过期缓存
            try {
              const today = getTodayInShanghai();
              const localLastCheckinDate = window.localStorage.getItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
              if (localLastCheckinDate && localLastCheckinDate !== today) {
                removeLocalStorageItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
                removeLocalStorageItem(STORAGE_KEYS.CHECKIN_STATUS);
              }
            } catch {
              // ignore storage errors
            }
          }
        }, 24 * 60 * 60 * 1000);
      }, delay);

      return timeoutId;
    };

    timeoutId = scheduleNextRefresh();

    // 监听日期变化（每分钟检查一次，确保在0点附近能及时更新）
    const dateCheckInterval = setInterval(() => {
      const today = getTodayInShanghai();
      const localLastCheckinDate = window.localStorage.getItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
      if (localLastCheckinDate && localLastCheckinDate !== today) {
        // 日期已变化，清除缓存并刷新状态
        try {
          removeLocalStorageItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
          removeLocalStorageItem(STORAGE_KEYS.CHECKIN_STATUS);
          // 清除昨天的打卡锁
          const yesterdayLockKey = getCheckInLockKey(localLastCheckinDate);
          window.localStorage.removeItem(yesterdayLockKey);
        } catch {
          // ignore storage errors
        }
        window.dispatchEvent(new CustomEvent(CHECK_IN_STATUS_CHANGED_EVENT));
      }
    }, 60 * 1000); // 每分钟检查一次

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
      clearInterval(dateCheckInterval);
    };
  }, []);

  const checkedIn = (() => {
    // 首先检查本地存储的日期是否是今天，如果不是，清除过期缓存
    try {
      if (typeof window !== "undefined") {
        const local = window.localStorage.getItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
        const today = getTodayInShanghai();
        // 如果本地存储的日期不是今天，清除过期缓存
        if (local && local !== today) {
          removeLocalStorageItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
          removeLocalStorageItem(STORAGE_KEYS.CHECKIN_STATUS);
        }
      }
    } catch {
      // ignore storage errors
    }

    const serverChecked = checkInStatus?.checked_today ?? false;
    // 优先使用服务器返回的状态
    if (serverChecked) {
      return true;
    }
    // 如果服务器明确说今天没打卡，清除本地存储的打卡日期，避免缓存干扰
    if (checkInStatus !== null && !serverChecked) {
      try {
        if (typeof window !== "undefined") {
          const local = window.localStorage.getItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
          const today = getTodayInShanghai();
          // 如果本地存储的日期是今天，但服务器说今天没打卡，清除本地存储
          if (local === today) {
            removeLocalStorageItem(STORAGE_KEYS.LAST_CHECKIN_DATE);
          }
        }
      } catch {
        // ignore storage errors
      }
    }
    // 服务器状态优先，如果服务器说没打卡，就返回 false
    return false;
  })();

  return {
    checkInStatus,
    checkedIn,
    loading,
    error,
    handleCheckIn,
    retry: loadStatus,
  };
}

