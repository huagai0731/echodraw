import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import MaterialIcon from "@/components/MaterialIcon";
import { ArtisticLoader } from "@/components/ArtisticLoader";
import type { Artwork } from "@/types/artwork";
import { TagManager } from "@/pages/upload/components/TagManager";
import type { TagOption } from "@/services/tagPreferences";
import { MoodSelector } from "@/pages/upload/components/MoodSelector";
import { DurationPicker } from "@/pages/upload/components/DurationPicker";
import { ScoreSlider as UploadScoreSlider } from "@/pages/upload/components/ScoreSlider";
import { ArtworkInfoEditor } from "@/pages/upload/components/ArtworkInfoEditor";
import { loadTagPreferencesAsync, buildTagOptionsAsync } from "@/services/tagPreferences";
import { useMood } from "@/pages/upload/hooks/useMood";
import { useDuration } from "@/pages/upload/hooks/useDuration";

import "../Upload.css";
import "./ArtworkEditPage.css";

type ArtworkEditPageProps = {
  artwork: Artwork;
  onBack: () => void;
  onSave: (updatedArtwork: Artwork) => void | Promise<void>;
};

export function ArtworkEditPage({ artwork, onBack, onSave }: ArtworkEditPageProps) {
  // 防御性检查：确保 artwork 存在
  if (!artwork) {
    console.error("[ArtworkEditPage] artwork is null or undefined");
    return (
      <div className="artwork-edit-screen">
        <div className="artwork-edit-screen__topbar">
          <TopNav
            title="编辑画作"
            subtitle="Edit Artwork"
            leadingAction={{ icon: "arrow_back", label: "返回", onClick: onBack }}
            className="top-nav--fixed top-nav--flush"
          />
        </div>
        <main className="artwork-edit-screen__content">
          <div style={{ padding: "2rem", textAlign: "center", color: "#efeae7" }}>
            <p>画作数据无效，请返回重试。</p>
          </div>
        </main>
      </div>
    );
  }

  const [title, setTitle] = useState(artwork.title || "");
  const [description, setDescription] = useState(artwork.description || "");
  const [selectedTags, setSelectedTags] = useState<(string | number)[]>([]);
  const [rating, setRating] = useState(() => {
    // 将字符串评分转换为数字，如果没有评分则默认为0
    if (artwork.rating) {
      const parsed = Number.parseFloat(artwork.rating);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  });
  const [showRating, setShowRating] = useState(() => {
    // 默认隐藏评分（眼睛按钮关闭）
    return false;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);

  // 加载标签选项并初始化选中的标签
  useEffect(() => {
    let cancelled = false;
    setTagsLoading(true);
    loadTagPreferencesAsync()
      .then((preferences) => buildTagOptionsAsync(preferences))
      .then((options) => {
        if (!cancelled) {
          setTagOptions(options);
          setTagsLoading(false);
          
          // 将 artwork.tags 转换为标签ID
          const tagIds: (string | number)[] = [];
          (artwork.tags || []).forEach((tag) => {
            // 如果标签是数字或数字字符串，直接使用
            if (typeof tag === "number") {
              tagIds.push(tag);
            } else if (typeof tag === "string") {
              // 检查是否是纯数字字符串（标签ID）
              const numId = Number.parseInt(tag, 10);
              if (Number.isFinite(numId) && numId > 0) {
                tagIds.push(numId);
              } else {
                // 是标签名称，查找对应的ID
                const option = options.find((opt) => opt.name === tag);
                if (option) {
                  tagIds.push(option.id);
                }
              }
            }
          });
          setSelectedTags(tagIds);
        }
      })
      .catch((error) => {
        console.warn("[ArtworkEditPage] Failed to load tag options:", error);
        if (!cancelled) {
          setTagsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [artwork?.tags]);

  // 处理心情选择 - 需要从 mood 字符串转换为 mood ID
  const [selectedMoodId, setSelectedMoodId] = useState<number | null>(null);

  const { moodMatrix, selectedMood, isLoading: moodsLoading, selectMood } = useMood(
    selectedMoodId,
    (moodId) => {
      setSelectedMoodId(moodId);
    }
  );

  // 当 moods 加载完成后，尝试匹配 artwork.mood 字符串到 mood ID
  useEffect(() => {
    if (!moodsLoading && moodMatrix.length > 0 && artwork.mood && artwork.mood.trim()) {
      // 在所有 moods 中查找匹配的名称
      const allMoods = moodMatrix.flat();
      const matchedMood = allMoods.find((m) => m.name === artwork.mood);
      if (matchedMood) {
        setSelectedMoodId(matchedMood.id);
      }
    }
  }, [moodsLoading, moodMatrix, artwork.mood]);

  // 处理时长 - 必须在 useEffect 之前定义
  const [durationHours, setDurationHours] = useState(() => {
    if (artwork.durationMinutes) {
      return Math.floor(artwork.durationMinutes / 60);
    }
    return 0;
  });

  const [durationMinutes, setDurationMinutes] = useState(() => {
    if (artwork.durationMinutes) {
      return artwork.durationMinutes % 60;
    }
    return 0;
  });

  // 当 artwork 改变时，更新所有字段
  useEffect(() => {
    if (!artwork) return;
    setTitle(artwork.title || "");
    setDescription(artwork.description || "");
    
    // 更新评分 - 默认隐藏（眼睛按钮关闭），如果原来有评分则显示
    if (artwork.rating) {
      const parsed = Number.parseFloat(artwork.rating);
      if (Number.isFinite(parsed) && parsed > 0) {
        setRating(parsed);
        setShowRating(true); // 原来有评分，显示评分
      } else {
        setRating(0);
        setShowRating(false); // 默认关闭
      }
    } else {
      setRating(0);
      setShowRating(false); // 默认关闭
    }
    
    // 更新时长
    if (artwork.durationMinutes) {
      setDurationHours(Math.floor(artwork.durationMinutes / 60));
      setDurationMinutes(artwork.durationMinutes % 60);
    } else {
      setDurationHours(0);
      setDurationMinutes(0);
    }
  }, [artwork.id, artwork.title, artwork.description, artwork.rating, artwork.durationMinutes]);
  
  // 更新标签（当 tagOptions 加载完成后，且 artwork 改变时）
  useEffect(() => {
    if (tagOptions.length > 0 && artwork) {
      const tagIds: (string | number)[] = [];
      (artwork.tags || []).forEach((tag) => {
        if (typeof tag === "number") {
          tagIds.push(tag);
        } else if (typeof tag === "string") {
          const numId = Number.parseInt(tag, 10);
          if (Number.isFinite(numId) && numId > 0) {
            tagIds.push(numId);
          } else {
            const option = tagOptions.find((opt) => opt.name === tag);
            if (option) {
              tagIds.push(option.id);
            }
          }
        }
      });
      setSelectedTags(tagIds);
    }
  }, [artwork.id, artwork.tags, tagOptions]);

  const { totalMinutes: durationTotalMinutes, formattedDuration } = useDuration(
    durationHours,
    durationMinutes,
    (hours, minutes) => {
      setDurationHours(hours);
      setDurationMinutes(minutes);
    }
  );

  const handleToggleTag = useCallback((tagId: string | number) => {
    setSelectedTags((prev) => {
      const exists = prev.includes(tagId);
      return exists ? prev.filter((id) => id !== tagId) : [...prev, tagId];
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      // 构建更新后的作品数据
      const updatedArtwork: Artwork = {
        ...artwork,
        title: title.trim(),
        description: description.trim(),
        tags: selectedTags.map((tag) => String(tag)),
        rating: showRating && rating > 0 ? String(rating) : "",
        mood: selectedMood ? selectedMood.name : "",
        durationMinutes: durationTotalMinutes,
        duration: formattedDuration,
      };

      await onSave(updatedArtwork);
      // 不调用 onBack()，让 onSave 回调处理返回逻辑（如 handleEditSave 会设置 setIsEditMode(false)）
    } catch (error) {
      console.error("[ArtworkEditPage] Save failed:", error);
      // 可以在这里显示错误提示
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    artwork,
    title,
    description,
    selectedTags,
    showRating,
    rating,
    selectedMood,
    moodMatrix,
    durationTotalMinutes,
    formattedDuration,
    onSave,
  ]);

  return (
    <div className="artwork-edit-screen">
      <div className="artwork-edit-screen__background" aria-hidden="true">
        <div className="artwork-edit-screen__glow artwork-edit-screen__glow--primary" />
        <div className="artwork-edit-screen__glow artwork-edit-screen__glow--secondary" />
      </div>

      <div className="artwork-edit-screen__topbar">
        <TopNav
          title="编辑画作"
          subtitle="Edit Artwork"
          leadingAction={{ icon: "arrow_back", label: "返回", onClick: onBack }}
          className="top-nav--fixed top-nav--flush"
        />
      </div>

      <main className="artwork-edit-screen__content">
        <div className="artwork-edit-screen__form">
          {/* 标题和简介 */}
          <section className="artwork-edit-screen__section">
            <ArtworkInfoEditor
              title={title}
              description={description}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
            />
          </section>

          {/* 标签 */}
          <section className="artwork-edit-screen__section">
            <TagManager
              tagOptions={tagOptions}
              selectedTags={selectedTags}
              isLoading={tagsLoading}
              onToggleTag={handleToggleTag}
              onAddTag={() => {
                // 这里可以添加创建新标签的逻辑
                // 暂时留空，因为需要用户输入
              }}
            />
          </section>

          {/* 心情 */}
          <section className="artwork-edit-screen__section">
            <MoodSelector
              moodMatrix={moodMatrix}
              selectedMood={selectedMood}
              isLoading={moodsLoading}
              onSelect={selectMood}
            />
          </section>

          {/* 自评分 */}
          <section className="artwork-edit-screen__section">
            <UploadScoreSlider
              rating={rating}
              showRating={showRating}
              onRatingChange={setRating}
              onToggleVisibility={() => setShowRating((prev) => !prev)}
            />
          </section>

          {/* 画作时长 */}
          <section className="artwork-edit-screen__section">
            <DurationPicker
              hours={durationHours}
              minutes={durationMinutes}
              totalMinutes={durationTotalMinutes}
              formattedDuration={formattedDuration}
              incrementalDuration={null}
              onChange={(hours, minutes) => {
                setDurationHours(hours);
                setDurationMinutes(minutes);
              }}
            />
          </section>

          {/* 保存按钮 */}
          <div className="artwork-edit-screen__actions">
            <button
              type="button"
              className="artwork-edit-screen__save-button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <ArtisticLoader size="small" text="" />
                  <span style={{ marginLeft: "0.5rem" }}>保存中...</span>
                </>
              ) : (
                <>
                  <MaterialIcon name="check" className="artwork-edit-screen__save-icon" />
                  保存
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

