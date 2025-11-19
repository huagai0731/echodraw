import clsx from "clsx";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import NotificationModal from "@/components/NotificationModal";
import TopNav from "@/components/TopNav";
import {
  AUTH_CHANGED_EVENT,
  CHECK_IN_STATUS_CHANGED_EVENT,
  fetchCheckInStatus,
  fetchHomeMessages,
  fetchNotifications,
  fetchProfilePreferences,
  getUnreadNotificationCount,
  hasAuthToken,
  submitCheckIn,
  type CheckInStatus,
  type HomeMessagesResponse,
} from "@/services/api";
import { clearAllUserCache } from "@/utils/clearUserCache";

import "./HomeScreen.css";

const STORAGE_KEY = "echodraw-auth";
const PREFS_STORAGE_KEY = "echodraw-profile-preferences";

type AuthPayload = {
  token: string;
  user: {
    email: string;
  };
};

type StoredPreferences = {
  email: string;
  displayName: string;
  signature: string;
};

function getInitialAuth(): AuthPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AuthPayload;
    if (parsed?.token && parsed?.user?.email) {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse stored auth payload", error);
  }

  return null;
}

function loadStoredPreferences(email: string): StoredPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredPreferences;
    if (parsed?.email && parsed.email === email) {
      return parsed;
    }
  } catch (error) {
    console.warn("[Echo] Failed to parse stored profile preferences:", error);
  }
  return null;
}

function formatName(email: string): string {
  const name = email.split("@")[0];
  if (name.length === 0) {
    return "回声艺术家";
  }
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

function truncateName(name: string, maxLength: number = 12): string {
  if (name.length <= maxLength) {
    return name;
  }
  return name.slice(0, maxLength - 1) + "…";
}

const LOCAL_LAST_CHECKIN_KEY = "echo-last-checkin-date";
const LOCAL_CHECKIN_STATUS_KEY = "echo-last-checkin-status";
const HOME_COPY_CACHE_KEY_PREFIX = "echo-home-copy-cache-";
const HOME_COPY_CACHE_DATE_KEY = "echo-home-copy-cache-date";
// 不再使用时间戳，而是使用日期作为缓存键，确保每天只加载一次

type HomeProps = {
  onOpenUpload?: () => void;
  onOpenMentalStateAssessment?: () => void;
  onOpenColorPerceptionTest?: () => void;
};

type HomeCopy = {
  historyHeadline: string;
  historyText: string;
  conditional: string;
  encouragement: string;
};

const EMPTY_COPY: HomeCopy = {
  historyHeadline: "",
  historyText: "",
  conditional: "",
  encouragement: "",
};

function sanitize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeMessages(payload: HomeMessagesResponse | null): HomeCopy | null {
  if (!payload) {
    return null;
  }

  // 后端现有返回字段为：general/conditional/holiday/history
  // 为兼容老字段，将 general 作为 encouragement 兜底，holiday/history 合并为历史区块
  const historyHeadline = sanitize(payload.history?.headline) || sanitize(payload.holiday?.headline);
  const historyText = sanitize(payload.history?.text) || sanitize(payload.holiday?.text);
  const conditional = sanitize(payload.conditional);
  const encouragement = sanitize(payload.encouragement) || sanitize((payload as any).general);

  const normalized: HomeCopy = {
    historyHeadline,
    historyText,
    conditional,
    encouragement,
  };

  const hasContent = Object.values(normalized).some(Boolean);
  return hasContent ? normalized : null;
}

function getTodayIsoForCache(): string {
  // 使用与getTodayIso相同的逻辑获取今天的日期
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "0000";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

function loadCachedCopy(): HomeCopy | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const today = getTodayIsoForCache();
    const cachedDate = window.sessionStorage.getItem(HOME_COPY_CACHE_DATE_KEY);
    // 如果缓存的日期是今天，才使用缓存
    if (cachedDate === today) {
      const cacheKey = `${HOME_COPY_CACHE_KEY_PREFIX}${today}`;
      const cached = window.sessionStorage.getItem(cacheKey);
      if (cached) {
        return JSON.parse(cached) as HomeCopy;
      }
    } else {
      // 如果日期不是今天，清除旧缓存
      if (cachedDate) {
        const oldCacheKey = `${HOME_COPY_CACHE_KEY_PREFIX}${cachedDate}`;
        window.sessionStorage.removeItem(oldCacheKey);
        window.sessionStorage.removeItem(HOME_COPY_CACHE_DATE_KEY);
      }
    }
  } catch {
    // ignore cache errors
  }
  return null;
}

