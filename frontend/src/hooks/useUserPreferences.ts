import { useEffect, useState, useCallback } from "react";
import {
  AUTH_CHANGED_EVENT,
  hasAuthToken,
  fetchProfilePreferences,
} from "@/services/api";
import { getLocalStorageItem } from "@/utils/storageUtils";
import { STORAGE_KEYS } from "@/constants/storageKeys";
import { formatNameFromEmail } from "@/utils/userUtils";

type AuthPayload = {
  token: string;
  user: {
    email: string;
  };
};

function getInitialAuth(): AuthPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.AUTH);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AuthPayload;
    if (parsed?.token && parsed?.user?.email) {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse stored auth payload", error);
  }

  return null;
}

export function useUserPreferences(authVersion: number) {
  const [userName, setUserName] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      if (!hasAuthToken()) {
        return null;
      }
      const auth = getInitialAuth();
      if (!auth?.user?.email) {
        return null;
      }
      const email = auth.user.email;
      // 先从本地存储加载
      const stored = getLocalStorageItem<{ email: string; displayName: string; signature: string }>(
        STORAGE_KEYS.PROFILE_PREFERENCES,
      );
      if (stored?.email === email && stored?.displayName) {
        return stored.displayName;
      }
      // 如果没有本地存储，使用 email 生成默认名称
      return formatNameFromEmail(email);
    } catch {
      // ignore errors
    }
    return null;
  });

  const loadUserName = useCallback(async () => {
    if (!hasAuthToken()) {
      setUserName(null);
      return;
    }

    try {
      const auth = getInitialAuth();
      if (!auth?.user?.email) {
        setUserName(null);
        return;
      }

      const email = auth.user.email;
      // 先尝试从本地存储加载
      const stored = getLocalStorageItem<{ email: string; displayName: string; signature: string }>(
        STORAGE_KEYS.PROFILE_PREFERENCES,
      );
      if (stored?.email === email && stored?.displayName) {
        setUserName(stored.displayName);
      } else {
        // 如果没有本地存储，尝试从服务器获取
        try {
          const preferences = await fetchProfilePreferences();
          const displayName = preferences.displayName.trim() || formatNameFromEmail(email);
          setUserName(displayName);
        } catch {
          // 如果获取失败，使用 email 生成默认名称
          setUserName(formatNameFromEmail(email));
        }
      }
    } catch (error) {
      console.warn("Failed to load user name", error);
      const auth = getInitialAuth();
      if (auth?.user?.email) {
        setUserName(formatNameFromEmail(auth.user.email));
      } else {
        setUserName(null);
      }
    }
  }, []);

  useEffect(() => {
    const handleAuthChange = () => {
      setUserName(null);
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);

    loadUserName();

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    };
  }, [authVersion, loadUserName]);

  return userName;
}

