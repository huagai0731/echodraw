/**
 * PWA 配置检查工具
 * 用于诊断 PWA 安装和配置问题
 */

export async function checkPWAConfiguration(): Promise<{
  manifest: boolean;
  serviceWorker: boolean;
  https: boolean;
  displayMode: string | null;
  issues: string[];
}> {
  const issues: string[] = [];
  let manifest = false;
  let serviceWorker = false;
  let displayMode: string | null = null;

  // 检查 HTTPS
  // Service Worker 只能在 HTTPS 或 localhost/127.0.0.1 环境下工作
  const isLocalhost = 
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.includes("localhost");
  
  const isHttps = window.location.protocol === "https:";
  const isSecureContext = isHttps || isLocalhost;

  // 检查是否是局域网 IP（开发环境常见）
  const isLocalNetwork = /^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname);

  if (!isSecureContext && !isLocalNetwork) {
    issues.push("PWA 需要 HTTPS 连接（localhost 和局域网 IP 除外）");
  }

  // 检查 manifest
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    manifest = true;
  } else {
    issues.push("未找到 manifest.json 链接");
  }

  // 检查 Service Worker（异步）
  // Service Worker 只能在安全上下文中注册（HTTPS 或 localhost）
  const canRegisterSW = "serviceWorker" in navigator;
  
  if (!canRegisterSW) {
    issues.push("浏览器不支持 Service Worker");
  } else if (!isSecureContext && !isLocalNetwork) {
    // 非安全上下文无法注册 Service Worker
    issues.push("Service Worker 无法在非 HTTPS 环境下注册（localhost 和局域网 IP 除外）");
  } else {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        serviceWorker = true;
      } else {
        // 检查是否有注册错误
        try {
          // 尝试注册以检查是否有错误
          const testRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
          if (testRegistration) {
            serviceWorker = true;
          }
        } catch (regError: unknown) {
          const errorMsg = regError instanceof Error ? regError.message : String(regError);
          if (errorMsg.includes("not allowed") || errorMsg.includes("insecure")) {
            issues.push("Service Worker 无法注册：需要 HTTPS 或 localhost 环境");
          } else if (errorMsg.includes("404") || errorMsg.includes("Failed to fetch")) {
            issues.push("Service Worker 文件未找到 - 请检查 sw.js 文件是否存在");
          } else {
            issues.push(`Service Worker 注册失败: ${errorMsg}`);
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      issues.push(`Service Worker 检查失败: ${errorMsg}`);
    }
  }

  // 检查显示模式
  if (window.matchMedia("(display-mode: standalone)").matches) {
    displayMode = "standalone";
  } else if (window.matchMedia("(display-mode: fullscreen)").matches) {
    displayMode = "fullscreen";
  } else if (window.matchMedia("(display-mode: minimal-ui)").matches) {
    displayMode = "minimal-ui";
  } else {
    displayMode = "browser";
    // 只在非开发环境或已安装时提示
    if (!import.meta.env.DEV) {
      issues.push("当前以浏览器模式运行，安装为 PWA 后将以 standalone 模式运行");
    }
  }

  return {
    manifest,
    serviceWorker,
    https: isSecureContext, // 返回是否在安全上下文中（包括 localhost）
    displayMode,
    issues,
  };
}

export async function logPWADiagnostics(): Promise<void> {
  // 此函数已被禁用，不再输出日志
  await checkPWAConfiguration();
}

