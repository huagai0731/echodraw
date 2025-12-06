import { memo, useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { Artwork } from "@/types/artwork";
import { getCachedImageDimensions, cacheImageDimensions, type ImageDimensions } from "@/utils/imageCache";

import "./GalleryItem.css";

type GalleryItemProps = {
  artwork: Artwork;
  index?: number;
  showInfo: boolean;
  tagIdToNameMap: Map<string, string>;
  onSelect: (artwork: Artwork) => void;
  onImageLoad?: (artworkId: string, dimensions: ImageDimensions) => void;
};

const MAX_RETRIES = 2;

function GalleryItemComponent({
  artwork,
  index,
  showInfo,
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
        
        <figcaption
          className={`gallery-item__info ${showInfo ? "" : "gallery-item__info--hidden"}`.trim()}
          aria-hidden={!showInfo}
        >
          <div>
            <h2 className="gallery-item__title">
              {artwork.title || ""}
            </h2>
            <p className="gallery-item__date">{artwork.date}</p>
          </div>
          <div className="gallery-item__tags">
            {artwork.tags && artwork.tags.length > 0 ? (() => {
              // 过滤并转换标签：如果标签是数字ID且找不到映射，则过滤掉；如果是名称则直接使用
              const validTags = artwork.tags
                .map((tag) => {
                  const tagStr = String(tag).trim();
                  // 如果是纯数字，尝试从映射中获取名称
                  if (/^\d+$/.test(tagStr)) {
                    const tagName = tagIdToNameMap.get(tagStr);
                    return tagName || null; // 找不到映射则返回null，后续过滤掉
                  }
                  // 如果不是纯数字，可能是标签名称，直接返回
                  return tagStr;
                })
                .filter((tagName): tagName is string => tagName !== null && tagName.length > 0)
                .slice(0, 3);
              
              // 如果标签映射还未加载完成（tagIdToNameMap为空），且所有标签都是数字ID，则不显示"无标签"
              // 等待映射加载完成后再显示
              const hasNumericTags = artwork.tags.some((tag) => /^\d+$/.test(String(tag).trim()));
              const isMappingLoaded = tagIdToNameMap.size > 0;
              
              // 如果映射未加载且存在数字ID标签，暂时不显示任何内容（等待映射加载）
              if (hasNumericTags && !isMappingLoaded && validTags.length === 0) {
                return null;
              }
              
              // 如果映射已加载但找不到有效标签，显示"无标签"
              if (validTags.length === 0) {
                return <span className="gallery-item__tag gallery-item__tag--empty">无标签</span>;
              }
              
              return validTags.map((tagName, index) => (
                <span key={`${artwork.id}-tag-${index}`} className="gallery-item__tag">
                  {tagName}
                </span>
              ));
            })() : (
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
    JSON.stringify(prevProps.artwork.tags) !== JSON.stringify(nextProps.artwork.tags)
  ) {
    return false; // props 变化，需要重新渲染
  }
  
  // 比较其他 props
  if (
    prevProps.showInfo !== nextProps.showInfo ||
    prevProps.index !== nextProps.index
  ) {
    return false;
  }
  
  // tagIdToNameMap 是 Map，需要特殊比较
  // 如果 artwork.tags 有值，需要检查 tagIdToNameMap 是否变化
  // 因为标签显示依赖于 tagIdToNameMap 的映射关系
  if (prevProps.artwork.tags && prevProps.artwork.tags.length > 0) {
    // 检查 tagIdToNameMap 的大小是否变化（从空到有内容，或内容变化）
    if (prevProps.tagIdToNameMap.size !== nextProps.tagIdToNameMap.size) {
      return false; // Map 大小变化，需要重新渲染
    }
    
    // 检查 artwork.tags 中的标签ID是否能在新的 tagIdToNameMap 中找到映射
    // 如果之前找不到映射但现在能找到，需要重新渲染
    for (const tag of prevProps.artwork.tags) {
      const tagStr = String(tag).trim();
      if (/^\d+$/.test(tagStr)) {
        const prevMapped = prevProps.tagIdToNameMap.get(tagStr);
        const nextMapped = nextProps.tagIdToNameMap.get(tagStr);
        // 如果之前没有映射但现在有映射，需要重新渲染
        if (!prevMapped && nextMapped) {
          return false;
        }
        // 如果映射的值发生变化，需要重新渲染
        if (prevMapped !== nextMapped) {
          return false;
        }
      }
    }
  }
  
  // 函数引用变化不影响渲染（因为我们已经用 useCallback 稳定了）
  
  return true; // props 相同，跳过渲染
});

