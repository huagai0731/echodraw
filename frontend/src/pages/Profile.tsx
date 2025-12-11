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
import api from "@/services/api";
import { clearAllUserCache } from "@/utils/clearUserCache";
import TopNav from "@/components/TopNav";
import { loadFeaturedArtworkIds, loadFeaturedArtworkIdsFromServer } from "@/services/featuredArtworks";
import { extractApiError } from "@/hooks/useApiError";
import type { Artwork } from "@/pages/Gallery";
import { isWechatBrowser, getWechatOAuthUrl, getCurrentUrl, invokeWechatPay } from "@/utils/wechatUtils";

import "./Profile.css";
import "./ProfileDashboard.css";
import MembershipOptions, { MEMBERSHIP_PLANS, type MembershipTier } from "./MembershipOptions";
import PaymentConfirmation from "./PaymentConfirmation";
import WechatPayment from "./WechatPayment";

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
  | "payment-confirmation"
  | "wechat-payment";

const STORAGE_KEY = "echodraw-auth";
const DEFAULT_SIGNATURE = "一副完整的画，一个崭新落成的次元";
const PREFS_STORAGE_KEY = "echodraw-profile-preferences";
const STATS_STORAGE_KEY = "echodraw-profile-stats";
const PENDING_ORDER_KEY = "echodraw-pending-order";

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
  const [checkingPayment, setCheckingPayment] = useState(false);

  // 处理微信授权回调
  useEffect(() => {
    // 检查是否是微信授权回调
    if (typeof window === "undefined" || !auth) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");

    // 只有在有code和state，且在微信浏览器中，且当前不在支付确认页面时才处理
    // 如果在支付确认页面，让onConfirm回调处理，避免重复处理
    if (code && state && isWechatBrowser() && view !== "payment-confirmation") {
      // 是微信授权回调，且当前在微信浏览器中
      try {
        // 解析state参数（包含支付信息）
        const paymentInfo = JSON.parse(decodeURIComponent(state)) as {
          tier: MembershipTier;
          expiresAt: string;
          paymentMethod: string;
          quantity: number;
          totalAmount: number;
        };

        // 清除URL中的code和state参数，避免重复处理
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);

        // 切换到支付确认页面，让onConfirm回调处理支付流程
        setPendingTier(paymentInfo.tier);
        setView("payment-confirmation");
      } catch (error: any) {
        console.error("[Echo] Failed to parse state parameter:", error);
        // 在测试阶段，显示详细的错误信息
        const errorMessage = `解析支付参数失败\n\n错误信息: ${error?.message || '未知错误'}\n\nState参数: ${state?.substring(0, 100) || 'N/A'}...`;
        alert(errorMessage);
        // 如果state解析失败，清除参数并返回会员选项页面
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
        setPendingTier(null);
        setView("membership-options");
      }
    }
  }, [auth, view]); // 依赖auth和view，确保在正确的时机处理

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

  // 检查并处理待支付的订单
  useEffect(() => {
    if (!auth || checkingPayment) {
      return;
    }

    // 检查是否有待处理的订单
    let pendingOrder: { order_id: number; order_number: string; timestamp: number } | null = null;
    try {
      const stored = window.localStorage.getItem(PENDING_ORDER_KEY);
      if (stored) {
        pendingOrder = JSON.parse(stored);
        // 检查订单是否超过30分钟（可能已过期）
        if (pendingOrder && Date.now() - pendingOrder.timestamp > 30 * 60 * 1000) {
          window.localStorage.removeItem(PENDING_ORDER_KEY);
          return;
        }
      }
    } catch (e) {
      console.warn("[Echo] Failed to load pending order:", e);
      window.localStorage.removeItem(PENDING_ORDER_KEY);
      return;
    }

    if (!pendingOrder) {
      return;
    }

    // 开始检查订单状态
    setCheckingPayment(true);
    let pollCount = 0;
    const maxPolls = 60; // 最多轮询60次（约5分钟）
    const pollInterval = 5000; // 每5秒轮询一次

    const checkOrderStatus = async () => {
      try {
        const response = await api.get<{
          order_id: number;
          order_number: string;
          status: string;
          amount: string;
          payment_method: string;
          paid_at: string | null;
          created_at: string;
        }>(`/payments/orders/${pendingOrder!.order_id}/status/`);

        if (response.data.status === "paid") {
          // 支付成功，清除待处理订单
          window.localStorage.removeItem(PENDING_ORDER_KEY);
          setCheckingPayment(false);
          
          // 强制同步会员状态（确保会员状态已更新）
          setMembershipTierLoading(true);
          try {
            // 先调用同步接口，强制更新会员状态
            try {
              await api.post(`/payments/orders/${pendingOrder.order_id}/sync-membership/`);
              console.log("[Echo] Membership status synced successfully");
            } catch (syncError: any) {
              console.warn("[Echo] Failed to sync membership status:", syncError);
              // 即使同步失败，也继续刷新会员状态
            }
            
            // 然后刷新会员状态
            const preferences = await fetchProfilePreferences();
            if (preferences.isMember) {
              setMembershipTier("premium");
              setMembershipExpires(preferences.membershipExpires);
            } else {
              setMembershipTier("pending");
              setMembershipExpires(null);
            }
          } catch (e) {
            console.error("[Echo] Failed to refresh membership status:", e);
          } finally {
            setMembershipTierLoading(false);
          }

          // 显示成功消息并返回会员选项页面
          alert("支付成功！您的会员已激活。");
          setPendingTier(null);
          setView("membership-options");
          return;
        }

        // 如果还没支付，继续轮询
        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(checkOrderStatus, pollInterval);
        } else {
          // 轮询超时，清除待处理订单
          window.localStorage.removeItem(PENDING_ORDER_KEY);
          setCheckingPayment(false);
          console.warn("[Echo] Order status polling timeout");
        }
      } catch (error: any) {
        console.error("[Echo] Failed to check order status:", error);
        // 如果订单不存在或出错，清除待处理订单
        if (error?.response?.status === 404) {
          window.localStorage.removeItem(PENDING_ORDER_KEY);
          setCheckingPayment(false);
        } else {
          // 其他错误，继续重试几次
          pollCount++;
          if (pollCount < maxPolls) {
            setTimeout(checkOrderStatus, pollInterval);
          } else {
            window.localStorage.removeItem(PENDING_ORDER_KEY);
            setCheckingPayment(false);
          }
        }
      }
    };

    // 延迟1秒后开始第一次检查（给页面一些时间加载）
    const timeoutId = setTimeout(checkOrderStatus, 1000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [auth, checkingPayment]);

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
        onConfirm={async ({ tier, expiresAt, paymentMethod, quantity, totalAmount }) => {
          // 防止重复提交：如果正在跳转，不再处理
          if (window.location.href.includes("alipay.com") || window.location.href.includes("alipaydev.com")) {
            return;
          }

          // 如果不是微信浏览器且选择微信支付，提示用户前往微信
          if (paymentMethod === "wechat" && !isWechatBrowser()) {
            alert("请在微信中打开此页面进行支付\n\n请复制链接到微信中打开，或通过公众号菜单进入");
            return;
          }

          try {
            // 如果是微信浏览器且选择微信支付，需要先获取openid
            let openid: string | undefined = undefined;
            if (paymentMethod === "wechat" && isWechatBrowser()) {
              // 检查URL中是否有code（微信授权回调）
              const urlParams = new URLSearchParams(window.location.search);
              const code = urlParams.get("code");
              const state = urlParams.get("state");
              
              if (code) {
                // 有code，说明是授权回调，获取openid
                try {
                  const oauthResponse = await api.get<{
                    openid: string;
                    state?: string;
                  }>(`/payments/wechat/oauth/callback/?code=${code}&state=${state || ""}`);
                  openid = oauthResponse.data.openid;
                  
                  if (!openid) {
                    throw new Error("获取openid失败：openid为空");
                  }
                  
                  // 清除URL中的code和state参数，避免重复使用
                  const cleanUrl = window.location.pathname;
                  window.history.replaceState({}, "", cleanUrl);
                } catch (oauthError: any) {
                  console.error("[Echo] Failed to get openid:", oauthError);
                  const errorMessage = extractApiError(oauthError, "获取微信授权失败，请重试");
                  alert(errorMessage);
                  setPendingTier(null);
                  setView("membership-options");
                  return;
                }
              } else {
                // 没有code，需要先进行微信授权
                // 确保当前URL不包含code和state参数
                const currentUrl = getCurrentUrl();
                const oauthUrl = getWechatOAuthUrl(
                  currentUrl,
                  JSON.stringify({ tier, expiresAt, paymentMethod, quantity, totalAmount })
                );
                if (oauthUrl) {
                  // 跳转到授权页面，授权后会回到当前页面（带code参数）
                  window.location.href = oauthUrl;
                  return; // 跳转到授权页面，不继续执行
                } else {
                  // 如果无法生成授权URL，提示用户
                  console.error("[Echo] Cannot generate WeChat OAuth URL");
                  alert("无法生成微信授权链接，请检查配置或稍后重试");
                  setPendingTier(null);
                  setView("membership-options");
                  return;
                }
              }
            }
            
            // 如果是微信支付但没有openid，报错
            if (paymentMethod === "wechat" && !openid) {
              alert("微信支付必须提供openid，请在微信浏览器中打开页面进行支付");
              setPendingTier(null);
              setView("membership-options");
              return;
            }

            // 调用创建支付订单接口
            const response = await api.post<{
              order_id: number;
              order_number: string;
              pay_url?: string;
              payment_method: string;
              code_url?: string;
              jsapi_params?: {
                appId: string;
                timeStamp: string;
                nonceStr: string;
                package: string;
                signType: string;
                paySign: string;
              };
              payment_type?: "native" | "jsapi";
            }>("/payments/orders/create/", {
              payment_method: paymentMethod,
              amount: totalAmount,
              tier: tier,
              expires_at: expiresAt,
              openid: openid, // 如果有openid，传递给后端
            });

            if (paymentMethod === "alipay") {
              // 支付宝支付：跳转到支付页面
              if (response.data.pay_url) {
                // 保存订单ID到 localStorage，用于支付完成后检测
                try {
                  window.localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({
                    order_id: response.data.order_id,
                    order_number: response.data.order_number,
                    timestamp: Date.now(),
                  }));
                } catch (e) {
                  console.warn("[Echo] Failed to save pending order:", e);
                }
                // 立即跳转，避免重复点击
                window.location.href = response.data.pay_url;
              } else {
                throw new Error("未获取到支付链接");
              }
            } else if (paymentMethod === "wechat") {
              // 微信支付（此时应该是在微信浏览器中）
              if (response.data.payment_type === "jsapi" && response.data.jsapi_params) {
                // JSAPI支付（公众号内支付）
                try {
                  // 保存订单ID到 localStorage，用于支付完成后检测
                  try {
                    window.localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify({
                      order_id: response.data.order_id,
                      order_number: response.data.order_number,
                      timestamp: Date.now(),
                    }));
                  } catch (e) {
                    console.warn("[Echo] Failed to save pending order:", e);
                  }
                  
                  // 调起微信支付
                  await invokeWechatPay(response.data.jsapi_params);
                  
                  // 支付成功，检查订单状态
                  setMembershipTierLoading(true);
                  try {
                    // 等待一下，让支付回调完成
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // 调用同步接口，强制更新会员状态
                    try {
                      await api.post(`/payments/orders/${response.data.order_id}/sync-membership/`);
                      console.log("[Echo] Membership status synced successfully");
                    } catch (syncError: any) {
                      console.warn("[Echo] Failed to sync membership status:", syncError);
                    }
                    
                    // 然后刷新会员状态
                    const preferences = await fetchProfilePreferences();
                    if (preferences.isMember) {
                      setMembershipTier("premium");
                      setMembershipExpires(preferences.membershipExpires);
                    } else {
                      setMembershipTier("pending");
                      setMembershipExpires(null);
                    }
                  } catch (e) {
                    console.error("[Echo] Failed to refresh membership status:", e);
                  } finally {
                    setMembershipTierLoading(false);
                  }
                  
                  setPendingTier(null);
                  setView("membership-options");
                } catch (payError: any) {
                  console.error("[Echo] Failed to invoke WeChat pay:", payError);
                  // 提供更详细的错误信息
                  let errorMessage = payError.message || "调起微信支付失败，请重试";
                  // 如果是签名验证失败，提供更明确的提示
                  if (errorMessage.includes("签名") || errorMessage.includes("sign")) {
                    errorMessage = "支付签名验证失败，请刷新页面后重试。如果问题持续，请联系客服。";
                  }
                  alert(errorMessage);
                  setPendingTier(null);
                  setView("membership-options");
                }
              } else if (response.data.code_url) {
                // Native支付（扫码支付）- 这种情况理论上不应该在微信浏览器中出现
                // 如果出现了，说明后端没有正确识别openid，提示用户
                console.warn("[Echo] Received Native payment in WeChat browser, this should not happen");
                alert("支付配置异常，请刷新页面重试");
                setPendingTier(null);
                setView("membership-options");
              } else {
                throw new Error("未获取到支付参数");
              }
            }
          } catch (error: any) {
            console.error("[Echo] Failed to create payment order:", error);
            // 使用 extractApiError 提取详细的错误信息
            const errorMessage = extractApiError(error, "创建支付订单失败，请重试");
            // 在控制台输出完整的错误信息，便于调试
            if (error?.response?.data) {
              console.error("[Echo] Error response data:", error.response.data);
            }
            alert(errorMessage);
            setPendingTier(null);
            setView("membership-options");
          }
        }}
      />
    );
  }

  if (view === "wechat-payment" && auth) {
    // 从sessionStorage获取二维码URL和订单ID
    const qrcodeUrl = sessionStorage.getItem("wechat-payment-qrcode");
    const orderIdStr = sessionStorage.getItem("wechat-payment-order-id");
    
    if (!qrcodeUrl || !orderIdStr) {
      // 如果没有二维码信息，返回会员选项页面
      setView("membership-options");
      return null;
    }
    
    const orderId = parseInt(orderIdStr, 10);
    if (isNaN(orderId)) {
      setView("membership-options");
      return null;
    }
    
    return (
      <WechatPayment
        codeUrl={qrcodeUrl}
        orderId={orderId}
        onBack={() => {
          sessionStorage.removeItem("wechat-payment-qrcode");
          sessionStorage.removeItem("wechat-payment-order-id");
          setPendingTier(null);
          setView("membership-options");
        }}
        onSuccess={async () => {
          // 支付成功，清除sessionStorage
          sessionStorage.removeItem("wechat-payment-qrcode");
          sessionStorage.removeItem("wechat-payment-order-id");
          
          // 强制同步会员状态
          setMembershipTierLoading(true);
          try {
            // 先调用同步接口，强制更新会员状态
            try {
              await api.post(`/payments/orders/${orderId}/sync-membership/`);
              console.log("[Echo] Membership status synced successfully");
            } catch (syncError: any) {
              console.warn("[Echo] Failed to sync membership status:", syncError);
            }
            
            // 然后刷新会员状态
            const preferences = await fetchProfilePreferences();
            if (preferences.isMember) {
              setMembershipTier("premium");
              setMembershipExpires(preferences.membershipExpires);
            } else {
              setMembershipTier("pending");
              setMembershipExpires(null);
            }
          } catch (e) {
            console.error("[Echo] Failed to refresh membership status:", e);
          } finally {
            setMembershipTierLoading(false);
          }
          
          setPendingTier(null);
          setView("membership-options");
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

