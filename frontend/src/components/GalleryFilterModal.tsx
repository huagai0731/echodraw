import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import clsx from "clsx";

import MaterialIcon from "@/components/MaterialIcon";
import type { GalleryFilters, GalleryFilterStats, TagFilterMode } from "@/utils/urlQueryState";

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

function GalleryFilterModal({
  open,
  filters,
  stats,
  onChange,
  onClose,
  onReset,
  onApply,
}: GalleryFilterModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const mountedRef = useRef(false);

  // 控制动画触发
  useEffect(() => {
    if (open) {
      // 组件首次渲染或重新打开
      if (!mountedRef.current) {
        // 首次渲染：延迟添加open类，确保浏览器能捕获状态变化
        mountedRef.current = true;
        // 双重 requestAnimationFrame 确保浏览器能看到状态变化
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsOpen(true);
          });
        });
      } else {
        // 已经渲染过，直接设置
        setIsOpen(true);
      }
    } else {
      // 关闭时，先触发动画
      setIsOpen(false);
      // 可以在这里清理 mountedRef，但保留以便下次打开时能正确触发动画
    }
  }, [open]);
  const handleToggleTag = (tag: string) => {
    onChange((prev) => {
      const exists = prev.tags.includes(tag);
      return {
        ...prev,
        tags: exists ? prev.tags.filter((item) => item !== tag) : [...prev.tags, tag],
      };
    });
  };

  const handleModeChange = (mode: TagFilterMode) => {
    onChange((prev) => ({
      ...prev,
      tagMode: mode,
    }));
  };

  return (
    <div 
      ref={containerRef}
      className={clsx("gallery-filter", isOpen && "gallery-filter--open")}
    >
      <button type="button" className="gallery-filter__backdrop" onClick={onClose} />
      <div ref={sheetRef} className="gallery-filter__sheet">
        <header className="gallery-filter__header">
          <h2>筛选标签</h2>
          <button type="button" className="gallery-filter__icon-button" onClick={onClose}>
            <MaterialIcon name="close" className="gallery-filter__icon" />
          </button>
        </header>

        <div className="gallery-filter__content">
          <section className="gallery-filter__section">
            <div className="gallery-filter__section-header">
              <h3>标签</h3>
              <div className="gallery-filter__select-wrapper">
                <select
                  className="gallery-filter__mode-select"
                  value={filters.tagMode}
                  onChange={(e) => handleModeChange(e.target.value as TagFilterMode)}
                >
                  <option value="any">满足任意一个</option>
                  <option value="all">全部满足</option>
                </select>
                <MaterialIcon name="arrow_drop_down" className="gallery-filter__select-icon" />
              </div>
            </div>
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
