import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import GalleryFilterModal from "@/components/GalleryFilterModal";
import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import ArtworkDetails from "@/pages/ArtworkDetails";
import type { Artwork } from "@/types/artwork";
import { buildTagOptions, loadTagPreferences } from "@/services/tagPreferences";

import "./Gallery.css";

export type { Artwork };

export const INITIAL_ARTWORKS: Artwork[] = [];

type TimeRangeKey = "all" | "7d" | "30d" | "90d";

type SortKey = "newest" | "oldest" | "rating-high" | "rating-low" | "duration-high" | "duration-low";

export type GalleryFilters = {
  timeRange: TimeRangeKey;
  rating: {
    min: number;
    max: number;
  };
  duration: {
    min: number;
    max: number;
  };
  tags: string[];
  sortBy: SortKey;
};

export type GalleryFilterStats = {
  rating: {
    min: number;
    max: number;
  };
  duration: {
    min: number;
    max: number;
  };
  availableTags: string[];
};

type GalleryProps = {
  artworks: Artwork[];
  onOpenUpload?: () => void;
  onDeleteArtwork?: (artwork: Artwork) => void;
  onEditArtwork?: (artwork: Artwork) => void;
  onSetAsFeatured?: (artwork: Artwork) => void;
};

function getArtworkTimestamp(artwork: Artwork): number {
  if (artwork.uploadedAt) {
    const uploadedAtTime = Date.parse(artwork.uploadedAt);
    if (!Number.isNaN(uploadedAtTime)) {
      return uploadedAtTime;
    }
  }
  if (artwork.uploadedDate) {
    const uploadedDateTime = Date.parse(`${artwork.uploadedDate}T00:00:00Z`);
    if (!Number.isNaN(uploadedDateTime)) {
      return uploadedDateTime;
    }
  }
  if (artwork.date) {
    const fallbackTime = Date.parse(artwork.date);
    if (!Number.isNaN(fallbackTime)) {
      return fallbackTime;
    }
  }
  return 0;
}

function parseRatingValue(source: string | undefined): number | null {
  if (!source) {
    return null;
  }
  const match = source.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*5$/);
  if (match) {
    const value = Number.parseFloat(match[1]);
    if (!Number.isNaN(value)) {
      return clamp(value * 20, 0, 100);
    }
    return null;
  }

  const numeric = Number.parseFloat(source);
  if (!Number.isNaN(numeric)) {
    if (numeric <= 5) {
      return clamp(numeric * 20, 0, 100);
    }
    return clamp(numeric, 0, 100);
  }

  return null;
}

function parseDurationMinutes(source: Artwork): number | null {
  if (typeof source.durationMinutes === "number" && Number.isFinite(source.durationMinutes)) {
    return Math.max(source.durationMinutes, 0);
  }
  if (typeof source.duration === "string" && source.duration.trim().length > 0) {
    const match = source.duration.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
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

export function formatDurationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0 分钟";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours > 0 && remaining > 0) {
    return `${hours} 小时 ${remaining} 分钟`;
  }
  if (hours > 0) {
    return `${hours} 小时`;
  }
  return `${remaining} 分钟`;
}

