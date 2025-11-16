import { useCallback, useEffect, useMemo, useState } from "react";

import BottomNav, { type NavId } from "@/components/BottomNav";
import Gallery, { INITIAL_ARTWORKS, type Artwork } from "@/pages/Gallery";
import Goals from "@/pages/Goals";
import Home from "@/pages/Home";
import MentalStateAssessment from "@/pages/MentalStateAssessment";
import Reports from "@/pages/Reports";
import Profile from "@/pages/Profile";
import ProfileAchievements from "@/pages/ProfileAchievements";
import TestList from "@/pages/TestList";
import PointsRecharge from "@/pages/PointsRecharge";
import ColorPerceptionTest from "@/pages/ColorPerceptionTest";
import ColorTestResults from "@/pages/ColorTestResults";
import type { AchievementGroupDefinition, AchievementLevelDefinition } from "@/pages/achievementsData";
import Upload, { type UploadResult } from "@/pages/Upload";
import {
  API_BASE_URL,
  AUTH_FORCED_LOGOUT_EVENT,
    AUTH_CHANGED_EVENT,
  EXPLICIT_API_BASE_URL,
  createUserUpload,
  deleteUserUpload,
  fetchUserAchievements,
  fetchUserUploads,
  hasAuthToken,
  type UserAchievementGroupRecord,
  type UserAchievementLevelRecord,
  type UserAchievementsSummary,
  type UserUploadRecord,
} from "@/services/api";
import {
  formatDateKey,
  isUserArtwork,
  loadStoredArtworks,
  persistStoredArtworks,
  readFileAsDataUrl,
  USER_ARTWORKS_CHANGED_EVENT,
  USER_ARTWORK_STORAGE_KEY,
} from "@/services/artworkStorage";

import "./App.css";

const LOCAL_LAST_CHECKIN_KEY = "echo-last-checkin-date";

function getChinaDateIsoFrom(date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value ?? "0000";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

function sanitizeBaseUrl(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\/+$/, "");
}

function stripTrailingApiSegment(baseUrl: string): string {
  if (!baseUrl) {
    return baseUrl;
  }
  return baseUrl.replace(/\/api(?:\/)?$/i, "");
}

function isLocalhostName(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.") ||
    hostname.endsWith(".localhost")
  );
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch (_error) {
    return null;
  }
}

function resolveHttpCandidateBase(candidate: string): string {
  if (!candidate) {
    return "";
  }

  let prepared = stripTrailingApiSegment(candidate);
  if (!prepared) {
    return "";
  }

  let urlString = prepared;
  if (prepared.startsWith("//")) {
    if (typeof window === "undefined" || !window.location?.protocol) {
      return "";
    }
    urlString = `${window.location.protocol}${prepared}`;
  } else if (!/^[a-z][a-z\d+\-.]*:/i.test(prepared)) {
    // 未包含协议时无法构建绝对 URL。
    return "";
  }

  const parsed = safeParseUrl(urlString);
  if (!parsed) {
    return "";
  }

  if (
    isLocalhostName(parsed.hostname) &&
    typeof window !== "undefined" &&
    window.location?.hostname &&
    !isLocalhostName(window.location.hostname)
  ) {
    parsed.hostname = window.location.hostname;
  }

  return parsed.origin;
}

