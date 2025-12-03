const SCROLL_POSITION_KEY = "gallery-scroll-position";

/**
 * 保存滚动位置到 sessionStorage
 */
export function saveScrollPosition(position: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(SCROLL_POSITION_KEY, String(position));
  } catch (error) {
    console.warn("[ScrollManager] Failed to save scroll position", error);
  }
}

/**
 * 从 sessionStorage 恢复滚动位置
 */
export function restoreScrollPosition(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const saved = window.sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (saved) {
      const position = Number.parseFloat(saved);
      if (Number.isFinite(position) && position >= 0) {
        return position;
      }
    }
  } catch (error) {
    console.warn("[ScrollManager] Failed to restore scroll position", error);
  }
  return null;
}

/**
 * 清除保存的滚动位置
 */
export function clearScrollPosition(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.removeItem(SCROLL_POSITION_KEY);
  } catch (error) {
    console.warn("[ScrollManager] Failed to clear scroll position", error);
  }
}

/**
 * 获取当前滚动位置
 */
export function getCurrentScrollPosition(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
}

/**
 * 滚动到指定位置
 */
export function scrollToPosition(position: number, behavior: ScrollBehavior = "instant"): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.scrollTo({
      top: position,
      behavior,
    });
  } catch (error) {
    // 降级方案
    try {
      document.documentElement.scrollTop = position;
      document.body.scrollTop = position;
    } catch (e) {
      console.warn("[ScrollManager] Failed to scroll to position", e);
    }
  }
}

/**
 * 恢复滚动位置（带重试机制）
 */
export function restoreScrollPositionWithRetry(
  position: number,
  maxRetries: number = 5,
  retryDelay: number = 50
): void {
  if (typeof window === "undefined" || position <= 0) {
    return;
  }
  
  let retryCount = 0;
  
  const attemptScroll = () => {
    const maxScroll = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      window.innerHeight
    );
    
    if (maxScroll < position + window.innerHeight && retryCount < maxRetries) {
      retryCount++;
      setTimeout(attemptScroll, retryDelay);
      return;
    }
    
    const targetScroll = Math.min(position, Math.max(0, maxScroll - window.innerHeight));
    scrollToPosition(targetScroll);
  };
  
  // 使用双重 requestAnimationFrame 确保 DOM 已更新
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      attemptScroll();
    });
  });
}

