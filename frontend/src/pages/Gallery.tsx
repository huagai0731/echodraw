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

// 安全验证：验证图片URL是否安全（防止XSS和SSRF攻击）
function isValidImageUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  // 允许相对路径（以/开头）
  if (url.startsWith("/")) {
    return true;
  }

  // 允许data URL（base64图片）
  if (url.startsWith("data:image/")) {
    // 验证data URL格式
    const dataUrlPattern = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
    return dataUrlPattern.test(url);
  }

  // 允许blob URL（本地文件预览）
  if (url.startsWith("blob:")) {
    return true;
  }

  // 对于绝对URL，只允许同源或受信任的域名
  try {
    const urlObj = new URL(url, window.location.origin);
    // 只允许http和https协议
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return false;
    }
    // 允许同源URL
    if (urlObj.origin === window.location.origin) {
      return true;
    }
    // 对于生产环境，可以在这里添加受信任的CDN域名白名单
    // 例如：return urlObj.hostname === "cdn.example.com";
    // 目前为了安全，只允许同源URL
    return false;
  } catch {
    // URL解析失败，可能是无效的URL
    return false;
  }
}

// 数据验证：验证artwork对象是否有效
function isValidArtwork(artwork: any): artwork is Artwork {
  if (!artwork || typeof artwork !== "object") {
    return false;
  }

  // 必需字段检查
  if (!artwork.id || typeof artwork.id !== "string" || artwork.id.trim() === "") {
    return false;
  }

  if (!artwork.title || typeof artwork.title !== "string") {
    return false;
  }

  if (!artwork.date || typeof artwork.date !== "string") {
    return false;
  }

  if (!isValidImageUrl(artwork.imageSrc)) {
    return false;
  }

  if (!artwork.alt || typeof artwork.alt !== "string") {
    return false;
  }

  if (!Array.isArray(artwork.tags)) {
    return false;
  }

  // 验证tags数组中的每个元素都是字符串
  if (!artwork.tags.every((tag: any) => typeof tag === "string")) {
    return false;
  }

  return true;
}

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
  onRemoveFromFeatured?: (artwork: Artwork) => void;
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
const MAX_RENDERED_COUNT = 200; // 最多同时渲染的图片数量（虚拟滚动窗口）
const VIEWPORT_BUFFER = 300; // 视口缓冲距离（像素），用于计算哪些图片应该被卸载
const IMAGE_CLEANUP_THRESHOLD = 500; // 图片离开视口多少像素后从内存中清理

