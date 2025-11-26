import { PRESET_TAGS, type TagPreset } from "@/constants/tagPresets";
import { fetchTags, type Tag } from "@/services/api";
import { hasAuthToken } from "@/services/api";

export type CustomTag = {
  id: number; // 改为数字ID（后端Tag的ID）
  name: string;
  hidden?: boolean;
};

export type TagPreferences = {
  hiddenPresetTagIds: string[]; // 预设标签的ID（字符串，来自PRESET_TAGS）
  hiddenCustomTagIds: number[]; // 自定义标签的ID（数字，来自后端）
  customTags: CustomTag[]; // 自定义标签列表（从后端获取）
};

export type TagOption = {
  id: string | number; // 预设标签用字符串ID，自定义标签用数字ID
  name: string;
  isCustom: boolean;
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
let tagsCache: { presetTags: Tag[]; customTags: Tag[]; timestamp: number } | null = null;
const TAGS_CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

/**
 * 从后端获取标签
 */
export async function loadTagsFromAPI(): Promise<{ presetTags: Tag[]; customTags: Tag[] }> {
  if (!hasAuthToken()) {
    return { presetTags: [], customTags: [] };
  }

  // 检查缓存
  if (tagsCache && Date.now() - tagsCache.timestamp < TAGS_CACHE_DURATION) {
    return { presetTags: tagsCache.presetTags, customTags: tagsCache.customTags };
  }

  try {
    const response = await fetchTags();
    const presetTags = response.preset_tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      isPreset: tag.is_preset,
      isHidden: tag.is_hidden,
      displayOrder: tag.display_order,
      createdAt: tag.created_at,
      updatedAt: tag.updated_at,
    }));
    const customTags = response.custom_tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      isPreset: tag.is_preset,
      isHidden: tag.is_hidden,
      displayOrder: tag.display_order,
      createdAt: tag.created_at,
      updatedAt: tag.updated_at,
    }));

    tagsCache = { presetTags, customTags, timestamp: Date.now() };
    return { presetTags, customTags };
  } catch (error) {
    console.warn("[Echo] Failed to load tags from API:", error);
    // 如果API失败，返回空数组（或使用缓存）
    if (tagsCache) {
      return { presetTags: tagsCache.presetTags, customTags: tagsCache.customTags };
    }
    return { presetTags: [], customTags: [] };
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
  const { customTags } = await loadTagsFromAPI();
  
  // 从localStorage加载隐藏偏好
  const hiddenPrefs = loadHiddenPreferences(email);
  
  // 构建自定义标签列表
  const customTagsList: CustomTag[] = customTags.map(tag => ({
    id: tag.id,
    name: tag.name,
    hidden: hiddenPrefs.hiddenCustomTagIds.includes(tag.id),
  }));

  return {
    hiddenPresetTagIds: hiddenPrefs.hiddenPresetTagIds,
    hiddenCustomTagIds: hiddenPrefs.hiddenCustomTagIds,
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
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizePreferences(preferences);

  try {
    // 只保存隐藏偏好，不保存标签列表（标签列表从后端获取）
    const prefsToSave: TagPreferences = {
      hiddenPresetTagIds: normalized.hiddenPresetTagIds,
      hiddenCustomTagIds: normalized.hiddenCustomTagIds,
      customTags: [], // 不再保存标签列表到localStorage
    };
    window.localStorage.setItem(getStorageKey(email), JSON.stringify(prefsToSave));
  } catch (error) {
    console.warn("[Echo] Failed to save tag preferences:", error);
  }

  try {
    const event = new CustomEvent(TAG_PREFERENCES_CHANGED_EVENT, {
      detail: {
        email: email ?? null,
        preferences: normalized,
      },
    });
    window.dispatchEvent(event);
  } catch (error) {
    console.warn("[Echo] Failed to dispatch tag preferences changed event:", error);
  }
}

export async function buildTagOptionsAsync(preferences: TagPreferences): Promise<TagOption[]> {
  // 从后端获取标签
  const { presetTags, customTags } = await loadTagsFromAPI();
  
  const hiddenPresetSet = new Set(preferences.hiddenPresetTagIds);
  const hiddenCustomSet = new Set(preferences.hiddenCustomTagIds);

  // 构建预设标签选项（使用后端返回的数字ID，而不是PRESET_TAGS的字符串ID）
  // 通过名称匹配PRESET_TAGS和后端返回的预设标签
  const presetOptions: TagOption[] = presetTags
    .filter((tag) => {
      // 通过名称匹配找到对应的PRESET_TAGS项
      const preset = PRESET_TAGS.find((p) => p.name === tag.name);
      if (!preset) return false;
      // 检查是否被隐藏（使用PRESET_TAGS的字符串ID检查）
      return !hiddenPresetSet.has(preset.id);
    })
    .map((tag) => {
      const preset = PRESET_TAGS.find((p) => p.name === tag.name);
      return {
        id: tag.id, // 使用后端返回的数字ID
        name: tag.name,
        isCustom: false,
        defaultActive: preset ? preset.defaultActive && !hiddenPresetSet.has(preset.id) : false,
      };
    });

  // 构建自定义标签选项（从后端获取）
  const customOptions: TagOption[] = customTags
    .filter((tag) => !hiddenCustomSet.has(tag.id))
    .map((tag) => ({
      id: tag.id, // 使用数字ID
      name: tag.name,
      isCustom: true,
      defaultActive: false,
    }));

  return [...presetOptions, ...customOptions];
}

export function buildTagOptions(preferences: TagPreferences): TagOption[] {
  const hiddenPresetSet = new Set(preferences.hiddenPresetTagIds);
  const hiddenCustomSet = new Set(preferences.hiddenCustomTagIds);
  
  const presetOptions: TagOption[] = PRESET_TAGS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    isCustom: false,
    defaultActive: preset.defaultActive && !hiddenPresetSet.has(preset.id),
  })).filter((item) => !hiddenPresetSet.has(item.id));

  const customOptions: TagOption[] = preferences.customTags
    .filter((tag) => !hiddenCustomSet.has(tag.id))
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      isCustom: true,
      defaultActive: false,
    }));

  return [...presetOptions, ...customOptions];
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

  const hiddenPresetTagIds = Array.isArray(input.hiddenPresetTagIds)
    ? input.hiddenPresetTagIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value): value is string => value.length > 0 && !!findPresetById(value))
    : [];

  const hiddenCustomTagIds = Array.isArray(input.hiddenCustomTagIds)
    ? input.hiddenCustomTagIds
        .filter((value): value is number => typeof value === "number")
    : [];

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
          const hiddenValue =
            typeof (item as { hidden?: unknown }).hidden === "boolean"
              ? Boolean((item as { hidden?: boolean }).hidden)
              : false;
          const normalized: CustomTag = { id, name, hidden: hiddenValue };
          return normalized;
        })
        .filter((item): item is CustomTag => item !== null)
    : [];

  return {
    hiddenPresetTagIds,
    hiddenCustomTagIds,
    customTags,
  };
}

function findPresetById(id: string): TagPreset | undefined {
  return PRESET_TAGS.find((preset) => preset.id === id);
}


