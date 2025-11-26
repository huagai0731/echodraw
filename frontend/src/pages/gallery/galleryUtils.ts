import type { Artwork } from "@/types/artwork";

/**
 * 验证 artwork 对象是否有效
 */
export function isValidArtwork(artwork: unknown): artwork is Artwork {
  if (!artwork || typeof artwork !== "object") {
    console.warn("[Gallery] Invalid artwork: not an object", artwork);
    return false;
  }

  const a = artwork as Partial<Artwork>;

  if (!a.id || typeof a.id !== "string" || a.id.trim() === "") {
    console.warn("[Gallery] Invalid artwork: missing or invalid id", a.id);
    return false;
  }

  // title 现在是可选的，允许空字符串
  if (a.title !== undefined && typeof a.title !== "string") {
    console.warn("[Gallery] Invalid artwork: title is not a string", a.title);
    return false;
  }

  if (!a.date || typeof a.date !== "string") {
    console.warn("[Gallery] Invalid artwork: missing or invalid date", a.date);
    return false;
  }

  if (typeof a.alt !== "string") {
    console.warn("[Gallery] Invalid artwork: missing or invalid alt", a.alt);
    return false;
  }

  if (!Array.isArray(a.tags)) {
    console.warn("[Gallery] Invalid artwork: tags is not an array", a.tags);
    return false;
  }

  if (!a.tags.every((tag) => typeof tag === "string")) {
    console.warn("[Gallery] Invalid artwork: tags contain non-string values", a.tags);
    return false;
  }

  return true;
}

/**
 * 获取作品的时间戳
 */
export function getArtworkTimestamp(artwork: Artwork): number {
  if (artwork.uploadedAt) {
    const uploadedAtTime = Date.parse(artwork.uploadedAt);
    if (!Number.isNaN(uploadedAtTime)) {
      return uploadedAtTime;
    }
  }
  if (artwork.uploadedDate) {
    const uploadedDateTime = Date.parse(`${artwork.uploadedDate}T00:00:00Z`);
    if (!Number.isNaN(uploadedDateTime)) {
      return uploadedDateTime;
    }
  }
  if (artwork.date) {
    const fallbackTime = Date.parse(artwork.date);
    if (!Number.isNaN(fallbackTime)) {
      return fallbackTime;
    }
  }
  return 0;
}

/**
 * 解析评分值
 */
export function parseRatingValue(source: string | undefined): number | null {
  if (!source) {
    return null;
  }
  const match = source.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*5$/);
  if (match) {
    const value = Number.parseFloat(match[1]);
    if (!Number.isNaN(value)) {
      return Math.min(Math.max(value * 20, 0), 100);
    }
    return null;
  }

  const numeric = Number.parseFloat(source);
  if (!Number.isNaN(numeric)) {
    if (numeric <= 5) {
      return Math.min(Math.max(numeric * 20, 0), 100);
    }
    return Math.min(Math.max(numeric, 0), 100);
  }

  return null;
}

/**
 * 解析时长（分钟）
 */
export function parseDurationMinutes(artwork: Artwork): number | null {
  if (typeof artwork.durationMinutes === "number" && Number.isFinite(artwork.durationMinutes)) {
    return Math.max(artwork.durationMinutes, 0);
  }
  if (typeof artwork.duration === "string" && artwork.duration.trim().length > 0) {
    const match = artwork.duration.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
    if (match) {
      const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
      const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        const total = hours * 60 + minutes;
        return total >= 0 ? total : null;
      }
    }
  }
  return null;
}

/**
 * 检查单个tag是否匹配作品
 */
function checkTagMatch(
  selectedTagName: string,
  artworkTagIdSet: Set<string>,
  tagNameToIdMap?: Map<string, string>
): boolean {
  const normalizedSelected = String(selectedTagName).trim();
  
  // 如果有tag映射，将名称转换为ID进行匹配
  if (tagNameToIdMap) {
    const tagId = tagNameToIdMap.get(normalizedSelected);
    if (tagId) {
      // 尝试直接匹配ID（字符串）
      if (artworkTagIdSet.has(tagId)) {
        return true;
      }
      // 尝试匹配数字ID（如果artwork.tags是数字）
      const numericId = Number.parseInt(tagId, 10);
      if (!Number.isNaN(numericId) && artworkTagIdSet.has(String(numericId))) {
        return true;
      }
    }
  }
  
  // 兼容：如果artwork.tags包含这个名称（旧数据可能是名称），直接匹配
  if (artworkTagIdSet.has(normalizedSelected)) {
    return true;
  }
  
  return false;
}

/**
 * 筛选作品（仅按标签筛选）
 */
