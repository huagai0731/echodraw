import { useEffect, useRef, useState, useMemo } from "react";
import type { Artwork } from "@/types/artwork";
import { GalleryList } from "./GalleryList";
import type { ImageDimensions } from "@/utils/imageCache";

type GalleryVirtualGridProps = {
  artworks: Artwork[];
  showInfo: boolean;
  tagIdToNameMap: Map<string, string>;
  onSelect: (artwork: Artwork) => void;
  onImageLoad?: (artworkId: string, dimensions: ImageDimensions) => void;
};

const INITIAL_RENDER_COUNT = 20;
const LOAD_MORE_COUNT = 10;
const VIEWPORT_BUFFER = 300;
const INTERSECTION_ROOT_MARGIN = "300px";

export function GalleryVirtualGrid({
  artworks,
  showInfo,
  tagIdToNameMap,
  onSelect,
  onImageLoad,
}: GalleryVirtualGridProps) {
  const [renderedCount, setRenderedCount] = useState(INITIAL_RENDER_COUNT);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: INITIAL_RENDER_COUNT });
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const imageObserverRef = useRef<IntersectionObserver | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 当artworks变化时，重置渲染计数和可见范围，确保初始显示前20个
  // 使用artworks的ID数组作为依赖，确保内容变化时也能更新
  const artworksIds = useMemo(() => artworks.map(a => a.id).join(','), [artworks]);
  
  useEffect(() => {
    if (artworks.length > 0) {
      const initialCount = Math.min(INITIAL_RENDER_COUNT, artworks.length);
      setRenderedCount(initialCount);
      setVisibleRange({ start: 0, end: initialCount });
    }
  }, [artworks.length, artworksIds]);

  // 计算可见的作品
  const visibleArtworks = useMemo(() => {
    if (artworks.length === 0) {
      return [];
    }
    
    // 确保至少显示前20个作品（或所有作品，如果少于20个）
    const displayCount = Math.min(renderedCount, artworks.length);
    if (displayCount <= INITIAL_RENDER_COUNT) {
      return artworks.slice(0, displayCount);
    }
    
    return artworks.slice(visibleRange.start, visibleRange.end);
  }, [artworks, renderedCount, visibleRange]);

  // 无限滚动加载
  useEffect(() => {
    if (typeof window === "undefined" || !loadMoreTriggerRef.current || artworks.length === 0) {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      return;
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && renderedCount < artworks.length) {
            const newCount = Math.min(renderedCount + LOAD_MORE_COUNT, artworks.length);
            setRenderedCount(newCount);
            setVisibleRange((prev) => ({
              start: prev.start,
              end: Math.min(newCount, artworks.length),
            }));
          }
        });
      },
      {
        root: null,
        rootMargin: INTERSECTION_ROOT_MARGIN,
        threshold: 0.1,
      },
    );

    observerRef.current = observer;
    observer.observe(loadMoreTriggerRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [renderedCount, artworks.length]);

  // 滚动监听：更新可见范围（优化：减少更新频率）
  useEffect(() => {
    if (typeof window === "undefined" || artworks.length <= INITIAL_RENDER_COUNT) {
      return;
    }

    let ticking = false;
    let lastUpdateTime = 0;
    const THROTTLE_MS = 100; // 节流：最多每100ms更新一次

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;
        const now = Date.now();
        
        // 节流：如果距离上次更新不足100ms，跳过
        if (now - lastUpdateTime < THROTTLE_MS) {
          return;
        }
        lastUpdateTime = now;

        if (typeof window === "undefined" || !containerRef.current) return;

        const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;

        // 简单估算：假设每张图片平均高度为300px
        const estimatedItemHeight = 300;
        const bufferItems = Math.ceil(VIEWPORT_BUFFER / estimatedItemHeight);
        const estimatedStart = Math.max(0, Math.floor(scrollTop / estimatedItemHeight) - bufferItems);
        const estimatedEnd = Math.min(artworks.length, estimatedStart + INITIAL_RENDER_COUNT * 2);

        setVisibleRange((prev) => {
          const startDiff = Math.abs(prev.start - estimatedStart);
          const endDiff = Math.abs(prev.end - estimatedEnd);

          // 增加阈值，减少不必要的更新
          if (startDiff > 10 || endDiff > 10) {
            return { start: estimatedStart, end: estimatedEnd };
          }
          return prev;
        });
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // 初始调用

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [artworks.length]);

  // 图片懒加载观察器（优化：减少重新创建和观察）
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) {
      if (imageObserverRef.current) {
        imageObserverRef.current.disconnect();
        imageObserverRef.current = null;
      }
      return;
    }

    // 只在第一次创建观察器
    if (!imageObserverRef.current) {
      const imageObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const element = entry.target as HTMLElement;
              element.setAttribute("data-observed", "true");
              // 观察后立即取消观察，避免重复处理
              imageObserver.unobserve(element);
            }
          });
        },
        {
          root: null,
          rootMargin: "200px",
          threshold: 0.01,
        },
      );
      imageObserverRef.current = imageObserver;
    }

    const imageObserver = imageObserverRef.current;
    
    // 使用 setTimeout 延迟执行，避免阻塞渲染
    const timeoutId = setTimeout(() => {
      if (!containerRef.current) return;
      
      const elements = containerRef.current.querySelectorAll("[data-artwork-id]:not([data-observed])");
      const elementArray = Array.from(elements);

      elementArray.forEach((el) => {
        imageObserver.observe(el);
      });
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      // 不在这里断开连接，保持观察器存活
    };
  }, [visibleArtworks.length]);

  if (artworks.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef}>
      <GalleryList
        artworks={visibleArtworks}
        showInfo={showInfo}
        tagIdToNameMap={tagIdToNameMap}
        onSelect={onSelect}
        onImageLoad={onImageLoad}
      />
      {renderedCount < artworks.length && (
        <div
          ref={loadMoreTriggerRef}
          className="gallery-screen__load-more-trigger"
        />
      )}
    </div>
  );
}