function createDefaultFilters(stats: GalleryFilterStats): GalleryFilters {
  return {
    timeRange: "all",
    rating: {
      min: stats.rating.min,
      max: stats.rating.max,
    },
    duration: {
      min: stats.duration.min,
      max: stats.duration.max,
    },
    tags: [],
    sortBy: "newest",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeFilters(filters: GalleryFilters, stats: GalleryFilterStats): GalleryFilters {
  const ratingMin = clamp(filters.rating.min, stats.rating.min, stats.rating.max);
  const ratingMax = clamp(filters.rating.max, stats.rating.min, stats.rating.max);
  const durationMin = clamp(filters.duration.min, stats.duration.min, stats.duration.max);
  const durationMax = clamp(filters.duration.max, stats.duration.min, stats.duration.max);

  return {
    ...filters,
    rating: {
      min: Math.min(ratingMin, ratingMax),
      max: Math.max(ratingMin, ratingMax),
    },
    duration: {
      min: Math.min(durationMin, durationMax),
      max: Math.max(durationMin, durationMax),
    },
    tags: filters.tags.filter((tag) => stats.availableTags.includes(tag)),
  };
}

// 性能优化配置
const INITIAL_RENDER_COUNT = 20; // 初始渲染的图片数量
const LOAD_MORE_COUNT = 10; // 每次加载更多的数量
const INTERSECTION_ROOT_MARGIN = "300px"; // Intersection Observer 的提前加载距离

function Gallery({ artworks, onOpenUpload, onDeleteArtwork, onEditArtwork, onSetAsFeatured }: GalleryProps) {
  const [showInfo, setShowInfo] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [renderedCount, setRenderedCount] = useState(INITIAL_RENDER_COUNT);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const galleryScrollPositionRef = useRef<number>(0);

  const stats = useMemo<GalleryFilterStats>(() => {
    let maxDuration = 0;
    const preferences = loadTagPreferences();
    const options = buildTagOptions(preferences);
    const tags = options.map((option) => option.name.trim());

    artworks.forEach((artwork) => {
      const durationValue = parseDurationMinutes(artwork);
      if (durationValue !== null) {
        maxDuration = Math.max(maxDuration, durationValue);
      }
    });

    return {
      rating: { min: 0, max: 100 },
      duration: {
        min: 0,
        max: Math.max(maxDuration, 720),
      },
      availableTags: tags,
    };
  }, [artworks]);

  const defaultFilters = useMemo(() => createDefaultFilters(stats), [stats]);
  const [filters, setFilters] = useState<GalleryFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<GalleryFilters>(defaultFilters);

  useEffect(() => {
    setFilters((prev) => normalizeFilters(prev, stats));
    setDraftFilters((prev) => normalizeFilters(prev, stats));
  }, [stats]);

  const filteredArtworks = useMemo(() => {
    const now = Date.now();
    let minTimestamp: number | null = null;
    if (filters.timeRange === "7d") {
      minTimestamp = now - 7 * 86400000;
    } else if (filters.timeRange === "30d") {
      minTimestamp = now - 30 * 86400000;
    } else if (filters.timeRange === "90d") {
      minTimestamp = now - 90 * 86400000;
    }

    const selectedTags = new Set(filters.tags);
    const hasTagFilter = selectedTags.size > 0;

    return artworks.filter((artwork) => {
      const timestamp = getArtworkTimestamp(artwork);
      if (minTimestamp !== null && timestamp < minTimestamp) {
        return false;
      }

      const ratingValue = parseRatingValue(artwork.rating);
      if (
        ratingValue !== null &&
        (ratingValue < filters.rating.min - 1e-6 || ratingValue > filters.rating.max + 1e-6)
      ) {
        return false;
      }
      if (ratingValue === null && filters.rating.min > 0) {
        return false;
      }

      const durationValue = parseDurationMinutes(artwork);
      const durationFallback = durationValue ?? 0;
      if (
        durationFallback < filters.duration.min - 1e-6 ||
        durationFallback > filters.duration.max + 1e-6
      ) {
        return false;
      }

      if (hasTagFilter) {
        const artworkTags = artwork.tags;
        const hasMatch = artworkTags.some((tag) => selectedTags.has(tag));
        if (!hasMatch) {
          return false;
        }
      }

      return true;
    });
  }, [artworks, filters]);

  const sortedArtworks = useMemo(() => {
    const list = [...filteredArtworks];

    const compareByTimestamp = (a: Artwork, b: Artwork) => getArtworkTimestamp(a) - getArtworkTimestamp(b);
    const compareByRating = (a: Artwork, b: Artwork) => {
      const ratingA = parseRatingValue(a.rating) ?? -Infinity;
      const ratingB = parseRatingValue(b.rating) ?? -Infinity;
      return ratingA - ratingB;
    };
    const compareByDuration = (a: Artwork, b: Artwork) => {
      const durationA = parseDurationMinutes(a) ?? -Infinity;
      const durationB = parseDurationMinutes(b) ?? -Infinity;
      return durationA - durationB;
    };

    switch (filters.sortBy) {
      case "oldest":
        list.sort(compareByTimestamp);
        break;
      case "rating-high":
        list.sort((a, b) => compareByRating(b, a));
        break;
      case "rating-low":
        list.sort(compareByRating);
        break;
      case "duration-high":
        list.sort((a, b) => compareByDuration(b, a));
        break;
      case "duration-low":
        list.sort(compareByDuration);
        break;
      case "newest":
      default:
        list.sort((a, b) => compareByTimestamp(b, a));
        break;
    }

    return list;
  }, [filteredArtworks, filters.sortBy]);

  // 瀑布流算法：将图片按时间顺序交替分配到左右两列
  // 这样可以确保时间顺序正确：第一张在左列，第二张在右列，第三张在左列，以此类推
  const distributedArtworks = useMemo(() => {
    const artworksToRender = sortedArtworks.slice(0, renderedCount);
    const leftColumn: Artwork[] = [];
    const rightColumn: Artwork[] = [];

    artworksToRender.forEach((artwork, index) => {
      // 交替分配：偶数索引（0, 2, 4...）放在左列，奇数索引（1, 3, 5...）放在右列
      if (index % 2 === 0) {
        leftColumn.push(artwork);
      } else {
        rightColumn.push(artwork);
      }
    });

    return { leftColumn, rightColumn };
  }, [sortedArtworks, renderedCount]);

  // 重置渲染数量当排序或筛选改变时
  useEffect(() => {
    setRenderedCount(INITIAL_RENDER_COUNT);
    setLoadedImages(new Set());
  }, [sortedArtworks.length]);

  // 使用 Intersection Observer 实现无限滚动加载
  useEffect(() => {
    if (typeof window === "undefined" || !loadMoreTriggerRef.current) {
      return;
    }

    // 清理旧的 observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // 创建新的 observer 用于加载更多
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && renderedCount < sortedArtworks.length) {
            // 加载更多图片
            setRenderedCount((prev) => Math.min(prev + LOAD_MORE_COUNT, sortedArtworks.length));
          }
        });
      },
      {
        root: null, // 使用视口作为root
        rootMargin: INTERSECTION_ROOT_MARGIN,
        threshold: 0.1,
      },
    );

    observerRef.current.observe(loadMoreTriggerRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [renderedCount, sortedArtworks.length]);

  // 使用 Intersection Observer 优化图片懒加载
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) {
      return;
    }

    const imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const element = entry.target;
            const artworkId = element.getAttribute("data-artwork-id");
            if (artworkId && !loadedImages.has(artworkId)) {
              // 标记为已加载
              setLoadedImages((prev) => new Set(prev).add(artworkId));
            }
          }
        });
      },
      {
        root: null, // 使用视口作为root，而不是container
        rootMargin: "200px", // 提前200px开始加载
        threshold: 0.01,
      },
    );

    // 观察所有占位符和图片元素
    const elements = containerRef.current.querySelectorAll("[data-artwork-id]");
    elements.forEach((el) => imageObserver.observe(el));

    // 立即检查视口内的元素，避免等待observer触发
    const checkInitialVisibility = () => {
      const viewportTop = window.scrollY || window.pageYOffset || 0;
      const viewportBottom = viewportTop + window.innerHeight;
      const margin = 200; // 与rootMargin保持一致

      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const elementTop = viewportTop + rect.top;
        const elementBottom = elementTop + rect.height;

        // 检查元素是否在视口内（包括margin）
        if (elementBottom >= viewportTop - margin && elementTop <= viewportBottom + margin) {
          const artworkId = el.getAttribute("data-artwork-id");
          if (artworkId && !loadedImages.has(artworkId)) {
            setLoadedImages((prev) => new Set(prev).add(artworkId));
          }
        }
      });
    };

    // 延迟执行，确保DOM已渲染
    requestAnimationFrame(() => {
      requestAnimationFrame(checkInitialVisibility);
    });

    return () => {
      imageObserver.disconnect();
    };
  }, [distributedArtworks, loadedImages]);

  // 处理详情页打开/关闭时的滚动位置
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedIndex !== null) {
      // 打开详情页时，保存当前滚动位置
      galleryScrollPositionRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
      // 滚动到顶部，确保详情页从顶部开始
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    } else {
      // 关闭详情页时，恢复之前保存的滚动位置
      const savedPosition = galleryScrollPositionRef.current;
      requestAnimationFrame(() => {
        window.scrollTo(0, savedPosition);
      });
    }
  }, [selectedIndex]);

  const handleShare = useCallback((artwork: Artwork) => {
    const hasNavigator = typeof navigator !== "undefined";
    const hasWindow = typeof window !== "undefined";

    const shareData = {
      title: artwork.title,
      text: `${artwork.title} · ${artwork.date}`,
      url: hasWindow ? window.location.href : "",
    };

    if (hasNavigator && typeof navigator.share === "function") {
      navigator
        .share(shareData)
        .catch((error) => {
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

  if (selectedIndex !== null) {
    const selectedArtwork = sortedArtworks[selectedIndex];
    const hasPrev = selectedIndex > 0;
    const hasNext = selectedIndex < sortedArtworks.length - 1;

    return (
      <ArtworkDetails
        artwork={selectedArtwork}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onBack={() => setSelectedIndex(null)}
        onShare={(artwork) => handleShare(artwork)}
        onDelete={(artwork) => onDeleteArtwork?.(artwork)}
        onEdit={(artwork) => onEditArtwork?.(artwork)}
        onSetAsFeatured={(artwork) => onSetAsFeatured?.(artwork)}
        onNavigate={(direction) => {
          if (direction === "prev" && hasPrev) {
            setSelectedIndex((index) => (index === null ? null : Math.max(0, index - 1)));
          } else if (direction === "next" && hasNext) {
            setSelectedIndex((index) =>
              index === null ? null : Math.min(sortedArtworks.length - 1, index + 1),
            );
          }
        }}
      />
    );
  }

  return (
    <div className="gallery-screen">
      <div className="gallery-screen__background">
        <div className="gallery-screen__glow gallery-screen__glow--primary" />
        <div className="gallery-screen__glow gallery-screen__glow--secondary" />
      </div>

      <TopNav
        title="画集"
        subtitle="My Works"
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: showInfo ? "visibility" : "visibility_off",
          label: showInfo ? "隐藏作品信息" : "显示作品信息",
          onClick: () => setShowInfo((prev) => !prev),
        }}
        trailingActions={[
          {
            icon: "tune",
            label: "筛选作品",
            onClick: () => {
              setDraftFilters(filters);
              setFilterOpen(true);
            },
          },
        ]}
      />

      <main className="gallery-screen__content">
        {artworks.length === 0 ? (
          <p className="gallery-screen__empty">暂无作品，点击右下角按钮上传你的第一幅作品吧！</p>
        ) : sortedArtworks.length === 0 ? (
          <p className="gallery-screen__empty">暂无符合条件的作品，可尝试调整筛选条件。</p>
        ) : (
          <>
            <div ref={containerRef} className="gallery-screen__masonry">
              <div className="gallery-screen__masonry-column">
                {distributedArtworks.leftColumn.map((artwork) => {
                  const shouldLoadImage = loadedImages.has(artwork.id);
                  return (
                    <figure key={artwork.id} className="gallery-item">
                      <button
                        type="button"
                        className="gallery-item__trigger"
                        onClick={() => {
                          const actualIndex = sortedArtworks.findIndex((item) => item.id === artwork.id);
                          // 保存当前滚动位置
                          if (typeof window !== "undefined") {
                            galleryScrollPositionRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
                          }
                          setSelectedIndex(actualIndex === -1 ? null : actualIndex);
                        }}
                        aria-label={`查看 ${artwork.title}`}
                      >
                        {shouldLoadImage ? (
                          <img
                            src={artwork.imageSrc}
                            alt={artwork.alt}
                            className="gallery-item__image"
                            data-artwork-id={artwork.id}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div
                            className="gallery-item__image gallery-item__image--placeholder"
                            data-artwork-id={artwork.id}
                            style={{
                              aspectRatio: "1",
                              backgroundColor: "rgba(152, 219, 198, 0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <div
                              style={{
                                width: "40%",
                                height: "40%",
                                backgroundColor: "rgba(152, 219, 198, 0.2)",
                                borderRadius: "4px",
                              }}
                            />
                          </div>
                        )}
                        <figcaption
                          className={`gallery-item__info ${showInfo ? "" : "gallery-item__info--hidden"}`.trim()}
                          aria-hidden={!showInfo}
                        >
                          <div>
                            <h2 className="gallery-item__title">{artwork.title}</h2>
                            <p className="gallery-item__date">{artwork.date}</p>
                          </div>
                          <div className="gallery-item__tags">
                            {artwork.tags.map((tag) => (
                              <span key={tag} className="gallery-item__tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </figcaption>
                      </button>
                    </figure>
                  );
                })}
              </div>
              <div className="gallery-screen__masonry-column">
                {distributedArtworks.rightColumn.map((artwork) => {
                  const shouldLoadImage = loadedImages.has(artwork.id);
                  return (
                    <figure key={artwork.id} className="gallery-item">
                      <button
                        type="button"
                        className="gallery-item__trigger"
                        onClick={() => {
                          const actualIndex = sortedArtworks.findIndex((item) => item.id === artwork.id);
                          // 保存当前滚动位置
                          if (typeof window !== "undefined") {
                            galleryScrollPositionRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
                          }
                          setSelectedIndex(actualIndex === -1 ? null : actualIndex);
                        }}
                        aria-label={`查看 ${artwork.title}`}
                      >
                        {shouldLoadImage ? (
                          <img
                            src={artwork.imageSrc}
                            alt={artwork.alt}
                            className="gallery-item__image"
                            data-artwork-id={artwork.id}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div
                            className="gallery-item__image gallery-item__image--placeholder"
                            data-artwork-id={artwork.id}
                            style={{
                              aspectRatio: "1",
                              backgroundColor: "rgba(152, 219, 198, 0.1)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <div
                              style={{
                                width: "40%",
                                height: "40%",
                                backgroundColor: "rgba(152, 219, 198, 0.2)",
                                borderRadius: "4px",
                              }}
                            />
                          </div>
                        )}
                        <figcaption
                          className={`gallery-item__info ${showInfo ? "" : "gallery-item__info--hidden"}`.trim()}
                          aria-hidden={!showInfo}
                        >
                          <div>
                            <h2 className="gallery-item__title">{artwork.title}</h2>
                            <p className="gallery-item__date">{artwork.date}</p>
                          </div>
                          <div className="gallery-item__tags">
                            {artwork.tags.map((tag) => (
                              <span key={tag} className="gallery-item__tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </figcaption>
                      </button>
                    </figure>
                  );
                })}
              </div>
            </div>
            {/* 加载更多触发器 */}
            {renderedCount < sortedArtworks.length && (
              <div
                ref={loadMoreTriggerRef}
                className="gallery-screen__load-more-trigger"
              />
            )}
          </>
        )}

        <button type="button" className="gallery-screen__fab" onClick={() => onOpenUpload?.()}>
          <MaterialIcon name="add" className="gallery-screen__fab-icon" />
        </button>
      </main>

      <GalleryFilterModal
        open={filterOpen}
        filters={draftFilters}
        stats={stats}
        onChange={setDraftFilters}
        onClose={() => setFilterOpen(false)}
        onReset={() => setDraftFilters(createDefaultFilters(stats))}
        onApply={() => {
          setFilters(draftFilters);
          setFilterOpen(false);
        }}
      />
    </div>
  );
}

export default Gallery;

