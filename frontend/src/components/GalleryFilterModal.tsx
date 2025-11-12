import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import clsx from "clsx";

import MaterialIcon from "@/components/MaterialIcon";
import type { GalleryFilters, GalleryFilterStats } from "@/pages/Gallery";

import "./GalleryFilterModal.css";

type GalleryFilterModalProps = {
  open: boolean;
  filters: GalleryFilters;
  stats: GalleryFilterStats;
  onChange: Dispatch<SetStateAction<GalleryFilters>>;
  onClose: () => void;
  onReset: () => void;
  onApply: () => void;
};

type TimeOption = {
  label: string;
  value: GalleryFilters["timeRange"];
};

type SortOption = {
  label: string;
  value: GalleryFilters["sortBy"];
};

const TIME_OPTIONS: TimeOption[] = [
  { label: "全部", value: "all" },
  { label: "最近 7 天", value: "7d" },
  { label: "最近 30 天", value: "30d" },
  { label: "最近 90 天", value: "90d" },
];

const SORT_OPTIONS: SortOption[] = [
  { label: "最新优先", value: "newest" },
  { label: "最早优先", value: "oldest" },
  { label: "评分最高", value: "rating-high" },
  { label: "评分最低", value: "rating-low" },
  { label: "时长最长", value: "duration-high" },
  { label: "时长最短", value: "duration-low" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDurationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0 分钟";
  }
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours > 0 && remain > 0) {
    return `${hours} 小时 ${remain} 分钟`;
  }
  if (hours > 0) {
    return `${hours} 小时`;
  }
  return `${remain} 分钟`;
}

