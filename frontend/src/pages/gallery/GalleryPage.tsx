import { memo, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import type { Artwork } from "@/types/artwork";
import { buildTagOptionsAsync, loadTagPreferencesAsync } from "@/services/tagPreferences";
import {
  useURLQueryState,
  type GalleryFilters,
  type GalleryFilterStats,
} from "@/utils/urlQueryState";
import {
  restoreScrollPositionWithRetry,
  saveScrollPosition,
  getCurrentScrollPosition,
  restoreScrollPosition,
} from "@/utils/scrollManager";
import {
  isValidArtwork,
  filterArtworks,
  sortArtworks,
} from "./galleryUtils";
import { GalleryHeader } from "./GalleryHeader";
import { FilterPanel } from "./FilterPanel";
import { GalleryVirtualGrid } from "./GalleryVirtualGrid";
import { GalleryDetailModal } from "./GalleryDetailModal";
import { getVisualAnalysisQuota, type VisualAnalysisQuota } from "@/services/api";

import "../Gallery.css";

export type { Artwork };

export const INITIAL_ARTWORKS: Artwork[] = [];

type GalleryPageProps = {
  artworks: Artwork[];
  onOpenUpload?: (origin?: { x: number; y: number; size: number }) => void;
  onDeleteArtwork?: (artwork: Artwork) => void;
  onEditArtwork?: (artwork: Artwork) => void;
  onUpdateArtwork?: (artwork: Artwork) => void;
  onSetAsFeatured?: (artwork: Artwork) => void;
  onRemoveFromFeatured?: (artwork: Artwork) => void;
};

export function GalleryPage({
  artworks,
  onOpenUpload,
  onDeleteArtwork,
  onEditArtwork,
  onUpdateArtwork,
  onSetAsFeatured,
  onRemoveFromFeatured,
}: GalleryPageProps) {
  const fabRef = useRef<HTMLButtonElement>(null);
  const [showInfo, setShowInfo] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [draftFilters, setDraftFilters] = useState<GalleryFilters | null>(null);
  const scrollRestoredRef = useRef(false);
  const wasDetailOpenRef = useRef(false);
  const shouldRestoreScrollRef = useRef(false);
  const [quota, setQuota] = useState<VisualAnalysisQuota | null>(null);

  // 验证作品数据
  const validArtworks = useMemo(() => {
    try {
      return artworks.filter(isValidArtwork);
    } catch (error) {
      console.error("[Gallery] Error validating artworks", error);
      return [];
    }
  }, [artworks]);

  // 加载可用的tag列表（包括系统预设和用户自定义）
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagNameToIdMap, setTagNameToIdMap] = useState<Map<string, string>>(new Map());
  const [tagIdToNameMap, setTagIdToNameMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    loadTagPreferencesAsync()
      .then((preferences) => buildTagOptionsAsync(preferences))
      .then((options) => {
        const tags = options.map((option) => option.name.trim());
        const nameToIdMap = new Map<string, string>();
        const idToNameMap = new Map<string, string>();
        options.forEach((opt) => {
          const name = opt.name.trim();
          const id = String(opt.id);
          nameToIdMap.set(name, id);
          idToNameMap.set(id, name);
        });
        setAvailableTags(tags);
        setTagNameToIdMap(nameToIdMap);
        setTagIdToNameMap(idToNameMap);
      })
      .catch((error) => {
        console.error("[Gallery] Failed to load tags", error);
      });
  }, []);

  // 计算筛选统计信息
  const stats = useMemo<GalleryFilterStats>(() => {
    return {
      availableTags,
    };
  }, [availableTags]);

  // URL 状态管理
  const [filters, updateFilters] = useURLQueryState();

  // 规范化筛选条件（只保留有效的tags）
  const normalizedFilters = useMemo(() => {
    return {
      tags: filters.tags.filter((tag) => availableTags.includes(tag)),
      tagMode: filters.tagMode || "any",
    };
  }, [filters, availableTags]);

  // 筛选作品
  const filteredArtworks = useMemo(() => {
    try {
      return filterArtworks(validArtworks, normalizedFilters, tagNameToIdMap);
    } catch (error) {
      console.error("[Gallery] Error filtering artworks", error);
      return [];
    }
  }, [validArtworks, normalizedFilters, tagNameToIdMap]);

  // 直接使用筛选后的作品，不再处理套图
  const processedArtworks = filteredArtworks;

  // 排序作品（默认按最新优先）
  const sortedArtworks = useMemo(() => {
    try {
      return sortArtworks(processedArtworks, "newest");
    } catch (error) {
      console.error("[Gallery] Error sorting artworks", error);
      return processedArtworks;
    }
  }, [processedArtworks]);



  // 处理作品选择
  const handleSelectArtwork = useCallback(
    (artwork: Artwork) => {
      // 保存滚动位置
      const currentPosition = getCurrentScrollPosition();
      saveScrollPosition(currentPosition);
      wasDetailOpenRef.current = true; // 标记详情页已打开
      setSelectedArtwork(artwork);
    },
    []
  );

  // 处理详情页关闭
  const handleCloseDetail = useCallback(() => {
    // 在关闭详情页之前，先获取保存的滚动位置并立即设置
    // 这样可以避免组件重新渲染时先滚动到顶部
    if (wasDetailOpenRef.current) {
      const savedPosition = restoreScrollPosition();
      if (savedPosition !== null && savedPosition > 0) {
        // 立即设置滚动位置，在组件重新渲染之前
        // 使用同步方式立即设置，避免任何延迟
        window.scrollTo(0, savedPosition);
        document.documentElement.scrollTop = savedPosition;
        document.body.scrollTop = savedPosition;
        // 标记需要在渲染后再次确认（处理虚拟滚动）
        shouldRestoreScrollRef.current = true;
      }
      wasDetailOpenRef.current = false;
    }
    setSelectedArtwork(null);
    // 滚动位置恢复在 useLayoutEffect 中处理，确保虚拟滚动也正确
  }, []);

  // 处理作品删除：删除成功后关闭详情页
  const handleDeleteArtworkWithClose = useCallback(
    async (artwork: Artwork) => {
      await onDeleteArtwork?.(artwork);
      // 删除成功后，检查选中的作品是否还存在
      // 如果不存在（已被删除），自动关闭详情页
      setSelectedArtwork((prev) => {
        if (prev && prev.id === artwork.id) {
          // 选中的作品已被删除，关闭详情页
          return null;
        }
        return prev;
      });
    },
    [onDeleteArtwork]
  );

  // 用于导航的作品列表（直接使用筛选后的作品）
  const expandedArtworksForNavigation = filteredArtworks;

  // 处理详情页导航
  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!selectedArtwork) return;

      const currentIndex = expandedArtworksForNavigation.findIndex((a) => a.id === selectedArtwork.id);
      if (currentIndex < 0) return;

      let newIndex: number;
      if (direction === "prev") {
        newIndex = Math.max(0, currentIndex - 1);
      } else {
        newIndex = Math.min(expandedArtworksForNavigation.length - 1, currentIndex + 1);
      }

      if (newIndex !== currentIndex && expandedArtworksForNavigation[newIndex]) {
        setSelectedArtwork(expandedArtworksForNavigation[newIndex]);
      }
    },
    [selectedArtwork, expandedArtworksForNavigation]
  );

  // 计算详情页导航状态
  const detailNavState = useMemo(() => {
    if (!selectedArtwork) {
      return { hasPrev: false, hasNext: false };
    }

    const currentIndex = expandedArtworksForNavigation.findIndex((a) => a.id === selectedArtwork.id);
    if (currentIndex < 0) {
      return { hasPrev: false, hasNext: false };
    }

    return {
      hasPrev: currentIndex > 0,
      hasNext: currentIndex < expandedArtworksForNavigation.length - 1,
    };
  }, [selectedArtwork, expandedArtworksForNavigation]);

  // 获取视觉分析额度信息
  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const quotaData = await getVisualAnalysisQuota();
        setQuota(quotaData);
      } catch (err) {
        console.error("获取视觉分析额度失败:", err);
        // 不显示错误，因为这不是关键功能
      }
    };
    
    fetchQuota();
  }, []);

  // 恢复滚动位置（页面加载时）
  useEffect(() => {
    if (scrollRestoredRef.current) return;

    const savedPosition = restoreScrollPosition();
    if (savedPosition !== null && savedPosition > 0) {
      scrollRestoredRef.current = true;
      restoreScrollPositionWithRetry(savedPosition);
    }
  }, []);

  // 当关闭详情页后，使用 useLayoutEffect 立即恢复滚动位置
  // useLayoutEffect 在 DOM 更新后、浏览器绘制前执行，可以避免闪烁
  useLayoutEffect(() => {
    // 如果 selectedArtwork 为 null（详情页已关闭），且需要恢复滚动位置
    if (selectedArtwork === null && shouldRestoreScrollRef.current) {
      shouldRestoreScrollRef.current = false; // 清除标记
      const savedPosition = restoreScrollPosition();
      if (savedPosition !== null && savedPosition > 0) {
        // 立即设置滚动位置，在浏览器绘制之前
        // 使用同步方式，确保立即生效
        window.scrollTo(0, savedPosition);
        document.documentElement.scrollTop = savedPosition;
        document.body.scrollTop = savedPosition;
        
        // 然后在下一帧再次确认，处理虚拟滚动的情况
        // 使用更长的延迟，确保虚拟滚动已经渲染完成
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              // 再次设置，确保位置正确
              window.scrollTo(0, savedPosition);
              document.documentElement.scrollTop = savedPosition;
              document.body.scrollTop = savedPosition;
              // 使用重试机制处理虚拟滚动
              restoreScrollPositionWithRetry(savedPosition, 15, 150);
            }, 150);
          });
        });
      }
    }
  }, [selectedArtwork]);

  // 处理筛选面板
  const handleOpenFilter = useCallback(() => {
    setDraftFilters(normalizedFilters);
    setFilterOpen(true);
  }, [normalizedFilters]);

  const handleCloseFilter = useCallback(() => {
    setFilterOpen(false);
    setDraftFilters(null);
  }, []);

  const handleResetFilter = useCallback(() => {
    if (!draftFilters) return;
    const defaultFilters: GalleryFilters = {
      tags: [],
      tagMode: "any",
    };
    setDraftFilters(defaultFilters);
  }, [draftFilters]);

  const handleApplyFilter = useCallback(() => {
    if (!draftFilters) return;
    updateFilters(draftFilters);
    setFilterOpen(false);
    setDraftFilters(null);
  }, [draftFilters, updateFilters]);

  // 处理分享
  const handleShare = useCallback((artwork: Artwork) => {
    const hasNavigator = typeof navigator !== "undefined";
    const hasWindow = typeof window !== "undefined";

    const shareData = {
      title: artwork.title,
      text: `${artwork.title} · ${artwork.date}`,
      url: hasWindow ? window.location.href : "",
    };

    if (hasNavigator && typeof navigator.share === "function") {
      navigator.share(shareData).catch((error) => {
        console.warn("分享失败", error);
      });
      return;
    }

    if (hasNavigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard
        .writeText(`${shareData.title} - ${shareData.text}`)
        .then(() => {
          console.info("已复制作品信息到剪贴板");
        })
        .catch((error) => {
          console.warn("无法复制作品信息", error);
        });
    }
  }, []);

  // 处理图片加载（用于缓存尺寸）
  const handleImageLoad = useCallback(() => {
    // 尺寸已由 imageCache 缓存，这里可以添加其他逻辑
  }, []);

  return (
    <>
      {/* 列表视图 - 当详情页打开时隐藏，但保持渲染 */}
      <div className="gallery-screen" style={{ display: selectedArtwork ? 'none' : undefined }}>
      <div className="gallery-screen__background">
        <div className="gallery-screen__glow gallery-screen__glow--primary" />
        <div className="gallery-screen__glow gallery-screen__glow--secondary" />
      </div>

      <GalleryHeader
        showInfo={showInfo}
        onToggleInfo={() => setShowInfo((prev) => !prev)}
        onOpenFilter={handleOpenFilter}
        activeFilters={normalizedFilters.tags}
        tagMode={normalizedFilters.tagMode}
      />

      <main className="gallery-screen__content">
        {validArtworks.length === 0 ? (
          <p className="gallery-screen__empty">暂无作品，点击右下角按钮上传你的第一幅作品吧！</p>
        ) : sortedArtworks.length === 0 ? (
          <p className="gallery-screen__empty">暂无符合条件的作品，可尝试调整筛选条件。</p>
        ) : (
          <GalleryVirtualGrid
            artworks={sortedArtworks}
            showInfo={showInfo}
            tagIdToNameMap={tagIdToNameMap}
            onSelect={handleSelectArtwork}
            onImageLoad={handleImageLoad}
          />
        )}

        <button
          ref={fabRef}
          type="button"
          className="gallery-screen__fab"
          onClick={() => {
            if (fabRef.current && onOpenUpload) {
              const rect = fabRef.current.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              const size = Math.max(rect.width, rect.height);
              onOpenUpload({ x, y, size });
            } else {
              onOpenUpload?.();
            }
          }}
        >
          <MaterialIcon name="add" className="gallery-screen__fab-icon" />
        </button>
      </main>

      {draftFilters && (
        <FilterPanel
          open={filterOpen}
          filters={draftFilters}
          stats={stats}
          onFiltersChange={(newFilters) => {
            setDraftFilters(typeof newFilters === "function" ? newFilters(draftFilters) : newFilters);
          }}
          onClose={handleCloseFilter}
          onReset={handleResetFilter}
          onApply={handleApplyFilter}
        />
      )}
      </div>

      {/* 详情页 - 当有选中作品时显示 */}
      {selectedArtwork && (
        <GalleryDetailModal
          artwork={selectedArtwork}
          allArtworks={validArtworks}
          hasPrev={detailNavState.hasPrev}
          hasNext={detailNavState.hasNext}
          onClose={handleCloseDetail}
          onShare={handleShare}
          onDelete={handleDeleteArtworkWithClose}
          onEdit={onEditArtwork}
          onUpdateArtwork={onUpdateArtwork}
          onSetAsFeatured={onSetAsFeatured}
          onRemoveFromFeatured={onRemoveFromFeatured}
          onNavigate={handleNavigate}
          onSelectArtwork={handleSelectArtwork}
        />
      )}
    </>
  );
}


// 使用 React.memo 优化，避免不必要的重渲染
export default memo(GalleryPage);

