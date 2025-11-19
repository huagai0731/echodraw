/**
 * 清除所有用户相关的缓存
 * 在用户退出登录时调用，确保不会泄露用户数据
 */

import { clearAllCache } from "./apiCache";
import { clearTagsCache } from "@/services/tagPreferences";

/**
 * 清除所有用户相关的 localStorage 和 sessionStorage 缓存
 */
export function clearAllUserCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    // ========== localStorage 清除 ==========
    
    // 1. 认证相关
    window.localStorage.removeItem("echodraw-auth");
    
    // 2. 用户资料相关
    window.localStorage.removeItem("echodraw-profile-preferences");
    window.localStorage.removeItem("echodraw-profile-stats");
    
    // 3. 打卡相关
    window.localStorage.removeItem("echo-last-checkin-date");
    window.localStorage.removeItem("echo-last-checkin-status");
    // 清除所有打卡锁
    const localStorageKeys = Object.keys(window.localStorage);
    localStorageKeys.forEach((key) => {
      if (key.startsWith("echo-checkin-lock-")) {
        window.localStorage.removeItem(key);
      }
    });
    
    // 4. 通知相关
    window.localStorage.removeItem("echo-notification-read-ids");
    
    // 5. 用户画作
    window.localStorage.removeItem("echo.user-artworks.v1");
    
    // 6. 标签偏好（清除所有用户的标签偏好）
    localStorageKeys.forEach((key) => {
      if (key.startsWith("echo.tag-preferences.")) {
        window.localStorage.removeItem(key);
      }
    });
    
    // 7. 精选画作
    window.localStorage.removeItem("echodraw-featured-artworks");
    
    // 8. 管理员相关（虽然普通用户不应该有，但为了安全也清除）
    window.localStorage.removeItem("echo-admin-long-term-copy");
    
    // 注意：不清除 echo-pwa-install-dismissed，因为这是设备级别的设置，不是用户级别的
    
    // ========== sessionStorage 清除 ==========
    
    // 1. 首页文案缓存
    const sessionStorageKeys = Object.keys(window.sessionStorage);
    sessionStorageKeys.forEach((key) => {
      if (key.startsWith("echo-home-copy-cache-")) {
        window.sessionStorage.removeItem(key);
      }
    });
    window.sessionStorage.removeItem("echo-home-copy-cache-date");
    
    // 2. 长线目标缓存
    window.sessionStorage.removeItem("echo-long-term-goal-cache");
    window.sessionStorage.removeItem("echo-long-term-goal-cache-timestamp");
    window.sessionStorage.removeItem("echo-long-term-goal-cache-updated");
    
    // 3. 短线目标缓存
    window.sessionStorage.removeItem("echo-short-term-goals-cache");
    window.sessionStorage.removeItem("echo-short-term-goals-cache-timestamp");
    sessionStorageKeys.forEach((key) => {
      if (key.startsWith("echo-short-term-goals-cache-")) {
        window.sessionStorage.removeItem(key);
      }
      if (key.startsWith("echo-short-term-goals-cache-timestamp-")) {
        window.sessionStorage.removeItem(key);
      }
    });
    
    // 4. 强制登出标记
    window.sessionStorage.removeItem("echo-forced-logout");
    
    // 5. API 缓存（通过工具函数清除）
    clearAllCache();
    
    // 6. 标签缓存（内存缓存）
    clearTagsCache();
    
    // 7. 清除所有以 echo 开头的 sessionStorage 项（兜底）
    sessionStorageKeys.forEach((key) => {
      if (key.startsWith("echo")) {
        window.sessionStorage.removeItem(key);
      }
    });
    
  } catch (error) {
    console.warn("[Echo] Failed to clear user cache:", error);
  }
}

