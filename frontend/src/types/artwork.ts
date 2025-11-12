export type Artwork = {
  id: string;
  title: string;
  date: string;
  tags: string[];
  imageSrc: string;
  alt: string;
  description: string;
  duration: string;
  mood: string;
  rating: string;
  uploadedAt?: string | null;
  uploadedDate?: string | null;
  durationMinutes?: number | null;
};



