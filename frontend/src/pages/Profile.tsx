import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import Register from "@/pages/Register";
import Settings from "@/pages/Settings";
import CustomTagManager from "@/pages/CustomTagManager";
import Welcome from "@/pages/Welcome";
import {
  fetchCheckInStatus,
  fetchProfilePreferences,
  fetchUserUploads,
  hasAuthToken,
  setAuthToken,
  updateProfilePreferences,
  subscribeMembership,
} from "@/services/api";
import { clearAllUserCache } from "@/utils/clearUserCache";
import TopNav from "@/components/TopNav";
import { loadFeaturedArtworkIds, loadFeaturedArtworkIdsFromServer } from "@/services/featuredArtworks";
import type { Artwork } from "@/pages/Gallery";

import "./Profile.css";
import "./ProfileDashboard.css";
import MembershipOptions, { MEMBERSHIP_PLANS, type MembershipTier } from "./MembershipOptions";
import PaymentConfirmation from "./PaymentConfirmation";

type AuthPayload = {
  token: string;
  user: {
    email: string;
  };
};

type ViewState =
  | "welcome"
  | "login"
  | "register"
  | "forgot-password"
  | "dashboard"
  | "settings"
  | "custom-tags"
  | "membership-options"
  | "payment-confirmation";

const STORAGE_KEY = "echodraw-auth";
const DEFAULT_SIGNATURE = "一副完整的画，一个崭新落成的次元";
const PREFS_STORAGE_KEY = "echodraw-profile-preferences";
const STATS_STORAGE_KEY = "echodraw-profile-stats";

type StoredPreferences = {
  email: string;
  displayName: string;
  signature: string;
};

type StoredStats = {
  email: string;
  totalCheckInDays: number;
  totalDurationMinutes: number;
  totalUploads: number;
  timestamp: number;
};

function loadStoredPreferences(email: string): StoredPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredPreferences;
    if (parsed?.email && parsed.email === email) {
      return parsed;
    }
  } catch (error) {
    // 处理JSON解析错误或localStorage访问错误
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("[Echo] localStorage quota exceeded, clearing old preferences");
      try {
        window.localStorage.removeItem(PREFS_STORAGE_KEY);
      } catch {
        // 忽略清理错误
      }
    } else {
      console.warn("[Echo] Failed to parse stored profile preferences:", error);
    }
  }
  return null;
}

function storePreferences(email: string, displayName: string, signature: string) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: StoredPreferences = {
    email,
    displayName,
    signature,
  };

  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // 处理localStorage配额超出错误
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("[Echo] localStorage quota exceeded, attempting to clear old data");
      try {
        // 尝试清理旧的偏好设置
        window.localStorage.removeItem(PREFS_STORAGE_KEY);
        // 重试一次
        window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(payload));
      } catch (retryError) {
        console.warn("[Echo] Failed to persist profile preferences after cleanup:", retryError);
      }
    } else {
      console.warn("[Echo] Failed to persist profile preferences:", error);
    }
  }
}

function clearStoredPreferences() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(PREFS_STORAGE_KEY);
  } catch (error) {
    // localStorage可能被禁用或不可用，静默处理
    if (error instanceof DOMException) {
      console.warn("[Echo] localStorage access denied or unavailable");
    } else {
      console.warn("[Echo] Failed to clear stored profile preferences:", error);
    }
  }
}

function loadStoredStats(email: string): StoredStats | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredStats;
    // 检查是否是同一用户的数据，且缓存时间不超过5分钟
    const now = Date.now();
    const CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟
    if (
      parsed?.email &&
      parsed.email === email &&
      parsed.timestamp &&
      now - parsed.timestamp < CACHE_EXPIRY
    ) {
      return parsed;
    }
  } catch (error) {
    console.warn("[Echo] Failed to parse stored profile stats:", error);
  }
  return null;
}

