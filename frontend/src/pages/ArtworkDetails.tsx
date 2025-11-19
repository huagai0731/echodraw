import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav, { type TopNavAction } from "@/components/TopNav";
import { isFeaturedArtwork } from "@/services/featuredArtworks";

import "./ArtworkDetails.css";

// 将数字转换为罗马数字
function toRomanNumeral(num: number): string {
  if (num <= 0 || !Number.isFinite(num)) return "";
  
  const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const numerals = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  
  let result = "";
  for (let i = 0; i < values.length; i++) {
    while (num >= values[i]) {
      result += numerals[i];
      num -= values[i];
    }
  }
  return result;
}

// 格式化套图标题
function formatCollectionTitle(artwork: ArtworkDetailsProps["artwork"]): string {
  if (artwork.collectionName && artwork.collectionIndex) {
    const romanNumeral = toRomanNumeral(artwork.collectionIndex);
    
    // 提取原始标题（去掉可能存在的套图名前缀）
    let originalTitle = artwork.title;
    if (artwork.title.includes(artwork.collectionName)) {
      // 如果标题包含套图名，尝试提取原始标题
      // 格式可能是：套图名·图片标题 或 套图名I·图片标题 等
      const parts = artwork.title.split("·");
      if (parts.length > 1) {
        // 检查第一部分是否是套图名（可能带罗马数字）
        const firstPart = parts[0];
        if (firstPart.startsWith(artwork.collectionName)) {
          // 去掉套图名和可能的罗马数字，取后面的部分
          originalTitle = parts.slice(1).join("·");
        } else {
          // 如果第一部分不是套图名，保留原标题
          originalTitle = artwork.title;
        }
      } else {
        // 如果没有分隔符，但包含套图名，尝试去掉套图名
        originalTitle = artwork.title.replace(artwork.collectionName, "").trim();
      }
    }
    
    // 如果提取后标题为空，使用原标题
    if (!originalTitle || originalTitle.trim() === "") {
      originalTitle = artwork.title;
    }
    
    return `${artwork.collectionName}${romanNumeral}·${originalTitle}`;
  }
  return artwork.title;
}

