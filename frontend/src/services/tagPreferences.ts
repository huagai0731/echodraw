import { fetchTags, type Tag } from "@/services/api";
import { hasAuthToken } from "@/services/api";

export type CustomTag = {
  id: number; // 后端Tag的ID
  name: string;
  hidden?: boolean; // 保留字段以兼容旧代码，但不再使用
};

export type TagPreferences = {
  hiddenPresetTagIds: string[]; // 保留字段以兼容旧代码，但不再使用
  hiddenCustomTagIds: number[]; // 保留字段以兼容旧代码，但不再使用
  customTags: CustomTag[]; // 所有标签列表（从后端获取）
};

export type TagOption = {
  id: number; // 统一使用数字ID
  name: string;
  isCustom: boolean; // 保留字段以兼容旧代码，现在都是true
  defaultActive: boolean;
};

const STORAGE_PREFIX = "echo.tag-preferences.";
export const TAG_PREFERENCES_CHANGED_EVENT = "echo:tag-preferences.changed";

const DEFAULT_PREFERENCES: TagPreferences = {
  hiddenPresetTagIds: [],
  hiddenCustomTagIds: [],
  customTags: [],
};

export function getDefaultTagPreferences(): TagPreferences {
  return {
    hiddenPresetTagIds: [],
    hiddenCustomTagIds: [],
    customTags: [],
  };
}

// 标签缓存（避免频繁请求后端）
let tagsCache: { tags: Tag[]; timestamp: number } | null = null;
const TAGS_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

/**
 * 从后端获取标签
 */
export async function loadTagsFromAPI(): Promise<{ tags: Tag[] }> {
  if (!hasAuthToken()) {
    return { tags: [] };
  }

  // 检查缓存
  if (tagsCache && Date.now() - tagsCache.timestamp < TAGS_CACHE_DURATION) {
    return { tags: tagsCache.tags };
  }

  try {
    const response = await fetchTags();
    // 统一处理所有标签（不再区分预设和自定义）
    const tags = response.custom_tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      isPreset: false, // 统一为false
      isHidden: false, // 不再支持隐藏
      displayOrder: tag.display_order,
      createdAt: tag.created_at,
      updatedAt: tag.updated_at,
    }));

    tagsCache = { tags, timestamp: Date.now() };
    return { tags };
  } catch (error) {
    console.warn("[Echo] Failed to load tags from API:", error);
    // 如果API失败，返回空数组（或使用缓存）
    if (tagsCache) {
      return { tags: tagsCache.tags };
    }
    return { tags: [] };
  }
}

/**
 * 清除标签缓存
 */
export function clearTagsCache() {
  tagsCache = null;
}

export function getStorageKey(email?: string | null) {
  const normalized = (email ?? "global").trim().toLowerCase();
  return `${STORAGE_PREFIX}${normalized}`;
}

export async function loadTagPreferencesAsync(email?: string | null): Promise<TagPreferences> {
  // 从后端获取标签
  const { tags } = await loadTagsFromAPI();
  
  // 构建标签列表（不再支持隐藏功能）
  const customTagsList: CustomTag[] = tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    hidden: false, // 不再支持隐藏
  }));

  return {
    hiddenPresetTagIds: [], // 不再使用
    hiddenCustomTagIds: [], // 不再使用
    customTags: customTagsList,
  };
}

