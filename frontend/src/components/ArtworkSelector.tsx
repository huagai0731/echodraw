import { useState, useEffect, useMemo } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { loadStoredArtworks, USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";
import type { Artwork } from "@/types/artwork";
import { formatISODateInShanghai, parseISODateInShanghai } from "@/utils/dateUtils";
import "./ArtworkSelector.css";

type ArtworkSelectorProps = {
  startDate: Date;
  endDate: Date;
  onSelect: (artworkId: number) => void;
  onClose: () => void;
};

const ITEMS_PER_PAGE = 20;

function ArtworkSelector({ startDate, endDate, onSelect, onClose }: ArtworkSelectorProps) {
  const [allArtworks, setAllArtworks] = useState<Artwork[]>(() => loadStoredArtworks());
  const [currentPage, setCurrentPage] = useState(1);

  // 监听画作数据变化
  useEffect(() => {
    const handleArtworksChange = () => {
      setAllArtworks(loadStoredArtworks());
    };

    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChange);
    return () => {
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChange);
    };
  }, []);

  // 过滤时间范围内的画作
  const filteredArtworks = useMemo(() => {
    return allArtworks.filter((artwork) => {
      const artworkDate = artwork.uploadedAt
        ? new Date(artwork.uploadedAt)
        : artwork.uploadedDate
        ? parseISODateInShanghai(artwork.uploadedDate)
        : null;

      if (!artworkDate) return false;

      // 转换为日期进行比较（忽略时间部分）
      const artworkDateOnly = new Date(
        artworkDate.getFullYear(),
        artworkDate.getMonth(),
        artworkDate.getDate()
      );
      const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

      return artworkDateOnly >= startDateOnly && artworkDateOnly <= endDateOnly;
    });
  }, [allArtworks, startDate, endDate]);

  // 分页
  const totalPages = Math.ceil(filteredArtworks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedArtworks = filteredArtworks.slice(startIndex, endIndex);

  const handleSelect = (artwork: Artwork) => {
    const numericId = artwork.id.replace(/^art-/, "");
    const uploadId = Number.parseInt(numericId, 10);
    if (Number.isFinite(uploadId) && uploadId > 0) {
      onSelect(uploadId);
    }
  };

  return (
    <div className="artwork-selector-overlay" onClick={onClose}>
      <div className="artwork-selector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="artwork-selector-header">
          <h2 className="artwork-selector-title">选择画作</h2>
          <button
            type="button"
            className="artwork-selector-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="artwork-selector-body">
          {filteredArtworks.length === 0 ? (
            <div className="artwork-selector-empty">
              <MaterialIcon name="image_not_supported" />
              <p>该时间段内没有上传的画作</p>
            </div>
          ) : (
            <>
              <div className="artwork-selector-grid">
                {paginatedArtworks.map((artwork) => (
                  <button
                    key={artwork.id}
                    type="button"
                    className="artwork-selector-item"
                    onClick={() => handleSelect(artwork)}
                  >
                    <img
                      src={artwork.imageSrc}
                      alt={artwork.title}
                      className="artwork-selector-item-image"
                    />
                    {artwork.title && (
                      <div className="artwork-selector-item-title">{artwork.title}</div>
                    )}
                  </button>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="artwork-selector-pagination">
                  <button
                    type="button"
                    className="artwork-selector-pagination-button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <MaterialIcon name="chevron_left" />
                    上一页
                  </button>
                  <span className="artwork-selector-pagination-info">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="artwork-selector-pagination-button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    下一页
                    <MaterialIcon name="chevron_right" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ArtworkSelector;

