import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTH_CHANGED_EVENT,
  fetchShortTermGoals,
  hasAuthToken,
  type ShortTermGoal,
} from "@/services/api";

const CACHE_KEY = "echo-short-term-goals-cache";
const CACHE_TIMESTAMP_KEY = "echo-short-term-goals-cache-timestamp";
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5分钟缓存有效期

function loadCachedGoals(): ShortTermGoal[] | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const cached = window.sessionStorage.getItem(CACHE_KEY);
    const timestamp = window.sessionStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (cached && timestamp) {
      const age = Date.now() - Number.parseInt(timestamp, 10);
      if (age < CACHE_MAX_AGE) {
        return JSON.parse(cached) as ShortTermGoal[];
      }
    }
  } catch {
    // 忽略缓存错误
  }
  return null;
}

function saveCachedGoals(goals: ShortTermGoal[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (goals.length > 0) {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(goals));
      window.sessionStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
    } else {
      window.sessionStorage.removeItem(CACHE_KEY);
      window.sessionStorage.removeItem(CACHE_TIMESTAMP_KEY);
    }
    // 跨标签页同步
    try {
      const eventKey = `${CACHE_KEY}-updated`;
      window.localStorage.setItem(eventKey, String(Date.now()));
      setTimeout(() => {
        try {
          window.localStorage.removeItem(eventKey);
        } catch {
          // ignore
        }
      }, 100);
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

/**
 * 管理短期目标的状态和加载逻辑
 */
export function useShortTermGoals() {
  // 初始化时先从缓存加载，避免闪烁
  const [goals, setGoals] = useState<ShortTermGoal[]>(() => {
    const cached = loadCachedGoals();
    return cached || [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const isMountedRef = useRef(true);

  // 加载目标列表
  const loadGoals = useCallback(async (useCache = true) => {
    if (!hasAuthToken()) {
      setGoals([]);
      setError("登录后可查看短期目标。");
      saveCachedGoals([]);
      return;
    }

    // 尝试从缓存加载
    if (useCache) {
      const cached = loadCachedGoals();
      if (cached && isMountedRef.current) {
        setGoals(cached);
        setError(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    try {
      const data = await fetchShortTermGoals();
      if (!isMountedRef.current) {
        return;
      }
      // 只有成功获取到数据时才更新状态和缓存
      // 如果返回空数组，可能是服务器还没同步，保留现有缓存
      if (Array.isArray(data)) {
        const cached = loadCachedGoals();
        // 如果API返回空数组，但缓存有数据，可能是服务器延迟，保留缓存
        if (data.length === 0 && cached && cached.length > 0) {
          // 保留缓存，不更新状态（继续显示缓存的数据）
          setError(null);
          // 不更新缓存，等待下次刷新时再尝试
        } else {
          // 有数据，或者缓存也是空的，使用API返回的数据
          setGoals(data);
          setError(null);
          saveCachedGoals(data);
        }
      } else {
        // 如果返回的不是数组，保留缓存
        const cached = loadCachedGoals();
        if (cached) {
          setGoals(cached);
          setError(null);
        } else {
          setGoals([]);
          setError("获取短期目标失败，请稍后重试。");
        }
      }
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        setGoals([]);
        setError("登录后可查看短期目标。");
        saveCachedGoals([]);
      } else {
        console.warn("Failed to load short-term goals", error);
        const cached = loadCachedGoals();
        if (!cached) {
          setGoals([]);
          setError("获取短期目标失败，请稍后重试。");
        } else {
          // API失败但有缓存，使用缓存（可能是网络问题）
          setGoals(cached);
          setError(null);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // 添加新目标
  const addGoal = useCallback((goal: ShortTermGoal) => {
    setGoals((prev) => {
      const filtered = prev.filter((item) => item.id !== goal.id);
      const next = [goal, ...filtered];
      next.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      saveCachedGoals(next);
      return next;
    });
    setError(null);
  }, []);

  // 删除目标
  const removeGoal = useCallback((goalId: number) => {
    setGoals((prev) => {
      const next = prev.filter((goal) => goal.id !== goalId);
      saveCachedGoals(next);
      return next;
    });
  }, []);

  // 更新目标
  const updateGoal = useCallback((goal: ShortTermGoal) => {
    setGoals((prev) => {
      const next = prev.map((item) => (item.id === goal.id ? goal : item));
      next.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      saveCachedGoals(next);
      return next;
    });
    setError(null);
  }, []);

  // 监听认证变化
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthChange = () => {
      setAuthVersion((prev) => prev + 1);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === CACHE_KEY ||
        event.key === CACHE_TIMESTAMP_KEY ||
        event.key === `${CACHE_KEY}-updated`
      ) {
        setAuthVersion((prev) => prev + 1);
      }
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // 监听认证版本变化，重新加载
  useEffect(() => {
    isMountedRef.current = true;
    loadGoals(true);

    return () => {
      isMountedRef.current = false;
    };
  }, [authVersion, loadGoals]);

  return {
    goals,
    loading,
    error,
    reload: () => loadGoals(false),
    addGoal,
    removeGoal,
    updateGoal,
  };
}

