import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStoredArtworks, USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";
import type { Artwork } from "@/types/artwork";

export type Collection = {
  id: string;
  name: string;
  coverImage: string | null;
  count: number;
};

function getArtworkTimestamp(artwork: Artwork): number {
  if (artwork.uploadedAt) {
    const time = Date.parse(artwork.uploadedAt);
    if (!Number.isNaN(time)) return time;
  }
  if (artwork.uploadedDate) {
    const time = Date.parse(`${artwork.uploadedDate}T00:00:00Z`);
    if (!Number.isNaN(time)) return time;
  }
  if (artwork.date) {
    const time = Date.parse(artwork.date);
    if (!Number.isNaN(time)) return time;
  }
  return 0;
}

function parseDurationMinutes(artwork: Artwork): number | null {
  if (
    typeof artwork.durationMinutes === "number" &&
    Number.isFinite(artwork.durationMinutes)
  ) {
    return Math.max(artwork.durationMinutes, 0);
  }
  if (typeof artwork.duration === "string" && artwork.duration.trim().length > 0) {
    const match = artwork.duration.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
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

export function useGroupManager() {
  const [refreshKey, setRefreshKey] = useState(0);
  
  // 缓存 artworks 数据，避免频繁读取 localStorage
  const artworksCacheRef = useRef<Artwork[] | null>(null);
  const cacheKeyRef = useRef<number>(0);

  // 获取缓存的 artworks，只在 refreshKey 变化时重新加载
  const getCachedArtworks = useCallback((): Artwork[] => {
    if (artworksCacheRef.current === null || cacheKeyRef.current !== refreshKey) {
      artworksCacheRef.current = loadStoredArtworks();
      cacheKeyRef.current = refreshKey;
    }
    return artworksCacheRef.current;
  }, [refreshKey]);

  const collections = useMemo(() => {
    const artworks = getCachedArtworks();
    const collectionMap = new Map<
      string,
      { name: string; artworks: Artwork[] }
    >();

    const collectionArtworks = artworks.filter(
      (artwork) => artwork.collectionId && artwork.collectionName
    );

    collectionArtworks.forEach((artwork) => {
      if (artwork.collectionId && artwork.collectionName) {
        if (!collectionMap.has(artwork.collectionId)) {
          collectionMap.set(artwork.collectionId, {
            name: artwork.collectionName,
            artworks: [],
          });
        }
        collectionMap.get(artwork.collectionId)!.artworks.push(artwork);
      }
    });

    collectionMap.forEach((collection) => {
      collection.artworks.sort((a, b) => {
        const timeA = getArtworkTimestamp(a);
        const timeB = getArtworkTimestamp(b);
        return timeB - timeA;
      });
    });

    return Array.from(collectionMap.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      coverImage: data.artworks[0]?.imageSrc || null,
      count: data.artworks.length,
    }));
  }, [getCachedArtworks]);

  const getCollectionMaxDuration = useCallback((collectionId: string): number => {
    const artworks = getCachedArtworks();
    const collectionArtworks = artworks.filter(
      (a) => a.collectionId === collectionId
    );
    let maxDuration = 0;
    collectionArtworks.forEach((artwork) => {
      const duration = parseDurationMinutes(artwork);
      if (duration !== null) {
        maxDuration = Math.max(maxDuration, duration);
      }
    });
    return maxDuration;
  }, [getCachedArtworks]);

  const getNextCollectionIndex = useCallback((collectionId: string): number => {
    const artworks = getCachedArtworks();
    const collectionArtworks = artworks.filter(
      (a) => a.collectionId === collectionId
    );
    return collectionArtworks.length + 1;
  }, [getCachedArtworks]);

  const generateCollectionId = useCallback((): string => {
    return `collection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const refreshCollections = useCallback(() => {
    artworksCacheRef.current = null; // 清除缓存
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const handleArtworksChanged = () => {
      artworksCacheRef.current = null; // 清除缓存
      setRefreshKey((prev) => prev + 1);
    };

    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    return () => {
      window.removeEventListener(
        USER_ARTWORKS_CHANGED_EVENT,
        handleArtworksChanged
      );
    };
  }, []);

  return {
    collections,
    getCollectionMaxDuration,
    getNextCollectionIndex,
    generateCollectionId,
    refreshCollections,
  };
}

