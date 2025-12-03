import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";

export type TagFilterMode = "any" | "all";

export type GalleryFilters = {
  tags: string[];
  tagMode: TagFilterMode;
};

export type GalleryFilterStats = {
  availableTags: string[];
};

const DEFAULT_FILTERS: GalleryFilters = {
  tags: [],
  tagMode: "any",
};

/**
 * 从 URL 查询参数解析筛选条件
 */
export function parseFiltersFromURL(searchParams: URLSearchParams): GalleryFilters {
  const tagsParam = searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : [];
  const tagMode = (searchParams.get("tagMode") || DEFAULT_FILTERS.tagMode) as TagFilterMode;
  
  return {
    tags,
    tagMode: tagMode === "all" ? "all" : "any",
  };
}

/**
 * 将筛选条件同步到 URL 查询参数
 */
export function syncFiltersToURL(
  filters: GalleryFilters,
  searchParams: URLSearchParams,
  setSearchParams: (params: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => void,
): void {
  const newParams = new URLSearchParams(searchParams);
  
  if (filters.tags.length > 0) {
    newParams.set("tags", filters.tags.join(","));
  } else {
    newParams.delete("tags");
  }
  
  if (filters.tagMode !== DEFAULT_FILTERS.tagMode) {
    newParams.set("tagMode", filters.tagMode);
  } else {
    newParams.delete("tagMode");
  }
  
  setSearchParams(newParams);
}

/**
 * Hook: 使用 URL 查询参数管理筛选条件
 */
export function useURLQueryState() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const filters = useMemo(() => {
    return parseFiltersFromURL(searchParams);
  }, [searchParams]);
  
  const updateFilters = useCallback((newFilters: GalleryFilters | ((prev: GalleryFilters) => GalleryFilters)) => {
    const finalFilters = typeof newFilters === "function" ? newFilters(filters) : newFilters;
    syncFiltersToURL(finalFilters, searchParams, setSearchParams);
  }, [filters, searchParams, setSearchParams]);
  
  return [filters, updateFilters] as const;
}

