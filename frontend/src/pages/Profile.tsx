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
} from "@/services/api";
import TopNav from "@/components/TopNav";
import { loadFeaturedArtworkIds } from "@/services/featuredArtworks";
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

type StoredPreferences = {
  email: string;
  displayName: string;
  signature: string;
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
    console.warn("[Echo] Failed to parse stored profile preferences:", error);
  }
  return null;
}

function storePreferences(email: string, displayName: string, signature: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: StoredPreferences = {
      email,
      displayName,
      signature,
    };
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[Echo] Failed to persist profile preferences:", error);
  }
}

function clearStoredPreferences() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(PREFS_STORAGE_KEY);
  } catch (error) {
    console.warn("[Echo] Failed to clear stored profile preferences:", error);
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

type PinnedAchievement = {
  id: string;
  kind?: string;
  title: string;
  subtitle: string;
};

type RecentAchievement = {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
};

type ProfileProps = {
  onOpenAchievements?: () => void;
  pinnedAchievements?: PinnedAchievement[];
  recentAchievements?: RecentAchievement[];
  forcedLogoutVersion?: number;
  artworks?: Artwork[];
};

function Profile({
  onOpenAchievements,
  pinnedAchievements = [],
  recentAchievements = [],
  forcedLogoutVersion = 0,
  artworks = [],
}: ProfileProps) {
  const initialAuth = useMemo(getInitialAuth, []);
  const [auth, setAuth] = useState<AuthPayload | null>(initialAuth);
  const [view, setView] = useState<ViewState>(initialAuth ? "dashboard" : "welcome");
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
  const [membershipTier, setMembershipTier] = useState<MembershipTier>("basic");
  const [pendingTier, setPendingTier] = useState<MembershipTier | null>(null);

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
    setHandledForcedLogoutVersion(forcedLogoutVersion);
  }, [forcedLogoutVersion, handledForcedLogoutVersion, auth]);

  const handleAuthSuccess = useCallback((payload: AuthPayload) => {
    // 立即设置 token，确保数据加载时 token 已经可用
    setAuthToken(payload.token);
    setAuth(payload);
    setCachedEmail(payload.user.email);
    setView("dashboard");
  }, []);

  const userEmail = auth?.user.email ?? null;

  useEffect(() => {
    if (!userEmail) {
      setDisplayName("");
      setSignature(DEFAULT_SIGNATURE);
      clearStoredPreferences();
      return;
    }

    let cancelled = false;

    const loadPreferences = async () => {
      const stored = loadStoredPreferences(userEmail);
      if (stored) {
        setDisplayName(stored.displayName);
        setSignature(stored.signature);
      }

      try {
        const preferences = await fetchProfilePreferences();
        if (cancelled) {
          return;
        }
        const effectiveDisplayName =
          preferences.displayName.trim() ||
          preferences.defaultDisplayName.trim() ||
          formatName(userEmail);
        const effectiveSignature = preferences.signature.trim() || DEFAULT_SIGNATURE;
        setDisplayName(effectiveDisplayName);
        setSignature(effectiveSignature);
        storePreferences(userEmail, effectiveDisplayName, effectiveSignature);
      } catch (error) {
        if (!cancelled) {
          console.warn("[Echo] Failed to load profile preferences:", error);
          setDisplayName(formatName(userEmail));
          setSignature(DEFAULT_SIGNATURE);
          storePreferences(userEmail, formatName(userEmail), DEFAULT_SIGNATURE);
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
    };
  }, [userEmail]);

  const handleUpdateDisplayName = useCallback(
    async (value: string) => {
      setDisplayName(value);
      if (userEmail) {
        try {
          const preferences = await updateProfilePreferences({ displayName: value });
          setDisplayName(
            preferences.displayName.trim() ||
              preferences.defaultDisplayName.trim() ||
              formatName(userEmail),
          );
          setSignature(preferences.signature.trim() || DEFAULT_SIGNATURE);
          storePreferences(
            userEmail,
            preferences.displayName.trim() ||
              preferences.defaultDisplayName.trim() ||
              formatName(userEmail),
            preferences.signature.trim() || DEFAULT_SIGNATURE,
          );
        } catch (error) {
          console.warn("[Echo] Failed to update display name:", error);
          setDisplayName(formatName(userEmail));
          storePreferences(userEmail, formatName(userEmail), signature);
        }
      }
    },
    [userEmail, signature],
  );

  const handleUpdateSignature = useCallback(
    async (value: string) => {
      setSignature(value);
      if (userEmail) {
        try {
          const preferences = await updateProfilePreferences({ signature: value });
          setDisplayName(
            preferences.displayName.trim() ||
              preferences.defaultDisplayName.trim() ||
              formatName(userEmail),
          );
          setSignature(preferences.signature.trim() || DEFAULT_SIGNATURE);
          storePreferences(
            userEmail,
            preferences.displayName.trim() ||
              preferences.defaultDisplayName.trim() ||
              formatName(userEmail),
            preferences.signature.trim() || DEFAULT_SIGNATURE,
          );
        } catch (error) {
          console.warn("[Echo] Failed to update signature:", error);
          setSignature(DEFAULT_SIGNATURE);
          storePreferences(userEmail, displayName, DEFAULT_SIGNATURE);
        }
      }
    },
    [userEmail, displayName],
  );

  const handleLogout = useCallback(() => {
    setAuth(null);
    setView("welcome");
    setPendingTier(null);
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
        onBack={() => setView("membership-options")}
        onConfirm={({ tier }) => {
          setMembershipTier(tier);
          setPendingTier(null);
          setView("dashboard");
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
        onOpenAchievements={onOpenAchievements}
        pinnedAchievements={pinnedAchievements}
        recentAchievements={recentAchievements}
        membershipTier={membershipTier}
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
  onOpenAchievements?: () => void;
  pinnedAchievements: PinnedAchievement[];
  recentAchievements: RecentAchievement[];
  membershipTier: MembershipTier;
  onOpenMembership: () => void;
  artworks: Artwork[];
};

function ProfileDashboard({
  email,
  onLogout,
  onOpenSettings,
  displayName,
  signature,
  onOpenAchievements,
  pinnedAchievements,
  recentAchievements,
  membershipTier,
  onOpenMembership,
  artworks,
}: ProfileDashboardProps) {
  const effectiveName = displayName.trim() || formatName(email);
  const effectiveSignature = signature.trim() || DEFAULT_SIGNATURE;
  const membershipLabels: Record<MembershipTier, string> = {
    pending: "加入EchoDraw",
    basic: "Lite",
    premium: "Plus",
    premiumQuarter: "Plus",
  };
  const currentMembershipLabel = membershipLabels[membershipTier] ?? membershipLabels.pending;
  const [stats, setStats] = useState({
    totalCheckInDays: 0,
    totalDurationMinutes: 0,
    totalUploads: 0,
  });
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      // 确保 token 已设置后再加载数据
      if (!hasAuthToken()) {
        setIsStatsLoading(false);
        return;
      }

      setIsStatsLoading(true);

      try {
        const [checkInResult, uploadsResult] = await Promise.allSettled([
          fetchCheckInStatus(),
          fetchUserUploads(),
        ]);

        if (cancelled) {
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
          console.warn("[Echo] Failed to load check-in stats:", checkInResult.reason);
        }

        if (uploadsResult.status === "fulfilled") {
          const uploads = uploadsResult.value;
          nextStats.totalUploads = uploads.length;
          nextStats.totalDurationMinutes = uploads.reduce(
            (total, item) => total + (item.duration_minutes ?? 0),
            0,
          );
        } else {
          console.warn("[Echo] Failed to load upload stats:", uploadsResult.reason);
        }

        setStats(nextStats);
      } catch (error) {
        if (!cancelled) {
          console.warn("[Echo] Failed to load profile stats:", error);
          setStats({
            totalCheckInDays: 0,
            totalDurationMinutes: 0,
            totalUploads: 0,
          });
        }
      } finally {
        if (!cancelled) {
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
    };
  }, [email]);

  const totalDaysDisplay = isStatsLoading ? "--" : String(stats.totalCheckInDays);
  const totalUploadsDisplay = isStatsLoading ? "--" : String(stats.totalUploads);
  const totalDurationDisplay = isStatsLoading ? "--" : formatTotalDuration(stats.totalDurationMinutes);

  // 加载用户选择的"作品"
  const [featuredArtworks, setFeaturedArtworks] = useState<Artwork[]>([]);

  useEffect(() => {
    const featuredIds = loadFeaturedArtworkIds();
    const featured = artworks.filter((art) => featuredIds.includes(art.id));
    setFeaturedArtworks(featured);
  }, [artworks]);

  // 监听"作品"变化事件
  useEffect(() => {
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
          <button
            type="button"
            className={clsx("profile-membership-trigger", `profile-membership-trigger--${membershipTier}`)}
            onClick={onOpenMembership}
          >
            <span className="profile-membership-trigger__label">{currentMembershipLabel}</span>
          </button>
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

        <section className="profile-page__badges">
          {pinnedAchievements.length > 0 ? (
            pinnedAchievements.map((achievement) => (
              <span key={achievement.id}>{achievement.title}</span>
            ))
          ) : (
            <span className="profile-page__badge-placeholder">暂无展示成就</span>
          )}
        </section>

        <section className="profile-page__gallery">
          <header>
            <h2>作品</h2>
          </header>
          {featuredArtworks.length > 0 ? (
            <div className="profile-page__gallery-track">
              {featuredArtworks.map((art) => (
                <div key={art.id} className="profile-page__gallery-item">
                  <img src={art.imageSrc} alt={art.alt || art.title} />
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

        <section className="profile-page__achievements">
          <header>
            <div className="profile-page__achievement-heading">
              <h2>近期成就</h2>
              <p>记录最近完成的里程碑与灵感瞬间</p>
            </div>
            <div className="profile-page__achievement-divider" />
            {onOpenAchievements ? (
              <button type="button" className="profile-page__achievement-link" onClick={onOpenAchievements}>
                查看全部
              </button>
            ) : null}
          </header>
          <ul className="profile-page__achievement-list">
            {recentAchievements.length > 0 ? (
              recentAchievements.map((item, index) => (
                <li key={item.id} className="profile-page__achievement">
                  <span className="profile-page__achievement-index">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.subtitle}</p>
                    <p className="profile-page__achievement-date">{item.dateLabel}</p>
                  </div>
                </li>
              ))
            ) : (
              <li className="profile-page__achievement profile-page__achievement--placeholder">
                <span className="profile-page__achievement-index">--</span>
                <div>
                  <h3>尚未获得成就</h3>
                  <p>继续创作并完成任务，即可在此处看到最新成就记录。</p>
                </div>
              </li>
            )}
          </ul>
        </section>
      </main>

      <footer className="profile-page__footer">
        <button type="button" className="profile-page__logout" onClick={onLogout}>
          退出登录
        </button>
      </footer>
    </div>
  );
}

function formatName(email: string) {
  const name = email.split("@")[0];
  if (name.length === 0) {
    return "回声艺术家";
  }
  return name.slice(0, 1).toUpperCase() + name.slice(1);
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

