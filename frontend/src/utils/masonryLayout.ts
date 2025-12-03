import type { Artwork } from "@/types/artwork";

export type ImageDimensions = {
  width: number;
  height: number;
};

/**
 * 瀑布流布局：将作品分配到左右两列
 */
export function distributeArtworks(artworks: Artwork[]): {
  leftColumn: Artwork[];
  rightColumn: Artwork[];
} {
  const leftColumn: Artwork[] = [];
  const rightColumn: Artwork[] = [];
  
  artworks.forEach((artwork, index) => {
    if (index % 2 === 0) {
      leftColumn.push(artwork);
    } else {
      rightColumn.push(artwork);
    }
  });
  
  return { leftColumn, rightColumn };
}

/**
 * 计算图片的宽高比（用于占位）
 */
export function getImageAspectRatio(dimensions: ImageDimensions | null): number {
  if (!dimensions || dimensions.width === 0 || dimensions.height === 0) {
    return 1; // 默认正方形
  }
  return dimensions.width / dimensions.height;
}

