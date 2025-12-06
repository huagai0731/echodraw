/**
 * 请求去重和防抖工具
 * 用于避免短时间内重复的 API 请求，特别是在快速切换页面时
 * 
 * 重要说明：
 * - 去重只在短时间内生效（默认500ms），不会阻止正常刷新
 * - 超过时间窗口的请求会被允许，确保数据可以正常更新
 * - 可以通过 forceRefresh 参数强制刷新，跳过去重检查
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
  abortController: AbortController;
}

// 存储正在进行的请求
const pendingRequests = new Map<string, PendingRequest<unknown>>();

// 请求去重时间窗口（毫秒）- 只对快速切换时的重复请求生效
const DEDUP_WINDOW = 500; // 500ms 内的相同请求会被去重

// 请求最大保留时间（避免内存泄漏）
const MAX_REQUEST_AGE = 30000; // 30秒

/**
 * 生成请求的唯一键
 */
function getRequestKey(
  method: string, 
  url: string, 
  params?: Record<string, unknown>,
  forceRefresh?: boolean
): string {
  const paramsStr = params ? JSON.stringify(params) : '';
  // forceRefresh 不包含在 key 中，因为强制刷新时我们需要创建新的请求
  return `${method}:${url}:${paramsStr}`;
}

/**
 * 清理过期的请求记录
 */
function cleanupOldRequests(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  pendingRequests.forEach((request, key) => {
    if (now - request.timestamp > MAX_REQUEST_AGE) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => {
    pendingRequests.delete(key);
  });
}

/**
 * 执行去重请求
 * 如果相同的请求在短时间内已经发起，返回同一个 Promise
 * 
 * @param method HTTP 方法
 * @param url 请求 URL
 * @param requestFn 请求函数
 * @param params 请求参数（用于生成唯一键）
 * @param forceRefresh 是否强制刷新，如果为 true，跳过去重检查，直接发送新请求
 * 
 * 说明：
 * - forceRefresh=false（默认）：500ms 内的相同请求会被去重
 * - forceRefresh=true：即使有相同请求正在进行，也会强制发送新请求
 * - 超过 500ms 的请求会自动允许，确保数据可以正常刷新
 */
export function deduplicateRequest<T>(
  method: string,
  url: string,
  requestFn: (signal: AbortSignal) => Promise<T>,
  params?: Record<string, unknown>,
  forceRefresh: boolean = false
): Promise<T> {
  const requestKey = getRequestKey(method, url, params);
  const now = Date.now();

  // 清理过期请求
  cleanupOldRequests();

  // 如果强制刷新，取消现有请求并创建新请求
  if (forceRefresh) {
    const existingRequest = pendingRequests.get(requestKey);
    if (existingRequest) {
      existingRequest.abortController.abort();
      pendingRequests.delete(requestKey);
    }
  } else {
    // 检查是否有正在进行的相同请求
    const existingRequest = pendingRequests.get(requestKey);
    if (existingRequest) {
      const age = now - existingRequest.timestamp;
      // 如果请求在去重时间窗口内（500ms），返回现有的 Promise
      // 这样可以避免快速切换页面时的重复请求
      if (age < DEDUP_WINDOW) {
        return existingRequest.promise as Promise<T>;
      }
      // 如果请求已超过时间窗口，说明用户可能在等待刷新，取消旧请求并创建新请求
      // 这样可以确保数据能够正常刷新
      existingRequest.abortController.abort();
      pendingRequests.delete(requestKey);
    }
  }

  // 创建新的 AbortController
  const abortController = new AbortController();

  // 创建新的请求 Promise
  const requestPromise = requestFn(abortController.signal)
    .then((result) => {
      // 请求完成后，清理记录（延迟清理，以便在去重窗口内的后续请求可以使用）
      setTimeout(() => {
        pendingRequests.delete(requestKey);
      }, DEDUP_WINDOW);
      return result;
    })
    .catch((error) => {
      // 请求失败后，立即清理记录
      pendingRequests.delete(requestKey);
      throw error;
    });

  // 存储请求信息
  pendingRequests.set(requestKey, {
    promise: requestPromise,
    timestamp: now,
    abortController,
  });

  return requestPromise;
}

/**
 * 取消指定的请求
 */
export function cancelRequest(method: string, url: string, params?: Record<string, unknown>): void {
  const requestKey = getRequestKey(method, url, params);
  const existingRequest = pendingRequests.get(requestKey);
  if (existingRequest) {
    existingRequest.abortController.abort();
    pendingRequests.delete(requestKey);
  }
}

/**
 * 取消所有正在进行的请求
 */
export function cancelAllRequests(): void {
  pendingRequests.forEach((request) => {
    request.abortController.abort();
  });
  pendingRequests.clear();
}

/**
 * 获取正在进行的请求数量
 */
export function getPendingRequestCount(): number {
  cleanupOldRequests();
  return pendingRequests.size;
}
