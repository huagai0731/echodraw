const FEATURED_ARTWORKS_STORAGE_KEY = "echodraw-featured-artworks";

export type FeaturedArtworkId = string;

/**
 * 加载用户选择的"作品"图片ID列表
 */
export function loadFeaturedArtworkIds(): FeaturedArtworkId[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(FEATURED_ARTWORKS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
    }
  } catch (error) {
    console.warn("[Echo] Failed to parse featured artwork IDs:", error);
  }

  return [];
}

/**
 * 保存用户选择的"作品"图片ID列表
 */
export function saveFeaturedArtworkIds(ids: FeaturedArtworkId[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const filtered = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
    window.localStorage.setItem(FEATURED_ARTWORKS_STORAGE_KEY, JSON.stringify(filtered));
    
    // 触发自定义事件，通知其他组件更新
    window.dispatchEvent(new CustomEvent("echodraw-featured-artworks-changed"));
  } catch (error) {
    console.warn("[Echo] Failed to save featured artwork IDs:", error);
  }
}

/**
 * 添加一个作品ID到"作品"列表
 */
export function addFeaturedArtworkId(id: FeaturedArtworkId): void {
  const current = loadFeaturedArtworkIds();
  if (!current.includes(id)) {
    saveFeaturedArtworkIds([...current, id]);
  }
}

/**
 * 从"作品"列表中移除一个作品ID
 */
export function removeFeaturedArtworkId(id: FeaturedArtworkId): void {
  const current = loadFeaturedArtworkIds();
  saveFeaturedArtworkIds(current.filter((item) => item !== id));
}

/**
 * 检查一个作品ID是否在"作品"列表中
 */
export function isFeaturedArtwork(id: FeaturedArtworkId): boolean {
  const current = loadFeaturedArtworkIds();
  return current.includes(id);
}







