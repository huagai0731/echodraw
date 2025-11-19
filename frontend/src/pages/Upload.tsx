import { useEffect, useId, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import { getActiveUserEmail } from "@/services/authStorage";
import {
  buildTagOptionsAsync,
  loadTagPreferencesAsync,
  saveTagPreferences,
  clearTagsCache,
  TAG_PREFERENCES_CHANGED_EVENT,
  type TagOption,
  type TagPreferences,
} from "@/services/tagPreferences";
import { createTag } from "@/services/api";
import { PRESET_TAGS } from "@/constants/tagPresets";
import { loadStoredArtworks, USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";
import type { Artwork } from "@/types/artwork";

import "./Upload.css";

export type UploadResult = {
  file: File;
  title: string;
  description: string;
  tags: (string | number)[]; // 支持字符串ID（预设标签）和数字ID（自定义标签）
  mood: string;
  rating: number;
  durationMinutes: number;
  previewDataUrl: string | null;
  // 套图相关字段
  collectionId?: string | null;
  collectionName?: string | null;
  collectionIndex?: number | null;
  incrementalDurationMinutes?: number | null; // 增量时长（分钟）
};

type UploadProps = {
  onClose: () => void;
  onSave: (result: UploadResult) => void | Promise<void>;
};

const MOODS = [
  // 第一行：[左上(1), 左上(2), 右上(1), 右上(2)]
  "灵感爆棚",
  "画感全开",
  "稳扎慢练",
  "卡住反复",
  // 第二行：[左上(3), 左上(4), 右上(3), 右上(4)]
  "惊喜超标",
  "随便摸鱼",
  "换法试笔",
  "小小进步",
  // 第三行：[左下(1), 左下(2), 右下(1), 右下(2)]
  "爆肝冲刺",
  "疲惫挂机",
  "细节打磨",
  "产能见底",
  // 第四行：[左下(3), 左下(4), 右下(3), 右下(4)]
  "画废崩溃",
  "自我怀疑",
  "摆烂自救",
  "情绪重启",
];

function Upload({ onClose, onSave }: UploadProps) {
  const [rating, setRating] = useState(70);
  const [showRating, setShowRating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<(string | number)[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(true);
  const [selectedMood, setSelectedMood] = useState<string>("心旷神怡");
  const [durationHours, setDurationHours] = useState<number>(1);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // 套图相关状态
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [showSelectCollectionModal, setShowSelectCollectionModal] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [previewCollectionImage, setPreviewCollectionImage] = useState<string | null>(null);
  const [showLargeImagePreview, setShowLargeImagePreview] = useState<string | null>(null);
  const [collectionMaxDurationMinutes, setCollectionMaxDurationMinutes] = useState<number | null>(null); // 套图最大画布时长
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const moodMatrix = useMemo(() => chunkArray(MOODS, 4), []);
  const sliderBackground = useMemo(() => {
    const percentage = `${rating}%`;
    return `linear-gradient(90deg, rgba(152, 219, 198, 1) ${percentage}, rgba(239, 234, 231, 0.3) ${percentage})`;
  }, [rating]);
  const formattedDuration = useMemo(() => {
    return `${formatTwoDigits(durationHours)}:${formatTwoDigits(durationMinutes)}`;
  }, [durationHours, durationMinutes]);
  const totalMinutes = useMemo(() => durationHours * 60 + durationMinutes, [durationHours, durationMinutes]);
  
  // 计算增量时长（仅当选择已有套图时）
  const incrementalDurationMinutes = useMemo(() => {
    if (collectionMaxDurationMinutes !== null && totalMinutes >= collectionMaxDurationMinutes) {
      return totalMinutes - collectionMaxDurationMinutes;
    }
    return null;
  }, [collectionMaxDurationMinutes, totalMinutes]);
  
  // 格式化增量时长显示
  const formattedIncrementalDuration = useMemo(() => {
    if (incrementalDurationMinutes === null || incrementalDurationMinutes <= 0) {
      return null;
    }
    const hours = Math.floor(incrementalDurationMinutes / 60);
    const minutes = incrementalDurationMinutes % 60;
    if (hours > 0 && minutes > 0) {
      return `${hours} 小时 ${minutes} 分钟`;
    }
    if (hours > 0) {
      return `${hours} 小时`;
    }
    return `${minutes} 分钟`;
  }, [incrementalDurationMinutes]);

  useEffect(() => {
    if (!selectedFile) {
      setPreview(null);
      return;
    }

    let canceled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!canceled && typeof reader.result === "string") {
        setPreview(reader.result);
      }
    };
    reader.onerror = () => {
      if (!canceled) {
        console.warn("[Upload] 读取图片失败", reader.error);
        setPreview(null);
      }
    };
    reader.readAsDataURL(selectedFile);

    return () => {
      canceled = true;
      if (reader.readyState === FileReader.LOADING) {
        reader.abort();
      }
    };
  }, [selectedFile]);

  // 限制画布时长不能小于套图最大时长
  useEffect(() => {
    if (collectionMaxDurationMinutes !== null && totalMinutes < collectionMaxDurationMinutes) {
      const hours = Math.floor(collectionMaxDurationMinutes / 60);
      const minutes = collectionMaxDurationMinutes % 60;
      setDurationHours(hours);
      setDurationMinutes(minutes);
    }
  }, [collectionMaxDurationMinutes, totalMinutes]);

  const handleFileChange = () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }

    // 验证文件大小（10MB限制，与后端一致）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      alert(`文件大小不能超过 10MB，当前文件大小为 ${sizeMB}MB。请选择较小的图片或压缩后再上传。`);
      // 清空文件输入
      if (input && input.value) {
        input.value = "";
      }
      return;
    }

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    
    // 安全地获取文件扩展名
    const lastDotIndex = file.name.lastIndexOf('.');
    const fileExtension = lastDotIndex >= 0 && lastDotIndex < file.name.length - 1
      ? file.name.toLowerCase().substring(lastDotIndex)
      : '';
    const isValidType = allowedTypes.includes(file.type) || (fileExtension && allowedExtensions.includes(fileExtension));
    
    if (!isValidType) {
      alert(`不支持的文件格式：${fileExtension || file.type}。\n仅支持：${allowedExtensions.join(', ')}`);
      // 清空文件输入
      if (input && input.value) {
        input.value = "";
      }
      return;
    }

    setSelectedFile(file);

    setTimeout(() => {
      try {
        if (input && input.value) {
          input.value = "";
        }
      } catch (error) {
        console.warn("[Upload] 重置文件输入框失败（可忽略）", error);
      }
    }, 0);
  };

  const handleToggleRating = () => {
    setShowRating((prev) => !prev);
  };

  const handleTagToggle = (id: string | number) => {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((tagId) => tagId !== id) : [...prev, id]));
  };

  const handleMoodSelect = (label: string) => {
    setSelectedMood(label);
  };

  const handleAddTagShortcut = async () => {
    if (typeof window === "undefined") {
      return;
    }

    const input = window.prompt("输入自定义标签名称（12 个字符以内）");
    if (input === null) {
      return;
    }

    const name = input.trim();
    if (!name) {
      window.alert("标签名称不能为空");
      return;
    }
    if (name.length > 12) {
      window.alert("标签名称请控制在 12 个字符以内");
      return;
    }

    // 检查是否与现有标签重名
    const normalized = name.toLowerCase();
    const existingNames = new Set<string>([
      ...tagOptions.map((tag) => tag.name.toLowerCase()),
    ]);
    if (existingNames.has(normalized)) {
      window.alert("标签名称已存在，请使用其他名称");
      return;
    }

    try {
      // 调用后端API创建标签
      const createdTag = await createTag({ name });
      clearTagsCache(); // 清除缓存
      
      // 刷新标签列表
      const email = getActiveUserEmail();
      const preferences = await loadTagPreferencesAsync(email);
      const options = await buildTagOptionsAsync(preferences);
      setTagOptions(options);
      
      // 自动选中新创建的标签
      setSelectedTags((prev) => {
        if (prev.includes(createdTag.id)) {
          return prev;
        }
        return [...prev, createdTag.id];
      });

      window.alert("标签已添加，可在上传时直接使用。");
    } catch (error) {
      console.warn("[Upload] Failed to create tag:", error);
      window.alert("添加失败，请重试。");
    }
  };

  // 用于触发 allCollections 重新计算的计数器
  const [collectionsRefreshKey, setCollectionsRefreshKey] = useState(0);

  function getArtworkTimestamp(artwork: Artwork): number {
    if (artwork.uploadedAt) {
      const time = Date.parse(artwork.uploadedAt);
      if (!Number.isNaN(time)) return time;
    }
    if (artwork.uploadedDate) {
      const time = Date.parse(`${artwork.uploadedDate}T00:00:00Z`);
      if (!Number.isNaN(time)) return time;
    }
    if (artwork.date) {
      const time = Date.parse(artwork.date);
      if (!Number.isNaN(time)) return time;
    }
    return 0;
  }

  // 获取所有套图
  const allCollections = useMemo(() => {
    const artworks = loadStoredArtworks();
    const collectionMap = new Map<string, { name: string; artworks: Artwork[] }>();
    
    // 调试：检查所有作品和套图数据
    const collectionArtworks = artworks.filter((artwork) => artwork.collectionId && artwork.collectionName);
    
    collectionArtworks.forEach((artwork) => {
      if (artwork.collectionId && artwork.collectionName) {
        if (!collectionMap.has(artwork.collectionId)) {
          collectionMap.set(artwork.collectionId, {
            name: artwork.collectionName,
            artworks: [],
          });
        }
        collectionMap.get(artwork.collectionId)!.artworks.push(artwork);
      }
    });
    
    // 对每个套图按上传时间排序，最新的在前
    collectionMap.forEach((collection) => {
      collection.artworks.sort((a, b) => {
        const timeA = getArtworkTimestamp(a);
        const timeB = getArtworkTimestamp(b);
        return timeB - timeA;
      });
    });
    
    const result = Array.from(collectionMap.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      coverImage: data.artworks[0]?.imageSrc || null,
      count: data.artworks.length,
    }));
    
    return result;
  }, [collectionsRefreshKey]); // 依赖 collectionsRefreshKey，当它改变时会重新计算

  // 组件挂载时主动刷新套图列表
  useEffect(() => {
    setCollectionsRefreshKey((prev) => prev + 1);
  }, []);

  // 监听作品数据变化，刷新套图列表
  useEffect(() => {
    const handleArtworksChanged = () => {
      setCollectionsRefreshKey((prev) => prev + 1);
    };

    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    return () => {
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    };
  }, []);

  // 生成套图ID
  function generateCollectionId(): string {
    return `collection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // 获取套图中下一个索引
  function getNextCollectionIndex(collectionId: string): number {
    const artworks = loadStoredArtworks();
    const collectionArtworks = artworks.filter((a) => a.collectionId === collectionId);
    return collectionArtworks.length + 1;
  }

  // 解析画布时长（分钟）
  function parseDurationMinutes(artwork: Artwork): number | null {
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

  // 获取套图的最大画布时长
  function getCollectionMaxDuration(collectionId: string): number {
    const artworks = loadStoredArtworks();
    const collectionArtworks = artworks.filter((a) => a.collectionId === collectionId);
    let maxDuration = 0;
    collectionArtworks.forEach((artwork) => {
      const duration = parseDurationMinutes(artwork);
      if (duration !== null) {
        maxDuration = Math.max(maxDuration, duration);
      }
    });
    return maxDuration;
  }

  const handleCreateCollection = () => {
    const name = collectionName.trim();
    if (!name) {
      window.alert("请输入套图名称");
      return;
    }
    setShowCreateCollectionModal(false);
    // 创建新套图时，重置套图最大时长
    setCollectionMaxDurationMinutes(null);
    // collectionName 已经在状态中，会在保存时使用
    // 不需要设置selectedCollectionId，因为创建新套图时会在handleSave中生成新的ID
  };

  const handleSelectCollection = (collectionId: string) => {
    setSelectedCollectionId(collectionId);
    const collection = allCollections.find((c) => c.id === collectionId);
    if (collection) {
      // 更新标题为：套图名·原标题
      if (title.trim()) {
        // 如果标题已经包含套图名，则不重复添加
        if (!title.includes(collection.name)) {
          setTitle(`${collection.name}·${title}`);
        }
      }
      // 获取套图的最大画布时长
      const maxDuration = getCollectionMaxDuration(collectionId);
      setCollectionMaxDurationMinutes(maxDuration);
      // 如果当前画布时长小于套图最大时长，自动调整为套图最大时长
      if (totalMinutes < maxDuration) {
        const hours = Math.floor(maxDuration / 60);
        const minutes = maxDuration % 60;
        setDurationHours(hours);
        setDurationMinutes(minutes);
      }
    }
    setShowSelectCollectionModal(false);
  };

  const handlePreviewCollectionImage = (imageSrc: string | null) => {
    setPreviewCollectionImage(imageSrc);
  };

  const handleSave = async () => {
    if (!selectedFile || isSaving) {
      if (!selectedFile) {
        fileInputRef.current?.click();
      }
      return;
    }

    // 直接使用标签ID（字符串或数字）
    const selectedTagIds = selectedTags;

    // 处理套图逻辑
    let finalCollectionId: string | null = null;
    let finalCollectionName: string | null = null;
    let finalCollectionIndex: number | null = null;
    let finalTitle = title.trim();

    if (selectedCollectionId) {
      // 如果选择了已有套图
      const collection = allCollections.find((c) => c.id === selectedCollectionId);
      if (collection) {
        finalCollectionId = selectedCollectionId;
        finalCollectionName = collection.name;
        finalCollectionIndex = getNextCollectionIndex(selectedCollectionId);
        // 确保标题格式为：套图名·图片标题
        if (!finalTitle.includes(collection.name)) {
          finalTitle = `${collection.name}·${finalTitle || "Untitled"}`;
        }
      }
    } else if (collectionName.trim()) {
      // 如果创建了新套图
      const newCollectionId = generateCollectionId();
      finalCollectionId = newCollectionId;
      finalCollectionName = collectionName.trim();
      finalCollectionIndex = 1; // 第一张图
      // 标题格式为：套图名·图片标题
      const baseTitle = title.trim() || "Untitled";
      // 如果标题已经包含套图名，则不重复添加
      if (!baseTitle.includes(finalCollectionName)) {
        finalTitle = `${finalCollectionName}·${baseTitle}`;
      } else {
        finalTitle = baseTitle;
      }
    }

    setIsSaving(true);
    try {
      await onSave({
        file: selectedFile,
        title: finalTitle,
        description: description.trim(),
        tags: selectedTagIds,
        mood: selectedMood,
        rating,
        durationMinutes: totalMinutes,
        previewDataUrl: preview,
        collectionId: finalCollectionId,
        collectionName: finalCollectionName,
        collectionIndex: finalCollectionIndex,
        incrementalDurationMinutes: incrementalDurationMinutes,
      });
      // 保存成功后重置套图相关状态
      setCollectionName("");
      setSelectedCollectionId(null);
      setCollectionMaxDurationMinutes(null);
    } catch (error) {
      console.warn("[Upload] Save failed:", error);
      // 错误处理由 onSave 内部处理，这里只重置状态
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const loadTags = async () => {
      setIsLoadingTags(true);
      try {
        const email = getActiveUserEmail();
        const preferences = await loadTagPreferencesAsync(email);
        const options = await buildTagOptionsAsync(preferences);
        setTagOptions(options);
        setSelectedTags((prev) => {
          const optionIds = new Set(options.map((option) => option.id));
          const retained = prev.filter((id) => optionIds.has(id));
          const baseSet = new Set(retained);
          options.forEach((option) => {
            if (option.defaultActive && !baseSet.has(option.id)) {
              baseSet.add(option.id);
            }
          });
          return Array.from(baseSet);
        });
      } catch (error) {
        console.warn("[Upload] Failed to load tags:", error);
      } finally {
        setIsLoadingTags(false);
        }
    };

    loadTags();

    if (typeof window === "undefined") {
      return;
    }

    const tagEventListener = async (_event: Event) => {
      await loadTags();
    };
    const storageListener = async (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith("echo.tag-preferences.")) {
        return;
      }
      await loadTags();
    };

    window.addEventListener(TAG_PREFERENCES_CHANGED_EVENT, tagEventListener);
    window.addEventListener("storage", storageListener);

    return () => {
      window.removeEventListener(TAG_PREFERENCES_CHANGED_EVENT, tagEventListener);
      window.removeEventListener("storage", storageListener);
    };
  }, []);

  return (
    <div className="upload-screen">
      <div className="upload-screen__background">
        <div className="upload-screen__glow upload-screen__glow--mint" />
        <div className="upload-screen__glow upload-screen__glow--brown" />
        <div className="upload-screen__glow upload-screen__glow--accent" />
      </div>

      <TopNav
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onClose,
        }}
        title="Upload"
        subtitle="New Work"
      />

      <main className="upload-screen__content">
        <div className="upload-dropzone__wrapper">
          <label
            htmlFor={fileInputId}
            className={`upload-dropzone${preview ? " upload-dropzone--with-preview" : ""}`}
          >
            {preview ? (
              <img src={preview} alt="已选择的作品" className="upload-dropzone__preview" />
            ) : (
              <>
                <MaterialIcon name="add_photo_alternate" />
                <div>
                  <p>轻触以添加作品</p>
                  <p>上传你的创作图片</p>
                </div>
              </>
            )}
          </label>
          <input
            id={fileInputId}
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="upload-dropzone__input"
            onChange={handleFileChange}
            onInput={handleFileChange}
          />
        </div>

        <section className="upload-section">
          <h2>标签</h2>
          <div className="upload-tags">
            {tagOptions.map((tag) => (
              <button
                type="button"
                key={tag.id}
                className={
                  selectedTags.includes(tag.id) ? "upload-tag upload-tag--active" : "upload-tag"
                }
                onClick={() => handleTagToggle(tag.id)}
              >
                {tag.name}
              </button>
            ))}
            <button type="button" className="upload-tag upload-tag--add" onClick={handleAddTagShortcut}>
              <MaterialIcon name="add" />
              添加标签
            </button>
          </div>
        </section>

        <section className="upload-section">
          <h2>创作时的心情</h2>
          <div className="upload-mood-grid">
            {moodMatrix.map((row, rowIndex) => (
              <div key={rowIndex} className="upload-mood-row">
                {row.map((label) => (
                  <button
                    type="button"
                    key={label}
                    className={
                      selectedMood === label ? "upload-mood upload-mood--active" : "upload-mood"
                    }
                    onClick={() => handleMoodSelect(label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ))}
            <span className="upload-mood__divider upload-mood__divider--horizontal" />
            <span className="upload-mood__divider upload-mood__divider--vertical" />
          </div>
        </section>

        <section className="upload-section">
          <div className="upload-duration__header">
            <h2>绘画时长</h2>
            <span className="upload-duration__total">{formattedDuration}</span>
          </div>
          <DurationPicker
            hours={durationHours}
            minutes={durationMinutes}
            onChange={(nextHours, nextMinutes) => {
              setDurationHours(nextHours);
              setDurationMinutes(nextMinutes);
            }}
          />
          <p className="upload-duration__hint">支持 5 分钟刻度，当前共 {totalMinutes} 分钟的专注创作</p>
          {formattedIncrementalDuration && (
            <p className="upload-duration__incremental" style={{ color: "#98dbc6", fontSize: "0.9rem", marginTop: "0.5rem" }}>
              本次新增：{formattedIncrementalDuration}
            </p>
          )}
        </section>

        <section className="upload-section">
          <div className="upload-slider__header">
            <h2>自我评分</h2>
            <div className="upload-slider__value">
              <span>{showRating ? rating : "--"}</span>
              <button type="button" onClick={handleToggleRating}>
                <MaterialIcon name={showRating ? "visibility" : "visibility_off"} />
              </button>
            </div>
          </div>
          <input
            className="upload-slider"
            type="range"
            min={0}
            max={100}
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
            style={{ background: sliderBackground }}
          />
        </section>

        <section className="upload-section">
          <label className="upload-field">
            <span>作品标题</span>
            <input
              type="text"
              placeholder="例如：日落速写、抽象形态"
              maxLength={20}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="upload-field">
            <span>作品简介</span>
            <textarea
              placeholder="写下简介或创作笔记…"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </section>

        <section className="upload-section">
          <div className="upload-collection-actions">
            <button
              type="button"
              className="upload-collection-button"
              onClick={() => setShowCreateCollectionModal(true)}
            >
              <MaterialIcon name="add" />
              <span>建立套图</span>
            </button>
            <button
              type="button"
              className="upload-collection-button"
              onClick={() => {
                // 打开弹窗前刷新套图列表
                setCollectionsRefreshKey((prev) => prev + 1);
                setShowSelectCollectionModal(true);
              }}
            >
              <MaterialIcon name="collections" />
              <span>增加到已有套图</span>
            </button>
          </div>
          {(selectedCollectionId || collectionName) && (
            <div className="upload-collection-info" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <MaterialIcon name="collections" />
              <span>
                {collectionName || allCollections.find((c) => c.id === selectedCollectionId)?.name || "套图"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCollectionId(null);
                  setCollectionName("");
                  setCollectionMaxDurationMinutes(null);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(239, 234, 231, 0.6)",
                  cursor: "pointer",
                  padding: "0.25rem",
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label="取消选择套图"
              >
                <span style={{ fontSize: "1rem" }}>
                  <MaterialIcon name="close" />
                </span>
              </button>
            </div>
          )}
          <button type="button" className="upload-save" onClick={handleSave} disabled={!selectedFile || isSaving}>
            {isSaving ? (
              <>
                <MaterialIcon name="sync" />
                上传中...
              </>
            ) : (
              "保存"
            )}
          </button>
        </section>

        {/* 建立套图弹窗 */}
        {showCreateCollectionModal && (
          <div className="upload-modal-overlay" onClick={() => setShowCreateCollectionModal(false)}>
            <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
              <div className="upload-modal__header">
                <h2>建立套图</h2>
                <button
                  type="button"
                  className="upload-modal__close"
                  onClick={() => setShowCreateCollectionModal(false)}
                >
                  <MaterialIcon name="close" />
                </button>
              </div>
              <div className="upload-modal__content">
                <p className="upload-modal__hint">
                  该图会作为此套图的第一张图，后续可以增加图片到该套图。套图图片名称会显示为套图名·图片标题。
                </p>
                <label className="upload-field">
                  <span>套图名称</span>
                  <input
                    type="text"
                    placeholder="例如：角色设计、场景练习"
                    maxLength={20}
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateCollection();
                      }
                    }}
                    autoFocus
                  />
                </label>
              </div>
              <div className="upload-modal__actions">
                <button
                  type="button"
                  className="upload-modal__button upload-modal__button--secondary"
                  onClick={() => setShowCreateCollectionModal(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="upload-modal__button upload-modal__button--primary"
                  onClick={handleCreateCollection}
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 选择已有套图弹窗 */}
        {showSelectCollectionModal && (
          <div className="upload-modal-overlay" onClick={() => setShowSelectCollectionModal(false)}>
            <div className="upload-modal upload-modal--large" onClick={(e) => e.stopPropagation()}>
              <div className="upload-modal__header">
                <h2>选择套图</h2>
                <button
                  type="button"
                  className="upload-modal__close"
                  onClick={() => setShowSelectCollectionModal(false)}
                >
                  <MaterialIcon name="close" />
                </button>
              </div>
              <div className="upload-modal__content upload-modal__content--scrollable">
                {allCollections.length === 0 ? (
                  <p className="upload-modal__empty">暂无套图</p>
                ) : (
                  <div className="upload-collection-grid">
                    {allCollections.map((collection) => (
                      <button
                        key={collection.id}
                        type="button"
                        className="upload-collection-item"
                        onClick={(e) => {
                          // 如果点击的是图片，显示大图预览；否则选择套图
                          if (e.target instanceof HTMLImageElement && collection.coverImage) {
                            e.stopPropagation();
                            setShowLargeImagePreview(collection.coverImage);
                          } else {
                            handleSelectCollection(collection.id);
                          }
                        }}
                        onMouseEnter={() => handlePreviewCollectionImage(collection.coverImage)}
                        onMouseLeave={() => handlePreviewCollectionImage(null)}
                      >
                        {collection.coverImage ? (
                          <img
                            src={collection.coverImage}
                            alt={collection.name}
                            className="upload-collection-item__image"
                          />
                        ) : (
                          <div className="upload-collection-item__placeholder">
                            <MaterialIcon name="image" />
                          </div>
                        )}
                        <div className="upload-collection-item__info">
                          <span className="upload-collection-item__name">{collection.name}</span>
                          <span className="upload-collection-item__count">{collection.count} 张</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {previewCollectionImage && (
                <div className="upload-collection-preview">
                  <img src={previewCollectionImage} alt="预览" className="upload-collection-preview__image" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 大图预览弹窗 */}
        {showLargeImagePreview && (
          <div
            className="upload-modal-overlay"
            onClick={() => setShowLargeImagePreview(null)}
            style={{ zIndex: 101 }}
          >
            <div className="upload-large-image-preview" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="upload-large-image-preview__close"
                onClick={() => setShowLargeImagePreview(null)}
              >
                <MaterialIcon name="close" />
              </button>
              <img
                src={showLargeImagePreview}
                alt="套图预览"
                className="upload-large-image-preview__image"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
}

function formatTwoDigits(value: number) {
  return value.toString().padStart(2, "0");
}

type DurationPickerProps = {
  hours: number;
  minutes: number;
  onChange: (hours: number, minutes: number) => void;
};

function DurationPicker({ hours, minutes, onChange }: DurationPickerProps) {
  const HOURS = useMemo(() => Array.from({ length: 13 }, (_, index) => index), []);
  const MINUTES = useMemo(() => Array.from({ length: 12 }, (_, index) => index * 5), []);

  const handleHourChange = (next: number) => {
    onChange(next, minutes);
  };

  const handleMinuteChange = (next: number) => {
    onChange(hours, next);
  };

  const stepMinute = (delta: number) => {
    const currentIndex = MINUTES.indexOf(minutes);
    if (currentIndex === -1) {
      handleMinuteChange(0);
      return;
    }
    let nextIndex = currentIndex + delta;
    let nextHours = hours;

    if (nextIndex >= MINUTES.length) {
      nextIndex = 0;
      nextHours = Math.min(hours + 1, HOURS[HOURS.length - 1]);
    } else if (nextIndex < 0) {
      nextIndex = MINUTES.length - 1;
      nextHours = Math.max(hours - 1, HOURS[0]);
    }

    handleHourChange(nextHours);
    handleMinuteChange(MINUTES[nextIndex]);
  };

  return (
    <div className="upload-duration">
      <DurationCard
        value={hours}
        options={HOURS}
        unit="小时"
        formatValue={formatTwoDigits}
        ariaLabel="选择创作时长的小时数"
        onChange={handleHourChange}
        onStep={(delta) => {
          const nextIndex = Math.max(Math.min(HOURS.indexOf(hours) + delta, HOURS.length - 1), 0);
          handleHourChange(HOURS[nextIndex]);
        }}
      />
      <span className="upload-duration__separator">:</span>
      <DurationCard
        value={minutes}
        options={MINUTES}
        unit="分钟"
        formatValue={formatTwoDigits}
        ariaLabel="选择创作时长的分钟数"
        onChange={handleMinuteChange}
        onStep={stepMinute}
      />
    </div>
  );
}

type DurationCardProps = {
  value: number;
  options: number[];
  onChange: (next: number) => void;
  unit: string;
  formatValue: (value: number) => string;
  ariaLabel: string;
  onStep?: (delta: number) => void;
};

function DurationCard({
  value,
  options,
  onChange,
  unit,
  formatValue,
  ariaLabel,
  onStep,
}: DurationCardProps) {
  const index = options.indexOf(value);
  const hasPrev = index > 0;
  const hasNext = index < options.length - 1;

  const changeBy = (delta: number) => {
    const nextIndex = Math.min(Math.max(index + delta, 0), options.length - 1);
    onChange(options[nextIndex]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      if (onStep) {
        onStep(1);
      } else {
        changeBy(1);
      }
    }
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (onStep) {
        onStep(-1);
      } else {
        changeBy(-1);
      }
    }
  };

  return (
    <div className="upload-duration__column">
      <div
        className="upload-duration__pill"
        tabIndex={0}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={options[0]}
        aria-valuemax={options[options.length - 1]}
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {formatValue(value)}
      </div>

      <div className="upload-duration__controls">
        <button
          type="button"
          className="upload-duration__control"
          onClick={() => (onStep ? onStep(-1) : changeBy(-1))}
          disabled={!hasPrev && !onStep}
          aria-label={`减少${unit}`}
        >
          <MaterialIcon name="remove" />
        </button>
        <button
          type="button"
          className="upload-duration__control"
          onClick={() => (onStep ? onStep(1) : changeBy(1))}
          disabled={!hasNext && !onStep}
          aria-label={`增加${unit}`}
        >
          <MaterialIcon name="add" />
        </button>
      </div>

      <span className="upload-duration__unit">{unit}</span>
    </div>
  );
}

export default Upload;


