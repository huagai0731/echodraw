import { useState, useEffect, useCallback } from "react";
import type { Artwork } from "@/types/artwork";
import ArtworkDetails from "@/pages/ArtworkDetails";
import { ArtworkEditPage } from "./ArtworkEditPage";

type GalleryDetailModalProps = {
  artwork: Artwork | null;
  allArtworks: Artwork[];
  hasPrev: boolean;
  hasNext: boolean;
  onClose: () => void;
  onShare?: (artwork: Artwork) => void;
  onDelete?: (artwork: Artwork) => void;
  onEdit?: (artwork: Artwork) => void;
  onUpdateArtwork?: (artwork: Artwork) => void;
  onSetAsFeatured?: (artwork: Artwork) => void;
  onRemoveFromFeatured?: (artwork: Artwork) => void;
  onNavigate: (direction: "prev" | "next") => void;
  onSelectArtwork?: (artwork: Artwork) => void;
};

export function GalleryDetailModal({
  artwork,
  allArtworks,
  hasPrev,
  hasNext,
  onClose,
  onShare,
  onDelete,
  onEdit,
  onUpdateArtwork,
  onSetAsFeatured,
  onRemoveFromFeatured,
  onNavigate,
  onSelectArtwork,
}: GalleryDetailModalProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(artwork);

  // 当 artwork 改变时，更新当前作品并退出编辑模式
  useEffect(() => {
    if (artwork) {
      // 如果 artwork 存在且与当前作品不同，更新当前作品
      if (artwork.id !== currentArtwork?.id) {
        setCurrentArtwork(artwork);
        setIsEditMode(false);
      }
    } else {
      // 如果 artwork 为 null，清除当前作品并退出编辑模式
      setCurrentArtwork(null);
      setIsEditMode(false);
    }
  }, [artwork, currentArtwork?.id]);

  const handleBack = useCallback(() => {
    // 不在这里保存滚动位置，因为在打开详情页时已经保存了列表的滚动位置
    // 这里保存可能会保存详情页的滚动位置（通常是0），导致恢复位置不正确
    onClose();
  }, [onClose]);

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      onNavigate(direction);
    },
    [onNavigate]
  );

  const handleEdit = useCallback(() => {
    if (currentArtwork) {
      setIsEditMode(true);
      onEdit?.(currentArtwork);
    }
  }, [currentArtwork, onEdit]);

  const handleEditBack = useCallback(() => {
    setIsEditMode(false);
  }, []);

  const handleEditSave = useCallback(
    async (updatedArtwork: Artwork) => {
      try {
        // 先更新本地状态，确保详情页能显示更新后的内容
        setCurrentArtwork(updatedArtwork);
        // 退出编辑模式，返回到详情页
        setIsEditMode(false);
        // 然后异步保存到后端
        await onUpdateArtwork?.(updatedArtwork);
      } catch (error) {
        console.error("[GalleryDetailModal] Save failed:", error);
        // 即使保存失败，也要返回到详情页（显示更新后的内容）
        setIsEditMode(false);
      }
    },
    [onUpdateArtwork]
  );

  if (!currentArtwork) {
    return null;
  }

  // 如果处于编辑模式，显示编辑页面
  if (isEditMode && currentArtwork) {
    return (
      <ArtworkEditPage
        artwork={currentArtwork}
        onBack={handleEditBack}
        onSave={handleEditSave}
      />
    );
  }


  return (
    <ArtworkDetails
      artwork={currentArtwork}
      hasPrev={hasPrev}
      hasNext={hasNext}
      onBack={handleBack}
      onShare={onShare}
      onDelete={onDelete}
      onEdit={handleEdit}
      onSetAsFeatured={onSetAsFeatured}
      onRemoveFromFeatured={onRemoveFromFeatured}
      onNavigate={handleNavigate}
      onUpdateArtwork={onUpdateArtwork}
    />
  );
}


