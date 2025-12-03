import { useState, useEffect, useRef, type ImgHTMLAttributes } from "react";

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  placeholder?: string;
  threshold?: number;
}

/**
 * 懒加载图片组件
 * 使用 Intersection Observer API 实现图片懒加载
 */
export default function LazyImage({
  src,
  alt,
  placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E",
  threshold = 0.1,
  ...props
}: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string>(placeholder);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    // 如果图片已经在视口中，直接加载
    const rect = img.getBoundingClientRect();
    const isInViewport =
      rect.top < window.innerHeight + 100 && rect.bottom > -100;

    if (isInViewport) {
      setImageSrc(src);
      return;
    }

    // 使用 Intersection Observer 监听图片是否进入视口
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin: "50px", // 提前50px开始加载
      }
    );

    observer.observe(img);

    return () => {
      observer.disconnect();
    };
  }, [src, threshold]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setIsLoaded(false);
  };

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      onLoad={handleLoad}
      onError={handleError}
      style={{
        opacity: isLoaded ? 1 : 0.3,
        transition: "opacity 0.3s ease-in-out",
        ...props.style,
      }}
      loading="lazy"
      {...props}
    />
  );
}