function Gallery({ artworks, onOpenUpload, onDeleteArtwork, onEditArtwork, onSetAsFeatured, onRemoveFromFeatured }: GalleryProps) {
  const [showInfo, setShowInfo] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [renderedCount, setRenderedCount] = useState(INITIAL_RENDER_COUNT);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: INITIAL_RENDER_COUNT }); // 虚拟滚动窗口
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const imageObserverRef = useRef<IntersectionObserver | null>(null);
  const galleryScrollPositionRef = useRef<number>(0);
  const isRestoringScrollRef = useRef<boolean>(false); // 标记是否正在恢复滚动位置
  const scrollCleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 滚动清理定时器
  const elementPositionsRef = useRef<Map<string, number>>(new Map()); // 存储元素位置，用于清理

  // 修复：过滤掉无效的artwork数据，防止渲染错误数据
  const validArtworks = useMemo(() => {
    try {
      return artworks.filter(isValidArtwork);
    } catch (error) {
      console.error("[Gallery] Error validating artworks", error);
      return [];
    }
  }, [artworks]);

  const stats = useMemo<GalleryFilterStats>(() => {
    let maxDuration = 0;
    const preferences = loadTagPreferences();
    const options = buildTagOptions(preferences);
    const tags = options.map((option) => option.name.trim());

    validArtworks.forEach((artwork) => {
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
  }, [validArtworks]);

  const defaultFilters = useMemo(() => createDefaultFilters(stats), [stats]);
  const [filters, setFilters] = useState<GalleryFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<GalleryFilters>(defaultFilters);

  useEffect(() => {
    // 修复：添加错误处理，防止筛选器更新失败
    try {
      setFilters((prev) => normalizeFilters(prev, stats));
      setDraftFilters((prev) => normalizeFilters(prev, stats));
    } catch (error) {
      console.error("[Gallery] Failed to normalize filters", error);
    }
  }, [stats]);
  
  // 修复：清理防抖定时器
  useEffect(() => {
    return () => {
      if (filterChangeTimeoutRef.current) {
        clearTimeout(filterChangeTimeoutRef.current);
        filterChangeTimeoutRef.current = null;
      }
    };
  }, []);

  const filteredArtworks = useMemo(() => {
    // 修复：添加错误处理，防止筛选失败导致组件崩溃
    try {
      // 修复：使用上海时区计算时间范围，确保日期计算准确
      // 获取当前上海时区的日期（UTC+8）
      const now = Date.now();
      const shanghaiOffset = 8 * 60 * 60 * 1000; // UTC+8 的毫秒偏移
      const shanghaiNow = now + shanghaiOffset;
      const shanghaiDate = new Date(shanghaiNow);
      // 获取上海时区的当天0点（UTC时间）
      const shanghaiMidnight = new Date(Date.UTC(
        shanghaiDate.getUTCFullYear(),
        shanghaiDate.getUTCMonth(),
        shanghaiDate.getUTCDate(),
        0, 0, 0, 0
      ));
      const shanghaiMidnightTimestamp = shanghaiMidnight.getTime() - shanghaiOffset;
      
      let minTimestamp: number | null = null;
      if (filters.timeRange === "7d") {
        minTimestamp = shanghaiMidnightTimestamp - 7 * 86400000;
      } else if (filters.timeRange === "30d") {
        minTimestamp = shanghaiMidnightTimestamp - 30 * 86400000;
      } else if (filters.timeRange === "90d") {
        minTimestamp = shanghaiMidnightTimestamp - 90 * 86400000;
      }

      const selectedTags = new Set(filters.tags);
      const hasTagFilter = selectedTags.size > 0;

      // 性能优化：如果筛选条件为空，直接返回所有作品
      const hasTimeFilter = filters.timeRange !== "all";
      const hasRatingFilter = filters.rating.min > 0 || filters.rating.max < 100;
      const hasDurationFilter = filters.duration.min > 0 || filters.duration.max < 720;
      
      if (!hasTimeFilter && !hasRatingFilter && !hasDurationFilter && !hasTagFilter) {
        return validArtworks;
      }

      return validArtworks.filter((artwork) => {
      const timestamp = getArtworkTimestamp(artwork);
      if (minTimestamp !== null && timestamp < minTimestamp) {
        return false;
      }

      const ratingValue = parseRatingValue(artwork.rating);
      // 如果有评分，检查是否在筛选范围内
      if (ratingValue !== null) {
        if (ratingValue < filters.rating.min - 1e-6 || ratingValue > filters.rating.max + 1e-6) {
          return false;
        }
      }
      // 如果无评分但设置了最小评分筛选，且最小评分大于0，则排除
      // 但如果是筛选最小值0，则包含无评分作品
      if (ratingValue === null && filters.rating.min > 1e-6) {
        return false;
      }

      const durationValue = parseDurationMinutes(artwork);
      // 如果有时长信息，检查是否在筛选范围内
      if (durationValue !== null) {
        if (
          durationValue < filters.duration.min - 1e-6 ||
          durationValue > filters.duration.max + 1e-6
        ) {
          return false;
        }
      } else {
        // 如果无时长信息，只有在设置了最小时长筛选（大于0）时才排除
        // 如果最小时长为0，则包含无时长信息的作品
        if (filters.duration.min > 1e-6) {
          return false;
        }
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
    } catch (error) {
      console.error("[Gallery] Error filtering artworks", error);
      // 出错时返回空数组，避免组件崩溃
      return [];
    }
  }, [validArtworks, filters]);

  // 处理套图逻辑：每个套图只显示最新的一张（作为封面），其他图片隐藏
  const processedArtworks = useMemo(() => {
    // 修复：添加错误处理，防止套图处理失败导致组件崩溃
    try {
      const collectionMap = new Map<string, Artwork[]>();
      const standaloneArtworks: Artwork[] = [];

      // 将作品分为套图和非套图
      filteredArtworks.forEach((artwork) => {
      if (artwork.collectionId) {
        if (!collectionMap.has(artwork.collectionId)) {
          collectionMap.set(artwork.collectionId, []);
        }
        collectionMap.get(artwork.collectionId)!.push(artwork);
      } else {
        standaloneArtworks.push(artwork);
      }
    });

    // 对每个套图，只保留最新的一张（按上传时间排序）
    const collectionCovers: Artwork[] = [];
    collectionMap.forEach((collectionArtworks) => {
      // 按上传时间排序，最新的在前
      collectionArtworks.sort((a, b) => {
        const timeA = getArtworkTimestamp(a);
        const timeB = getArtworkTimestamp(b);
        return timeB - timeA;
      });
      // 只保留最新的一张作为封面
      if (collectionArtworks.length > 0) {
        collectionCovers.push(collectionArtworks[0]);
      }
    });

      // 合并套图封面和非套图作品
      return [...collectionCovers, ...standaloneArtworks];
    } catch (error) {
      console.error("[Gallery] Error processing artworks", error);
      // 出错时返回原始筛选结果，避免组件崩溃
      return filteredArtworks;
    }
  }, [filteredArtworks]);

  const sortedArtworks = useMemo(() => {
    // 修复：添加错误处理，防止排序失败导致组件崩溃
    try {
      const list = [...processedArtworks];

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
    } catch (error) {
      console.error("[Gallery] Error sorting artworks", error);
      // 出错时返回原始列表，避免组件崩溃
      return processedArtworks;
    }
  }, [processedArtworks, filters.sortBy]);

  // 获取套图的所有图片（用于详情页切换）
  // 注意：这里使用validArtworks数组，不受筛选影响，确保套图内所有作品都能切换
  const getCollectionArtworks = useCallback((collectionId: string): Artwork[] => {
    return validArtworks
      .filter((a) => a.collectionId === collectionId)
      .sort((a, b) => {
        const timeA = getArtworkTimestamp(a);
        const timeB = getArtworkTimestamp(b);
        return timeB - timeA; // 最新的在前
      });
  }, [validArtworks]);

  // 获取套图的图片数量（基于所有作品，不受筛选影响）
  const getCollectionCount = useCallback((collectionId: string): number => {
    // 使用validArtworks数组，而不是filteredArtworks，确保显示的是套图的总数
    return validArtworks.filter((a) => a.collectionId === collectionId).length;
  }, [validArtworks]);

  // 虚拟滚动窗口：只渲染视口附近的图片，限制DOM节点数量
  const visibleArtworks = useMemo(() => {
    const totalCount = sortedArtworks.length;
    if (totalCount === 0) {
      return { start: 0, end: 0, artworks: [] };
    }

    // 如果总数小于最大渲染数，直接返回所有
    if (totalCount <= MAX_RENDERED_COUNT) {
      return {
        start: 0,
        end: totalCount,
        artworks: sortedArtworks,
      };
    }

    // 计算虚拟滚动窗口的起始和结束位置
    // 确保窗口不超过最大值，并且总是包含当前视口附近的图片
    const bufferSize = Math.floor(MAX_RENDERED_COUNT / 2);
    let start = Math.max(0, visibleRange.start - bufferSize);
    let end = Math.min(totalCount, start + MAX_RENDERED_COUNT);

    // 如果窗口太靠后，向前调整
    if (end - start < MAX_RENDERED_COUNT) {
      start = Math.max(0, end - MAX_RENDERED_COUNT);
    }

    return {
      start,
      end,
      artworks: sortedArtworks.slice(start, end),
    };
  }, [sortedArtworks, visibleRange]);

  // 瀑布流算法：将图片按时间顺序交替分配到左右两列
  // 这样可以确保时间顺序正确：第一张在左列，第二张在右列，第三张在左列，以此类推
  const distributedArtworks = useMemo(() => {
    const { artworks: artworksToRender, start: globalStart } = visibleArtworks;
    const leftColumn: Artwork[] = [];
    const rightColumn: Artwork[] = [];

    artworksToRender.forEach((artwork, localIndex) => {
      // 计算全局索引（用于保持交替分配的正确性）
      const globalIndex = globalStart + localIndex;
      // 交替分配：偶数索引（0, 2, 4...）放在左列，奇数索引（1, 3, 5...）放在右列
      if (globalIndex % 2 === 0) {
        leftColumn.push(artwork);
      } else {
        rightColumn.push(artwork);
      }
    });

    return { leftColumn, rightColumn, globalStart: globalStart };
  }, [visibleArtworks]);

  // 重置渲染数量当排序或筛选改变时（基于filters和sortBy，而不是sortedArtworks.length）
  const filtersKey = useMemo(() => {
    return JSON.stringify({
      timeRange: filters.timeRange,
      rating: filters.rating,
      duration: filters.duration,
      tags: filters.tags.sort(),
      sortBy: filters.sortBy,
    });
  }, [filters]);

  useEffect(() => {
    // 修复：如果正在从详情页恢复滚动位置，不要干扰
    if (isRestoringScrollRef.current) {
      return;
    }
    
    // 修复：保存当前滚动位置，使用更可靠的方法
    const savedScrollPosition = typeof window !== "undefined" 
      ? window.scrollY || window.pageYOffset || document.documentElement.scrollTop 
      : 0;
    
    setRenderedCount(INITIAL_RENDER_COUNT);
    setLoadedImages(new Set());
    setVisibleRange({ start: 0, end: INITIAL_RENDER_COUNT });
    elementPositionsRef.current.clear();
    
    // 恢复滚动位置（使用更可靠的机制，确保DOM已完全渲染）
    if (savedScrollPosition > 0 && typeof window !== "undefined") {
      // 使用setTimeout确保DOM已更新，并添加重试机制
      let retryCount = 0;
      const maxRetries = 5;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let rafId1: number | null = null;
      let rafId2: number | null = null;
      
      const attemptScroll = () => {
        // 再次检查窗口是否仍然存在
        if (typeof window === "undefined") {
          return;
        }
        
        // 获取当前文档高度
        const maxScroll = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          window.innerHeight
        );
        
        // 如果文档高度还不够，等待一下再试
        if (maxScroll < savedScrollPosition + window.innerHeight && retryCount < maxRetries) {
          retryCount++;
          timeoutId = setTimeout(attemptScroll, 50);
          return;
        }
        
        // 计算目标滚动位置，确保不超过文档高度
        const targetScroll = Math.min(savedScrollPosition, Math.max(0, maxScroll - window.innerHeight));
        
        // 使用scrollTo恢复位置
        if (targetScroll >= 0) {
          try {
            window.scrollTo({
              top: targetScroll,
              behavior: 'instant' as ScrollBehavior, // 立即滚动，不使用动画
            });
          } catch (error) {
            // 如果scrollTo失败，尝试使用scrollTop
            console.debug("[Gallery] scrollTo failed, using scrollTop", error);
            try {
              document.documentElement.scrollTop = targetScroll;
              document.body.scrollTop = targetScroll;
            } catch (e) {
              console.warn("[Gallery] Failed to restore scroll position", e);
            }
          }
        }
      };
      
      // 使用双重requestAnimationFrame确保DOM已更新
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          attemptScroll();
        }) as unknown as number;
      }) as unknown as number;
      
      // 清理函数：清理所有定时器和动画帧
      return () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (rafId1 !== null) {
          cancelAnimationFrame(rafId1);
          rafId1 = null;
        }
        if (rafId2 !== null) {
          cancelAnimationFrame(rafId2);
          rafId2 = null;
        }
      };
    }
  }, [filtersKey]);

  // 使用 Intersection Observer 实现无限滚动加载
  useEffect(() => {
    // 修复：当sortedArtworks为空时，不需要创建observer
    if (typeof window === "undefined" || !loadMoreTriggerRef.current || sortedArtworks.length === 0) {
      // 清理旧的 observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      return;
    }

    // 清理旧的 observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    // 创建新的 observer 用于加载更多
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && renderedCount < sortedArtworks.length) {
            // 加载更多图片（但不立即渲染，等待滚动窗口调整）
            const newCount = Math.min(renderedCount + LOAD_MORE_COUNT, sortedArtworks.length);
            setRenderedCount(newCount);
            
            // 如果总数超过最大渲染数，调整可见范围到底部
            if (sortedArtworks.length > MAX_RENDERED_COUNT) {
              setVisibleRange(() => {
                const newEnd = newCount;
                const newStart = Math.max(0, newEnd - MAX_RENDERED_COUNT);
                return { start: newStart, end: newEnd };
              });
            }
          }
        });
      },
      {
        root: null, // 使用视口作为root
        rootMargin: INTERSECTION_ROOT_MARGIN,
        threshold: 0.1,
      },
    );

    observerRef.current = observer;
    
    // 修复：添加错误处理，防止observer失败
    try {
      observer.observe(loadMoreTriggerRef.current);
    } catch (error) {
      console.warn("[Gallery] Failed to observe load more trigger", error);
      observer.disconnect();
      observerRef.current = null;
    }

    return () => {
      if (observerRef.current) {
        try {
          observerRef.current.disconnect();
        } catch (error) {
          // 忽略已断开的observer错误
          console.debug("[Gallery] Observer already disconnected (safe to ignore)", error);
        }
        observerRef.current = null;
      }
    };
  }, [renderedCount, sortedArtworks.length]);

  // 滚动监听：更新虚拟滚动窗口，并清理离开视口的图片内存
  useEffect(() => {
    if (typeof window === "undefined" || sortedArtworks.length <= MAX_RENDERED_COUNT) {
      return; // 如果总数不超过最大值，不需要虚拟滚动
    }

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      
      requestAnimationFrame(() => {
        ticking = false;
        
        if (typeof window === "undefined" || !containerRef.current) return;
        
        const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
        const viewportHeight = window.innerHeight;
        const viewportTop = scrollTop;
        const viewportBottom = scrollTop + viewportHeight;

        // 计算哪些图片应该在视口附近
        // 简单估算：假设每张图片平均高度为300px（包括间距）
        const estimatedItemHeight = 300;
        const bufferItems = Math.ceil(VIEWPORT_BUFFER / estimatedItemHeight);
        
        // 计算应该渲染的起始索引
        const estimatedStart = Math.max(0, Math.floor(viewportTop / estimatedItemHeight) - bufferItems);

        // 限制在最大渲染数量内
        const newStart = Math.max(0, Math.min(estimatedStart, sortedArtworks.length - MAX_RENDERED_COUNT));
        const newEnd = Math.min(sortedArtworks.length, newStart + MAX_RENDERED_COUNT);

        // 更新可见范围（使用防抖，避免频繁更新）
        setVisibleRange((prev) => {
          // 只有当范围变化足够大时才更新（至少变化20%）
          const changeThreshold = Math.floor(MAX_RENDERED_COUNT * 0.2);
          const startDiff = Math.abs(prev.start - newStart);
          const endDiff = Math.abs(prev.end - newEnd);
          
          if (startDiff > changeThreshold || endDiff > changeThreshold) {
            return { start: newStart, end: newEnd };
          }
          return prev;
        });

        // 清理离开视口太远的图片内存（延迟执行，避免阻塞滚动）
        if (scrollCleanupTimeoutRef.current) {
          clearTimeout(scrollCleanupTimeoutRef.current);
        }
        
        scrollCleanupTimeoutRef.current = setTimeout(() => {
          if (!containerRef.current) return;
          
          const cleanupTop = viewportTop - IMAGE_CLEANUP_THRESHOLD;
          const cleanupBottom = viewportBottom + IMAGE_CLEANUP_THRESHOLD;
          
          // 查找所有图片元素，清理离开视口太远的图片
          const imageElements = containerRef.current.querySelectorAll("[data-artwork-id]");
          const toCleanup = new Set<string>();
          
          imageElements.forEach((el) => {
            const rect = el.getBoundingClientRect();
            const elementTop = scrollTop + rect.top;
            const elementBottom = elementTop + rect.height;
            
            // 如果元素完全在清理区域外，标记为需要清理
            if (elementBottom < cleanupTop || elementTop > cleanupBottom) {
              const artworkId = el.getAttribute("data-artwork-id");
              if (artworkId) {
                toCleanup.add(artworkId);
              }
            }
          });
          
          // 从loadedImages中移除离开视口的图片
          if (toCleanup.size > 0) {
            setLoadedImages((prev) => {
              const newSet = new Set(prev);
              let hasChanges = false;
              toCleanup.forEach((id) => {
                if (newSet.has(id)) {
                  newSet.delete(id);
                  hasChanges = true;
                }
              });
              return hasChanges ? newSet : prev;
            });
          }
        }, 300); // 延迟300ms执行清理
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    
    // 初始调用一次，确保初始状态正确
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollCleanupTimeoutRef.current) {
        clearTimeout(scrollCleanupTimeoutRef.current);
        scrollCleanupTimeoutRef.current = null;
      }
    };
  }, [sortedArtworks.length]);

  // 使用 Intersection Observer 优化图片懒加载
  // 优化：只观察可视区域附近的元素，减少观察数量
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) {
      // 如果容器不存在，确保清理observer
      if (imageObserverRef.current) {
        try {
          imageObserverRef.current.disconnect();
        } catch (error) {
          // 忽略已断开的observer错误
          console.debug("[Gallery] Observer already disconnected (safe to ignore)", error);
        }
        imageObserverRef.current = null;
      }
      return;
    }

    // 如果 observer 不存在，创建它
    if (!imageObserverRef.current) {
      const imageObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const element = entry.target;
              const artworkId = element.getAttribute("data-artwork-id");
              if (artworkId) {
                // 使用函数式更新，避免依赖loadedImages
                setLoadedImages((prev) => {
                  if (prev.has(artworkId)) {
                    return prev; // 如果已存在，返回原Set（避免不必要的重新渲染）
                  }
                  return new Set(prev).add(artworkId);
                });
                
                // 记录元素位置，用于后续清理
                const rect = element.getBoundingClientRect();
                const scrollTop = window.scrollY || window.pageYOffset || 0;
                elementPositionsRef.current.set(artworkId, scrollTop + rect.top);
              }
            } else {
              // 元素离开视口，但不立即清理（由滚动清理逻辑统一处理）
            }
          });
        },
        {
          root: null, // 使用视口作为root，而不是container
          rootMargin: "200px", // 提前200px开始加载
          threshold: 0.01,
        },
      );
      imageObserverRef.current = imageObserver;
    }

    const imageObserver = imageObserverRef.current;

    // 只观察可视区域附近的元素，减少观察数量
    const elements = containerRef.current.querySelectorAll("[data-artwork-id]");
    const elementArray = Array.from(elements);
    
    // 获取视口范围
    const viewportTop = window.scrollY || window.pageYOffset || 0;
    const viewportBottom = viewportTop + window.innerHeight;
    const observeMargin = 500; // 观察范围：视口上下500px
    
    // 清理已移除元素的观察标记
    const observedElements = Array.from(containerRef.current.querySelectorAll("[data-artwork-id][data-observed]"));
    const currentIds = new Set(
      elementArray
        .map((el) => el.getAttribute("data-artwork-id"))
        .filter((id): id is string => id !== null)
    );
    
    // 移除已不存在或离开观察范围的元素
    observedElements.forEach((el) => {
      const artworkId = el.getAttribute("data-artwork-id");
      if (!artworkId || !currentIds.has(artworkId)) {
        try {
          imageObserver.unobserve(el);
          el.removeAttribute("data-observed");
          if (artworkId) {
            elementPositionsRef.current.delete(artworkId);
          }
        } catch (error) {
          console.debug("[Gallery] Failed to unobserve element", error);
        }
        return;
      }
      
      // 如果元素离开观察范围太远，取消观察
      const rect = el.getBoundingClientRect();
      const elementTop = viewportTop + rect.top;
      const elementBottom = elementTop + rect.height;
      
      if (elementBottom < viewportTop - observeMargin || elementTop > viewportBottom + observeMargin) {
        try {
          imageObserver.unobserve(el);
          el.removeAttribute("data-observed");
        } catch (error) {
          console.debug("[Gallery] Failed to unobserve distant element", error);
        }
      }
    });
    
    // 只观察视口附近的元素（包括新添加的）
    elementArray.forEach((el) => {
      if (el.hasAttribute("data-observed")) {
        return; // 已经观察过了
      }
      
      const rect = el.getBoundingClientRect();
      const elementTop = viewportTop + rect.top;
      const elementBottom = elementTop + rect.height;
      
      // 只观察在观察范围内的元素
      if (elementBottom >= viewportTop - observeMargin && elementTop <= viewportBottom + observeMargin) {
        try {
          imageObserver.observe(el);
          el.setAttribute("data-observed", "true");
          
          // 立即检查是否在视口内（包括margin），如果是则立即加载
          const margin = 200;
          if (elementBottom >= viewportTop - margin && elementTop <= viewportBottom + margin) {
            const artworkId = el.getAttribute("data-artwork-id");
            if (artworkId) {
              setLoadedImages((prev) => {
                if (prev.has(artworkId)) {
                  return prev;
                }
                return new Set(prev).add(artworkId);
              });
            }
          }
        } catch (error) {
          console.warn("[Gallery] Failed to observe element", error);
        }
      }
    });

    // 清理函数：清理observer
    return () => {
      // 修复：组件卸载时清理所有观察的元素，防止内存泄漏
      if (imageObserverRef.current && containerRef.current) {
        try {
          const observedElements = containerRef.current.querySelectorAll("[data-artwork-id][data-observed]");
          observedElements.forEach((el) => {
            try {
              imageObserverRef.current?.unobserve(el);
              el.removeAttribute("data-observed");
            } catch (error) {
              // 忽略已移除元素的错误
              console.debug("[Gallery] Failed to unobserve element during cleanup", error);
            }
          });
          imageObserverRef.current.disconnect();
        } catch (error) {
          console.debug("[Gallery] Failed to disconnect image observer during cleanup", error);
        }
        imageObserverRef.current = null;
      }
      elementPositionsRef.current.clear();
    };
  }, [visibleArtworks.start, visibleArtworks.end]); // 当可见范围变化时，重新观察新元素

  // 处理详情页打开/关闭时的滚动位置
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedIndex !== null) {
      // 打开详情页时，滚动位置已经在点击图片时保存了
      // 这里不需要再次保存，避免覆盖点击时保存的准确位置
    } else {
      // 关闭详情页时，微调滚动位置（主要恢复已在 onBack 中完成）
      // 这里只做微调，确保位置准确，避免闪烁
      const savedPosition = galleryScrollPositionRef.current;
      
      if (savedPosition > 0) {
        // 标记正在恢复滚动位置，防止其他 effect 干扰
        isRestoringScrollRef.current = true;
        
        // 轻量级的微调逻辑，只检查一次，不做多次重试
        const fineTuneScroll = () => {
          if (typeof window === "undefined") {
            isRestoringScrollRef.current = false;
            return;
          }
          
          // 获取文档高度
          const maxScroll = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
            window.innerHeight
          );
          
          // 计算目标滚动位置，确保不超过文档高度
          const targetScroll = Math.min(savedPosition, Math.max(0, maxScroll - window.innerHeight));
          
          // 获取当前滚动位置
          const currentScroll = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
          const diff = Math.abs(currentScroll - targetScroll);
          
          // 如果位置已经正确（差异小于 5px），不需要调整
          if (diff < 5) {
            isRestoringScrollRef.current = false;
            return;
          }
          
          // 微调滚动位置
          try {
            window.scrollTo({
              top: targetScroll,
              behavior: 'instant' as ScrollBehavior,
            });
          } catch (error) {
            try {
              document.documentElement.scrollTop = targetScroll;
              document.body.scrollTop = targetScroll;
            } catch (e) {
              console.debug("[Gallery] Failed to fine-tune scroll position", e);
            }
          }
          
          isRestoringScrollRef.current = false;
        };
        
        // 等待 DOM 更新后微调一次即可
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fineTuneScroll();
          });
        });
        
        // 清理函数
        return () => {
          isRestoringScrollRef.current = false;
        };
      } else {
        isRestoringScrollRef.current = false;
      }
    }
  }, [selectedIndex]);

  // 修复：添加防抖ref，防止快速操作时的竞态条件
  const navigationLockRef = useRef(false);
  const filterChangeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 用于存储当前查看的套图作品列表和索引
  const [collectionArtworksState, setCollectionArtworksState] = useState<{
    artworks: Artwork[];
    currentIndex: number;
    collectionId: string;
  } | null>(null);

  // 当选中作品改变时，更新套图状态
  useEffect(() => {
    if (selectedIndex === null) {
      setCollectionArtworksState(null);
      return;
    }

    const selectedArtwork = sortedArtworks[selectedIndex];
    if (!selectedArtwork) {
      setCollectionArtworksState(null);
      return;
    }

    if (selectedArtwork.collectionId) {
      const artworksToNavigate = getCollectionArtworks(selectedArtwork.collectionId);
      // 过滤掉不存在的作品（可能已被删除）
      const validCollectionArtworks = artworksToNavigate.filter((a) => 
        validArtworks.some((original) => original.id === a.id)
      );
      
      if (validCollectionArtworks.length === 0) {
        // 如果套图内所有作品都被删除，关闭详情页
        setSelectedIndex(null);
        setCollectionArtworksState(null);
        return;
      }
      
      const currentIndexInCollection = validCollectionArtworks.findIndex((a) => a.id === selectedArtwork.id);
      
      setCollectionArtworksState({
        artworks: validCollectionArtworks,
        currentIndex: currentIndexInCollection >= 0 ? currentIndexInCollection : 0,
        collectionId: selectedArtwork.collectionId,
      });
    } else {
      setCollectionArtworksState(null);
    }
  }, [selectedIndex, sortedArtworks, getCollectionArtworks, validArtworks]);

  // 修复：当artworks数组变化时，检查selectedIndex是否仍然有效
  // 如果当前选中的作品被删除，关闭详情页
  useEffect(() => {
    if (selectedIndex === null) {
      return;
    }

    // 检查当前选中的作品是否仍然存在
    const selectedArtwork = sortedArtworks[selectedIndex];
    if (!selectedArtwork) {
      // 作品不存在，关闭详情页
      setSelectedIndex(null);
      setCollectionArtworksState(null);
      return;
    }

    // 检查作品是否在validArtworks数组中（可能被删除）
    const artworkExists = validArtworks.some((a) => a.id === selectedArtwork.id);
    if (!artworkExists) {
      // 作品已被删除，关闭详情页
      setSelectedIndex(null);
      setCollectionArtworksState(null);
      return;
    }

    // 如果selectedIndex超出范围，调整到最后一个有效索引
    if (selectedIndex >= sortedArtworks.length && sortedArtworks.length > 0) {
      setSelectedIndex(sortedArtworks.length - 1);
    }
  }, [validArtworks, sortedArtworks, selectedIndex]);

  if (selectedIndex !== null) {
    const selectedArtwork = sortedArtworks[selectedIndex];
    if (!selectedArtwork) {
      // 如果选中的作品不存在，重置选择并显示错误提示
      console.warn("[Gallery] Selected artwork not found, resetting selection");
      setSelectedIndex(null);
      return null;
    }
    
    // 如果是套图，需要获取套图内的所有图片
    let artworksToNavigate: Artwork[] = [];
    let currentIndexInCollection = -1;
    
    if (selectedArtwork.collectionId && collectionArtworksState) {
      artworksToNavigate = collectionArtworksState.artworks;
      currentIndexInCollection = collectionArtworksState.currentIndex;
    } else if (selectedArtwork.collectionId) {
      // 如果状态还没更新，使用临时数据
      artworksToNavigate = getCollectionArtworks(selectedArtwork.collectionId);
      currentIndexInCollection = artworksToNavigate.findIndex((a) => a.id === selectedArtwork.id);
      // 如果找不到当前作品在套图中的位置，使用0作为默认值
      if (currentIndexInCollection < 0) {
        currentIndexInCollection = 0;
      }
    } else {
      artworksToNavigate = sortedArtworks;
      currentIndexInCollection = selectedIndex;
    }
    
    // 确保索引在有效范围内
    if (currentIndexInCollection < 0) {
      currentIndexInCollection = 0;
    }
    if (currentIndexInCollection >= artworksToNavigate.length && artworksToNavigate.length > 0) {
      currentIndexInCollection = artworksToNavigate.length - 1;
    }
    
    const hasPrev = currentIndexInCollection > 0;
    const hasNext = currentIndexInCollection < artworksToNavigate.length - 1;

    // 使用当前实际的作品（可能是套图内的任意一张）
    // 如果是套图且状态已更新，优先使用套图中的作品；否则使用selectedArtwork
    // 确保索引安全
    const safeIndex = artworksToNavigate.length > 0 
      ? Math.max(0, Math.min(currentIndexInCollection, artworksToNavigate.length - 1))
      : 0;
    
    const currentArtwork = selectedArtwork.collectionId && collectionArtworksState && artworksToNavigate.length > 0 && safeIndex >= 0 && safeIndex < artworksToNavigate.length
      ? artworksToNavigate[safeIndex] || selectedArtwork
      : selectedArtwork;

    // 如果是套图，计算正确的collectionIndex（基于在套图中的位置，从1开始）
    let displayArtwork = { ...currentArtwork };
    if (selectedArtwork.collectionId && collectionArtworksState && currentIndexInCollection >= 0 && currentIndexInCollection < artworksToNavigate.length) {
      // 套图内索引从0开始（最新的是0），显示时应该从1开始（I, II, III...）
      // 最新上传的显示为I，第二新的显示为II，以此类推
      // 确保索引在有效范围内
      const safeIndex = Math.max(0, Math.min(currentIndexInCollection, artworksToNavigate.length - 1));
      const displayIndex = safeIndex + 1;
      displayArtwork = {
        ...currentArtwork,
        collectionIndex: displayIndex,
      };
    } else if (selectedArtwork.collectionId && currentArtwork.collectionIndex) {
      // 如果状态还没更新，但作品本身有collectionIndex，使用它
      displayArtwork = {
        ...currentArtwork,
        collectionIndex: currentArtwork.collectionIndex,
      };
    }

    return (
      <ArtworkDetails
        artwork={displayArtwork}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onBack={() => {
          // 在关闭详情页之前，立即恢复滚动位置，避免闪烁
          const savedPosition = galleryScrollPositionRef.current;
          if (savedPosition > 0 && typeof window !== "undefined") {
            // 立即设置滚动位置，不等待状态更新
            try {
              window.scrollTo({
                top: savedPosition,
                behavior: 'instant' as ScrollBehavior,
              });
            } catch (error) {
              try {
                document.documentElement.scrollTop = savedPosition;
                document.body.scrollTop = savedPosition;
              } catch (e) {
                console.debug("[Gallery] Failed to immediately restore scroll position", e);
              }
            }
          }
          setSelectedIndex(null);
          setCollectionArtworksState(null);
        }}
        onShare={(artwork) => handleShare(artwork)}
        onDelete={(artwork) => {
          // 修复：删除作品前检查是否是当前查看的作品
          const isCurrentArtwork = selectedArtwork.id === artwork.id || 
            (collectionArtworksState && collectionArtworksState.artworks.some(a => a.id === artwork.id));
          
          onDeleteArtwork?.(artwork);
          
          // 如果删除的是当前查看的作品，关闭详情页
          if (isCurrentArtwork) {
            setSelectedIndex(null);
            setCollectionArtworksState(null);
          }
        }}
        onEdit={(artwork) => onEditArtwork?.(artwork)}
        onSetAsFeatured={(artwork) => onSetAsFeatured?.(artwork)}
        onRemoveFromFeatured={(artwork) => onRemoveFromFeatured?.(artwork)}
        onNavigate={(direction) => {
          // 修复：添加导航锁，防止快速操作时的竞态条件
          if (navigationLockRef.current) {
            return;
          }
          navigationLockRef.current = true;
          
          // 在操作完成后释放锁
          setTimeout(() => {
            navigationLockRef.current = false;
          }, 300);
          
          try {
            if (selectedArtwork.collectionId && collectionArtworksState && collectionArtworksState.artworks.length > 0) {
              // 套图内切换
              const collectionArtworks = collectionArtworksState.artworks;
              const currentIdx = collectionArtworksState.currentIndex;
              const maxIdx = collectionArtworks.length - 1;
              
              // 确保当前索引在有效范围内
              const safeCurrentIdx = Math.max(0, Math.min(currentIdx, maxIdx));
              
              // 确保artworks数组不为空且索引有效
              if (collectionArtworks.length === 0 || safeCurrentIdx < 0 || safeCurrentIdx >= collectionArtworks.length) {
                console.warn("[Gallery] Invalid collection state, cannot navigate");
                return;
              }
              
              const newIndex = direction === "prev"
                ? Math.max(0, safeCurrentIdx - 1)
                : Math.min(maxIdx, safeCurrentIdx + 1);
              
              // 确保新索引有效且与当前索引不同，且新索引对应的作品存在
              if (newIndex === safeCurrentIdx || newIndex < 0 || newIndex >= collectionArtworks.length || !collectionArtworks[newIndex]) {
                return;
              }
              
              const newArtwork = collectionArtworks[newIndex];
              
              // 修复：检查新作品是否仍然存在（可能被删除）
              // 注意：这里检查的是validArtworks数组，而不是collectionArtworksState.artworks
              if (!newArtwork || !validArtworks.some(a => a.id === newArtwork.id)) {
                console.warn("[Gallery] Artwork no longer exists, cannot navigate");
                return;
              }
              
              // 直接更新套图状态，不依赖sortedArtworks的索引
              setCollectionArtworksState({
                artworks: collectionArtworksState.artworks,
                currentIndex: newIndex,
                collectionId: collectionArtworksState.collectionId,
              });
              // 尝试在sortedArtworks中找到对应的索引
              // 如果找不到（比如作品被筛选掉了），仍然使用当前的selectedIndex
              // 但是套图状态已更新，详情页会通过collectionArtworksState显示正确的作品
              const foundIndex = sortedArtworks.findIndex((a) => a.id === newArtwork.id);
              if (foundIndex >= 0) {
                setSelectedIndex(foundIndex);
              }
              // 注意：即使找不到索引，套图状态已更新，详情页会通过collectionArtworksState正确显示新作品
              // 这是预期行为，因为套图内的作品可能在筛选后的列表中不可见
            } else {
              // 非套图切换
              if (direction === "prev" && hasPrev) {
                setSelectedIndex((index) => (index === null ? null : Math.max(0, index - 1)));
              } else if (direction === "next" && hasNext) {
                setSelectedIndex((index) =>
                  index === null ? null : Math.min(sortedArtworks.length - 1, index + 1),
                );
              }
            }
          } catch (error) {
            console.error("[Gallery] Navigation error", error);
            navigationLockRef.current = false;
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
        {validArtworks.length === 0 ? (
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
                          // 使用全局索引，确保详情页导航正确
                          const actualIndex = sortedArtworks.findIndex((item) => item.id === artwork.id);
                          // 保存当前滚动位置
                          if (typeof window !== "undefined") {
                            galleryScrollPositionRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
                          }
                          setSelectedIndex(actualIndex >= 0 ? actualIndex : null);
                        }}
                        aria-label={`查看 ${artwork.title}`}
                      >
                        {shouldLoadImage ? (
                          <img
                            src={isValidImageUrl(artwork.imageSrc) ? artwork.imageSrc : ""}
                            alt={artwork.alt || artwork.title || "作品图片"}
                            className="gallery-item__image"
                            data-artwork-id={artwork.id}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              // 修复：图片加载失败时显示占位符
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              const placeholder = target.nextElementSibling as HTMLElement;
                              if (placeholder && placeholder.classList.contains('gallery-item__image--placeholder')) {
                                placeholder.style.display = 'flex';
                              }
                            }}
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
                        {artwork.collectionId && showInfo && (
                          <div className="gallery-item__collection-badge">
                            套图·{getCollectionCount(artwork.collectionId)}
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
                          // 使用全局索引，确保详情页导航正确
                          const actualIndex = sortedArtworks.findIndex((item) => item.id === artwork.id);
                          // 保存当前滚动位置
                          if (typeof window !== "undefined") {
                            galleryScrollPositionRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;
                          }
                          setSelectedIndex(actualIndex >= 0 ? actualIndex : null);
                        }}
                        aria-label={`查看 ${artwork.title}`}
                      >
                        {shouldLoadImage ? (
                          <img
                            src={isValidImageUrl(artwork.imageSrc) ? artwork.imageSrc : ""}
                            alt={artwork.alt || artwork.title || "作品图片"}
                            className="gallery-item__image"
                            data-artwork-id={artwork.id}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              // 修复：图片加载失败时显示占位符
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              const placeholder = target.nextElementSibling as HTMLElement;
                              if (placeholder && placeholder.classList.contains('gallery-item__image--placeholder')) {
                                placeholder.style.display = 'flex';
                              }
                            }}
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
                        {artwork.collectionId && showInfo && (
                          <div className="gallery-item__collection-badge">
                            套图·{getCollectionCount(artwork.collectionId)}
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
            {/* 加载更多触发器 - 只在需要时显示（当总数超过最大渲染数时，或已加载的数量小于总数时） */}
            {sortedArtworks.length > MAX_RENDERED_COUNT 
              ? (visibleArtworks.end < sortedArtworks.length && (
                  <div
                    ref={loadMoreTriggerRef}
                    className="gallery-screen__load-more-trigger"
                  />
                ))
              : (renderedCount < sortedArtworks.length && (
                  <div
                    ref={loadMoreTriggerRef}
                    className="gallery-screen__load-more-trigger"
                  />
                ))
            }
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
        onClose={() => {
          // 关闭时重置draftFilters为当前应用的filters，确保下次打开时显示正确的值
          setDraftFilters(filters);
          setFilterOpen(false);
        }}
        onReset={() => setDraftFilters(createDefaultFilters(stats))}
        onApply={() => {
          // 修复：添加防抖，防止快速操作时的竞态条件
          if (filterChangeTimeoutRef.current) {
            clearTimeout(filterChangeTimeoutRef.current);
          }
          
          filterChangeTimeoutRef.current = setTimeout(() => {
            setFilters(draftFilters);
            setFilterOpen(false);
            filterChangeTimeoutRef.current = null;
          }, 100);
        }}
      />
    </div>
  );
}

export default Gallery;