function GalleryFilterModal({
  open,
  filters,
  stats,
  onChange,
  onClose,
  onReset,
  onApply,
}: GalleryFilterModalProps) {
  const ratingDefaults = useMemo(
    () => ({
      min: stats.rating.min ?? 0,
      max: stats.rating.max ?? 100,
    }),
    [stats.rating.max, stats.rating.min],
  );

  const durationDefaults = useMemo(
    () => ({
      min: stats.duration.min ?? 0,
      max: stats.duration.max ?? 720,
    }),
    [stats.duration.max, stats.duration.min],
  );

  const handleTimeRangeChange = (value: GalleryFilters["timeRange"]) => {
    onChange((prev) => ({
      ...prev,
      timeRange: value,
    }));
  };

  const handleSortChange = (value: GalleryFilters["sortBy"]) => {
    onChange((prev) => ({
      ...prev,
      sortBy: value,
    }));
  };

  const handleToggleTag = (tag: string) => {
    onChange((prev) => {
      const exists = prev.tags.includes(tag);
      return {
        ...prev,
        tags: exists ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
      };
    });
  };

  const handleRatingMinChange = (value: number) => {
    onChange((prev) => {
      const nextMin = clamp(value, ratingDefaults.min, ratingDefaults.max);
      if (nextMin > prev.rating.max) {
        return {
          ...prev,
          rating: { min: prev.rating.max, max: nextMin },
        };
      }
      return {
        ...prev,
        rating: { min: nextMin, max: prev.rating.max },
      };
    });
  };

  const handleRatingMaxChange = (value: number) => {
    onChange((prev) => {
      const nextMax = clamp(value, ratingDefaults.min, ratingDefaults.max);
      if (nextMax < prev.rating.min) {
        return {
          ...prev,
          rating: { min: nextMax, max: prev.rating.min },
        };
      }
      return {
        ...prev,
        rating: { min: prev.rating.min, max: nextMax },
      };
    });
  };

  const handleDurationMinChange = (value: number) => {
    onChange((prev) => {
      const nextMin = clamp(value, durationDefaults.min, durationDefaults.max);
      if (nextMin > prev.duration.max) {
        return {
          ...prev,
          duration: { min: prev.duration.max, max: nextMin },
        };
      }
      return {
        ...prev,
        duration: { min: nextMin, max: prev.duration.max },
      };
    });
  };

  const handleDurationMaxChange = (value: number) => {
    onChange((prev) => {
      const nextMax = clamp(value, durationDefaults.min, durationDefaults.max);
      if (nextMax < prev.duration.min) {
        return {
          ...prev,
          duration: { min: nextMax, max: prev.duration.min },
        };
      }
      return {
        ...prev,
        duration: { min: prev.duration.min, max: nextMax },
      };
    });
  };

  return (
    <div className={clsx("gallery-filter", open && "gallery-filter--open")}>
      <button type="button" className="gallery-filter__backdrop" onClick={onClose} />
      <div className="gallery-filter__sheet">
        <header className="gallery-filter__header">
          <h2>筛选与排序</h2>
          <button type="button" className="gallery-filter__icon-button" onClick={onClose}>
            <MaterialIcon name="close" className="gallery-filter__icon" />
          </button>
        </header>

        <div className="gallery-filter__content">
          <section className="gallery-filter__section">
            <h3>时间范围</h3>
            <div className="gallery-filter__pills">
              {TIME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={clsx(
                    "gallery-filter__pill",
                    filters.timeRange === option.value && "gallery-filter__pill--active",
                  )}
                  onClick={() => handleTimeRangeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="gallery-filter__section">
            <div className="gallery-filter__range-header">
              <h3>自我评分</h3>
              <span className="gallery-filter__range-metric">
                {Math.round(filters.rating.min)} - {Math.round(filters.rating.max)} 分
              </span>
            </div>
            <div className="gallery-filter__range">
              <div className="gallery-filter__inputs">
                <label className="gallery-filter__input-field">
                  <span>最低</span>
                  <input
                    type="number"
                    min={ratingDefaults.min}
                    max={ratingDefaults.max}
                    value={Math.round(filters.rating.min)}
                    onChange={(event) => handleRatingMinChange(Number(event.target.value))}
                  />
                </label>
                <label className="gallery-filter__input-field">
                  <span>最高</span>
                  <input
                    type="number"
                    min={ratingDefaults.min}
                    max={ratingDefaults.max}
                    value={Math.round(filters.rating.max)}
                    onChange={(event) => handleRatingMaxChange(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="gallery-filter__section">
            <div className="gallery-filter__range-header">
              <h3>绘画时长</h3>
              <span className="gallery-filter__range-metric">
                {formatDurationLabel(filters.duration.min)} - {formatDurationLabel(filters.duration.max)}
              </span>
            </div>
            <div className="gallery-filter__range">
              <div className="gallery-filter__inputs">
                <label className="gallery-filter__input-field">
                  <span>最短</span>
                  <input
                    type="number"
                    min={durationDefaults.min}
                    max={durationDefaults.max}
                    value={Math.round(filters.duration.min)}
                    onChange={(event) => handleDurationMinChange(Number(event.target.value))}
                  />
                </label>
                <label className="gallery-filter__input-field">
                  <span>最长</span>
                  <input
                    type="number"
                    min={durationDefaults.min}
                    max={durationDefaults.max}
                    value={Math.round(filters.duration.max)}
                    onChange={(event) => handleDurationMaxChange(Number(event.target.value))}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="gallery-filter__section">
            <h3>标签</h3>
            <div className="gallery-filter__pills gallery-filter__pills--wrap">
              {stats.availableTags.length === 0 ? (
                <span className="gallery-filter__empty">暂无标签</span>
              ) : (
                stats.availableTags.map((tag) => {
                  const isActive = filters.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={clsx(
                        "gallery-filter__pill",
                        isActive && "gallery-filter__pill--active",
                      )}
                      onClick={() => handleToggleTag(tag)}
                    >
                      {tag}
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="gallery-filter__section">
            <h3>排序方式</h3>
            <div className="gallery-filter__pills gallery-filter__pills--wrap">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={clsx(
                    "gallery-filter__pill",
                    filters.sortBy === option.value && "gallery-filter__pill--primary",
                  )}
                  onClick={() => handleSortChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="gallery-filter__footer">
          <button
            type="button"
            className="gallery-filter__button gallery-filter__button--ghost"
            onClick={onReset}
          >
            重置
          </button>
          <button
            type="button"
            className="gallery-filter__button gallery-filter__button--primary"
            onClick={onApply}
          >
            应用
          </button>
        </footer>
      </div>
    </div>
  );
}

export default GalleryFilterModal;
