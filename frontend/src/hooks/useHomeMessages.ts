import { useEffect, useRef, useState, useCallback } from "react";
import type { AxiosError } from "axios";
import {
  fetchHomeMessages,
  type HomeMessagesResponse,
} from "@/services/api";
import { getTodayInShanghai } from "@/utils/dateUtils";
import {
  getSessionStorageItem,
  setSessionStorageItem,
  removeSessionStorageItem,
} from "@/utils/storageUtils";
import { STORAGE_KEYS, getHomeCopyCacheKey } from "@/constants/storageKeys";

export type HomeCopy = {
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
  const historyHeadline =
    sanitize(payload.history?.headline) || sanitize(payload.holiday?.headline);
  const historyText =
    sanitize(payload.history?.text) || sanitize(payload.holiday?.text);
  const conditional = sanitize(payload.conditional);
  const encouragement =
    sanitize(payload.encouragement) || sanitize((payload as any).general);

  const normalized: HomeCopy = {
    historyHeadline,
    historyText,
    conditional,
    encouragement,
  };

  const hasContent = Object.values(normalized).some(Boolean);
  return hasContent ? normalized : null;
}

function loadCachedCopy(): HomeCopy | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const today = getTodayInShanghai();
    const cachedDate = window.sessionStorage.getItem(STORAGE_KEYS.HOME_COPY_CACHE_DATE);
    // 如果缓存的日期是今天，才使用缓存
    if (cachedDate === today) {
      const cached = getSessionStorageItem<HomeCopy>(getHomeCopyCacheKey(today));
      if (cached) {
        return cached;
      }
    } else {
      // 如果日期不是今天，清除旧缓存
      if (cachedDate) {
        const oldCacheKey = getHomeCopyCacheKey(cachedDate);
        removeSessionStorageItem(oldCacheKey);
        removeSessionStorageItem(STORAGE_KEYS.HOME_COPY_CACHE_DATE);
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
    const today = getTodayInShanghai();
    const cacheKey = getHomeCopyCacheKey(today);
    setSessionStorageItem(cacheKey, copy);
    window.sessionStorage.setItem(STORAGE_KEYS.HOME_COPY_CACHE_DATE, today);
  } catch {
    // ignore cache errors
  }
}

export function useHomeMessages(authVersion: number) {
  const [copy, setCopy] = useState<HomeCopy>(() => {
    const cached = loadCachedCopy();
    return cached || EMPTY_COPY;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadCopy = useCallback(async () => {
    // 取消之前的请求（如果有）
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // 先尝试从缓存加载，避免闪烁
    const cached = loadCachedCopy();
    if (cached) {
      // 如果缓存存在且是今天的，直接使用，不显示加载状态
      setCopy(cached);
      setError(null);
      setLoading(false);
      // 如果已经有今天的缓存，就不需要再请求了
      const today = getTodayInShanghai();
      const cachedDate = window.sessionStorage.getItem(STORAGE_KEYS.HOME_COPY_CACHE_DATE);
      if (cachedDate === today) {
        // 今天已经有缓存，不需要重新请求
        return;
      }
    } else {
      setLoading(true);
    }

    try {
      // 允许未登录时也尝试获取首页文案
      const data = await fetchHomeMessages();

      // 检查请求是否被取消
      if (abortController.signal.aborted) {
        return;
      }

      const normalized = normalizeMessages(data);
      if (normalized) {
        setCopy(normalized);
        setError(null);
        // 保存到缓存
        saveCachedCopy(normalized);
      } else {
        // 后端暂未返回匹配文案时，保持为空，不提示错误、也不展示备用文案
        setCopy(EMPTY_COPY);
        setError(null);
      }
    } catch (err) {
      // 如果请求被取消，不处理错误
      if (abortController?.signal.aborted) {
        return;
      }

      const status = (err as AxiosError)?.response?.status;
      if (status === 401 || status === 403) {
        // 未登录时静默失败，不显示错误信息
        setError(null);
        setCopy(EMPTY_COPY);
      } else {
        // 如果出错但有缓存，保持使用缓存，不显示错误
        if (cached) {
          setError(null);
        } else {
          setError("获取今日文案失败。");
          console.warn("Failed to load home copy", err);
        }
      }
      if (!cached) {
        setCopy(EMPTY_COPY);
      }
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadCopy();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [authVersion, loadCopy]);

  return {
    copy,
    loading,
    error,
    retry: loadCopy,
  };
}

