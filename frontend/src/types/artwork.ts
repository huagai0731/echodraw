export type Artwork = {
  id: string;
  title: string;
  date: string;
  tags: string[];
  imageSrc: string;
  thumbnailSrc?: string | null; // 缩略图URL，用于列表页展示，节省CDN流量
  alt: string;
  description: string;
  duration: string;
  mood: string;
  rating: string;
  uploadedAt?: string | null;
  uploadedDate?: string | null;
  durationMinutes?: number | null;
  // 套图相关字段
  collectionId?: string | null; // 套图ID，同一套图的图片共享相同的collectionId
  collectionName?: string | null; // 套图名称
  collectionIndex?: number | null; // 在套图中的索引（从1开始，用于显示罗马数字）
  incrementalDurationMinutes?: number | null; // 增量时长（分钟），仅当增加到已有套图时使用，表示这张图相对于套图已有最大时长的增量
};



