import { fetchFeaturedArtworkIds, updateFeaturedArtworkIds, hasAuthToken } from "@/services/api";

const FEATURED_ARTWORKS_STORAGE_KEY = "echodraw-featured-artworks";

export type FeaturedArtworkId = string;

/**
 * 从服务器加载用户选择的"作品"图片ID列表
 */
export async function loadFeaturedArtworkIdsFromServer(): Promise<FeaturedArtworkId[]> {
  if (!hasAuthToken()) {
    return [];
  }

  try {
    const ids = await fetchFeaturedArtworkIds();
    // 同时更新localStorage作为缓存
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(FEATURED_ARTWORKS_STORAGE_KEY, JSON.stringify(ids));
      } catch (error) {
        console.warn("[Echo] Failed to cache featured artwork IDs to localStorage:", error);
      }
    }
    return ids;
  } catch (error) {
    console.warn("[Echo] Failed to load featured artwork IDs from server:", error);
    // 如果服务器请求失败，尝试从localStorage加载
    return loadFeaturedArtworkIds();
  }
}

/**
 * 从localStorage加载用户选择的"作品"图片ID列表（仅作为缓存）
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
 * 保存用户选择的"作品"图片ID列表（同时保存到服务器和localStorage）
 */
export async function saveFeaturedArtworkIds(ids: FeaturedArtworkId[]): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const filtered = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  
  // 先保存到localStorage（立即更新UI）
  try {
    window.localStorage.setItem(FEATURED_ARTWORKS_STORAGE_KEY, JSON.stringify(filtered));
    // 触发自定义事件，通知其他组件更新
    window.dispatchEvent(new CustomEvent("echodraw-featured-artworks-changed"));
  } catch (error) {
    console.warn("[Echo] Failed to save featured artwork IDs to localStorage:", error);
  }

  // 如果已登录，同时保存到服务器
  if (hasAuthToken()) {
    try {
      await updateFeaturedArtworkIds(filtered);
    } catch (error) {
      console.error("[Echo] Failed to save featured artwork IDs to server:", error);
      // 即使服务器保存失败，也不影响localStorage的保存
    }
  }
}

/**
 * 添加一个作品ID到"作品"列表
 */
export async function addFeaturedArtworkId(id: FeaturedArtworkId): Promise<void> {
  const current = loadFeaturedArtworkIds();
  if (!current.includes(id)) {
    await saveFeaturedArtworkIds([...current, id]);
  }
}

/**
 * 从"作品"列表中移除一个作品ID
 */
export async function removeFeaturedArtworkId(id: FeaturedArtworkId): Promise<void> {
  const current = loadFeaturedArtworkIds();
  await saveFeaturedArtworkIds(current.filter((item) => item !== id));
}

/**
 * 检查一个作品ID是否在"作品"列表中
 */
export function isFeaturedArtwork(id: FeaturedArtworkId): boolean {
  const current = loadFeaturedArtworkIds();
  return current.includes(id);
}







