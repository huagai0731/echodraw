// 全局图片缓存，避免重复加载
const imageCache = new Map<string, HTMLImageElement>();

/**
 * 获取缓存的图片，如果不存在或未加载完成，则加载并缓存
 * @param src 图片 URL
 * @returns Promise<HTMLImageElement>
 */
export function getOrLoadImage(src: string): Promise<HTMLImageElement> {
  // 检查缓存
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }

  // 创建新的 Image 对象并加载
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    const handleLoad = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    
    const handleError = () => {
      reject(new Error(`Failed to load image: ${src}`));
    };
    
    img.addEventListener("load", handleLoad, { once: true });
    img.addEventListener("error", handleError, { once: true });
    img.src = src;
  });
}

/**
 * 批量获取或加载图片
 * @param srcs 图片 URL 数组
 * @returns Promise<Map<string, HTMLImageElement>> 返回 URL 到 Image 对象的映射
 */
export async function getOrLoadImages(
  srcs: string[],
): Promise<Map<string, HTMLImageElement>> {
  const results = new Map<string, HTMLImageElement>();
  
  // 先收集已缓存的图片
  const cached: string[] = [];
  const toLoad: string[] = [];
  
  srcs.forEach((src) => {
    const cachedImg = imageCache.get(src);
    if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
      results.set(src, cachedImg);
      cached.push(src);
    } else {
      toLoad.push(src);
    }
  });
  
  // 如果所有图片都在缓存中，直接返回
  if (toLoad.length === 0) {
    return results;
  }
  
  // 加载未缓存的图片
  const loaders = toLoad.map((src) =>
    getOrLoadImage(src).then((img) => {
      results.set(src, img);
      return img;
    }),
  );
  
  await Promise.all(loaders);
  return results;
}

/**
 * 清除缓存（可选，通常不需要手动清除）
 */
export function clearImageCache(): void {
  imageCache.clear();
}


