import { PRESET_TAGS, type TagPreset } from "@/constants/tagPresets";

export type CustomTag = {
  id: string;
  name: string;
  hidden?: boolean;
};

export type TagPreferences = {
  hiddenPresetTagIds: string[];
  customTags: CustomTag[];
};

export type TagOption = {
  id: string;
  name: string;
  isCustom: boolean;
  defaultActive: boolean;
};

const STORAGE_PREFIX = "echo.tag-preferences.";
export const TAG_PREFERENCES_CHANGED_EVENT = "echo:tag-preferences.changed";

const DEFAULT_PREFERENCES: TagPreferences = {
  hiddenPresetTagIds: [],
  customTags: [],
};

export function getDefaultTagPreferences(): TagPreferences {
  return {
    hiddenPresetTagIds: [],
    customTags: [],
  };
}

export function getStorageKey(email?: string | null) {
  const normalized = (email ?? "global").trim().toLowerCase();
  return `${STORAGE_PREFIX}${normalized}`;
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

export function saveTagPreferences(email: string | null, preferences: TagPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizePreferences(preferences);

  try {
    window.localStorage.setItem(getStorageKey(email), JSON.stringify(normalized));
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

export function buildTagOptions(preferences: TagPreferences): TagOption[] {
  const hiddenSet = new Set(preferences.hiddenPresetTagIds);
  const presetOptions: TagOption[] = PRESET_TAGS.map((preset) => ({
    id: preset.id,
    name: preset.name,
    isCustom: false,
    defaultActive: preset.defaultActive && !hiddenSet.has(preset.id),
  })).filter((item) => !hiddenSet.has(item.id));

  const customOptions: TagOption[] = preferences.customTags
    .filter((tag) => !tag.hidden)
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
  return {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
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

  const customTags = Array.isArray(input.customTags)
    ? input.customTags
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const id = typeof item.id === "string" ? item.id.trim() : "";
          const name = typeof item.name === "string" ? item.name.trim() : "";
          if (!id || !name) {
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
    customTags,
  };
}

function findPresetById(id: string): TagPreset | undefined {
  return PRESET_TAGS.find((preset) => preset.id === id);
}