function deriveAssetBaseUrl(): string {
  const explicitAssetBase = sanitizeBaseUrl(import.meta.env.VITE_ASSET_BASE_URL ?? "");
  if (explicitAssetBase) {
    return explicitAssetBase;
  }

  const candidates = [
    sanitizeBaseUrl(EXPLICIT_API_BASE_URL ?? ""),
    sanitizeBaseUrl(API_BASE_URL ?? ""),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const resolved = resolveHttpCandidateBase(candidate);
    if (resolved) {
      return resolved;
    }
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "";
}

const ASSET_BASE_URL = deriveAssetBaseUrl();

function joinWithAssetBase(pathname: string): string {
  const normalizedPath = pathname.startsWith("/")
    ? pathname
    : `/${pathname.replace(/^\/+/, "")}`;
  if (!ASSET_BASE_URL) {
    return normalizedPath;
  }
  return `${ASSET_BASE_URL}${normalizedPath}`;
}

const LOCALHOST_MEDIA_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/(media\/.*)$/i;
const RELATIVE_MEDIA_PATH = /^\/?media\//i;

function resolveAssetUrl(source?: string | null): string {
  if (!source) {
    return "";
  }
  const trimmed = source.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (/^[a-z][a-z\d+\-.]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    const match = trimmed.match(LOCALHOST_MEDIA_URL);
    if (match) {
      return joinWithAssetBase(match[1]);
    }
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    if (RELATIVE_MEDIA_PATH.test(trimmed)) {
      return joinWithAssetBase(trimmed);
    }
    return ASSET_BASE_URL ? `${ASSET_BASE_URL}${trimmed}` : trimmed;
  }
  if (RELATIVE_MEDIA_PATH.test(trimmed)) {
    return joinWithAssetBase(trimmed);
  }
  return ASSET_BASE_URL ? `${ASSET_BASE_URL}/${trimmed}` : trimmed;
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getStringField(source: Record<string, unknown>, key: string): string | null {
  const raw = source[key];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function formatAchievementDate(iso?: string | null): { label: string; iso: string | null } {
  if (!iso) {
    return { label: "待解锁", iso: null };
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { label: "待解锁", iso: null };
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return {
    label: `${year}.${month}.${day}`,
    iso: date.toISOString().slice(0, 10),
  };
}

function mapAchievementLevel(raw: UserAchievementLevelRecord): AchievementLevelDefinition {
  const metadata = ensureRecord(raw.metadata);
  const condition = ensureRecord(raw.condition);
  const conditionText = getStringField(metadata, "condition_text") || getStringField(condition, "text");
  const description =
    (raw.description && raw.description.trim()) || conditionText || "持续创作以解锁更多故事。";
  const dateInfo = formatAchievementDate(raw.unlocked_at);
  const unlockedLabel = raw.unlocked_at ? `解锁于 ${dateInfo.label}` : "待解锁";

  return {
    id: raw.slug || `ach-${raw.id}`,
    slug: raw.slug || `ach-${raw.id}`,
    level: typeof raw.level === "number" && Number.isFinite(raw.level) ? raw.level : 1,
    name: raw.name || "未命名成就",
    description,
    displayOrder: undefined,
    category: raw.category ?? null,
    icon: raw.icon ?? null,
    metadata,
    condition,
    conditionText,
    unlockedAtLabel: unlockedLabel,
    unlockedAtDate: dateInfo.iso,
  };
}

function mapAchievementGroup(raw: UserAchievementGroupRecord): AchievementGroupDefinition {
  const metadata = ensureRecord(raw.metadata);
  const summaryRecord = raw.summary ?? {
    level_count: Array.isArray(raw.levels) ? raw.levels.length : 0,
    highest_unlocked_level: 0,
    unlocked_levels: [],
  };

  const levels = Array.isArray(raw.levels) ? raw.levels.map(mapAchievementLevel) : [];
  const unlockedLevels = Array.isArray(summaryRecord.unlocked_levels)
    ? summaryRecord.unlocked_levels
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  return {
    id: String(raw.id),
    slug: raw.slug || `group-${raw.id}`,
    name: raw.name || "未命名成就组",
    description: raw.description || "",
    displayOrder: raw.display_order ?? undefined,
    category: raw.category ?? null,
    icon: raw.icon ?? null,
    metadata,
    summary: {
      levelCount: summaryRecord.level_count ?? levels.length,
      highestUnlockedLevel: summaryRecord.highest_unlocked_level ?? 0,
      unlockedLevels,
    },
    levels,
  };
}

function isLevelUnlocked(level: AchievementLevelDefinition): boolean {
  return Boolean(level.unlockedAtDate);
}

function getHighestUnlockedLevel(group: AchievementGroupDefinition): AchievementLevelDefinition | null {
  if (!group.levels || group.levels.length === 0) {
    return null;
  }
  const unlocked = group.levels
    .filter(isLevelUnlocked)
    .sort((a, b) => b.level - a.level);
  return unlocked[0] ?? null;
}

function buildGroupPinnedId(group: AchievementGroupDefinition): string {
  return `group:${group.slug}`;
}

function buildStandalonePinnedId(level: AchievementLevelDefinition): string {
  return `standalone:${level.slug}`;
}

function resolvePinnedKind(id: string): "group" | "standalone" {
  return id.startsWith("group:") ? "group" : "standalone";
}

function formatLevelSubtitle(level: AchievementLevelDefinition): string {
  return level.conditionText || level.description || "持续创作以解锁更多故事。";
}


type PageId = NavId | "upload" | "profile-achievements" | "test-list" | "mental-state-assessment" | "points-recharge" | "color-perception-test" | "color-test-results";

type PinnedAchievement = {
  id: string;
  kind: "group" | "standalone";
  title: string;
  subtitle: string;
};

type RecentAchievement = {
  id: string;
  title: string;
  subtitle: string;
  dateLabel: string;
};

function UserApp() {
  const [activeNav, setActiveNav] = useState<NavId>("home");
  const [activePage, setActivePage] = useState<PageId>("home");
  const [userArtworks, setUserArtworks] = useState<Artwork[]>([]);
  const [pinnedAchievements, setPinnedAchievements] = useState<PinnedAchievement[]>([]);
  const [achievementGroups, setAchievementGroups] = useState<AchievementGroupDefinition[]>([]);
  const [standaloneAchievements, setStandaloneAchievements] = useState<AchievementLevelDefinition[]>([]);
  const [achievementSummary, setAchievementSummary] = useState<UserAchievementsSummary | null>(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [forcedLogoutVersion, setForcedLogoutVersion] = useState(0);
  const [forcedLogoutVisible, setForcedLogoutVisible] = useState(false);
  const [colorTestResultData, setColorTestResultData] = useState<{
    selectedOptionId: string;
    mainImageUrl: string;
    options: Array<{
      id: string;
      imageUrl: string;
      percentage: number;
    }>;
  } | null>(null);

  const combinedArtworks = useMemo(
    () => [...userArtworks, ...INITIAL_ARTWORKS],
    [userArtworks],
  );

  const formatArtworkDate = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}年${month}月${day}日`;
  }, []);

  const formatDuration = useCallback((minutesTotal: number) => {
    const hours = Math.floor(minutesTotal / 60);
    const minutes = minutesTotal % 60;
    if (hours === 0) {
      return `${minutes} 分钟`;
    }
    if (minutes === 0) {
      return `${hours} 小时`;
    }
    return `${hours} 小时 ${minutes} 分钟`;
  }, []);

  const mapUploadRecordToArtwork = useCallback(
    (record: UserUploadRecord, fallbackImage?: string | null): Artwork => {
      const uploadedAt = record.uploaded_at || new Date().toISOString();
      const uploadedDate = new Date(uploadedAt);
      const durationMinutes = record.duration_minutes ?? 0;
      const ratingLabel =
        typeof record.self_rating === "number"
          ? `${(record.self_rating / 20).toFixed(1)}/5`
          : "--/5";
      const tags = Array.isArray(record.tags) && record.tags.length > 0 ? record.tags : ["新作"];
      const resolvedImage = resolveAssetUrl(record.image);
      const imageSrc = resolvedImage || fallbackImage || "";
      const title = record.title?.trim() || "未命名作品";
      const description = record.description?.trim() || "尚未添加简介。";

      return {
        id: `art-${record.id}`,
        title,
        date: formatArtworkDate(uploadedDate),
        tags,
        imageSrc,
        alt: `${title} 作品预览`,
        description,
        duration: formatDuration(durationMinutes),
        mood: record.mood_label || "未知",
        rating: ratingLabel,
        uploadedAt,
        uploadedDate: formatDateKey(uploadedDate),
        durationMinutes: record.duration_minutes ?? null,
      };
    },
    [formatArtworkDate, formatDuration],
  );

  const refreshUserArtworks = useCallback(async () => {
    try {
      const records = await fetchUserUploads();
      const mapped = records.map((item) => mapUploadRecordToArtwork(item));
      setUserArtworks(mapped);
      persistStoredArtworks(mapped);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 401 && status !== 403) {
        console.warn("[Echo] Failed to load remote artworks:", error);
      }
      const stored = loadStoredArtworks();
      setUserArtworks(stored);
    }
  }, [mapUploadRecordToArtwork]);

  const refreshUserAchievements = useCallback(async () => {
    setAchievementsLoading(true);
    try {
      const response = await fetchUserAchievements();
      const groups = Array.isArray(response.groups)
        ? response.groups.map((item: UserAchievementGroupRecord) => mapAchievementGroup(item))
        : [];
      const standalone = Array.isArray(response.standalone)
        ? response.standalone.map((item: UserAchievementLevelRecord) => mapAchievementLevel(item))
        : [];
      setAchievementGroups(groups);
      setStandaloneAchievements(standalone);
      setAchievementSummary(response.summary ?? null);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 401 && status !== 403) {
        console.warn("[Echo] Failed to load achievements:", error);
      }
      setAchievementGroups([]);
      setStandaloneAchievements([]);
      setAchievementSummary(null);
    } finally {
      setAchievementsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasAuthToken()) {
      const stored = loadStoredArtworks();
      setUserArtworks(stored);
      refreshUserAchievements().catch(() => {
        /* 已在函数内部处理 */
      });
      return;
    }

    refreshUserArtworks().catch(() => {
      /* 已在函数内部处理 */
    });
    refreshUserAchievements().catch(() => {
      /* 已在函数内部处理 */
    });
  }, [refreshUserArtworks, refreshUserAchievements]);

  useEffect(() => {
    setPinnedAchievements((prev) => {
      if (achievementGroups.length === 0 && standaloneAchievements.length === 0) {
        return [];
      }

      const candidates: PinnedAchievement[] = [];
      const availability = new Map<string, PinnedAchievement>();

      for (const group of achievementGroups) {
        const representative = getHighestUnlockedLevel(group);
        if (!representative) {
          continue;
        }
        const id = buildGroupPinnedId(group);
        const entry: PinnedAchievement = {
          id,
          kind: "group",
          title: group.name,
          subtitle: formatLevelSubtitle(representative),
        };
        candidates.push(entry);
        availability.set(id, entry);
      }

      for (const level of standaloneAchievements) {
        if (!isLevelUnlocked(level)) {
          continue;
        }
        const id = buildStandalonePinnedId(level);
        const entry: PinnedAchievement = {
          id,
          kind: "standalone",
          title: level.name,
          subtitle: formatLevelSubtitle(level),
        };
        candidates.push(entry);
        availability.set(id, entry);
      }

      const filtered = prev.filter((item) => availability.has(item.id));
      if (filtered.length > 0) {
        return filtered;
      }

      return candidates.slice(0, 3);
    });
  }, [achievementGroups, standaloneAchievements]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== USER_ARTWORK_STORAGE_KEY) {
        return;
      }
      refreshUserArtworks().catch(() => {
        /* 已在函数内部处理 */
      });
    };

    const handleArtworksChanged = (_event: Event) => {
      refreshUserArtworks().catch(() => {
        /* 已在函数内部处理 */
      });
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    };
  }, [refreshUserArtworks]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleForcedLogout = (event: Event) => {
      setUserArtworks([]);
      persistStoredArtworks([]);
      setAchievementGroups([]);
      setStandaloneAchievements([]);
      setAchievementSummary(null);
      setPinnedAchievements([]);
      setForcedLogoutVersion((prev) => prev + 1);
      setActiveNav("profile");
      setActivePage("profile");
      setForcedLogoutVisible(true);

      if ("detail" in event) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = (event as any).detail as { reason?: string; timestamp?: number } | undefined;
        if (detail?.timestamp) {
          console.info(
            "[Echo] Forced logout triggered",
            new Date(detail.timestamp).toISOString(),
            detail.reason ?? "unknown",
          );
        }
      }
    };

    window.addEventListener(AUTH_FORCED_LOGOUT_EVENT, handleForcedLogout);
    return () => {
      window.removeEventListener(AUTH_FORCED_LOGOUT_EVENT, handleForcedLogout);
    };
  }, []);

  // 监听登录态变化：当 token 写入/清除时，刷新用户数据，保证图片 URL（含 token）与权限数据最新
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleAuthChanged = () => {
      refreshUserArtworks().catch(() => {
        /* 已在函数内部处理 */
      });
      refreshUserAchievements().catch(() => {
        /* 已在函数内部处理 */
      });
    };
    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    };
  }, [refreshUserArtworks, refreshUserAchievements]);

  const handleOpenUpload = useCallback(() => {
    setActivePage("upload");
  }, []);

  const handleCloseUpload = useCallback(() => {
    setActivePage((prev) => (prev === "upload" ? activeNav : prev));
  }, [activeNav]);

  const handleOpenProfileAchievements = useCallback(() => {
    setActiveNav("profile");
    setActivePage("profile-achievements");
  }, []);

  const handleOpenTestList = useCallback(() => {
    setActivePage("test-list");
  }, []);

  const handleCloseTestList = useCallback(() => {
    setActivePage(activeNav);
  }, [activeNav]);

  const handleOpenMentalStateAssessment = useCallback(() => {
    setActivePage("mental-state-assessment");
  }, []);

  const handleCloseMentalStateAssessment = useCallback(() => {
    setActivePage("test-list");
  }, []);

  const handleOpenPointsRecharge = useCallback(() => {
    setActivePage("points-recharge");
  }, []);

  const handleClosePointsRecharge = useCallback(() => {
    setActivePage("test-list");
  }, []);

  const handleOpenColorPerceptionTest = useCallback(() => {
    setActivePage("color-perception-test");
  }, []);

  const handleCloseColorPerceptionTest = useCallback(() => {
    setActivePage(activeNav);
  }, [activeNav]);

  const handleColorTestComplete = useCallback(
    (result: {
      selectedOptionId: string;
      mainImageUrl: string;
      options: Array<{
        id: string;
        imageUrl: string;
        percentage: number;
      }>;
    }) => {
      setColorTestResultData(result);
      setActivePage("color-test-results");
    },
    [],
  );

  const handleCloseColorTestResults = useCallback(() => {
    setActivePage(activeNav);
    setColorTestResultData(null);
  }, [activeNav]);

  const handleColorTestNext = useCallback(() => {
    // 下一题逻辑：返回测试页面
    setActivePage("color-perception-test");
    setColorTestResultData(null);
  }, []);

  const handleTogglePinnedAchievement = useCallback(
    ({ id, title, subtitle, nextPinned }: { id: string; title: string; subtitle: string; nextPinned: boolean }) => {
      const kind = resolvePinnedKind(id);
      setPinnedAchievements((prev) => {
        if (nextPinned) {
          if (prev.some((item) => item.id === id)) {
            return prev;
          }
          return [...prev, { id, kind, title, subtitle }];
        }
        return prev.filter((item) => item.id !== id);
      });
    },
    [],
  );

  const pinnedAchievementIds = useMemo(
    () => pinnedAchievements.map((achievement) => achievement.id),
    [pinnedAchievements],
  );

  const recentAchievements = useMemo<RecentAchievement[]>(() => {
    const entries: Array<{
      id: string;
      title: string;
      subtitle: string;
      dateIso: string | null;
      dateLabel: string;
    }> = [];

    for (const group of achievementGroups) {
      const representative = getHighestUnlockedLevel(group);
      if (!representative) {
        continue;
      }
      entries.push({
        id: buildGroupPinnedId(group),
        title: group.name,
        subtitle: formatLevelSubtitle(representative),
        dateIso: representative.unlockedAtDate,
        dateLabel: representative.unlockedAtLabel,
      });
    }

    for (const level of standaloneAchievements) {
      if (!isLevelUnlocked(level)) {
        continue;
      }
      entries.push({
        id: buildStandalonePinnedId(level),
        title: level.name,
        subtitle: formatLevelSubtitle(level),
        dateIso: level.unlockedAtDate,
        dateLabel: level.unlockedAtLabel,
      });
    }

    entries.sort((a, b) => {
      const timeA = a.dateIso ? new Date(a.dateIso).getTime() : 0;
      const timeB = b.dateIso ? new Date(b.dateIso).getTime() : 0;
      const safeA = Number.isFinite(timeA) ? timeA : 0;
      const safeB = Number.isFinite(timeB) ? timeB : 0;
      return safeB - safeA;
    });

    return entries.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      dateLabel: item.dateLabel,
    }));
  }, [achievementGroups, standaloneAchievements]);

  const handleUploadSave = useCallback(
    async (result: UploadResult) => {
      const finalizeLocal = (imageSrc: string | null) => {
        if (!imageSrc) {
          console.warn("[Echo] 无法生成作品预览，已取消保存。");
          if (typeof window !== "undefined" && typeof window.alert === "function") {
            window.alert("无法保存作品，请稍后重试。");
          }
          return;
        }

        const today = new Date();
        const ratingValue = (result.rating / 20).toFixed(1);
        const uploadedAt = today.toISOString();
        const uploadedDate = formatDateKey(today);

        const localArtwork: Artwork = {
          id: `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          title: result.title || "未命名作品",
          date: formatArtworkDate(today),
          tags: result.tags.length > 0 ? result.tags : ["新作"],
          imageSrc,
          alt: result.title ? `${result.title} 作品预览` : "新上传的作品",
          description: result.description || "尚未添加简介。",
          duration: formatDuration(result.durationMinutes),
          mood: result.mood,
          rating: `${ratingValue}/5`,
          uploadedAt,
          uploadedDate,
          durationMinutes: result.durationMinutes,
        };

        setUserArtworks((prev) => {
          const next = [localArtwork, ...prev.filter((item) => item.id !== localArtwork.id)];
          persistStoredArtworks(next);
          return next;
        });
        try {
          const chinaIso = getChinaDateIsoFrom(today);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(LOCAL_LAST_CHECKIN_KEY, chinaIso);
          }
        } catch {
          // ignore storage errors
        }
        setActivePage(activeNav);
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert("网络暂不可用，作品已暂存于本地。");
        }
      };

      try {
        const record = await createUserUpload({
          file: result.file,
          title: result.title,
          description: result.description,
          tags: result.tags,
          moodLabel: result.mood,
          selfRating: result.rating,
          durationMinutes: result.durationMinutes,
        });
        const artwork = mapUploadRecordToArtwork(record, result.previewDataUrl);
        setUserArtworks((prev) => {
          const next = [artwork, ...prev.filter((item) => item.id !== artwork.id)];
          persistStoredArtworks(next);
          return next;
        });
        try {
          const chinaIso = getChinaDateIsoFrom(new Date(record.uploaded_at));
          if (typeof window !== "undefined") {
            window.localStorage.setItem(LOCAL_LAST_CHECKIN_KEY, chinaIso);
          }
        } catch {
          // ignore storage errors
        }
        setActivePage(activeNav);
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          setForcedLogoutVisible(true);
          return;
        }
        console.warn("[Echo] Failed to upload artwork to server:", error);
        if (result.previewDataUrl) {
          finalizeLocal(result.previewDataUrl);
        } else {
          readFileAsDataUrl(result.file)
            .then((imageSrc) => finalizeLocal(imageSrc))
            .catch((readError) => {
              console.warn("[Echo] Failed to prepare upload preview:", readError);
              finalizeLocal(null);
            });
        }
      }
    },
    [activeNav, formatArtworkDate, formatDuration, mapUploadRecordToArtwork],
  );

  const handleDeleteArtwork = useCallback(
    async (target: Artwork) => {
      if (!isUserArtwork(target)) {
        if (typeof window !== "undefined" && typeof window.alert === "function") {
          window.alert("预设作品暂不支持删除。");
        }
        return;
      }

      const rawId = target.id.replace(/^art-/, "");
      const uploadId = Number.parseInt(rawId, 10);
      let shouldRemove = true;

      if (!Number.isNaN(uploadId)) {
        try {
          await deleteUserUpload(uploadId);
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status !== 404 && status !== 401) {
            shouldRemove = false;
            console.warn("[Echo] 删除作品失败:", error);
            if (typeof window !== "undefined" && typeof window.alert === "function") {
              window.alert("删除失败，请稍后重试。");
            }
          }
        }
      }

      if (!shouldRemove) {
        return;
      }

      setUserArtworks((prev) => {
        const next = prev.filter((item) => item.id !== target.id);
        persistStoredArtworks(next);
        return next;
      });
    },
    [],
  );

  const handleEditArtwork = useCallback((target: Artwork) => {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(`“${target.title}” 的编辑功能即将上线，敬请期待。`);
    } else {
      console.info("[Echo] Edit requested for artwork:", target.id);
    }
  }, []);

  if (import.meta.env.DEV) {
    console.info("[Echo] API base URL:", (window as unknown as { __ECHO_API_BASE__?: string }).__ECHO_API_BASE__);
  }

  return (
    <div className="app-shell">
      {activePage === "upload" ? (
        <Upload onClose={handleCloseUpload} onSave={handleUploadSave} />
      ) : activePage === "profile-achievements" ? (
        <ProfileAchievements
          onBack={() => setActivePage("profile")}
          pinnedAchievementIds={pinnedAchievementIds}
          onTogglePinned={handleTogglePinnedAchievement}
          groups={achievementGroups}
          standalone={standaloneAchievements}
          summary={achievementSummary}
          loading={achievementsLoading}
        />
      ) : activePage === "test-list" ? (
        <TestList
          onBack={handleCloseTestList}
          onSelectTest={handleOpenMentalStateAssessment}
          onOpenPointsRecharge={handleOpenPointsRecharge}
        />
      ) : activePage === "points-recharge" ? (
        <PointsRecharge onBack={handleClosePointsRecharge} />
      ) : activePage === "mental-state-assessment" ? (
        <MentalStateAssessment onBack={handleCloseMentalStateAssessment} />
      ) : activePage === "color-perception-test" ? (
        <ColorPerceptionTest onBack={handleCloseColorPerceptionTest} onComplete={handleColorTestComplete} />
      ) : activePage === "color-test-results" ? (
        <ColorTestResults
          onBack={handleCloseColorTestResults}
          onNext={handleColorTestNext}
          testData={colorTestResultData || undefined}
        />
      ) : activeNav === "home" ? (
        <Home
          onOpenUpload={handleOpenUpload}
          onOpenMentalStateAssessment={handleOpenTestList}
          onOpenColorPerceptionTest={handleOpenColorPerceptionTest}
        />
      ) : activeNav === "gallery" ? (
        <Gallery
          artworks={combinedArtworks}
          onOpenUpload={handleOpenUpload}
          onDeleteArtwork={handleDeleteArtwork}
          onEditArtwork={handleEditArtwork}
        />
      ) : activeNav === "goals" ? (
        <Goals />
      ) : activeNav === "reports" ? (
        <Reports artworks={userArtworks} />
      ) : (
        <Profile
          forcedLogoutVersion={forcedLogoutVersion}
          onOpenAchievements={handleOpenProfileAchievements}
          pinnedAchievements={pinnedAchievements}
          recentAchievements={recentAchievements}
        />
      )}
      <BottomNav
        activeId={activeNav}
        onChange={(id) => {
          setActiveNav(id);
          setActivePage(id);
        }}
      />
      {forcedLogoutVisible ? (
        <div className="forced-logout-overlay">
          <div className="forced-logout-dialog">
            <h2>登录状态已失效</h2>
            <p>检测到该账号已在其他设备登录，本设备会自动退出，请重新登录后继续使用。</p>
            <button
              type="button"
              onClick={() => {
                setForcedLogoutVisible(false);
                setActiveNav("profile");
                setActivePage("profile");
              }}
            >
              去登录
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default UserApp;


