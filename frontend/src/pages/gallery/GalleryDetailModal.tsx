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
  onUpdateCollectionThumbnail?: (collectionId: string, thumbnailArtworkId: string) => void;
  onUpdateCollectionName?: (collectionId: string, collectionName: string) => void;
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
  onUpdateCollectionThumbnail,
  onUpdateCollectionName,
}: GalleryDetailModalProps) {
  const [collectionArtworks, setCollectionArtworks] = useState<Artwork[]>([]);
  const [currentCollectionIndex, setCurrentCollectionIndex] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentArtwork, setCurrentArtwork] = useState<Artwork | null>(artwork);

  // 当 artwork 改变时，更新当前作品并退出编辑模式
  // 只有当 artwork.id 改变时才更新，避免在套图内切换时被覆盖
  useEffect(() => {
    if (artwork && artwork.id !== currentArtwork?.id) {
      setCurrentArtwork(artwork);
      setIsEditMode(false);
    }
  }, [artwork, currentArtwork?.id]);

  // 处理套图逻辑
  useEffect(() => {
    if (!currentArtwork || !currentArtwork.collectionId) {
      setCollectionArtworks([]);
      setCurrentCollectionIndex(0);
      return;
    }

    const collectionItems = allArtworks.filter((a) => a.collectionId === currentArtwork.collectionId);
    
    // 套图信息完全依赖服务器，不读取本地存储的顺序
    // 按时间从早到晚排序（与罗马数字序号一致）
    const orderedItems = [...collectionItems].sort((a, b) => {
      const timeA = getArtworkTimestamp(a);
      const timeB = getArtworkTimestamp(b);
      return timeA - timeB;
    });

    // 计算罗马数字序号：始终根据上传时间从早到晚排序
    const timeSortedItems = [...collectionItems].sort((a, b) => {
      const timeA = getArtworkTimestamp(a);
      const timeB = getArtworkTimestamp(b);
      return timeA - timeB; // 从早到晚
    });
    
    // 为每个套图作品设置正确的 collectionIndex（基于上传时间，从1开始）
    const orderedItemsWithIndex = orderedItems.map((item) => {
      const timeSortedIndex = timeSortedItems.findIndex((a) => a.id === item.id);
      return {
        ...item,
        collectionIndex: timeSortedIndex >= 0 ? timeSortedIndex + 1 : null,
        collectionName: currentArtwork.collectionName || item.collectionName || null,
      };
    });
    
    setCollectionArtworks(orderedItemsWithIndex);
    
    const timeSortedIndex = timeSortedItems.findIndex((a) => a.id === currentArtwork.id);
    
    // 导航使用的索引：使用编辑后的顺序（如果存在）
    const navigationIndex = orderedItemsWithIndex.findIndex((a) => a.id === currentArtwork.id);
    if (navigationIndex >= 0) {
      setCurrentCollectionIndex(navigationIndex);
    }
    
    // 更新当前作品的 collectionIndex 和 collectionName（用于标题显示）
    // 只有当值实际改变时才更新，避免无限循环
    if (currentArtwork.collectionId && timeSortedIndex >= 0) {
      const newCollectionIndex = timeSortedIndex + 1;
      const newCollectionName = currentArtwork.collectionName || collectionItems[0]?.collectionName || null;
      
      // 检查是否需要更新
      if (
        currentArtwork.collectionIndex !== newCollectionIndex ||
        currentArtwork.collectionName !== newCollectionName
      ) {
        setCurrentArtwork({
          ...currentArtwork,
          collectionIndex: newCollectionIndex,
          collectionName: newCollectionName,
        });
      }
    }
  }, [currentArtwork?.id, currentArtwork?.collectionId, allArtworks]);

  const handleBack = useCallback(() => {
    // 不在这里保存滚动位置，因为在打开详情页时已经保存了列表的滚动位置
    // 这里保存可能会保存详情页的滚动位置（通常是0），导致恢复位置不正确
    onClose();
  }, [onClose]);

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      // 如果在套图内，先尝试在套图内切换
      if (currentArtwork?.collectionId && collectionArtworks.length > 0 && currentCollectionIndex >= 0) {
        const hasPrevInCollection = currentCollectionIndex > 0;
        const hasNextInCollection = currentCollectionIndex < collectionArtworks.length - 1;
        
        if (direction === "prev" && hasPrevInCollection) {
          // 在套图内向前切换
          const newIndex = currentCollectionIndex - 1;
          const newArtwork = collectionArtworks[newIndex];
          if (newArtwork) {
            setCurrentCollectionIndex(newIndex);
            setCurrentArtwork(newArtwork);
            // 同步更新父组件的 selectedArtwork，确保导航状态正确
            onSelectArtwork?.(newArtwork);
            return;
          }
        } else if (direction === "next" && hasNextInCollection) {
          // 在套图内向后切换
          const newIndex = currentCollectionIndex + 1;
          const newArtwork = collectionArtworks[newIndex];
          if (newArtwork) {
            setCurrentCollectionIndex(newIndex);
            setCurrentArtwork(newArtwork);
            // 同步更新父组件的 selectedArtwork，确保导航状态正确
            onSelectArtwork?.(newArtwork);
            return;
          }
        }
        // 如果已经在套图边界，继续调用父组件的导航
      }
      
      // 不在套图内，或者已经在套图边界，调用父组件的导航
      // 父组件会更新 selectedArtwork，然后通过 artwork prop 传递下来，触发 useEffect 更新本地状态
      onNavigate(direction);
    },
    [onNavigate, onSelectArtwork, currentArtwork, collectionArtworks, currentCollectionIndex]
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
  if (isEditMode) {
    return (
      <ArtworkEditPage
        artwork={currentArtwork}
        onBack={handleEditBack}
        onSave={handleEditSave}
      />
    );
  }

  // 确定当前显示的作品（套图内切换时使用套图中的作品）
  // collectionArtworks 中的每个作品都已经设置了正确的 collectionIndex 和 collectionName
  const displayArtwork =
    currentArtwork.collectionId && collectionArtworks.length > 0 && currentCollectionIndex >= 0
      ? collectionArtworks[currentCollectionIndex] || currentArtwork
      : currentArtwork;

  // 确保 finalArtwork 有正确的 collectionId 和 collectionName（用于编辑套图按钮显示）
  // 优先使用 collectionArtworks 中的信息，确保所有字段都正确
  const finalArtwork: Artwork = collectionArtworks.length > 0 && currentCollectionIndex >= 0 && currentCollectionIndex < collectionArtworks.length
    ? {
        ...collectionArtworks[currentCollectionIndex],
        // 确保 collectionId 和 collectionName 都存在
        collectionId: collectionArtworks[currentCollectionIndex].collectionId || currentArtwork.collectionId || null,
        collectionName: collectionArtworks[currentCollectionIndex].collectionName || currentArtwork.collectionName || null,
      }
    : {
        ...displayArtwork,
        collectionId: currentArtwork.collectionId || displayArtwork.collectionId || null,
        collectionName: currentArtwork.collectionName || displayArtwork.collectionName || null,
      };

  // 计算本地的 hasPrev 和 hasNext（考虑套图内的情况）
  let localHasPrev = hasPrev;
  let localHasNext = hasNext;
  if (currentArtwork?.collectionId && collectionArtworks.length > 0 && currentCollectionIndex >= 0) {
    // 在套图内时，检查套图内的边界
    const hasPrevInCollection = currentCollectionIndex > 0;
    const hasNextInCollection = currentCollectionIndex < collectionArtworks.length - 1;
    // 如果在套图边界，还需要考虑是否可以切换到套图外
    localHasPrev = hasPrevInCollection || hasPrev;
    localHasNext = hasNextInCollection || hasNext;
  }

  return (
    <ArtworkDetails
      artwork={finalArtwork}
      collectionArtworks={finalArtwork.collectionId && collectionArtworks.length > 0 ? collectionArtworks : undefined}
      hasPrev={localHasPrev}
      hasNext={localHasNext}
      onBack={handleBack}
      onShare={onShare}
      onDelete={onDelete}
      onEdit={handleEdit}
      onSetAsFeatured={onSetAsFeatured}
      onRemoveFromFeatured={onRemoveFromFeatured}
      onNavigate={handleNavigate}
      onUpdateCollectionThumbnail={onUpdateCollectionThumbnail}
      onUpdateCollectionName={onUpdateCollectionName}
      onUpdateArtwork={onUpdateArtwork}
    />
  );
}

function getArtworkTimestamp(artwork: Artwork): number {
  if (artwork.uploadedAt) {
    const uploadedAtTime = Date.parse(artwork.uploadedAt);
    if (!Number.isNaN(uploadedAtTime)) {
      return uploadedAtTime;
    }
  }
  if (artwork.uploadedDate) {
    const uploadedDateTime = Date.parse(`${artwork.uploadedDate}T00:00:00Z`);
    if (!Number.isNaN(uploadedDateTime)) {
      return uploadedDateTime;
    }
  }
  if (artwork.date) {
    const fallbackTime = Date.parse(artwork.date);
    if (!Number.isNaN(fallbackTime)) {
      return fallbackTime;
    }
  }
  return 0;
}

