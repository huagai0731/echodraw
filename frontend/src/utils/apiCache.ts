/**
 * API 请求缓存工具
 * 用于减少重复的 API 请求，提升性能
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

const CACHE_PREFIX = 'echo_api_cache_';
const DEFAULT_EXPIRY = 5 * 60 * 1000; // 默认5分钟过期

/**
 * 获取缓存键
 */
function getCacheKey(url: string, params?: Record<string, unknown>): string {
  const key = params ? `${url}_${JSON.stringify(params)}` : url;
  return `${CACHE_PREFIX}${btoa(key).replace(/[+/=]/g, '')}`;
}

/**
 * 从缓存中获取数据
 */
export function getCachedData<T>(url: string, params?: Record<string, unknown>): T | null {
  try {
    const cacheKey = getCacheKey(url, params);
    const cached = sessionStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const entry: CacheEntry<T> = JSON.parse(cached);
    const now = Date.now();
    
    // 检查是否过期
    if (now - entry.timestamp > entry.expiry) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }
    
    return entry.data;
  } catch (error) {
    console.warn('[API Cache] Failed to get cached data:', error);
    return null;
  }
}

/**
 * 保存数据到缓存
 */
export function setCachedData<T>(
  url: string,
  data: T,
  params?: Record<string, unknown>,
  expiry: number = DEFAULT_EXPIRY
): void {
  try {
    const cacheKey = getCacheKey(url, params);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiry,
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (error) {
    console.warn('[API Cache] Failed to set cached data:', error);
    // 如果存储空间不足，清理旧缓存
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      clearOldCache();
    }
  }
}

/**
 * 清除指定 URL 的缓存
 */
export function clearCache(url: string, params?: Record<string, unknown>): void {
  try {
    const cacheKey = getCacheKey(url, params);
    sessionStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('[API Cache] Failed to clear cache:', error);
  }
}

/**
 * 清除所有 API 缓存
 */
export function clearAllCache(): void {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('[API Cache] Failed to clear all cache:', error);
  }
}

/**
 * 清理过期的缓存
 */
function clearOldCache(): void {
  try {
    const keys = Object.keys(sessionStorage);
    const now = Date.now();
    let cleared = 0;
    
    keys.forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        try {
          const cached = sessionStorage.getItem(key);
          if (cached) {
            const entry: CacheEntry<unknown> = JSON.parse(cached);
            if (now - entry.timestamp > entry.expiry) {
              sessionStorage.removeItem(key);
              cleared++;
            }
          }
        } catch (e) {
          // 解析失败，删除无效缓存
          sessionStorage.removeItem(key);
          cleared++;
        }
      }
    });
    
    if (cleared > 0) {
      console.log(`[API Cache] Cleared ${cleared} expired cache entries`);
    }
  } catch (error) {
    console.warn('[API Cache] Failed to clear old cache:', error);
  }
}

// 定期清理过期缓存（每10分钟）
let cacheCleanupInterval: ReturnType<typeof setInterval> | null = null;

if (typeof window !== 'undefined') {
  cacheCleanupInterval = setInterval(clearOldCache, 10 * 60 * 1000);
  
  // 在页面卸载时清理定时器，避免内存泄漏
  window.addEventListener('beforeunload', () => {
    if (cacheCleanupInterval) {
      clearInterval(cacheCleanupInterval);
      cacheCleanupInterval = null;
    }
  });
}

/**
 * 停止缓存清理定时器（用于测试或特殊场景）
 */
export function stopCacheCleanup(): void {
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
}





