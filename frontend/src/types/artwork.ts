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
  collectionId?: string | null;
  collectionName?: string | null;
  collectionIndex?: number | null;
  incrementalDurationMinutes?: number | null;
};



