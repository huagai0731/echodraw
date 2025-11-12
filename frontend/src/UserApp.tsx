import { useCallback, useEffect, useMemo, useState } from "react";

import BottomNav, { type NavId } from "@/components/BottomNav";
import Gallery, { INITIAL_ARTWORKS, type Artwork } from "@/pages/Gallery";
import Goals from "@/pages/Goals";
import Home from "@/pages/Home";
import Reports from "@/pages/Reports";
import Profile from "@/pages/Profile";
import ProfileAchievements from "@/pages/ProfileAchievements";
import { UNLOCKED_ACHIEVEMENTS } from "@/pages/achievementsData";
import Upload, { type UploadResult } from "@/pages/Upload";
import {
  API_BASE_URL,
  EXPLICIT_API_BASE_URL,
  createUserUpload,
  deleteUserUpload,
  fetchUserUploads,
  hasAuthToken,
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

type PageId = NavId | "upload" | "profile-achievements";

type PinnedAchievement = {
  id: string;
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
  const [pinnedAchievements, setPinnedAchievements] = useState<PinnedAchievement[]>(() =>
    UNLOCKED_ACHIEVEMENTS.filter((item) => item.defaultPinned).map((item) => ({
      id: item.id,
      title: item.profileTitle,
      subtitle: item.profileSubtitle,
    })),
  );

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

  useEffect(() => {
    if (!hasAuthToken()) {
      const stored = loadStoredArtworks();
      setUserArtworks(stored);
      return;
    }

    refreshUserArtworks().catch(() => {
      /* 已在函数内部处理 */
    });
  }, [refreshUserArtworks]);

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

  const handleTogglePinnedAchievement = useCallback(
    ({ id, title, subtitle, nextPinned }: { id: string; title: string; subtitle: string; nextPinned: boolean }) => {
      setPinnedAchievements((prev) => {
        if (nextPinned) {
          if (prev.some((item) => item.id === id)) {
            return prev;
          }
          return [...prev, { id, title, subtitle }];
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

  const recentAchievements = useMemo<RecentAchievement[]>(
    () =>
      [...UNLOCKED_ACHIEVEMENTS]
        .sort(
          (a, b) =>
            new Date(b.unlockedAtDate).getTime() - new Date(a.unlockedAtDate).getTime(),
        )
        .slice(0, 3)
        .map((item) => ({
          id: item.id,
          title: item.profileTitle,
          subtitle: item.profileSubtitle,
          dateLabel: item.profileDateLabel,
        })),
    [],
  );

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
        setActivePage(activeNav);
      } catch (error) {
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
        />
      ) : activeNav === "home" ? (
        <Home onOpenUpload={handleOpenUpload} />
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
    </div>
  );
}

export default UserApp;


