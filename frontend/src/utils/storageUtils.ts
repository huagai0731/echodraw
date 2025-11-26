/**
 * 本地存储工具函数
 * 提供类型安全的 localStorage 和 sessionStorage 操作
 */

import { STORAGE_KEYS } from "@/constants/storageKeys";

/**
 * 安全地从 localStorage 读取 JSON 数据
 */
export function getLocalStorageItem<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Failed to parse localStorage item "${key}":`, error);
    return null;
  }
}

/**
 * 安全地向 localStorage 写入 JSON 数据
 */
export function setLocalStorageItem<T>(key: string, value: T): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn(`localStorage quota exceeded for key "${key}"`);
    } else {
      console.warn(`Failed to set localStorage item "${key}":`, error);
    }
    return false;
  }
}

/**
 * 从 localStorage 删除项
 */
export function removeLocalStorageItem(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove localStorage item "${key}":`, error);
  }
}

/**
 * 安全地从 sessionStorage 读取 JSON 数据
 */
export function getSessionStorageItem<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Failed to parse sessionStorage item "${key}":`, error);
    return null;
  }
}

/**
 * 安全地向 sessionStorage 写入 JSON 数据
 */
export function setSessionStorageItem<T>(key: string, value: T): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn(`sessionStorage quota exceeded for key "${key}"`);
    } else {
      console.warn(`Failed to set sessionStorage item "${key}":`, error);
    }
    return false;
  }
}

/**
 * 从 sessionStorage 删除项
 */
export function removeSessionStorageItem(key: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove sessionStorage item "${key}":`, error);
  }
}

/**
 * 加载用户偏好设置
 */
export type StoredPreferences = {
  email: string;
  displayName: string;
  signature: string;
};

export function loadStoredPreferences(email: string): StoredPreferences | null {
  const prefs = getLocalStorageItem<StoredPreferences>(STORAGE_KEYS.PROFILE_PREFERENCES);
  if (prefs?.email && prefs.email === email) {
    return prefs;
  }
  return null;
}

/**
 * 保存用户偏好设置
 */
export function saveStoredPreferences(
  email: string,
  displayName: string,
  signature: string,
): boolean {
  const prefs: StoredPreferences = {
    email,
    displayName,
    signature,
  };
  return setLocalStorageItem(STORAGE_KEYS.PROFILE_PREFERENCES, prefs);
}

