// 重新导出类型和组件以保持向后兼容
export type { Artwork } from "@/types/artwork";
export { INITIAL_ARTWORKS, GalleryPage as Gallery } from "./gallery/GalleryPage";
export type { GalleryFilters, GalleryFilterStats } from "@/utils/urlQueryState";

// 重新导出工具函数以保持向后兼容
export { formatDurationLabel } from "@/utils/durationUtils";

// 保持默认导出
import { GalleryPage } from "./gallery/GalleryPage";
export default GalleryPage;
