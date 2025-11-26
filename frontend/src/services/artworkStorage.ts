import type { Artwork } from "@/types/artwork";

export const USER_ARTWORK_STORAGE_KEY = "echo.user-artworks.v1";
export const USER_ARTWORKS_CHANGED_EVENT = "echo:user-artworks-changed";

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isUserArtwork(artwork: Artwork) {
  return artwork.id.startsWith("art-");
}

function deriveUploadedDate(source: unknown): string | null {
  if (typeof source !== "string" || source.trim().length === 0) {
    return null;
  }

  const timestamp = Date.parse(source);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  try {
    const date = new Date(timestamp);
    return formatDateKey(date);
  } catch (error) {
    console.warn("[Echo] Failed to derive uploaded date:", error);
    return null;
  }
}

function sanitizeStoredArtworks(payload: unknown): Artwork[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const results: Artwork[] = [];

  for (const item of payload) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const imageSrc = typeof record.imageSrc === "string" ? record.imageSrc : "";

    // 修复：即使imageSrc为空字符串，也保留作品（图片无效时会显示占位符）
    // 只检查id是否有效
    if (!id.startsWith("art-")) {
      continue;
    }

    const uploadedAt =
      typeof record.uploadedAt === "string" && record.uploadedAt.trim().length > 0
        ? record.uploadedAt
        : null;
    const uploadedDateCandidate =
      typeof record.uploadedDate === "string" && record.uploadedDate.trim().length > 0
        ? record.uploadedDate
        : null;
    const uploadedDate = uploadedDateCandidate ?? deriveUploadedDate(uploadedAt);

    const rawDurationMinutes =
      typeof record.durationMinutes === "number" && Number.isFinite(record.durationMinutes)
        ? Math.max(record.durationMinutes, 0)
        : parseDurationString(record.duration);

    // 修复：确保date字段有默认值，避免验证失败
    let dateValue = typeof record.date === "string" && record.date ? record.date : "";
    if (!dateValue && uploadedDate) {
      // 如果没有date但有uploadedDate，尝试从uploadedDate生成
      try {
        const date = new Date(uploadedDate);
        if (!Number.isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = (date.getMonth() + 1).toString().padStart(2, "0");
          const day = date.getDate().toString().padStart(2, "0");
          dateValue = `${year}年${month}月${day}日`;
        }
      } catch {
        // 忽略日期解析错误
      }
    }
    if (!dateValue) {
      // 如果还是没有date，使用当前日期作为默认值
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, "0");
      const day = now.getDate().toString().padStart(2, "0");
      dateValue = `${year}年${month}月${day}日`;
    }

    const sanitized: Artwork = {
      id,
      title: typeof record.title === "string" ? record.title : "",
      date: dateValue,
      tags: Array.isArray(record.tags)
        ? record.tags.filter(
            (tag): tag is string => typeof tag === "string" && tag.trim().length > 0,
          )
        : ["新作"], // 如果没有标签，至少提供一个默认标签
      imageSrc,
      alt: typeof record.alt === "string" && record.alt ? record.alt : "作品预览",
      description: typeof record.description === "string" ? record.description : "",
      duration:
        typeof record.duration === "string" && record.duration ? record.duration : "0m",
      mood: typeof record.mood === "string" && record.mood ? record.mood : "未知",
      rating: typeof record.rating === "string" && record.rating ? record.rating : "--/5",
    };

    if (uploadedAt !== null) {
      sanitized.uploadedAt = uploadedAt;
    }
    if (uploadedDate !== null) {
      sanitized.uploadedDate = uploadedDate;
    }
    if (rawDurationMinutes !== null) {
      sanitized.durationMinutes = rawDurationMinutes;
    }
    // 套图相关字段
    if (typeof record.collectionId === "string" && record.collectionId.trim().length > 0) {
      sanitized.collectionId = record.collectionId;
    }
    if (typeof record.collectionName === "string" && record.collectionName.trim().length > 0) {
      sanitized.collectionName = record.collectionName;
    }
    if (typeof record.collectionIndex === "number" && Number.isFinite(record.collectionIndex)) {
      sanitized.collectionIndex = Math.max(1, Math.floor(record.collectionIndex));
    }
    if (typeof record.incrementalDurationMinutes === "number" && Number.isFinite(record.incrementalDurationMinutes)) {
      sanitized.incrementalDurationMinutes = Math.max(0, record.incrementalDurationMinutes);
    }

    results.push(sanitized);
  }

  return results;
}

function parseDurationString(source: unknown): number | null {
  if (typeof source !== "string") {
    return null;
  }
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  const regex = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i;
  const match = trimmed.match(regex);
  if (!match) {
    return null;
  }

  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  const total = hours * 60 + minutes;
  return total >= 0 ? total : null;
}

export function loadStoredArtworks(): Artwork[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(USER_ARTWORK_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeStoredArtworks(parsed);
  } catch (error) {
    console.warn("[Echo] Failed to parse stored artworks:", error);
    return [];
  }
}

export function persistStoredArtworks(artworks: Artwork[], silent = false) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = artworks.filter(isUserArtwork);
  const serialized = JSON.stringify(payload);

  try {
    const existing = window.localStorage.getItem(USER_ARTWORK_STORAGE_KEY);
    if (existing === serialized) {
      return;
    }

    window.localStorage.setItem(USER_ARTWORK_STORAGE_KEY, serialized);
    // silent=true 时不触发事件，避免在 refreshUserArtworks 内部调用时造成循环
    if (!silent) {
      window.dispatchEvent(new CustomEvent(USER_ARTWORKS_CHANGED_EVENT));
    }
  } catch (error) {
    console.warn("[Echo] Failed to persist artworks:", error);
  }
}

export function replaceTagNameForStoredArtworks(oldName: string, newName: string) {
  const source = loadStoredArtworks();
  if (oldName === newName || !oldName.trim()) {
    return;
  }

  let changed = false;
  const normalizedOld = oldName.trim();
  const normalizedNew = newName.trim();

  const updated: Artwork[] = source.map((item) => {
    if (!isUserArtwork(item) || !Array.isArray(item.tags) || item.tags.length === 0) {
      return item;
    }

    let tagChanged = false;
    const nextTags = item.tags.map((tag) => {
      const normalizedTag = tag.trim();
      if (normalizedTag === normalizedOld) {
        tagChanged = true;
        return normalizedNew;
      }
      return tag;
    });

    if (!tagChanged) {
      return item;
    }

    changed = true;
    return {
      ...item,
      tags: nextTags,
    };
  });

  if (changed) {
    persistStoredArtworks(updated);
  }
}

export function removeTagFromStoredArtworks(tagName: string) {
  const source = loadStoredArtworks();
  if (!tagName.trim()) {
    return;
  }

  const normalized = tagName.trim();
  let changed = false;

  const updated: Artwork[] = source.map((item) => {
    if (!isUserArtwork(item) || !Array.isArray(item.tags) || item.tags.length === 0) {
      return item;
    }

    const filtered = item.tags.filter((tag) => tag.trim() !== normalized);
    if (filtered.length === item.tags.length) {
      return item;
    }

    changed = true;
    return {
      ...item,
      tags: filtered,
    };
  });

  if (changed) {
    persistStoredArtworks(updated);
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("无法生成图片预览"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}


