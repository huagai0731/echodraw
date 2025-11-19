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