function saveCachedCopy(copy: HomeCopy) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const today = getTodayIsoForCache();
    const cacheKey = `${HOME_COPY_CACHE_KEY_PREFIX}${today}`;
    window.sessionStorage.setItem(cacheKey, JSON.stringify(copy));
    window.sessionStorage.setItem(HOME_COPY_CACHE_DATE_KEY, today);
  } catch {
    // ignore cache errors
  }
}

// 辅助函数：获取今天的日期（用于打卡状态初始化）
function getTodayIsoForCheckIn(): string {
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value ?? "0000";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

function Home({ onOpenMentalStateAssessment, onOpenColorPerceptionTest }: HomeProps) {
  // 初始化时先从缓存加载，避免闪烁
  const [copy, setCopy] = useState<HomeCopy>(() => {
    const cached = loadCachedCopy();
    return cached || EMPTY_COPY;
  });
  const [loadingCopy, setLoadingCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  // 初始化时先从缓存加载打卡状态，避免闪烁
  // 注意：只有在有认证信息时才读取缓存，避免读取到其他用户的数据
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    // 如果没有认证信息，不读取缓存，避免读取到其他用户的数据
    if (!hasAuthToken()) {
      return null;
    }
    try {
      const today = getTodayIsoForCheckIn();
      const localLastCheckinDate = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
      // 检查本地存储的打卡日期是否是今天
      if (localLastCheckinDate === today) {
        const cached = window.localStorage.getItem(LOCAL_CHECKIN_STATUS_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as CheckInStatus;
            if (parsed && typeof parsed.total_checkins === "number") {
              return parsed;
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      // ignore storage errors
    }
    return null;
  });
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [checkInStatusRequested, setCheckInStatusRequested] = useState(false);
  const checkInAbortControllerRef = useRef<AbortController | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  // 初始化时先从缓存加载用户名，避免闪烁
  const [userName, setUserName] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      if (!hasAuthToken()) {
        return null;
      }
      const auth = getInitialAuth();
      if (!auth?.user?.email) {
        return null;
      }
      const email = auth.user.email;
      // 先从本地存储加载
      const stored = loadStoredPreferences(email);
      if (stored?.displayName) {
        return stored.displayName;
      }
      // 如果没有本地存储，使用 email 生成默认名称
      return formatName(email);
    } catch {
      // ignore errors
    }
    return null;
  });
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // 需要在组件内部定义 getTodayIso，因为初始化时需要使用
  function getTodayIso(): string {
    // 始终以中国时区（Asia/Shanghai）计算“今天”，避免用户本地时区影响
    try {
      const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(new Date());
      const y = parts.find((p) => p.type === "year")?.value ?? "0000";
      const m = parts.find((p) => p.type === "month")?.value ?? "01";
      const d = parts.find((p) => p.type === "day")?.value ?? "01";
      return `${y}-${m}-${d}`;
    } catch {
      // 兜底：若 Intl 不可用，退回本地时区
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthChange = () => {
      setAuthVersion((prev) => prev + 1);
      setCopy(EMPTY_COPY);
      setCopyError(null);
      setCheckInStatus(null);
      setCheckInStatusRequested(false);
      setCheckInError(null);
      setLoadingCopy(true);
      setUserName(null);
      // 清除所有用户相关的缓存
      clearAllUserCache();
    };

    const handleCheckInStatusChange = async () => {
      // 刷新打卡状态
      setCheckInStatusRequested(true);
      try {
        if (hasAuthToken()) {
          const status = await fetchCheckInStatus();
          setCheckInStatus(status);
          setCheckInError(null);
          try {
            if (typeof window !== "undefined") {
              window.localStorage.setItem(LOCAL_CHECKIN_STATUS_KEY, JSON.stringify(status));
            }
          } catch {
            // ignore storage errors
          }
        } else {
          setCheckInStatusRequested(false);
        }
      } catch (error) {
        setCheckInStatusRequested(false);
        const status = (error as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setCheckInError("请登录后查看打卡状态。");
        } else {
          console.warn("Failed to refresh check-in status", error);
          setCheckInError("获取打卡状态失败，请稍后重试。");
        }
      }
    };

    // 处理多标签页同步：监听storage事件
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LOCAL_CHECKIN_STATUS_KEY && e.newValue) {
        try {
          const status = JSON.parse(e.newValue) as CheckInStatus;
          setCheckInStatus(status);
          setCheckInError(null);
        } catch {
          // ignore parse errors
        }
      } else if (e.key === LOCAL_LAST_CHECKIN_KEY) {
        // 如果日期变化，清除缓存并刷新状态
        const today = getTodayIso();
        if (e.newValue !== today) {
          setCheckInStatus(null);
          setCheckInStatusRequested(false);
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
  }, []);

  useEffect(() => {
    let isMounted = true;
    let abortController: AbortController | null = null;

    async function loadCopy() {
      // 取消之前的请求（如果有）
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      // 先尝试从缓存加载，避免闪烁
      const cached = loadCachedCopy();
      if (cached && isMounted) {
        // 如果缓存存在且是今天的，直接使用，不显示加载状态
        setCopy(cached);
        setCopyError(null);
        setLoadingCopy(false);
        // 如果已经有今天的缓存，就不需要再请求了
        const today = getTodayIsoForCache();
        const cachedDate = window.sessionStorage.getItem(HOME_COPY_CACHE_DATE_KEY);
        if (cachedDate === today) {
          // 今天已经有缓存，不需要重新请求
          return;
        }
      } else {
        setLoadingCopy(true);
      }

      try {
        if (!hasAuthToken()) {
          if (isMounted) {
            setCopy(EMPTY_COPY);
            setCopyError("请登录后查看今日专属文案。");
            setCheckInStatus(null);
            setCheckInStatusRequested(false);
            // 清除缓存，因为未登录状态不应该使用缓存
            if (typeof window !== "undefined") {
              try {
                const today = getTodayIsoForCache();
                const cacheKey = `${HOME_COPY_CACHE_KEY_PREFIX}${today}`;
                window.sessionStorage.removeItem(cacheKey);
                window.sessionStorage.removeItem(HOME_COPY_CACHE_DATE_KEY);
              } catch {
                // ignore storage errors
              }
            }
          }
          return;
        }

        const data = await fetchHomeMessages();
        
        // 检查请求是否被取消
        if (abortController.signal.aborted || !isMounted) {
          return;
        }

        if (data?.check_in) {
          setCheckInStatus(data.check_in);
          setCheckInStatusRequested(true);
        }

        const normalized = normalizeMessages(data);
        if (normalized) {
          setCopy(normalized);
          setCopyError(null);
          // 保存到缓存
          saveCachedCopy(normalized);
        } else {
          // 后端暂未返回匹配文案时，保持为空，不提示错误、也不展示备用文案
          setCopy(EMPTY_COPY);
          setCopyError(null);
        }
      } catch (error) {
        // 如果请求被取消，不处理错误
        if (abortController?.signal.aborted || !isMounted) {
          return;
        }

        const status = (error as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setCopyError("请登录后查看今日专属文案。");
        } else {
          // 如果出错但有缓存，保持使用缓存，不显示错误
          if (cached) {
            setCopyError(null);
          } else {
            setCopyError("获取今日文案失败。");
            console.warn("Failed to load home copy", error);
          }
        }
        if (!cached) {
          setCopy(EMPTY_COPY);
        }
      } finally {
        if (isMounted) {
          setLoadingCopy(false);
        }
      }
    }

    loadCopy();

    return () => {
      isMounted = false;
      if (abortController) {
        abortController.abort();
      }
    };
  }, [authVersion]);

  // 加载用户名
  useEffect(() => {
    let isMounted = true;

    async function loadUserName() {
      if (!hasAuthToken()) {
        if (isMounted) {
          setUserName(null);
        }
        return;
      }

      try {
        const auth = getInitialAuth();
        if (!auth?.user?.email) {
          if (isMounted) {
            setUserName(null);
          }
          return;
        }

        const email = auth.user.email;
        // 先尝试从本地存储加载
        const stored = loadStoredPreferences(email);
        if (stored?.displayName) {
          if (isMounted) {
            setUserName(stored.displayName);
          }
        } else {
          // 如果没有本地存储，尝试从服务器获取
          try {
            const preferences = await fetchProfilePreferences();
            const displayName = preferences.displayName.trim() || formatName(email);
            if (isMounted) {
              setUserName(displayName);
            }
          } catch {
            // 如果获取失败，使用 email 生成默认名称
            if (isMounted) {
              setUserName(formatName(email));
            }
          }
        }
      } catch (error) {
        console.warn("Failed to load user name", error);
        if (isMounted) {
          const auth = getInitialAuth();
          if (auth?.user?.email) {
            setUserName(formatName(auth.user.email));
          } else {
            setUserName(null);
          }
        }
      }
    }

    loadUserName();

    return () => {
      isMounted = false;
    };
  }, [authVersion]);

  // 加载未读通知数量
  useEffect(() => {
    let isMounted = true;

    async function loadUnreadCount() {
      if (!hasAuthToken()) {
        if (isMounted) {
          setUnreadNotificationCount(0);
        }
        return;
      }

      try {
        const notifications = await fetchNotifications();
        if (isMounted) {
          const unreadCount = getUnreadNotificationCount(notifications);
          setUnreadNotificationCount(unreadCount);
        }
      } catch (error) {
        // 静默失败，不影响主界面
        if (isMounted) {
          setUnreadNotificationCount(0);
        }
      }
    }

    loadUnreadCount();

    // 当通知模态框关闭时，重新加载未读数量
    if (!notificationModalOpen) {
      loadUnreadCount();
    }

    return () => {
      isMounted = false;
    };
  }, [authVersion, notificationModalOpen]);

  // 添加每天0点自动刷新打卡状态的机制
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function getNextMidnightShanghai(): number {
      const now = new Date();
      
      // 使用更可靠的方法计算上海时区的下一个午夜
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
            const today = getTodayIso();
            const localLastCheckinDate = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
            if (localLastCheckinDate && localLastCheckinDate !== today) {
              window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
              window.localStorage.removeItem(LOCAL_CHECKIN_STATUS_KEY);
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
              const today = getTodayIso();
              const localLastCheckinDate = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
              if (localLastCheckinDate && localLastCheckinDate !== today) {
                window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
                window.localStorage.removeItem(LOCAL_CHECKIN_STATUS_KEY);
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
      const today = getTodayIso();
      const localLastCheckinDate = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
      if (localLastCheckinDate && localLastCheckinDate !== today) {
        // 日期已变化，清除缓存并刷新状态
        try {
          window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
          window.localStorage.removeItem(LOCAL_CHECKIN_STATUS_KEY);
          // 清除昨天的打卡锁
          const yesterdayLockKey = `echo-checkin-lock-${localLastCheckinDate}`;
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

  useEffect(() => {
    if (checkInStatus || checkInStatusRequested) {
      return;
    }

    let isMounted = true;
    setCheckInStatusRequested(true);

    // 乐观：如果本地记录了当天已打卡，则先行置位，避免刷新后短暂可点击
    try {
      if (typeof window !== "undefined") {
        const today = getTodayIso();
        const localLastCheckinDate = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
        
        // 检查本地存储的打卡日期是否是今天，如果不是，清除缓存
        const isCacheValid = localLastCheckinDate === today;
        
        if (!isCacheValid) {
          // 如果缓存日期不是今天，清除相关缓存
          window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
          window.localStorage.removeItem(LOCAL_CHECKIN_STATUS_KEY);
        } else {
          // 先读取缓存的打卡统计，避免请求期间显示为 0
          const cached = window.localStorage.getItem(LOCAL_CHECKIN_STATUS_KEY);
          if (cached && isMounted) {
            try {
              const parsed = JSON.parse(cached) as CheckInStatus;
              // 额外检查：如果缓存显示今天已打卡，但本地日期记录不匹配，也清除缓存
              if (parsed && typeof parsed.total_checkins === "number") {
                // 如果缓存显示今天已打卡，但日期记录不是今天，清除缓存
                if (parsed.checked_today && localLastCheckinDate !== today) {
                  window.localStorage.removeItem(LOCAL_CHECKIN_STATUS_KEY);
                  window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
                } else {
                  setCheckInStatus(parsed);
                }
              }
            } catch {
              // ignore bad cache
            }
          }
        }
      }
    } catch {
      // ignore storage errors
    }

    async function loadStatus() {
      try {
        if (!hasAuthToken()) {
          if (!isMounted) {
            return;
          }
          setCheckInStatusRequested(false);
          setCheckInStatus(null);
          setCheckInError("请登录后查看打卡状态。");
          return;
        }

        const status = await fetchCheckInStatus();
        if (!isMounted) {
          return;
        }
        setCheckInStatus(status);
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(LOCAL_CHECKIN_STATUS_KEY, JSON.stringify(status));
          }
        } catch {
          // ignore storage errors
        }
        setCheckInError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const status = (error as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setCheckInError("请登录后查看打卡状态。");
        } else {
          console.warn("Failed to load check-in status", error);
          setCheckInError("获取打卡状态失败，请稍后重试。");
        }
      }
    }

    loadStatus();

    return () => {
      isMounted = false;
    };
  }, [checkInStatus, checkInStatusRequested, authVersion]);

  const messageLines = useMemo(
    () =>
      [copy.historyText, copy.conditional, copy.encouragement].filter(
        (line): line is string => Boolean(line),
      ),
    [copy],
  );

  const handleCheckIn = async () => {
    // 防止重复提交
    if (checkInLoading) {
      return;
    }

    // 如果已经打卡，直接返回
    if (checkInStatus?.checked_today) {
      return;
    }

    // 额外检查：使用localStorage防止多标签页同时打卡
    const checkInLockKey = `echo-checkin-lock-${getTodayIso()}`;
    try {
      const lockValue = window.localStorage.getItem(checkInLockKey);
      if (lockValue) {
        const lockTime = parseInt(lockValue, 10);
        const now = Date.now();
        // 如果锁在1分钟内，说明可能正在打卡，直接返回
        if (now - lockTime < 60000) {
          setCheckInError("正在打卡中，请稍候...");
          return;
        }
      }
      // 设置锁，有效期1分钟
      window.localStorage.setItem(checkInLockKey, String(Date.now()));
    } catch {
      // 如果localStorage不可用，继续执行（降级处理）
    }

    // 取消之前的请求（如果有）
    if (checkInAbortControllerRef.current) {
      checkInAbortControllerRef.current.abort();
    }

    // 创建新的AbortController
    const abortController = new AbortController();
    checkInAbortControllerRef.current = abortController;

    setCheckInLoading(true);
    setCheckInError(null);

    try {
      const result = await submitCheckIn({ source: "app" });
      
      // 检查请求是否被取消
      if (abortController.signal.aborted) {
        return;
      }

      const { created: _created, checked_date: _checkedDate, ...status } = result;
      setCheckInStatus(status);
      setCheckInError(null);
      
      try {
        if (typeof window !== "undefined") {
          const today = getTodayIso();
          window.localStorage.setItem(LOCAL_LAST_CHECKIN_KEY, today);
          window.localStorage.setItem(LOCAL_CHECKIN_STATUS_KEY, JSON.stringify(status));
          // 清除打卡锁
          const checkInLockKey = `echo-checkin-lock-${today}`;
          window.localStorage.removeItem(checkInLockKey);
          // 注意：storage事件只在其他标签页修改localStorage时触发
          // 当前标签页的修改不会触发storage事件，所以我们需要手动触发自定义事件
          // 其他标签页会通过storage事件接收到更新
        }
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      // 如果请求被取消，不处理错误
      if (abortController.signal.aborted) {
        return;
      }

      console.warn("Failed to submit check-in", error);
      
      // 区分不同类型的错误
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        const status = axiosError.response.status;
        if (status === 400) {
          const detail = (axiosError.response.data as any)?.detail;
          if (detail && typeof detail === "string" && detail.includes("已打卡")) {
            setCheckInError("您今天已经打卡过了。");
            // 刷新状态
            try {
              const status = await fetchCheckInStatus();
              setCheckInStatus(status);
            } catch {
              // ignore refresh error
            }
          } else {
            setCheckInError("打卡失败，请检查网络连接后重试。");
          }
        } else if (status === 401 || status === 403) {
          setCheckInError("请登录后打卡。");
        } else if (status >= 500) {
          setCheckInError("服务器错误，请稍后再试。");
        } else {
          setCheckInError("打卡失败，请稍后再试。");
        }
      } else if (axiosError.code === "ECONNABORTED" || axiosError.message.includes("timeout")) {
        setCheckInError("请求超时，请检查网络连接后重试。");
      } else if (axiosError.code === "ERR_NETWORK") {
        setCheckInError("网络错误，请检查网络连接。");
      } else if (axiosError.response?.status === 429) {
        // 处理频率限制错误
        const detail = (axiosError.response.data as any)?.detail;
        setCheckInError(detail || "请求过于频繁，请稍后再试。");
        // 如果是因为重复打卡，刷新状态
        if (detail && typeof detail === "string" && (detail.includes("已经打卡") || detail.includes("刚刚已经打卡"))) {
          try {
            const status = await fetchCheckInStatus();
            setCheckInStatus(status);
          } catch {
            // ignore refresh error
          }
        }
      } else {
        setCheckInError("打卡失败，请稍后再试。");
      }
    } finally {
      // 只有在请求没有被取消时才清除loading状态
      if (!abortController.signal.aborted) {
        setCheckInLoading(false);
      }
      // 清除AbortController引用
      if (checkInAbortControllerRef.current === abortController) {
        checkInAbortControllerRef.current = null;
      }
      // 清除打卡锁（无论成功或失败）
      try {
        if (typeof window !== "undefined") {
          const today = getTodayIso();
          const checkInLockKey = `echo-checkin-lock-${today}`;
          window.localStorage.removeItem(checkInLockKey);
        }
      } catch {
        // ignore storage errors
      }
    }
  };

  const checkedIn = (() => {
    // 首先检查本地存储的日期是否是今天，如果不是，清除过期缓存
    try {
      if (typeof window !== "undefined") {
        const local = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
        const today = getTodayIso();
        // 如果本地存储的日期不是今天，清除过期缓存
        if (local && local !== today) {
          window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
          window.localStorage.removeItem(LOCAL_CHECKIN_STATUS_KEY);
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
          const local = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
          const today = getTodayIso();
          // 如果本地存储的日期是今天，但服务器说今天没打卡，清除本地存储
          if (local === today) {
            window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
          }
        }
      } catch {
        // ignore storage errors
      }
    }
    // 服务器状态优先，如果服务器说没打卡，就返回 false
    return false;
  })();
  const totalCheckins = checkInStatus?.total_checkins ?? 0;
  const currentStreak = checkInStatus?.current_streak ?? 0;

  return (
    <div className="home-screen">
      <div className="home-screen__background">
        <div className="home-screen__glow home-screen__glow--primary" />
        <div className="home-screen__glow home-screen__glow--secondary" />
      </div>

      <TopNav
        title="EchoDraw"
        subtitle="Home"
        className="top-nav--fixed top-nav--flush"
        trailingSlot={
          <button
            type="button"
            className={clsx(
              "top-nav__action-button",
              unreadNotificationCount > 0 && "top-nav__action-button--has-badge",
            )}
            aria-label="通知"
            onClick={() => setNotificationModalOpen(true)}
          >
            <MaterialIcon name="notifications" className="top-nav__icon" />
            {unreadNotificationCount > 0 && (
              <span className="top-nav__badge" aria-hidden="true" />
            )}
          </button>
        }
      />

      <NotificationModal
        open={notificationModalOpen}
        onClose={() => {
          setNotificationModalOpen(false);
          // 关闭时刷新未读数量
          if (hasAuthToken()) {
            fetchNotifications()
              .then((notifications) => {
                const unreadCount = getUnreadNotificationCount(notifications);
                setUnreadNotificationCount(unreadCount);
              })
              .catch(() => {
                // 静默失败
              });
          }
        }}
      />

      <main className="home-screen__content">
        <header className="home-screen__header">
          <h1 className="home-screen__title">
            {userName ? `欢迎回来，${truncateName(userName)}` : "欢迎回来，创作者"}
          </h1>
          {copy.historyHeadline && (
            <p className="home-screen__subtitle home-screen__subtitle--headline">
              {copy.historyHeadline}
            </p>
          )}
          {messageLines.map((line, index) => (
            <p key={line + index} className="home-screen__subtitle">
              {line}
            </p>
          ))}
          {loadingCopy && (
            <p className="home-screen__subtitle home-screen__subtitle--hint">正在获取今日文案…</p>
          )}
          {copyError && !loadingCopy && (
            <p className="home-screen__subtitle home-screen__subtitle--hint">{copyError}</p>
          )}
        </header>

        <section className="home-screen__cards">
          <button
            type="button"
            className={clsx(
              "home-screen__card",
              "home-screen__card--checkin",
              checkedIn && "home-screen__card--checked",
            )}
            onClick={handleCheckIn}
            disabled={checkInLoading || checkedIn}
            aria-busy={checkInLoading ? "true" : undefined}
          >
            <MaterialIcon
              name={checkedIn ? "check_circle" : "sentiment_satisfied"}
              className="home-screen__card-icon"
              filled={checkedIn}
            />
            <div className="home-screen__card-text">
              <h2 className="home-screen__card-title">
                {checkedIn ? "今日已打卡！" : "每日打卡"}
              </h2>
              <p className="home-screen__card-description">
                {checkedIn
                  ? `累计打卡 ${totalCheckins} 天${
                      currentStreak > 0 ? ` · 连续 ${currentStreak} 天` : ""
                    }`
                  : "记录今日情绪与时长"}
              </p>
            </div>
          </button>
          {checkInError && (
            <p className="home-screen__subtitle home-screen__subtitle--hint">{checkInError}</p>
          )}

          <div className="home-screen__grid">
            <button
              type="button"
              className="home-screen__card home-screen__card--link"
              onClick={() => onOpenColorPerceptionTest?.()}
            >
              <MaterialIcon name="palette" className="home-screen__card-icon" />
              <div className="home-screen__card-text">
                <h2 className="home-screen__card-title">每日色感测试</h2>
                <p className="home-screen__card-description">测试你的色彩感知</p>
              </div>
            </button>
            <button
              type="button"
              className="home-screen__card home-screen__card--link"
              onClick={() => onOpenMentalStateAssessment?.()}
            >
              <MaterialIcon name="task_alt" className="home-screen__card-icon" />
              <div className="home-screen__card-text">
                <h2 className="home-screen__card-title">测试中心</h2>
                <p className="home-screen__card-description">心境评估</p>
              </div>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Home;