export function filterArtworks(
  artworks: Artwork[],
  filters: {
    tags: string[];
    tagMode: "any" | "all";
  },
  tagNameToIdMap?: Map<string, string> // tag名称到ID的映射
): Artwork[] {
  const selectedTags = new Set(filters.tags);
  const hasTagFilter = selectedTags.size > 0;

  if (!hasTagFilter) {
    return artworks;
  }

  return artworks.filter((artwork) => {
    const artworkTags = artwork.tags || [];
    // artwork.tags现在是tag ID列表（可能是字符串或数字）
    // 统一转换为字符串进行比较
    const artworkTagIdSet = new Set(
      artworkTags
        .map((tag) => String(tag).trim())
        .filter((tag) => tag.length > 0)
    );
    
    // 如果作品没有任何tags，在有筛选条件时不显示
    if (artworkTagIdSet.size === 0) {
      return false;
    }
    
    // selectedTags是用户选择的tag名称列表（字符串数组，如["Abstract", "Sketch"]）
    // 需要将名称转换为ID，然后与artwork.tags（ID列表）进行匹配
    if (filters.tagMode === "all") {
      // AND逻辑：必须全部满足
      return Array.from(selectedTags).every((selectedTagName) => {
        return checkTagMatch(selectedTagName, artworkTagIdSet, tagNameToIdMap);
      });
    } else {
      // OR逻辑：只要包含任意一个就显示
      return Array.from(selectedTags).some((selectedTagName) => {
        return checkTagMatch(selectedTagName, artworkTagIdSet, tagNameToIdMap);
      });
    }
  });
}

/**
 * 获取套图首图映射（从服务器数据中获取，不依赖本地存储）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
export function getCollectionThumbnails(): Record<string, string> {
  // 套图信息完全依赖服务器，不读取本地存储
  // 首图信息应该从服务器返回的 artwork 数据中获取
  return {};
}

/**
 * 处理套图：每个套图只显示最新一张（或用户设置的首图）
 */
export function processCollectionArtworks(artworks: Artwork[]): Artwork[] {
  const collectionMap = new Map<string, Artwork[]>();
  const standaloneArtworks: Artwork[] = [];

  artworks.forEach((artwork) => {
    if (artwork.collectionId) {
      if (!collectionMap.has(artwork.collectionId)) {
        collectionMap.set(artwork.collectionId, []);
      }
      collectionMap.get(artwork.collectionId)!.push(artwork);
    } else {
      standaloneArtworks.push(artwork);
    }
  });

  const collectionCovers: Artwork[] = [];
  collectionMap.forEach((collectionArtworks, _collectionId) => {
    if (collectionArtworks.length > 0) {
      // 优先选择 collectionIndex === 1 的作品作为首图
      let selectedArtwork = collectionArtworks.find((a) => a.collectionIndex === 1);
      
      // 如果没有找到 collectionIndex === 1 的作品，按时间排序选择最新的
      if (!selectedArtwork) {
        collectionArtworks.sort((a, b) => {
          const timeA = getArtworkTimestamp(a);
          const timeB = getArtworkTimestamp(b);
          return timeB - timeA;
        });
        selectedArtwork = collectionArtworks[0];
      } else {
        // 如果找到了 collectionIndex === 1 的作品，按时间排序找到最新的作品用于时间戳
        collectionArtworks.sort((a, b) => {
          const timeA = getArtworkTimestamp(a);
          const timeB = getArtworkTimestamp(b);
          return timeB - timeA;
        });
      }
      
      // 创建一个新的artwork对象，使用套图内最新图片的时间戳
      // 这样可以确保即使首图改变，套图在列表中的位置也不会改变
      const coverArtwork: Artwork = {
        ...selectedArtwork,
        // 使用套图内最新图片的时间戳，而不是首图的时间戳
        uploadedAt: collectionArtworks[0].uploadedAt,
        uploadedDate: collectionArtworks[0].uploadedDate,
        date: collectionArtworks[0].date,
      };
      
      collectionCovers.push(coverArtwork);
    }
  });

  return [...collectionCovers, ...standaloneArtworks];
}

/**
 * 排序作品
 */
export function sortArtworks(
  artworks: Artwork[],
  sortBy: "newest" | "oldest" | "rating-high" | "rating-low" | "duration-high" | "duration-low"
): Artwork[] {
  const list = [...artworks];

  const compareByTimestamp = (a: Artwork, b: Artwork) => getArtworkTimestamp(a) - getArtworkTimestamp(b);
  const compareByRating = (a: Artwork, b: Artwork) => {
    const ratingA = parseRatingValue(a.rating) ?? -Infinity;
    const ratingB = parseRatingValue(b.rating) ?? -Infinity;
    return ratingA - ratingB;
  };
  const compareByDuration = (a: Artwork, b: Artwork) => {
    const durationA = parseDurationMinutes(a) ?? -Infinity;
    const durationB = parseDurationMinutes(b) ?? -Infinity;
    return durationA - durationB;
  };

  switch (sortBy) {
    case "oldest":
      list.sort(compareByTimestamp);
      break;
    case "rating-high":
      list.sort((a, b) => compareByRating(b, a));
      break;
    case "rating-low":
      list.sort(compareByRating);
      break;
    case "duration-high":
      list.sort((a, b) => compareByDuration(b, a));
      break;
    case "duration-low":
      list.sort(compareByDuration);
      break;
    case "newest":
    default:
      list.sort((a, b) => compareByTimestamp(b, a));
      break;
  }

  return list;
}

