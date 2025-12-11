/**
 * 工具函数：替换URL中的localhost地址为当前页面的hostname
 * 用于解决手机通过WiFi访问时，无法访问127.0.0.1的问题
 */

function isLocalhostName(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.") ||
    hostname.endsWith(".localhost")
  );
}

/**
 * 替换URL中的127.0.0.1或localhost为当前页面的hostname
 * 如果当前页面本身就是localhost，则不替换
 * 
 * @param url 原始URL
 * @returns 处理后的URL
 */
/**
 * 将TOS图片URL转换为代理URL，解决CORS问题
 * @param url 原始图片URL
 * @returns 如果是TOS URL，返回代理URL；否则返回原URL
 */
export function getProxiedImageUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url;
  }
  
  // 如果是base64数据URL，直接返回
  if (url.startsWith('data:')) {
    return url;
  }
  
  // 如果已经是代理URL，直接返回（避免重复转换）
  if (url.includes('/visual-analysis/proxy-image/') || (url.includes('/api/uploads/') && url.includes('/image/'))) {
    return url;
  }
  
  // 检查是否是TOS URL
  const tosDomains = [
    'tos-cn-shanghai.volces.com',
    'tos.cn-shanghai.volces.com',
    'echobucket.tos-cn-shanghai.volces.com',
  ];
  
  const isTosUrl = tosDomains.some(domain => url.includes(domain));
  
  if (isTosUrl) {
    // 动态导入 API_BASE_URL 以避免循环依赖
    // 使用与 api.ts 相同的逻辑来解析 baseURL
    let baseUrl: string;
    const explicitBaseURL = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
    
    if (explicitBaseURL) {
      if (
        typeof window !== "undefined" &&
        window.location.hostname &&
        window.location.hostname !== "localhost" &&
        /localhost|127\.0\.0\.1/i.test(explicitBaseURL)
      ) {
        baseUrl = `${window.location.protocol}//${window.location.host.replace(/\/$/, "")}/api`;
      } else {
        baseUrl = explicitBaseURL.endsWith('/') ? explicitBaseURL.slice(0, -1) : explicitBaseURL;
      }
    } else {
      if (typeof window !== "undefined") {
        if (import.meta.env.DEV) {
          baseUrl = "/api";
        } else {
          const origin = window.location.origin.replace(/\/$/, "");
          baseUrl = `${origin}/api`;
        }
      } else {
        baseUrl = "/api";
      }
    }
    
    // 确保 baseUrl 不以 / 结尾
    baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    // 构建代理URL（baseUrl 已经包含 /api 前缀）
    const encodedUrl = encodeURIComponent(url);
    return `${baseUrl}/visual-analysis/proxy-image/?url=${encodedUrl}`;
  }
  
  return url;
}

export function replaceLocalhostInUrl(url: string): string {
  if (!url || typeof window === "undefined" || !window.location?.hostname) {
    return url;
  }
  
  const currentHostname = window.location.hostname;
  // 如果当前hostname不是localhost，则替换URL中的localhost地址
  if (!isLocalhostName(currentHostname)) {
    // 替换 http://127.0.0.1 或 http://localhost
    url = url.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/i, `${window.location.protocol}//${window.location.host}`);
  }
  
  return url;
}







