import localforage from "localforage";

// 全局图片缓存，避免重复加载
const imageCache = new Map<string, HTMLImageElement>();
// 存储blob URL，避免重复创建和过早清理
const blobUrlCache = new Map<string, string>();

// 图片尺寸缓存（使用 localForage）
const dimensionsStore = localforage.createInstance({
  name: "gallery-image-dimensions",
  storeName: "dimensions",
});

export type ImageDimensions = {
  width: number;
  height: number;
};

/**
 * 获取缓存的图片尺寸
 */
export async function getCachedImageDimensions(artworkId: string): Promise<ImageDimensions | null> {
  try {
    const cached = await dimensionsStore.getItem<ImageDimensions>(artworkId);
    if (cached && typeof cached.width === "number" && typeof cached.height === "number") {
      return cached;
    }
  } catch (error) {
    console.warn("[ImageCache] Failed to get cached dimensions", error);
  }
  return null;
}

/**
 * 缓存图片尺寸
 */
export async function cacheImageDimensions(artworkId: string, dimensions: ImageDimensions): Promise<void> {
  try {
    await dimensionsStore.setItem(artworkId, dimensions);
  } catch (error) {
    console.warn("[ImageCache] Failed to cache dimensions", error);
  }
}


/**
 * 通过fetch获取图片blob，避免跨域问题
 * 如果图片是同源的（来自同一个域名），直接使用cors模式
 * 如果是跨域的，尝试使用cors模式，如果失败则抛出错误
 */
async function fetchImageAsBlob(src: string): Promise<Blob> {
  // 检查是否是同源URL
  try {
    const url = new URL(src, window.location.href);
    const isSameOrigin = url.origin === window.location.origin;
    
    if (isSameOrigin) {
      // 同源URL，直接fetch
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      return await response.blob();
    } else {
      // 跨域URL，使用cors模式
      const response = await fetch(src, { mode: "cors" });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      return await response.blob();
    }
  } catch (error) {
    // 如果fetch失败，检查是否是CORS问题
    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      // 可能是CORS问题，尝试使用no-cors模式（虽然会导致Canvas污染，但至少可以加载）
      console.warn(`CORS fetch failed for ${src}, trying no-cors mode (Canvas may be tainted)`);
      try {
        const response = await fetch(src, { mode: "no-cors" });
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        return await response.blob();
      } catch (noCorsError) {
        throw new Error(`Failed to fetch image: ${src}. CORS is required for Canvas export.`);
      }
    }
    throw error;
  }
}

/**
 * 获取缓存的图片，如果不存在或未加载完成，则加载并缓存
 * 使用fetch获取blob并转换为blob URL，确保图片是同源的，避免Canvas污染
 * @param src 图片 URL
 * @returns Promise<HTMLImageElement>
 */
export function getOrLoadImage(src: string): Promise<HTMLImageElement> {
  // 检查是否是blob URL或data URL（这些已经是同源的）
  const isBlobUrl = src.startsWith("blob:");
  const isDataUrl = src.startsWith("data:");
  
  // 如果是同源URL（blob或data），直接加载
  if (isBlobUrl || isDataUrl) {
    const cached = imageCache.get(src);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      return Promise.resolve(cached);
    }
    
    return new Promise<HTMLImageElement>((resolve, reject) => {
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

  // 对于跨域图片，检查是否已经有blob URL
  const blobUrl = blobUrlCache.get(src);
  if (blobUrl) {
    // 检查缓存的图片是否使用这个blob URL
    const cached = imageCache.get(src);
    if (cached && cached.complete && cached.naturalWidth > 0 && cached.src === blobUrl) {
      return Promise.resolve(cached);
    }
  }

  // 对于跨域图片，通过fetch获取blob并转换为blob URL
  return fetchImageAsBlob(src)
    .then((blob) => {
      // 检查是否已经有这个blob的URL
      let currentBlobUrl = blobUrlCache.get(src);
      if (!currentBlobUrl) {
        currentBlobUrl = URL.createObjectURL(blob);
        blobUrlCache.set(src, currentBlobUrl);
      }
      
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        // blob URL是同源的，不需要设置crossOrigin
        img.crossOrigin = null;
        
        const handleLoad = () => {
          imageCache.set(src, img);
          resolve(img);
        };
        
        const handleError = () => {
          reject(new Error(`Failed to load image from blob: ${src}`));
        };
        
        img.addEventListener("load", handleLoad, { once: true });
        img.addEventListener("error", handleError, { once: true });
        img.src = currentBlobUrl!;
      });
    })
    .catch((error) => {
      console.warn(`Failed to fetch image as blob: ${src}`, error);
      // 如果fetch失败，尝试直接加载（可能仍然会有跨域问题）
      const cached = imageCache.get(src);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        return Promise.resolve(cached);
      }
      
      return new Promise<HTMLImageElement>((resolve, reject) => {
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







