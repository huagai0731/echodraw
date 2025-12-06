import { useCallback, useEffect, useMemo, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
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
import "./ArtworkDetails.css";

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
  const [allTagNames, setAllTagNames] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<CustomTag | null>(null);

  const refreshPreferences = useCallback(async () => {
    setIsLoading(true);
    try {
      const latest = await loadTagPreferencesAsync(userEmail);
      setOriginalPreferences(latest);
      setDraftPreferences(clonePreferences(latest));
      setEditingTagId(null);
      setEditingName("");
      // 更新所有标签名称集合（用于验证重名）
      setAllTagNames(new Set(latest.customTags.map(tag => tag.name.toLowerCase())));
    } catch (error) {
      console.warn("[CustomTagManager] Failed to load preferences:", error);
      const fallback = getDefaultTagPreferences();
      setOriginalPreferences(fallback);
      setDraftPreferences(clonePreferences(fallback));
      setAllTagNames(new Set());
    } finally {
      setIsLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    refreshPreferences();
  }, [refreshPreferences]);

  const dirty = useMemo(() => {
    return !areTagPreferencesEqual(draftPreferences, originalPreferences);
  }, [draftPreferences, originalPreferences]);

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
      // 检查是否与现有标签重名
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
    [draftPreferences.customTags],
  );


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
        // 更新标签名称集合
        const updatedNames = new Set(allTagNames);
        updatedNames.delete(tag.name.toLowerCase());
        updatedNames.add(trimmed.toLowerCase());
        setAllTagNames(updatedNames);
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

  const handleDeleteClick = useCallback((tag: CustomTag) => {
    setTagToDelete(tag);
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!tagToDelete) return;
    
    const tag = tagToDelete;
    setShowDeleteConfirm(false);
    
    try {
      // 调用后端API删除标签
      await deleteTag(tag.id);
      clearTagsCache(); // 清除缓存
      
      // 更新本地状态
      setDraftPreferences((prev) => {
        const updatedNames = new Set(allTagNames);
        updatedNames.delete(tag.name.toLowerCase());
        setAllTagNames(updatedNames);
        return {
          ...prev,
          customTags: prev.customTags.filter((item) => item.id !== tag.id),
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
    } finally {
      setTagToDelete(null);
    }
  }, [tagToDelete, editingTagId, refreshPreferences, allTagNames]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
    setTagToDelete(null);
  }, []);

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
      // 更新标签名称集合
      const updatedNames = new Set(allTagNames);
      updatedNames.add(createdTag.name.toLowerCase());
      setAllTagNames(updatedNames);
      
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

  const handleBack = useCallback(() => {
    // 标签的创建/更新/删除已经通过API完成，不需要保存偏好
    onBack();
  }, [onBack]);

  return (
    <div className="custom-tag-page">
      <div className="custom-tag-page__bg">
        <div className="custom-tag-page__glow custom-tag-page__glow--one" />
        <div className="custom-tag-page__glow custom-tag-page__glow--two" />
        <div className="custom-tag-page__grid custom-tag-page__grid--left" />
        <div className="custom-tag-page__grid custom-tag-page__grid--right" />
      </div>

      <TopNav
        title="标签管理"
        subtitle="Tag Management"
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
            <h2>标签管理</h2>
            <p>
              当前共有 {draftPreferences.customTags.length} 个标签。可直接编辑或删除标签。
            </p>
          </header>

          <div className="custom-tag-table">
            {draftPreferences.customTags.length === 0 ? (
              <p className="custom-tag-empty">暂未添加自定义标签，请先添加一个吧。</p>
            ) : (
              draftPreferences.customTags.map((tag) => {
                const isEditing = editingTagId === tag.id;
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
                        <span className="custom-tag-row__name">
                          {tag.name}
                        </span>
                      )}
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
                        className="custom-tag-action custom-tag-action--danger"
                        onClick={() => handleDeleteClick(tag)}
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
              {feedback || "标签名称支持中文与英文，最多 12 个字符。可以自由添加、编辑或删除标签。"}
            </span>
          </div>
        </section>
          </>
        )}
      </main>

      {showDeleteConfirm && tagToDelete && (
        <div className="artwork-delete-confirm-overlay" onClick={handleDeleteCancel}>
          <div className="artwork-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="artwork-delete-confirm-title">要删除这个标签吗？</h2>
            <div className="artwork-delete-confirm-content">
              <p className="artwork-delete-confirm-text">
                删除后，标签"{tagToDelete.name}"将无法在上传时选择。
              </p>
              <p className="artwork-delete-confirm-text">
                如果仍有画作使用此标签，删除操作将失败。
              </p>
              <p className="artwork-delete-confirm-text artwork-delete-confirm-text--highlight">
                确认要删除吗？
              </p>
            </div>
            <div className="artwork-delete-confirm-actions">
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--cancel"
                onClick={handleDeleteCancel}
              >
                取消
              </button>
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--confirm"
                onClick={handleDeleteConfirm}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
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
  }

  return true;
}


