/**
 * 本地存储键常量
 * 统一管理所有 localStorage 和 sessionStorage 的键名
 */

export const STORAGE_KEYS = {
  /** 认证信息 */
  AUTH: "echodraw-auth",
  /** 用户偏好设置 */
  PROFILE_PREFERENCES: "echodraw-profile-preferences",
  /** 用户统计数据 */
  PROFILE_STATS: "echodraw-profile-stats",
  /** 最后打卡日期 */
  LAST_CHECKIN_DATE: "echo-last-checkin-date",
  /** 打卡状态缓存 */
  CHECKIN_STATUS: "echo-last-checkin-status",
  /** 首页文案缓存日期键 */
  HOME_COPY_CACHE_DATE: "echo-home-copy-cache-date",
} as const;

/**
 * 生成首页文案缓存的键名
 */
export function getHomeCopyCacheKey(date: string): string {
  return `echo-home-copy-cache-${date}`;
}

/**
 * 生成打卡锁的键名
 */
export function getCheckInLockKey(date: string): string {
  return `echo-checkin-lock-${date}`;
}