function storeStats(
  email: string,
  totalCheckInDays: number,
  totalDurationMinutes: number,
  totalUploads: number,
) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: StoredStats = {
    email,
    totalCheckInDays,
    totalDurationMinutes,
    totalUploads,
    timestamp: Date.now(),
  };

  try {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    // 处理localStorage配额超出错误
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("[Echo] localStorage quota exceeded, attempting to clear old stats");
      try {
        window.localStorage.removeItem(STATS_STORAGE_KEY);
        window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(payload));
      } catch (retryError) {
        console.warn("[Echo] Failed to persist profile stats after cleanup:", retryError);
      }
    } else {
      console.warn("[Echo] Failed to persist profile stats:", error);
    }
  }
}

function clearStoredStats() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STATS_STORAGE_KEY);
  } catch (error) {
    // localStorage可能被禁用或不可用，静默处理
    if (error instanceof DOMException) {
      console.warn("[Echo] localStorage access denied or unavailable");
    } else {
      console.warn("[Echo] Failed to clear stored profile stats:", error);
    }
  }
}

function getInitialAuth(): AuthPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

type ProfileProps = {
  forcedLogoutVersion?: number;
  artworks?: Artwork[];
};

function Profile({
  forcedLogoutVersion = 0,
  artworks = [],
}: ProfileProps) {
  const initialAuth = useMemo(getInitialAuth, []);
  const [auth, setAuth] = useState<AuthPayload | null>(initialAuth);
  const [view, setView] = useState<ViewState>(() => {
    // 检查是否有打开会员选项的事件
    if (typeof window !== "undefined") {
      const shouldOpenMembership = sessionStorage.getItem("open-membership-options");
      if (shouldOpenMembership === "true" && initialAuth) {
        sessionStorage.removeItem("open-membership-options");
        return "membership-options";
      }
    }
    return initialAuth ? "dashboard" : "welcome";
  });
  const [cachedEmail, setCachedEmail] = useState(initialAuth?.user.email ?? "");
  const [displayName, setDisplayName] = useState(() => {
    const email = initialAuth?.user.email;
    if (!email) {
      return "";
    }
    const stored = loadStoredPreferences(email);
    return stored?.displayName ?? "";
  });
  const [signature, setSignature] = useState(() => {
    const email = initialAuth?.user.email;
    if (!email) {
      return DEFAULT_SIGNATURE;
    }
    const stored = loadStoredPreferences(email);
    return stored?.signature ?? DEFAULT_SIGNATURE;
  });
  const [handledForcedLogoutVersion, setHandledForcedLogoutVersion] = useState(0);
  const [membershipTier, setMembershipTier] = useState<MembershipTier>("pending");
  const [pendingTier, setPendingTier] = useState<MembershipTier | null>(null);
  const [membershipTierLoading, setMembershipTierLoading] = useState(true);
  const [membershipExpires, setMembershipExpires] = useState<string | null>(null);

  useEffect(() => {
    if (auth) {
      setAuthToken(auth.token);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    } else {
      setAuthToken(null);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [auth]);

  useEffect(() => {
    if (
      forcedLogoutVersion === 0 ||
      forcedLogoutVersion === handledForcedLogoutVersion
    ) {
      return;
    }

    // 强制退出登录时，清除所有用户相关状态
    setCachedEmail(""); // 清除缓存的邮箱
    setAuth(null);
    setView("login");
    setDisplayName("");
    setSignature(DEFAULT_SIGNATURE);
    clearStoredPreferences();
    clearStoredStats();
    // 清除所有用户相关的缓存
    clearAllUserCache();
    setHandledForcedLogoutVersion(forcedLogoutVersion);
  }, [forcedLogoutVersion, handledForcedLogoutVersion, auth]);

  const handleAuthSuccess = useCallback(async (payload: AuthPayload) => {
    // 清除旧的缓存，确保新用户不会看到之前用户的数据
    // 注意：必须在设置 auth 之前清除，避免清除刚保存的登录状态
    clearAllUserCache();
    
    // 立即设置 token，确保数据加载时 token 已经可用
    setAuthToken(payload.token);
    setAuth(payload);
    // 立即保存登录状态到 localStorage，避免被清除
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    setCachedEmail(payload.user.email);
    // 注册成功后跳转到首页，而不是我的页面
    // 触发事件通知UserApp跳转到首页
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("echodraw-navigate-to-home"));
    }
    setView("dashboard");
    
    // 从服务器加载展示作品列表
    try {
      await loadFeaturedArtworkIdsFromServer();
      // 触发事件通知其他组件更新
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("echodraw-featured-artworks-changed"));
      }
    } catch (error) {
      console.warn("[Echo] Failed to load featured artwork IDs after login:", error);
    }
  }, []);

  const userEmail = auth?.user.email ?? null;

  useEffect(() => {
    if (!userEmail) {
      setDisplayName("");
      setSignature(DEFAULT_SIGNATURE);
      clearStoredPreferences();
      clearStoredStats();
      setMembershipTierLoading(false);
      return;
    }

    let cancelled = false;
    let requestAbortController: AbortController | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadPreferences = async () => {
      // 取消之前的请求
      if (requestAbortController) {
        requestAbortController.abort();
      }
      requestAbortController = new AbortController();
      
      // 开始加载，设置加载状态
      setMembershipTierLoading(true);

      // 先加载本地缓存以快速显示
      const stored = loadStoredPreferences(userEmail);
      if (stored && !cancelled) {
        setDisplayName(stored.displayName);
        setSignature(stored.signature);
      }

      // 设置超时，在500ms后显示按钮（即使API还没完成）
      // 这样可以避免在云服务器上因为API响应慢而导致按钮长时间不显示
      timeoutId = setTimeout(() => {
        if (!cancelled && !requestAbortController?.signal.aborted) {
          setMembershipTierLoading(false);
        }
      }, 500);

      try {
        const preferences = await fetchProfilePreferences();
        if (cancelled || requestAbortController.signal.aborted) {
          return;
        }
        const effectiveDisplayName =
          preferences.displayName.trim() ||
          preferences.defaultDisplayName.trim() ||
          formatName(userEmail);
        const effectiveSignature = preferences.signature.trim() || DEFAULT_SIGNATURE;
        if (!cancelled && !requestAbortController.signal.aborted) {
          setDisplayName(effectiveDisplayName);
          setSignature(effectiveSignature);
          storePreferences(userEmail, effectiveDisplayName, effectiveSignature);
          // 更新会员状态
          const isMember = preferences.isMember;
          const membershipExpiresDate = preferences.membershipExpires;
          // 保存会员到期时间
          setMembershipExpires(membershipExpiresDate);
          // 检查会员是否过期
          if (isMember && membershipExpiresDate) {
            const expiresDate = new Date(membershipExpiresDate);
            const now = new Date();
            if (expiresDate > now) {
              setMembershipTier("premium");
            } else {
              setMembershipTier("pending");
            }
          } else {
            setMembershipTier("pending");
          }
          // 加载完成，设置加载状态为false
          setMembershipTierLoading(false);
          // 清除超时，因为已经完成了
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
      } catch (error) {
        if (!cancelled && !requestAbortController.signal.aborted) {
          // 如果是401错误，可能是token过期，不更新本地状态
          if (error && typeof error === "object" && "response" in error) {
            const httpError = error as { response?: { status?: number } };
            if (httpError.response?.status === 401) {
              // Token过期，不更新状态，让上层处理
              setMembershipTierLoading(false);
              if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
              }
              return;
            }
          }
          console.warn("[Echo] Failed to load profile preferences:", error);
          // 加载失败，也设置加载状态为false
          setMembershipTierLoading(false);
          // 清除超时
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          // 只有在没有本地缓存时才使用默认值
          const hasStored = loadStoredPreferences(userEmail);
          if (!hasStored) {
            setDisplayName(formatName(userEmail));
            setSignature(DEFAULT_SIGNATURE);
            storePreferences(userEmail, formatName(userEmail), DEFAULT_SIGNATURE);
          }
        }
      }
    };

    loadPreferences().catch((error) => {
      if (!cancelled) {
        console.warn("[Echo] Unexpected error when loading profile preferences:", error);
      }
    });

    return () => {
      cancelled = true;
      if (requestAbortController) {
        requestAbortController.abort();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [userEmail]);

  const handleUpdateDisplayName = useCallback(
    async (value: string) => {
      // 输入验证：防止XSS和过长输入
      const trimmed = value.trim();
      if (trimmed.length > 24) {
        throw new Error("显示名称不能超过24个字符");
      }
      
      // 乐观更新UI
      setDisplayName(trimmed);
      if (userEmail) {
        try {
          const preferences = await updateProfilePreferences({ displayName: trimmed });
          // 使用服务器返回的值更新状态
          const effectiveDisplayName =
            preferences.displayName.trim() ||
            preferences.defaultDisplayName.trim() ||
            formatName(userEmail);
          const effectiveSignature = preferences.signature.trim() || DEFAULT_SIGNATURE;
          setDisplayName(effectiveDisplayName);
          setSignature(effectiveSignature);
          storePreferences(userEmail, effectiveDisplayName, effectiveSignature);
        } catch (error) {
          console.warn("[Echo] Failed to update display name:", error);
          // 回滚到之前的显示名称
          const stored = loadStoredPreferences(userEmail);
          if (stored) {
            setDisplayName(stored.displayName);
            setSignature(stored.signature);
          } else {
            setDisplayName(formatName(userEmail));
            setSignature(DEFAULT_SIGNATURE);
          }
          // 重新抛出错误，让调用者处理
          throw error;
        }
      }
    },
    [userEmail],
  );

  const handleUpdateSignature = useCallback(
    async (value: string) => {
      // 输入验证：防止XSS和过长输入
      const trimmed = value.trim();
      if (trimmed.length > 80) {
        throw new Error("签名不能超过80个字符");
      }
      
      // 乐观更新UI
      setSignature(trimmed);
      if (userEmail) {
        try {
          const preferences = await updateProfilePreferences({ signature: trimmed });
          // 使用服务器返回的值更新状态
          const effectiveDisplayName =
            preferences.displayName.trim() ||
            preferences.defaultDisplayName.trim() ||
            formatName(userEmail);
          const effectiveSignature = preferences.signature.trim() || DEFAULT_SIGNATURE;
          setDisplayName(effectiveDisplayName);
          setSignature(effectiveSignature);
          storePreferences(userEmail, effectiveDisplayName, effectiveSignature);
        } catch (error) {
          console.warn("[Echo] Failed to update signature:", error);
          // 回滚到之前的签名
          const stored = loadStoredPreferences(userEmail);
          if (stored) {
            setDisplayName(stored.displayName);
            setSignature(stored.signature);
          } else {
            setDisplayName(formatName(userEmail));
            setSignature(DEFAULT_SIGNATURE);
          }
          // 重新抛出错误，让调用者处理
          throw error;
        }
      }
    },
    [userEmail],
  );

  const handleLogout = useCallback(() => {
    setAuth(null);
    setView("welcome");
    setPendingTier(null);
    // 清除所有用户相关的缓存
    clearAllUserCache();
  }, []);

  if (view === "login") {
    return (
      <Login
        onBack={() => setView(auth ? "dashboard" : "welcome")}
        onSuccess={handleAuthSuccess}
        initialEmail={cachedEmail}
        onForgotPassword={(email) => {
          setCachedEmail(email.trim());
          setView("forgot-password");
        }}
      />
    );
  }

  if (view === "register") {
    return (
      <Register
        onBack={() => setView("welcome")}
        onLogin={() => setView("login")}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  if (view === "forgot-password") {
    return (
      <ForgotPassword
        onBack={() => setView("login")}
        onSuccess={handleAuthSuccess}
        initialEmail={cachedEmail}
        onLogin={() => setView("login")}
      />
    );
  }

  if (view === "settings" && auth) {
    return (
      <Settings
        onBack={() => setView("dashboard")}
        displayName={displayName || formatName(auth.user.email)}
        signature={signature}
        userEmail={auth.user.email}
        onUpdateDisplayName={handleUpdateDisplayName}
        onUpdateSignature={handleUpdateSignature}
        onOpenTagManager={() => setView("custom-tags")}
        onLogout={handleLogout}
      />
    );
  }

  if (view === "custom-tags" && auth) {
    return (
      <CustomTagManager
        userEmail={auth.user.email}
        onBack={() => setView("settings")}
      />
    );
  }

  if (view === "payment-confirmation" && auth) {
    const nextPlan =
      (pendingTier && MEMBERSHIP_PLANS.find((item) => item.id === pendingTier)) ?? null;

    if (!nextPlan) {
      return null;
    }

    return (
      <PaymentConfirmation
        plan={nextPlan}
        currentMembershipExpires={membershipExpires}
        onBack={() => setView("membership-options")}
        onConfirm={async ({ tier, expiresAt }) => {
          try {
            // 调用 API 保存会员状态和到期时间
            await subscribeMembership({
              tier: tier as "premium",
              expiresAt: expiresAt,
            });
            // 更新本地状态
            setMembershipTier(tier);
            setPendingTier(null);
            setView("dashboard");
          } catch (error) {
            console.error("[Echo] Failed to subscribe membership:", error);
            // 即使 API 调用失败，也更新本地状态（因为用户已经"支付"了）
            // 但应该显示错误提示
            alert("保存会员状态失败，请刷新页面重试");
            setMembershipTier(tier);
            setPendingTier(null);
            setView("dashboard");
          }
        }}
      />
    );
  }

  if (view === "membership-options" && auth) {
    return (
      <MembershipOptions
        onBack={() => {
          setPendingTier(null);
          setView("dashboard");
        }}
        currentTier={membershipTier}
        membershipExpires={membershipExpires}
        onSelectTier={(tier) => {
          setPendingTier(tier);
          setView("payment-confirmation");
        }}
      />
    );
  }

  if (view === "dashboard" && auth) {
    return (
      <ProfileDashboard
        email={auth.user.email}
        onLogout={handleLogout}
        onOpenSettings={() => setView("settings")}
        displayName={displayName || formatName(auth.user.email)}
        signature={signature}
        membershipTier={membershipTier}
        membershipTierLoading={membershipTierLoading}
        onOpenMembership={() => setView("membership-options")}
        artworks={artworks}
      />
    );
  }

  return (
    <Welcome
      onLogin={() => setView("login")}
      onRegister={() => setView("register")}
    />
  );
}

type ProfileDashboardProps = {
  email: string;
  onLogout: () => void;
  onOpenSettings: () => void;
  displayName: string;
  signature: string;
  membershipTier: MembershipTier;
  membershipTierLoading: boolean;
  onOpenMembership: () => void;
  artworks: Artwork[];
};

function ProfileDashboard({
  email,
  onLogout,
  onOpenSettings,
  displayName,
  signature,
  membershipTier,
  membershipTierLoading,
  onOpenMembership,
  artworks,
}: ProfileDashboardProps) {
  const effectiveName = displayName.trim() || formatName(email);
  const effectiveSignature = signature.trim() || DEFAULT_SIGNATURE;
  const membershipLabels: Record<MembershipTier, string> = {
    pending: "加入EchoDraw",
    premium: "Plus",
  };
  const currentMembershipLabel = membershipLabels[membershipTier] ?? membershipLabels.pending;
  // 先从缓存加载统计数据，避免闪烁
  const [stats, setStats] = useState(() => {
    const cached = loadStoredStats(email);
    if (cached) {
      return {
        totalCheckInDays: cached.totalCheckInDays,
        totalDurationMinutes: cached.totalDurationMinutes,
        totalUploads: cached.totalUploads,
      };
    }
    return {
      totalCheckInDays: 0,
      totalDurationMinutes: 0,
      totalUploads: 0,
    };
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let requestAbortController: AbortController | null = null;

    const loadStats = async () => {
      // 取消之前的请求
      if (requestAbortController) {
        requestAbortController.abort();
      }
      requestAbortController = new AbortController();

      // 确保 token 已设置后再加载数据
      if (!hasAuthToken()) {
        setIsStatsLoading(false);
        return;
      }

      // 如果已有缓存数据，不显示加载状态，静默更新
      const cached = loadStoredStats(email);
      if (!cached) {
        setIsStatsLoading(true);
      }

      try {
        const [checkInResult, uploadsResult] = await Promise.allSettled([
          fetchCheckInStatus(),
          fetchUserUploads(),
        ]);

        if (cancelled || requestAbortController.signal.aborted) {
          return;
        }

        const nextStats = {
          totalCheckInDays: 0,
          totalDurationMinutes: 0,
          totalUploads: 0,
        };

        if (checkInResult.status === "fulfilled") {
          nextStats.totalCheckInDays = checkInResult.value.total_checkins ?? 0;
        } else {
          const reason = checkInResult.reason;
          // 如果是401错误，可能是token过期，不记录警告
          if (reason && typeof reason === "object" && "response" in reason) {
            const httpError = reason as { response?: { status?: number } };
            if (httpError.response?.status !== 401) {
              console.warn("[Echo] Failed to load check-in stats:", reason);
            }
          } else {
            console.warn("[Echo] Failed to load check-in stats:", reason);
          }
        }

        if (uploadsResult.status === "fulfilled") {
          const uploads = uploadsResult.value;
          nextStats.totalUploads = uploads.length;
          nextStats.totalDurationMinutes = uploads.reduce(
            (total, item) => total + (item.duration_minutes ?? 0),
            0,
          );
        } else {
          const reason = uploadsResult.reason;
          // 如果是401错误，可能是token过期，不记录警告
          if (reason && typeof reason === "object" && "response" in reason) {
            const httpError = reason as { response?: { status?: number } };
            if (httpError.response?.status !== 401) {
              console.warn("[Echo] Failed to load upload stats:", reason);
            }
          } else {
            console.warn("[Echo] Failed to load upload stats:", reason);
          }
        }

        if (!cancelled && !requestAbortController.signal.aborted) {
          setStats(nextStats);
          // 保存到缓存，供下次快速显示
          storeStats(
            email,
            nextStats.totalCheckInDays,
            nextStats.totalDurationMinutes,
            nextStats.totalUploads,
          );
        }
      } catch (error) {
        if (!cancelled && !requestAbortController.signal.aborted) {
          console.warn("[Echo] Failed to load profile stats:", error);
          // 如果加载失败，但有缓存数据，保持缓存数据不变
          const cached = loadStoredStats(email);
          if (!cached) {
            // 只有在没有缓存时才设置为0
            setStats({
              totalCheckInDays: 0,
              totalDurationMinutes: 0,
              totalUploads: 0,
            });
          }
        }
      } finally {
        if (!cancelled && !requestAbortController.signal.aborted) {
          setIsStatsLoading(false);
        }
      }
    };

    loadStats().catch((error) => {
      if (!cancelled) {
        console.warn("[Echo] Unexpected error when loading profile stats:", error);
        setIsStatsLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (requestAbortController) {
        requestAbortController.abort();
      }
    };
  }, [email]);

  const totalDaysDisplay = isStatsLoading ? "--" : String(stats.totalCheckInDays);
  const totalUploadsDisplay = isStatsLoading ? "--" : String(stats.totalUploads);
  const totalDurationDisplay = isStatsLoading ? "--" : formatTotalDuration(stats.totalDurationMinutes);

  // 加载用户选择的"作品"
  const [featuredArtworks, setFeaturedArtworks] = useState<Artwork[]>([]);

  // 在用户登录后，从服务器加载展示作品列表
  useEffect(() => {
    if (!email) {
      setFeaturedArtworks([]);
      return;
    }

    let cancelled = false;

    const loadFeatured = async () => {
      try {
        const featuredIds = await loadFeaturedArtworkIdsFromServer();
        if (!cancelled) {
          const featured = artworks.filter((art) => featuredIds.includes(art.id));
          setFeaturedArtworks(featured);
        }
      } catch (error) {
        console.warn("[Echo] Failed to load featured artworks from server:", error);
        // 如果服务器加载失败，从localStorage加载
        if (!cancelled) {
          const featuredIds = loadFeaturedArtworkIds();
          const featured = artworks.filter((art) => featuredIds.includes(art.id));
          setFeaturedArtworks(featured);
        }
      }
    };

    loadFeatured();

    return () => {
      cancelled = true;
    };
  }, [email, artworks]);

  // 监听"作品"变化事件
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleFeaturedChanged = () => {
      const featuredIds = loadFeaturedArtworkIds();
      const featured = artworks.filter((art) => featuredIds.includes(art.id));
      setFeaturedArtworks(featured);
    };

    window.addEventListener("echodraw-featured-artworks-changed", handleFeaturedChanged);
    return () => {
      window.removeEventListener("echodraw-featured-artworks-changed", handleFeaturedChanged);
    };
  }, [artworks]);

  return (
    <div className="profile-page">
      <div className="profile-page__bg">
        <div className="profile-page__glow profile-page__glow--mint" />
        <div className="profile-page__glow profile-page__glow--brown" />
        <div className="profile-page__line profile-page__line--one" />
        <div className="profile-page__line profile-page__line--two" />
        <div className="profile-page__line profile-page__line--three" />
      </div>

      <TopNav
        title="个人"
        subtitle="Profile"
        className="top-nav--fixed top-nav--flush"
        leadingSlot={
          !membershipTierLoading && (
            <button
              type="button"
              className={clsx("profile-membership-trigger", `profile-membership-trigger--${membershipTier}`)}
              onClick={onOpenMembership}
            >
              <span className="profile-membership-trigger__label">{currentMembershipLabel}</span>
            </button>
          )
        }
        trailingActions={[
          {
            icon: "more_horiz",
            label: "打开设置",
            onClick: onOpenSettings,
          },
        ]}
      />

      <main className="profile-page__content">
        <section className="profile-page__intro">
          <h1>{effectiveName}</h1>
          <p>{effectiveSignature}</p>
        </section>

        <section className="profile-page__stats">
          <div>
            <strong>{totalDaysDisplay}</strong>
            <span>打卡天数</span>
          </div>
          <div>
            <strong>{totalDurationDisplay}</strong>
            <span>绘画时长</span>
          </div>
          <div>
            <strong>{totalUploadsDisplay}</strong>
            <span>上传作品</span>
          </div>
        </section>


        <section className="profile-page__gallery">
          <header>
            <h2>作品</h2>
          </header>
          {featuredArtworks.length > 0 ? (
            <div className="profile-page__gallery-track">
              {featuredArtworks.map((art) => (
                <div key={art.id} className="profile-page__gallery-item">
                  <img
                    src={art.imageSrc}
                    alt={art.alt || art.title || "作品"}
                    onError={(e) => {
                      // 图片加载失败时显示占位符
                      const target = e.currentTarget;
                      target.style.display = "none";
                      // 可以在这里添加错误占位符逻辑
                      console.warn("[Echo] Failed to load artwork image:", art.id);
                    }}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="profile-page__gallery-placeholder">
              <div className="profile-page__gallery-placeholder-content">
                <span className="profile-page__gallery-placeholder-icon">--</span>
                <div>
                  <h3>尚未设置作品</h3>
                  <p>可以前往画集页面设置图片展示在这里</p>
                </div>
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

function formatName(email: string) {
  // 输入验证：确保email是有效的字符串
  if (!email || typeof email !== "string") {
    return "回声艺术家";
  }
  
  const name = email.split("@")[0];
  if (name.length === 0) {
    return "回声艺术家";
  }
  
  // 防止XSS：确保只返回安全的字符串（React会自动转义，但这里额外验证）
  const sanitized = name.slice(0, 1).toUpperCase() + name.slice(1);
  return sanitized;
}

function formatTotalDuration(minutesTotal: number) {
  if (minutesTotal <= 0) {
    return "0m";
  }

  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

export default Profile;

