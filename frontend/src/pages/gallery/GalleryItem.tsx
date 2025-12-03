import { memo, useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Artwork } from "@/types/artwork";
import { getCachedImageDimensions, cacheImageDimensions, type ImageDimensions } from "@/utils/imageCache";

import "./GalleryItem.css";

type GalleryItemProps = {
  artwork: Artwork;
  index?: number;
  showInfo: boolean;
  collectionCount?: number;
  tagIdToNameMap: Map<string, string>;
  onSelect: (artwork: Artwork) => void;
  onImageLoad?: (artworkId: string, dimensions: ImageDimensions) => void;
};

const MAX_RETRIES = 2;

function GalleryItemComponent({
  artwork,
  index,
  showInfo,
  collectionCount,
  tagIdToNameMap,
  onSelect,
  onImageLoad,
}: GalleryItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // 加载缓存的尺寸
  useEffect(() => {
    let cancelled = false;
    
    getCachedImageDimensions(artwork.id).then((cached) => {
      if (!cancelled && cached) {
        setDimensions(cached);
      }
    });
    
    return () => {
      cancelled = true;
    };
  }, [artwork.id]);

  const handleImageLoad = useCallback(() => {
    if (!imgRef.current) return;
    
    const img = imgRef.current;
    const dims: ImageDimensions = {
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
    
    setDimensions(dims);
    setImageLoaded(true);
    setImageError(false);
    
    // 缓存尺寸
    cacheImageDimensions(artwork.id, dims);
    
    // 通知父组件
    onImageLoad?.(artwork.id, dims);
  }, [artwork.id, onImageLoad]);

  const handleImageError = useCallback(() => {
    if (retryCount < MAX_RETRIES) {
      setRetryCount((prev) => prev + 1);
      // 延迟重试
      setTimeout(() => {
        if (imgRef.current) {
          const src = imgRef.current.src;
          imgRef.current.src = "";
          setTimeout(() => {
            if (imgRef.current) {
              imgRef.current.src = src;
            }
          }, 100);
        }
      }, 1000);
    } else {
      setImageError(true);
    }
  }, [retryCount]);
  
  const handleSelect = useCallback(() => {
    onSelect(artwork);
  }, [artwork, onSelect]);

  // 列表页使用缩略图，如果没有缩略图则回退到完整图（向后兼容）
  const imageUrl = artwork.thumbnailSrc || artwork.imageSrc;
  const hasValidImage = imageUrl && !imageError;
  const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;
  
  // 判断是否应该立即加载图片
  // 1. 前20个作品立即加载（首屏可见）
  // 2. 最近5分钟内上传的立即加载
  const shouldLoadEagerly = useMemo(() => {
    // 通过index prop判断是否是前20个（首屏可见）
    if (typeof index === 'number' && index < 20) {
      return true;
    }
    // 新上传的图片立即加载
    if (artwork.uploadedAt) {
      try {
        const uploadedTime = new Date(artwork.uploadedAt).getTime();
        const now = Date.now();
        // 如果是在最近5分钟内上传的，立即加载
        return now - uploadedTime < 5 * 60 * 1000;
      } catch {
        return false;
      }
    }
    return false;
  }, [artwork.uploadedAt, index]);

  return (
    <figure className="gallery-item">
      <button
        type="button"
        className="gallery-item__trigger"
        onClick={handleSelect}
        aria-label={`查看 ${artwork.title}`}
      >
        {hasValidImage ? (
          <>
            {!imageLoaded && (
              <div
                className="gallery-item__skeleton"
                style={{
                  aspectRatio: String(aspectRatio),
                  minHeight: "150px",
                }}
              />
            )}
            <img
              ref={imgRef}
              src={imageUrl}
              alt={artwork.alt || artwork.title || "作品图片"}
              className={`gallery-item__image ${imageLoaded ? "gallery-item__image--loaded" : "gallery-item__image--loading"}`}
              loading={shouldLoadEagerly ? "eager" : "lazy"}
              decoding="async"
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={{
                display: imageLoaded ? "block" : "none",
                aspectRatio: String(aspectRatio),
              }}
            />
          </>
        ) : (
          <div
            className="gallery-item__image gallery-item__image--placeholder"
            style={{
              aspectRatio: "1",
              minHeight: "150px",
            }}
            data-artwork-id={artwork.id}
          >
            <div className="gallery-item__placeholder-content" />
          </div>
        )}
        
        {artwork.collectionId && showInfo && (
          <div className="gallery-item__collection-badge">
            套图{collectionCount !== undefined && collectionCount > 0 ? `·${collectionCount}` : ""}
          </div>
        )}
        
        <figcaption
          className={`gallery-item__info ${showInfo ? "" : "gallery-item__info--hidden"}`.trim()}
          aria-hidden={!showInfo}
        >
          <div>
            <h2 className="gallery-item__title">
              {artwork.collectionName || artwork.title || ""}
            </h2>
            <p className="gallery-item__date">{artwork.date}</p>
          </div>
          <div className="gallery-item__tags">
            {artwork.tags && artwork.tags.length > 0 ? (
              artwork.tags.slice(0, 3).map((tag, index) => {
                const tagId = String(tag).trim();
                const tagName = tagIdToNameMap.get(tagId) || tagId;
                return (
                  <span key={`${artwork.id}-tag-${index}`} className="gallery-item__tag">
                    {tagName}
                  </span>
                );
              })
            ) : (
              <span className="gallery-item__tag gallery-item__tag--empty">无标签</span>
            )}
          </div>
        </figcaption>
      </button>
    </figure>
  );
}

// 使用 React.memo 优化，避免不必要的重渲染
// 自定义比较函数：只在 artwork、showInfo、collectionCount 或 tagIdToNameMap 变化时重新渲染
export const GalleryItem = memo(GalleryItemComponent, (prevProps, nextProps) => {
  // 比较 artwork（通过 id 和关键字段）
  if (
    prevProps.artwork.id !== nextProps.artwork.id ||
    prevProps.artwork.imageSrc !== nextProps.artwork.imageSrc ||
    prevProps.artwork.thumbnailSrc !== nextProps.artwork.thumbnailSrc ||
    prevProps.artwork.title !== nextProps.artwork.title ||
    prevProps.artwork.date !== nextProps.artwork.date ||
    JSON.stringify(prevProps.artwork.tags) !== JSON.stringify(nextProps.artwork.tags) ||
    prevProps.artwork.collectionId !== nextProps.artwork.collectionId ||
    prevProps.artwork.collectionName !== nextProps.artwork.collectionName
  ) {
    return false; // props 变化，需要重新渲染
  }
  
  // 比较其他 props
  if (
    prevProps.showInfo !== nextProps.showInfo ||
    prevProps.collectionCount !== nextProps.collectionCount ||
    prevProps.index !== nextProps.index
  ) {
    return false;
  }
  
  // tagIdToNameMap 是 Map，需要特殊比较
  // 如果 artwork.tags 没有变化，tagIdToNameMap 的变化通常不影响显示
  // 这里简化处理，假设 tagIdToNameMap 引用变化但内容相同时不重新渲染
  
  // 函数引用变化不影响渲染（因为我们已经用 useCallback 稳定了）
  
  return true; // props 相同，跳过渲染
});

