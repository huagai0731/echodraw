import { useMemo } from "react";
import type { Artwork } from "@/types/artwork";
import { distributeArtworks } from "@/utils/masonryLayout";
import { GalleryItem } from "./GalleryItem";
import type { ImageDimensions } from "@/utils/imageCache";

import "../Gallery.css";

type GalleryListProps = {
  artworks: Artwork[];
  showInfo: boolean;
  getCollectionCount: (collectionId: string) => number;
  tagIdToNameMap: Map<string, string>;
  onSelect: (artwork: Artwork) => void;
  onImageLoad?: (artworkId: string, dimensions: ImageDimensions) => void;
};

export function GalleryList({
  artworks,
  showInfo,
  getCollectionCount,
  tagIdToNameMap,
  onSelect,
  onImageLoad,
}: GalleryListProps) {
  const { leftColumn, rightColumn } = useMemo(() => {
    return distributeArtworks(artworks);
  }, [artworks]);

  return (
    <div className="gallery-screen__masonry">
      <div className="gallery-screen__masonry-column">
        {leftColumn.map((artwork, index) => (
          <GalleryItem
            key={artwork.id}
            artwork={artwork}
            index={index * 2}
            showInfo={showInfo}
            collectionCount={artwork.collectionId ? getCollectionCount(artwork.collectionId) : undefined}
            tagIdToNameMap={tagIdToNameMap}
            onSelect={onSelect}
            onImageLoad={onImageLoad}
          />
        ))}
      </div>
      <div className="gallery-screen__masonry-column">
        {rightColumn.map((artwork, index) => (
          <GalleryItem
            key={artwork.id}
            artwork={artwork}
            index={index * 2 + 1}
            showInfo={showInfo}
            collectionCount={artwork.collectionId ? getCollectionCount(artwork.collectionId) : undefined}
            tagIdToNameMap={tagIdToNameMap}
            onSelect={onSelect}
            onImageLoad={onImageLoad}
          />
        ))}
      </div>
    </div>
  );
}

