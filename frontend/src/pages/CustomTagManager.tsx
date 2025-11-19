import { useCallback, useEffect, useMemo, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import { PRESET_TAGS } from "@/constants/tagPresets";
import {
  getDefaultTagPreferences,
  loadTagPreferencesAsync,
  saveTagPreferences,
  clearTagsCache,
  type CustomTag,
  type TagPreferences,
} from "@/services/tagPreferences";
import {
  createTag,
  updateTag,
  deleteTag,
} from "@/services/api";

import "./CustomTagManager.css";

type CustomTagManagerProps = {
  userEmail: string | null;
  onBack: () => void;
};

const TAG_NAME_LIMIT = 12;

function CustomTagManager({ userEmail, onBack }: CustomTagManagerProps) {
  const [originalPreferences, setOriginalPreferences] = useState<TagPreferences>(getDefaultTagPreferences);
  const [draftPreferences, setDraftPreferences] = useState<TagPreferences>(getDefaultTagPreferences);
  const [newTagName, setNewTagName] = useState("");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [feedback, setFeedback] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const refreshPreferences = useCallback(async () => {
    setIsLoading(true);
    try {
      const latest = await loadTagPreferencesAsync(userEmail);
      setOriginalPreferences(latest);
      setDraftPreferences(clonePreferences(latest));
      setEditingTagId(null);
      setEditingName("");
    } catch (error) {
      console.warn("[CustomTagManager] Failed to load preferences:", error);
      const fallback = getDefaultTagPreferences();
      setOriginalPreferences(fallback);
      setDraftPreferences(clonePreferences(fallback));
    } finally {
      setIsLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    refreshPreferences();
  }, [refreshPreferences]);

  const hiddenPresetIds = useMemo(() => {
    return new Set(draftPreferences.hiddenPresetTagIds);
  }, [draftPreferences.hiddenPresetTagIds]);

  const visiblePresetCount = PRESET_TAGS.length - hiddenPresetIds.size;

  const hiddenCustomCount = useMemo(
    () => draftPreferences.customTags.filter((tag) => tag.hidden).length,
    [draftPreferences.customTags],
  );

  const dirty = useMemo(() => {
    return !areTagPreferencesEqual(draftPreferences, originalPreferences);
  }, [draftPreferences, originalPreferences]);

  const presetTagNames = useMemo(() => new Set(PRESET_TAGS.map((tag) => tag.name.toLowerCase())), []);

  const validateTagName = useCallback(
    (name: string, excludeId?: number | null): string | null => {
      const trimmed = name.trim();
      if (!trimmed) {
        return "标签名称不能为空";
      }
      if (trimmed.length > TAG_NAME_LIMIT) {
        return `标签名称请控制在 ${TAG_NAME_LIMIT} 个字符以内`;
      }
      const normalized = trimmed.toLowerCase();
      if (presetTagNames.has(normalized)) {
        return "与预设标签重名，请使用其他名称";
      }
      for (const tag of draftPreferences.customTags) {
        if (tag.id === excludeId) {
          continue;
        }
        if (tag.name.toLowerCase() === normalized) {
          return "与现有标签重名，请使用其他名称";
        }
      }
      return null;
    },
    [draftPreferences.customTags, presetTagNames],
  );

  const handleTogglePreset = useCallback((id: string) => {
    setDraftPreferences((prev) => {
      const hidden = new Set(prev.hiddenPresetTagIds);
      if (hidden.has(id)) {
        hidden.delete(id);
      } else {
        hidden.add(id);
      }
      return {
        ...prev,
        hiddenPresetTagIds: Array.from(hidden),
      };
    });
    setFeedback("");
  }, []);

  const handleToggleCustomVisibility = useCallback((id: number) => {
    setDraftPreferences((prev) => {
      const nextTags = prev.customTags.map((tag) => {
        if (tag.id !== id) {
          return tag;
        }
        return {
          ...tag,
          hidden: !tag.hidden,
        };
      });
      return {
        ...prev,
        customTags: nextTags,
        hiddenCustomTagIds: nextTags
          .filter(tag => tag.hidden)
          .map(tag => tag.id),
      };
    });
    setFeedback("");
  }, []);

  const handleStartEdit = useCallback((tag: CustomTag) => {
    setEditingTagId(tag.id);
    setEditingName(tag.name);
    setFeedback("");
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingTagId(null);
    setEditingName("");
    setFeedback("");
  }, []);

  const handleConfirmEdit = useCallback(
    async (tag: CustomTag) => {
      const error = validateTagName(editingName, tag.id);
      if (error) {
        setFeedback(error);
        return;
      }
      const trimmed = editingName.trim();
      if (trimmed === tag.name) {
        setEditingTagId(null);
        setEditingName("");
        return;
      }

      try {
        // 调用后端API更新标签
        await updateTag(tag.id, { name: trimmed });
        clearTagsCache(); // 清除缓存，强制重新加载
        
        // 更新本地状态
        setDraftPreferences((prev) => {
          const nextTags = prev.customTags.map((item) => {
            if (item.id !== tag.id) {
              return item;
            }
            return {
              ...item,
              name: trimmed,
            };
          });
          return {
            ...prev,
            customTags: nextTags,
          };
        });
        
        // 刷新偏好设置
        await refreshPreferences();
        setEditingTagId(null);
        setEditingName("");
        setFeedback("标签名称已更新。");
      } catch (error) {
        console.warn("[CustomTagManager] Failed to update tag:", error);
        setFeedback("更新失败，请重试。");
      }
    },
    [editingName, validateTagName, refreshPreferences],
  );

  const handleDelete = useCallback(async (tag: CustomTag) => {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm(`确定要删除标签"${tag.name}"吗？删除后将无法在上传时选择。`);
      if (!ok) {
        return;
      }
    }

    try {
      // 调用后端API删除标签
      await deleteTag(tag.id);
      clearTagsCache(); // 清除缓存
      
      // 更新本地状态
      setDraftPreferences((prev) => {
        return {
          ...prev,
          customTags: prev.customTags.filter((item) => item.id !== tag.id),
          hiddenCustomTagIds: prev.hiddenCustomTagIds.filter(id => id !== tag.id),
        };
      });
      
      if (editingTagId === tag.id) {
        setEditingTagId(null);
        setEditingName("");
      }
      
      // 刷新偏好设置
      await refreshPreferences();
      setFeedback("标签已删除。");
    } catch (error) {
      console.warn("[CustomTagManager] Failed to delete tag:", error);
      const errorMessage = error instanceof Error ? error.message : "删除失败";
      if (errorMessage.includes("仍有") && errorMessage.includes("个画作使用")) {
        setFeedback(errorMessage);
      } else {
        setFeedback("删除失败，请重试。");
      }
    }
  }, [editingTagId, refreshPreferences]);

  const handleAddTag = useCallback(async () => {
    const error = validateTagName(newTagName, null);
    if (error) {
      setFeedback(error);
      return;
    }

    const trimmed = newTagName.trim();
    try {
      // 调用后端API创建标签
      const createdTag = await createTag({ name: trimmed });
      clearTagsCache(); // 清除缓存
      
      // 更新本地状态
      const newTag: CustomTag = {
        id: createdTag.id,
        name: createdTag.name,
        hidden: false,
      };
      setDraftPreferences((prev) => ({
        ...prev,
        customTags: [...prev.customTags, newTag],
      }));
      
      setNewTagName("");
      
      // 刷新偏好设置
      await refreshPreferences();
      setFeedback("标签已添加，可在上传页使用。");
    } catch (error) {
      console.warn("[CustomTagManager] Failed to create tag:", error);
      setFeedback("添加失败，请重试。");
    }
  }, [newTagName, validateTagName, refreshPreferences]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleAddTag();
    },
    [handleAddTag],
  );

  const handleBack = useCallback(async () => {
    if (dirty) {
      try {
        // 只保存隐藏偏好（标签的创建/更新/删除已经通过API完成）
        saveTagPreferences(userEmail, {
          ...draftPreferences,
          customTags: [], // 不保存标签列表，从后端获取
        });
        setOriginalPreferences(clonePreferences(draftPreferences));
      } catch (error) {
        console.warn("[Echo] Failed to save tag preferences on back:", error);
      }
    }
    onBack();
  }, [dirty, draftPreferences, userEmail, onBack]);

  return (
    <div className="custom-tag-page">
      <div className="custom-tag-page__bg">
        <div className="custom-tag-page__glow custom-tag-page__glow--one" />
        <div className="custom-tag-page__glow custom-tag-page__glow--two" />
        <div className="custom-tag-page__grid custom-tag-page__grid--left" />
        <div className="custom-tag-page__grid custom-tag-page__grid--right" />
      </div>

      <TopNav
        title="自定义标签"
        subtitle="Custom Tags"
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: handleBack,
        }}
      />

      <main className="custom-tag-page__content">
        {isLoading ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.6)" }}>
            加载中...
          </div>
        ) : (
          <>
        <section className="custom-tag-section">
          <header>
            <h2>预设标签可见性</h2>
            <p>
              已显示 {visiblePresetCount} 个预设标签，隐藏 {hiddenPresetIds.size} 个。关闭后将在上传页面隐藏对应标签。
            </p>
          </header>
          <div className="custom-tag-section__grid">
            {PRESET_TAGS.map((preset) => {
              const visible = !hiddenPresetIds.has(preset.id);
              return (
                <label
                  key={preset.id}
                  className={visible ? "custom-tag-pill" : "custom-tag-pill custom-tag-pill--muted"}
                >
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => handleTogglePreset(preset.id)}
                  />
                  <span>{preset.name}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="custom-tag-section">
          <header>
            <h2>自定义标签</h2>
            <p>
              当前共有 {draftPreferences.customTags.length} 个，其中隐藏 {hiddenCustomCount} 个。可直接编辑或隐藏标签。
            </p>
          </header>

          <div className="custom-tag-table">
            {draftPreferences.customTags.length === 0 ? (
              <p className="custom-tag-empty">暂未添加自定义标签，请先添加一个吧。</p>
            ) : (
              draftPreferences.customTags.map((tag) => {
                const isEditing = editingTagId === tag.id;
                const isHidden = Boolean(tag.hidden);
                return (
                  <div key={tag.id} className="custom-tag-row">
                    <div className="custom-tag-row__label">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          maxLength={TAG_NAME_LIMIT}
                          placeholder="输入标签名称"
                        />
                      ) : (
                        <span className={isHidden ? "custom-tag-row__name custom-tag-row__name--muted" : "custom-tag-row__name"}>
                          {tag.name}
                        </span>
                      )}
                      <span className="custom-tag-row__meta">{isHidden ? "已隐藏" : "显示中"}</span>
                    </div>
                    <div className="custom-tag-row__actions">
                      {isEditing ? (
                        <>
                          <button type="button" className="custom-tag-action custom-tag-action--confirm" onClick={() => handleConfirmEdit(tag)}>
                            <MaterialIcon name="check" />
                          </button>
                          <button type="button" className="custom-tag-action" onClick={handleCancelEdit}>
                            <MaterialIcon name="close" />
                          </button>
                        </>
                      ) : (
                        <button type="button" className="custom-tag-action" onClick={() => handleStartEdit(tag)}>
                          <MaterialIcon name="edit" />
                        </button>
                      )}
                      <button
                        type="button"
                        className={isHidden ? "custom-tag-action custom-tag-action--ghost" : "custom-tag-action custom-tag-action--ghost"}
                        onClick={() => handleToggleCustomVisibility(tag.id)}
                      >
                        <MaterialIcon name={isHidden ? "visibility" : "visibility_off"} />
                      </button>
                      <button
                        type="button"
                        className="custom-tag-action custom-tag-action--danger"
                        onClick={() => handleDelete(tag)}
                      >
                        <MaterialIcon name="delete" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form className="custom-tag-form" onSubmit={handleSubmit}>
            <label>
              <span>新增标签</span>
              <input
                type="text"
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="输入自定义标签名称"
                maxLength={TAG_NAME_LIMIT}
              />
            </label>
            <button type="submit" className="custom-tag-form__add">
              <MaterialIcon name="add" />
              添加
            </button>
          </form>

          <div className="custom-tag-hint">
            <span className={feedback ? "custom-tag-hint__message custom-tag-hint__message--active" : "custom-tag-hint__message"}>
              {feedback || "标签名称支持中文与英文，最多 12 个字符。"}
            </span>
          </div>
        </section>
          </>
        )}
      </main>
    </div>
  );
}

export default CustomTagManager;

function clonePreferences(preferences: TagPreferences): TagPreferences {
  return {
    hiddenPresetTagIds: [...preferences.hiddenPresetTagIds],
    hiddenCustomTagIds: [...preferences.hiddenCustomTagIds],
    customTags: preferences.customTags.map((tag) => ({ ...tag })),
  };
}

function areTagPreferencesEqual(a: TagPreferences, b: TagPreferences): boolean {
  if (a.hiddenPresetTagIds.length !== b.hiddenPresetTagIds.length) {
    return false;
  }

  const hiddenA = [...a.hiddenPresetTagIds].sort();
  const hiddenB = [...b.hiddenPresetTagIds].sort();
  for (let i = 0; i < hiddenA.length; i += 1) {
    if (hiddenA[i] !== hiddenB[i]) {
      return false;
    }
  }

  if (a.hiddenCustomTagIds.length !== b.hiddenCustomTagIds.length) {
    return false;
  }

  const hiddenCustomA = [...a.hiddenCustomTagIds].sort((x, y) => x - y);
  const hiddenCustomB = [...b.hiddenCustomTagIds].sort((x, y) => x - y);
  for (let i = 0; i < hiddenCustomA.length; i += 1) {
    if (hiddenCustomA[i] !== hiddenCustomB[i]) {
      return false;
    }
  }

  if (a.customTags.length !== b.customTags.length) {
    return false;
  }

  const customA = [...a.customTags].sort((left, right) => left.id - right.id);
  const customB = [...b.customTags].sort((left, right) => left.id - right.id);

  for (let i = 0; i < customA.length; i += 1) {
    if (customA[i].id !== customB[i].id) {
      return false;
    }
    if (customA[i].name !== customB[i].name) {
      return false;
    }
    if (Boolean(customA[i].hidden) !== Boolean(customB[i].hidden)) {
      return false;
    }
  }

  return true;
}


