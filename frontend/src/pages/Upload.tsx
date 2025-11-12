import { useEffect, useId, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import { getActiveUserEmail } from "@/services/authStorage";
import {
  buildTagOptions,
  createCustomTag,
  loadTagPreferences,
  saveTagPreferences,
  TAG_PREFERENCES_CHANGED_EVENT,
  type TagOption,
  type TagPreferences,
} from "@/services/tagPreferences";
import { PRESET_TAGS } from "@/constants/tagPresets";

import "./Upload.css";

export type UploadResult = {
  file: File;
  title: string;
  description: string;
  tags: string[];
  mood: string;
  rating: number;
  durationMinutes: number;
  previewDataUrl: string | null;
};

type UploadProps = {
  onClose: () => void;
  onSave: (result: UploadResult) => void;
};

const MOODS = [
  "心如止水",
  "兴高采烈",
  "心旷神怡",
  "百无聊赖",
  "怒火中烧",
  "全神贯注",
  "筋疲力尽",
  "灵感迸发",
  "忧心忡忡",
  "踌躇满志",
  "浮想联翩",
  "心满意足",
  "垂头丧气",
  "满怀希望",
  "若有所思",
  "思绪万千",
];

function Upload({ onClose, onSave }: UploadProps) {
  const initialTagState = useMemo(() => {
    const email = getActiveUserEmail();
    const preferences = loadTagPreferences(email);
    const options = buildTagOptions(preferences);
    return {
      options,
      selectedIds: options.filter((option) => option.defaultActive).map((option) => option.id),
    };
  }, []);

  const [rating, setRating] = useState(70);
  const [showRating, setShowRating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>(initialTagState.options);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTagState.selectedIds);
  const [selectedMood, setSelectedMood] = useState<string>("心旷神怡");
  const [durationHours, setDurationHours] = useState<number>(1);
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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

  const handleFileChange = () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
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

  const handleTagToggle = (id: string) => {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((tagId) => tagId !== id) : [...prev, id]));
  };

  const handleMoodSelect = (label: string) => {
    setSelectedMood(label);
  };

  const handleAddTagShortcut = () => {
    if (typeof window === "undefined") {
      return;
    }

    const email = getActiveUserEmail();
    const preferences = loadTagPreferences(email);

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

    const normalized = name.toLowerCase();
    const existingNames = new Set<string>([
      ...preferences.customTags.map((tag) => tag.name.toLowerCase()),
      ...PRESET_TAGS.map((preset) => preset.name.toLowerCase()),
    ]);
    if (existingNames.has(normalized)) {
      window.alert("标签名称已存在，请使用其他名称");
      return;
    }

    const newTag = createCustomTag(name);
    const nextPreferences: TagPreferences = {
      ...preferences,
      customTags: [...preferences.customTags, newTag],
    };

    saveTagPreferences(email, nextPreferences);

    const options = buildTagOptions(nextPreferences);
    setTagOptions(options);
    setSelectedTags((prev) => {
      if (prev.includes(newTag.id)) {
        return prev;
      }
      return [...prev, newTag.id];
    });

    window.alert("标签已添加，可在上传时直接使用。");
  };

  const handleSave = () => {
    if (!selectedFile) {
      fileInputRef.current?.click();
      return;
    }

    const selectedTagNames = tagOptions
      .filter((option) => selectedTags.includes(option.id))
      .map((option) => option.name);

    onSave({
      file: selectedFile,
      title: title.trim(),
      description: description.trim(),
      tags: selectedTagNames,
      mood: selectedMood,
      rating,
      durationMinutes: totalMinutes,
      previewDataUrl: preview,
    });
  };

  useEffect(() => {
    const handlePreferencesChange = () => {
      const email = getActiveUserEmail();
      const preferences = loadTagPreferences(email);
      const options = buildTagOptions(preferences);
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
    };

    handlePreferencesChange();

    if (typeof window === "undefined") {
      return;
    }

    const tagEventListener = (_event: Event) => {
      handlePreferencesChange();
    };
    const storageListener = (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith("echo.tag-preferences.")) {
        return;
      }
      handlePreferencesChange();
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
          <label className="upload-checkbox">
            <input type="checkbox" defaultChecked />
            <span>关联到其他作品</span>
          </label>
          <button type="button" className="upload-select">
            <span>选择作品…</span>
          </button>
          <button type="button" className="upload-save" onClick={handleSave} disabled={!selectedFile}>
            保存
          </button>
        </section>
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


