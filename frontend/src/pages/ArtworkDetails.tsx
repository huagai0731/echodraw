import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav, { type TopNavAction } from "@/components/TopNav";

import "./ArtworkDetails.css";

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
  };
  onBack: () => void;
  onShare?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onDelete?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onEdit?: (artwork: ArtworkDetailsProps["artwork"]) => void;
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
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: ArtworkDetailsProps) {
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const swipeThreshold = 48;
  const [menuOpen, setMenuOpen] = useState(false);

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
          title={artwork.title}
          subtitle="Artwork Details"
          leadingAction={{ icon: "arrow_back", label: "返回", onClick: onBack }}
          trailingActions={topNavActions}
          className="top-nav--fixed"
        />
        {menuOpen ? (
          <div className="artwork-details-menu" role="menu">
            <button
              type="button"
              className="artwork-details-menu__item"
              onClick={() => {
                setMenuOpen(false);
                onDelete?.(artwork);
              }}
            >
              <MaterialIcon name="delete" className="artwork-details-menu__icon artwork-details-menu__icon--danger" />
              删除此作
            </button>
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
          </div>
        ) : null}
      </div>

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
            <p className="artwork-details-screen__date">{artwork.date}</p>
            <h1 className="artwork-details-screen__title">{artwork.title}</h1>
            <div className="artwork-details-screen__duration">
              <MaterialIcon name="schedule" className="artwork-details-screen__stat-icon" />
              {artwork.duration}
            </div>
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
    </div>
  );
}

export default ArtworkDetails;