type ArtworkDetailsProps = {
  artwork: {
    id: string;
    title: string;
    date: string;
    imageSrc: string;
    alt: string;
    description: string;
    duration: string;
    mood: string;
    rating: string;
    tags: string[];
    collectionId?: string | null;
    collectionName?: string | null;
    collectionIndex?: number | null;
    incrementalDurationMinutes?: number | null;
  };
  onBack: () => void;
  onShare?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onDelete?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onEdit?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onSetAsFeatured?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onRemoveFromFeatured?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onNavigate?: (direction: "prev" | "next") => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

function ArtworkDetails({
  artwork,
  onBack,
  onShare,
  onDelete,
  onEdit,
  onSetAsFeatured,
  onRemoveFromFeatured,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: ArtworkDetailsProps) {
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const swipeThreshold = 48;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFeaturedToast, setShowFeaturedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFeatured, setIsFeatured] = useState(() => isFeaturedArtwork(artwork.id));

  // 当 artwork.id 改变时，更新 isFeatured 状态
  useEffect(() => {
    setIsFeatured(isFeaturedArtwork(artwork.id));
  }, [artwork.id]);

  // 监听 featured artworks 变化
  useEffect(() => {
    const handleFeaturedChanged = () => {
      setIsFeatured(isFeaturedArtwork(artwork.id));
    };

    window.addEventListener("echodraw-featured-artworks-changed", handleFeaturedChanged);
    return () => {
      window.removeEventListener("echodraw-featured-artworks-changed", handleFeaturedChanged);
    };
  }, [artwork.id]);

  // 组件挂载时确保滚动到顶部
  useEffect(() => {
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
    }
  }, []);

  const handleToggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        target.closest(".artwork-details-menu") ||
        target.closest(".artwork-details-menu__trigger")
      ) {
        return;
      }
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!showDeleteConfirm) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDeleteConfirm(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [showDeleteConfirm]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const topNavActions = useMemo<TopNavAction[]>(
    () => [
      {
        icon: "more_vert",
        label: "更多操作",
        onClick: handleToggleMenu,
        className: "artwork-details-menu__trigger",
      },
    ],
    [handleToggleMenu],
  );

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0].clientX;
    touchEndX.current = null;
  }, []);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchEndX.current = event.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null || !onNavigate) {
      return;
    }

    const deltaX = touchStartX.current - touchEndX.current;

    if (deltaX > swipeThreshold && hasNext) {
      onNavigate("next");
    } else if (deltaX < -swipeThreshold && hasPrev) {
      onNavigate("prev");
    }

    touchStartX.current = null;
    touchEndX.current = null;
  }, [hasNext, hasPrev, onNavigate]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!onNavigate) {
        return;
      }

      if (event.key === "ArrowRight" && hasNext) {
        onNavigate("next");
      } else if (event.key === "ArrowLeft" && hasPrev) {
        onNavigate("prev");
      }
    },
    [hasNext, hasPrev, onNavigate],
  );

  return (
    <div className="artwork-details-screen">
      <div className="artwork-details-screen__background" aria-hidden="true">
        <div className="artwork-details-screen__glow artwork-details-screen__glow--primary" />
        <div className="artwork-details-screen__glow artwork-details-screen__glow--secondary" />
      </div>

      <div className="artwork-details-screen__topbar">
        <TopNav
          title="画作"
          subtitle="Artwork Details"
          leadingAction={{ icon: "arrow_back", label: "返回", onClick: onBack }}
          trailingActions={topNavActions}
          className="top-nav--fixed top-nav--flush"
        />
        {menuOpen ? (
          <div className="artwork-details-menu" role="menu">
            <button
              type="button"
              className="artwork-details-menu__item"
              onClick={() => {
                setMenuOpen(false);
                onEdit?.(artwork);
              }}
            >
              <MaterialIcon name="edit" className="artwork-details-menu__icon" />
              编辑
            </button>
            <button
              type="button"
              className="artwork-details-menu__item"
              onClick={() => {
                setMenuOpen(false);
                if (isFeatured) {
                  onRemoveFromFeatured?.(artwork);
                  setToastMessage(`"${artwork.title}" 已取消展示为作品，已从个人页面移除`);
                } else {
                  onSetAsFeatured?.(artwork);
                  setToastMessage(`"${artwork.title}" 已设置为作品，将在个人页面展示`);
                }
                setShowFeaturedToast(true);
                if (toastTimerRef.current) {
                  clearTimeout(toastTimerRef.current);
                }
                toastTimerRef.current = setTimeout(() => {
                  setShowFeaturedToast(false);
                  toastTimerRef.current = null;
                }, 5000);
              }}
            >
              <MaterialIcon name="star" className="artwork-details-menu__icon" />
              {isFeatured ? "取消展示为作品" : "展示为作品"}
            </button>
            <div className="artwork-details-menu__divider" />
            <button
              type="button"
              className="artwork-details-menu__item"
              onClick={() => {
                setMenuOpen(false);
                setShowDeleteConfirm(true);
              }}
            >
              <MaterialIcon name="delete" className="artwork-details-menu__icon artwork-details-menu__icon--danger" />
              删除
            </button>
          </div>
        ) : null}
      </div>

      {showFeaturedToast ? (
        <div className="artwork-featured-toast">
          <div className="artwork-featured-toast__content">
            <MaterialIcon name="star" className="artwork-featured-toast__icon" filled />
            <span className="artwork-featured-toast__text">{toastMessage}</span>
          </div>
        </div>
      ) : null}

      <main
        className="artwork-details-screen__content"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-label={`${artwork.title} 详情`}
      >
        <div className="artwork-details-screen__header">
          {hasPrev ? (
            <button
              type="button"
              className="artwork-details-screen__nav artwork-details-screen__nav--prev"
              onClick={() => onNavigate?.("prev")}
              aria-label="上一幅作品"
            >
              <MaterialIcon name="chevron_left" />
            </button>
          ) : (
            <div className="artwork-details-screen__nav-placeholder" />
          )}
          
          <div className="artwork-details-screen__title-block">
            <h1 className="artwork-details-screen__title">
              {formatCollectionTitle(artwork)}
            </h1>
            <p className="artwork-details-screen__date">{artwork.date}</p>
          </div>

          {hasNext ? (
            <button
              type="button"
              className="artwork-details-screen__nav artwork-details-screen__nav--next"
              onClick={() => onNavigate?.("next")}
              aria-label="下一幅作品"
            >
              <MaterialIcon name="chevron_right" />
            </button>
          ) : (
            <div className="artwork-details-screen__nav-placeholder" />
          )}
        </div>

        <div className="artwork-details-screen__image-frame">
          <img src={artwork.imageSrc} alt={artwork.alt} className="artwork-details-screen__image" />
        </div>

        <section className="artwork-details-screen__meta">
          <p className="artwork-details-screen__description">{artwork.description}</p>

          <div className="artwork-details-screen__stats" aria-label="作品信息">
            <span className="artwork-details-screen__stat">
              <MaterialIcon name="sentiment_calm" className="artwork-details-screen__stat-icon" />
              {artwork.mood}
            </span>
            <span className="artwork-details-screen__divider" aria-hidden="true" />
            <span className="artwork-details-screen__stat">
              <MaterialIcon name="star" className="artwork-details-screen__stat-icon" filled />
              {artwork.rating}
            </span>
            {artwork.incrementalDurationMinutes !== null && artwork.incrementalDurationMinutes !== undefined && artwork.incrementalDurationMinutes > 0 && (
              <>
                <span className="artwork-details-screen__divider" aria-hidden="true" />
                <span className="artwork-details-screen__stat" style={{ color: "#98dbc6" }}>
                  <MaterialIcon name="schedule" className="artwork-details-screen__stat-icon" />
                  {(() => {
                    const hours = Math.floor(artwork.incrementalDurationMinutes / 60);
                    const minutes = artwork.incrementalDurationMinutes % 60;
                    if (hours > 0 && minutes > 0) {
                      return `+${hours} 小时 ${minutes} 分钟`;
                    }
                    if (hours > 0) {
                      return `+${hours} 小时`;
                    }
                    return `+${minutes} 分钟`;
                  })()}
                </span>
              </>
            )}
          </div>

          <div className="artwork-details-screen__tags" aria-label="作品标签">
            {artwork.tags.map((tag) => (
              <span key={tag} className="artwork-details-screen__tag">
                #{tag}
              </span>
            ))}
          </div>
        </section>

        <div className="artwork-details-screen__actions">
          <button
            type="button"
            className="artwork-details-screen__export"
            onClick={() => onShare?.(artwork)}
          >
            <MaterialIcon name="ios_share" className="artwork-details-screen__export-icon" />
            导出作品
          </button>
        </div>
      </main>

      {showDeleteConfirm ? (
        <div className="artwork-delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="artwork-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="artwork-delete-confirm-title">要删除这幅作品吗？</h2>
            <div className="artwork-delete-confirm-content">
              <p className="artwork-delete-confirm-text">
                删除后，它记录的创作时长会从你的总时长里一并消失。
              </p>
              <p className="artwork-delete-confirm-text">
                很多画在当下看不顺眼，可它们都是你一路积累下来的痕迹。
              </p>
              <p className="artwork-delete-confirm-text artwork-delete-confirm-text--highlight">
                如果不是误传，再考虑一下吗
              </p>
            </div>
            <div className="artwork-delete-confirm-actions">
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--cancel"
                onClick={() => setShowDeleteConfirm(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--confirm"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete?.(artwork);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ArtworkDetails;


