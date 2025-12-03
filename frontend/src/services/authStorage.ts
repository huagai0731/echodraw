export type StoredAuthPayload = {
  token: string;
  user: {
    email: string;
  };
};

export const AUTH_STORAGE_KEY = "echodraw-auth";

export function loadStoredAuth(): StoredAuthPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredAuthPayload;
    if (parsed?.token && parsed?.user?.email) {
      return parsed;
    }
  } catch (error) {
    console.warn("[Echo] Failed to parse stored auth payload:", error);
  }
  return null;
}

export function storeAuth(payload: StoredAuthPayload | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (payload) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("[Echo] Failed to persist auth payload:", error);
  }
}

export function getActiveUserEmail(): string | null {
  const payload = loadStoredAuth();
  return payload?.user?.email ?? null;
}