export function loadTagPreferences(email?: string | null): TagPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(email));
    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }
    const parsed = JSON.parse(raw) as Partial<TagPreferences>;
    return normalizePreferences(parsed);
  } catch (error) {
    console.warn("[Echo] Failed to load tag preferences:", error);
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * 加载隐藏偏好（仅从localStorage）
 */
function loadHiddenPreferences(email?: string | null): {
  hiddenPresetTagIds: string[];
  hiddenCustomTagIds: number[];
} {
  if (typeof window === "undefined") {
    return { hiddenPresetTagIds: [], hiddenCustomTagIds: [] };
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(email));
    if (!raw) {
      return { hiddenPresetTagIds: [], hiddenCustomTagIds: [] };
    }
    const parsed = JSON.parse(raw) as Partial<TagPreferences>;
    return {
      hiddenPresetTagIds: Array.isArray(parsed.hiddenPresetTagIds)
        ? parsed.hiddenPresetTagIds.filter((id): id is string => typeof id === "string")
        : [],
      hiddenCustomTagIds: Array.isArray(parsed.hiddenCustomTagIds)
        ? parsed.hiddenCustomTagIds.filter((id): id is number => typeof id === "number")
        : [],
    };
  } catch (error) {
    console.warn("[Echo] Failed to load hidden preferences:", error);
    return { hiddenPresetTagIds: [], hiddenCustomTagIds: [] };
  }
}

export function saveTagPreferences(email: string | null, preferences: TagPreferences) {
  // 不再需要保存偏好到localStorage（标签管理通过后端API完成）
  // 保留函数以兼容旧代码，但不执行任何操作
}

export async function buildTagOptionsAsync(preferences: TagPreferences): Promise<TagOption[]> {
  // 从后端获取标签
  const { tags } = await loadTagsFromAPI();
  
  // 导入预设标签配置
  const { PRESET_TAGS } = await import("@/constants/tagPresets");
  
  // 如果未登录或没有标签，使用预设标签
  if (!hasAuthToken() || tags.length === 0) {
    // 为预设标签生成临时ID（负数，避免与真实ID冲突）
    return PRESET_TAGS.map((preset, index) => ({
      id: -(index + 1), // 使用负数作为临时ID
      name: preset.name,
      isCustom: false,
      defaultActive: preset.defaultActive,
    }));
  }
  
  // 构建标签选项（统一处理，不再区分预设和自定义）
  // 根据预设标签的defaultActive属性设置标签选项的defaultActive
  const options: TagOption[] = tags.map((tag) => {
    // 通过名称匹配预设标签
    const presetTag = PRESET_TAGS.find((preset) => preset.name === tag.name);
    return {
      id: tag.id,
      name: tag.name,
      isCustom: true, // 现在都是自定义标签
      defaultActive: presetTag?.defaultActive ?? false,
    };
  });

  return options;
}

export function buildTagOptions(preferences: TagPreferences): TagOption[] {
  // 统一处理所有标签（不再区分预设和自定义，不再支持隐藏）
  const options: TagOption[] = preferences.customTags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    isCustom: true, // 现在都是自定义标签
    defaultActive: false,
  }));

  return options;
}

export function createCustomTag(name: string): CustomTag {
  const trimmed = name.trim();
  // 注意：这个函数现在主要用于临时创建，实际创建应该通过API
  // 返回一个临时ID，实际创建后会从后端获取真实ID
  return {
    id: -Date.now(), // 临时负数ID，创建后会替换为真实ID
    name: trimmed,
    hidden: false,
  };
}

export function normalizePreferences(input?: Partial<TagPreferences> | TagPreferences | null): TagPreferences {
  if (!input || typeof input !== "object") {
    return getDefaultTagPreferences();
  }

  const customTags = Array.isArray(input.customTags)
    ? input.customTags
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          // 支持旧格式（字符串ID）和新格式（数字ID）
          const id = typeof item.id === "number" 
            ? item.id 
            : (typeof item.id === "string" && /^-?\d+$/.test(item.id))
            ? Number.parseInt(item.id, 10)
            : null;
          const name = typeof item.name === "string" ? item.name.trim() : "";
          if (id === null || !name) {
            return null;
          }
          const normalized: CustomTag = { id, name, hidden: false }; // 不再支持隐藏
          return normalized;
        })
        .filter((item): item is CustomTag => item !== null)
    : [];

  return {
    hiddenPresetTagIds: [], // 不再使用
    hiddenCustomTagIds: [], // 不再使用
    customTags,
  };
}


