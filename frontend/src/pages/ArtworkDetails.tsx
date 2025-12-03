import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav, { type TopNavAction } from "@/components/TopNav";
import { isFeaturedArtwork } from "@/services/featuredArtworks";
import { loadTagPreferencesAsync, buildTagOptionsAsync } from "@/services/tagPreferences";
import SingleArtworkTemplateDesigner from "@/pages/reports/SingleArtworkTemplateDesigner";
import type { Artwork } from "@/types/artwork";

import "./ArtworkDetails.css";

// 安全验证：验证图片URL是否安全（防止XSS和SSRF攻击）
function isValidImageUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  // 允许相对路径（以/开头）
  if (url.startsWith("/")) {
    return true;
  }

  // 允许data URL（base64图片）
  if (url.startsWith("data:image/")) {
    // 验证data URL格式
    const dataUrlPattern = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
    return dataUrlPattern.test(url);
  }

  // 允许blob URL（本地文件预览）
  if (url.startsWith("blob:")) {
    return true;
  }

  // 对于绝对URL，只允许同源或受信任的域名
  try {
    const urlObj = new URL(url, window.location.origin);
    // 只允许http和https协议
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return false;
    }
    // 允许同源URL
    if (urlObj.origin === window.location.origin) {
      return true;
    }
    
    // 获取允许的图片域名白名单（从环境变量）
    const allowedDomainsEnv = (import.meta.env.VITE_ALLOWED_IMAGE_DOMAINS ?? "").trim();
    const allowedDomains: string[] = [];
    
    if (allowedDomainsEnv) {
      // 支持逗号分隔的多个域名
      allowedDomains.push(
        ...allowedDomainsEnv
          .split(",")
          .map((d: string) => d.trim())
          .filter((d: string) => d.length > 0)
      );
    }
    
    // 检查是否在允许的域名列表中
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = allowedDomains.some((domain) => {
      const normalizedDomain = domain.toLowerCase().trim();
      // 支持精确匹配和通配符匹配（*.example.com）
      if (normalizedDomain.startsWith("*.")) {
        const domainSuffix = normalizedDomain.slice(2);
        return hostname === domainSuffix || hostname.endsWith(`.${domainSuffix}`);
      }
      return hostname === normalizedDomain;
    });
    
    if (isAllowed) {
      return true;
    }
    
    // 默认情况下，为了安全，只允许同源URL
    return false;
  } catch {
    // URL解析失败，可能是无效的URL
    return false;
  }
}

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

// 格式化时间：0000-00-00 00:00
function formatDateTime(uploadedAt: string | null | undefined): string {
  if (!uploadedAt) {
    return "";
  }
  try {
    const date = new Date(uploadedAt);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return "";
  }
}

// 格式化套图标题
function formatCollectionTitle(artwork: ArtworkDetailsProps["artwork"]): string {
  if (artwork.collectionName && artwork.collectionIndex) {
    const romanNumeral = toRomanNumeral(artwork.collectionIndex);
    
    // 从 title 中提取纯作品标题（移除可能包含的套图名）
    // title 格式可能是："套图名·作品标题" 或 "作品标题"
    let pureTitle = artwork.title || "";
    if (artwork.collectionName && pureTitle) {
      // 如果 title 以套图名开头（格式：套图名·作品标题），移除套图名部分
      const collectionPrefix = `${artwork.collectionName}·`;
      if (pureTitle.startsWith(collectionPrefix)) {
        pureTitle = pureTitle.slice(collectionPrefix.length);
      } else if (pureTitle === artwork.collectionName) {
        // 如果 title 就是套图名，清空
        pureTitle = "";
      }
    }
    
    // 格式为：套图名 + 罗马数字序号 · 纯作品标题
    // 例如：套图名是"猫"，纯作品标题是"狗"，在套图中是第二张，则显示为"猫II·狗"
    if (pureTitle && pureTitle.trim()) {
      return `${artwork.collectionName}${romanNumeral}·${pureTitle.trim()}`;
    }
    // 如果画作没有标题，只显示套图名和序号
    return `${artwork.collectionName}${romanNumeral}`;
  }
  return artwork.title || "";
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
    uploadedAt?: string | null;
    durationMinutes?: number | null;
  };
  collectionArtworks?: ArtworkDetailsProps["artwork"][];
  onBack: () => void;
  onShare?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onDelete?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onEdit?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onSetAsFeatured?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onRemoveFromFeatured?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  onNavigate?: (direction: "prev" | "next") => void;
  onUpdateCollectionThumbnail?: (collectionId: string, thumbnailArtworkId: string) => void;
  onUpdateCollectionName?: (collectionId: string, collectionName: string) => void;
  onUpdateArtwork?: (artwork: ArtworkDetailsProps["artwork"]) => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

function ArtworkDetails({
  artwork,
  collectionArtworks = [],
  onBack,
  onShare: _onShare,
  onDelete,
  onEdit,
  onSetAsFeatured,
  onRemoveFromFeatured,
  onNavigate,
  onUpdateCollectionThumbnail,
  onUpdateCollectionName,
  onUpdateArtwork: _onUpdateArtwork,
  hasPrev = false,
  hasNext = false,
}: ArtworkDetailsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFeaturedToast, setShowFeaturedToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFeatured, setIsFeatured] = useState(() => isFeaturedArtwork(artwork.id));
  const [imageError, setImageError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>(() => {
    // 验证并清理图片URL
    const url = artwork.imageSrc;
    if (!url || !isValidImageUrl(url)) {
      return "";
    }
    return url;
  });
  const [tagOptions, setTagOptions] = useState<Array<{ id: string | number; name: string }>>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showThumbnailPicker, setShowThumbnailPicker] = useState(false);
  const [editCollectionTab, setEditCollectionTab] = useState<"thumbnail" | "name">("thumbnail");
  const [collectionNameEdit, setCollectionNameEdit] = useState("");

  // 当 artwork.id 改变时，更新 isFeatured 状态
  useEffect(() => {
    setIsFeatured(isFeaturedArtwork(artwork.id));
  }, [artwork.id]);

  // 当 artwork.imageSrc 改变时，验证并更新图片URL
  useEffect(() => {
    const url = artwork.imageSrc;
    if (!url || !isValidImageUrl(url)) {
      console.warn("[ArtworkDetails] Invalid image URL:", url);
      setImageSrc("");
      setImageError(true);
    } else {
      setImageSrc(url);
      setImageError(false);
    }
  }, [artwork.imageSrc]);

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

  // 加载标签选项以转换标签ID为名称
  useEffect(() => {
    let cancelled = false;
    loadTagPreferencesAsync()
      .then((preferences) => buildTagOptionsAsync(preferences))
      .then((options) => {
        if (!cancelled) {
          setTagOptions(options);
        }
      })
      .catch((error) => {
        console.warn("[ArtworkDetails] Failed to load tag options:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 将标签ID转换为标签名称
  const tagNames = useMemo(() => {
    return artwork.tags.map((tag) => {
      // 如果标签已经是字符串且不是纯数字，直接返回
      if (typeof tag === "string" && !/^\d+$/.test(tag)) {
        return tag;
      }
      // 尝试将标签转换为数字ID
      const tagId = typeof tag === "number" ? tag : Number.parseInt(tag, 10);
      if (Number.isFinite(tagId) && tagId > 0) {
        // 查找标签选项
        const option = tagOptions.find((opt) => opt.id === tagId);
        return option ? option.name : tag;
      }
      return tag;
    });
  }, [artwork.tags, tagOptions]);

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
                setShowExportModal(true);
              }}
            >
              <MaterialIcon name="ios_share" className="artwork-details-menu__icon" />
              导出作品
            </button>
            <div className="artwork-details-menu__divider" />
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
            {formatCollectionTitle(artwork) && (
              <h1 className="artwork-details-screen__title">
                {formatCollectionTitle(artwork)}
              </h1>
            )}
            <p className="artwork-details-screen__date">
              {formatDateTime(artwork.uploadedAt) || artwork.date}
            </p>
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

        <div className="artwork-details-screen__image-wrapper">
          <div className="artwork-details-screen__image-frame">
            {imageError || !imageSrc ? (
              <div
                className="artwork-details-screen__image artwork-details-screen__image--placeholder"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(152, 219, 198, 0.1)",
                  minHeight: "300px",
                }}
                aria-label="图片加载失败"
              >
                <div
                  style={{
                    textAlign: "center",
                    color: "rgba(239, 234, 231, 0.5)",
                    fontSize: "0.9rem",
                  }}
                >
                  <MaterialIcon
                    name="broken_image"
                    className="artwork-details-screen__placeholder-icon"
                  />
                  <div>图片加载失败</div>
                </div>
              </div>
            ) : (
              <>
                <img
                  src={imageSrc}
                  alt={artwork.alt || artwork.title || "作品图片"}
                  className="artwork-details-screen__image"
                  onClick={() => setShowInfo((prev) => !prev)}
                  onError={(e) => {
                    // 图片加载失败时显示占位符
                    console.warn("[ArtworkDetails] Image load error:", imageSrc);
                    setImageError(true);
                    const target = e.currentTarget;
                    target.style.display = "none";
                  }}
                  loading="lazy"
                  decoding="async"
                  style={{ cursor: "pointer" }}
                />
                <div className={`artwork-details-screen__image-overlay${showInfo ? "" : " artwork-details-screen__image-overlay--hidden"}`}>
                  <div className="artwork-details-screen__overlay-content">
                    {artwork.description && artwork.description.trim() && (
                      <p className="artwork-details-screen__overlay-description">{artwork.description}</p>
                    )}
                    
                    <div className="artwork-details-screen__overlay-stats" aria-label="作品信息">
                      {artwork.mood && artwork.mood.trim() && (
                        <>
                          <span className="artwork-details-screen__stat">
                            <MaterialIcon name="sentiment_calm" className="artwork-details-screen__stat-icon" />
                            {artwork.mood}
                          </span>
                          {(artwork.rating && artwork.rating.trim()) || (artwork.durationMinutes !== null && artwork.durationMinutes !== undefined && artwork.durationMinutes > 0) ? (
                            <span className="artwork-details-screen__divider" aria-hidden="true" />
                          ) : null}
                        </>
                      )}
                      {artwork.rating && artwork.rating.trim() && (
                        <>
                          <span className="artwork-details-screen__stat">
                            <MaterialIcon name="star" className="artwork-details-screen__stat-icon" filled />
                            {artwork.rating}
                          </span>
                          {artwork.durationMinutes !== null && artwork.durationMinutes !== undefined && artwork.durationMinutes > 0 ? (
                            <span className="artwork-details-screen__divider" aria-hidden="true" />
                          ) : null}
                        </>
                      )}
                      {artwork.durationMinutes !== null && artwork.durationMinutes !== undefined && artwork.durationMinutes > 0 && (
                        <span className="artwork-details-screen__stat">
                          <MaterialIcon name="schedule" className="artwork-details-screen__stat-icon" />
                          {(() => {
                            const hours = Math.floor(artwork.durationMinutes / 60);
                            const minutes = artwork.durationMinutes % 60;
                            if (hours > 0 && minutes > 0) {
                              return `${hours} 小时 ${minutes} 分钟`;
                            }
                            if (hours > 0) {
                              return `${hours} 小时`;
                            }
                            return `${minutes} 分钟`;
                          })()}
                        </span>
                      )}
                    </div>

                    {tagNames.length > 0 && (
                      <div className="artwork-details-screen__overlay-tags" aria-label="作品标签">
                        {tagNames.map((tag, index) => (
                          <span key={`${tag}-${index}`} className="artwork-details-screen__tag">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
              {!imageError && imageSrc && (
            <button
              type="button"
              className="artwork-details-screen__info-toggle"
              onClick={() => setShowInfo((prev) => !prev)}
              aria-label="点击图片以显示/隐藏信息"
            >
              点击图片以显示/隐藏信息
            </button>
          )}
        </div>

        {/* 编辑套图按钮（仅在套图时显示） */}
        {artwork.collectionId && collectionArtworks && collectionArtworks.length > 0 && (
          <div className="artwork-details-screen__change-thumbnail">
            <button
              type="button"
              className="artwork-details-screen__change-thumbnail-button"
              onClick={() => setShowThumbnailPicker(true)}
            >
              编辑套图
            </button>
          </div>
        )}

      </main>

      {/* 编辑套图弹窗 */}
      {showThumbnailPicker && artwork.collectionId && collectionArtworks.length > 0 && (
        <div className="artwork-thumbnail-picker-overlay" onClick={() => setShowThumbnailPicker(false)}>
          <div className="artwork-thumbnail-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="artwork-thumbnail-picker-header">
              <h2 className="artwork-thumbnail-picker-title">编辑套图</h2>
              <button
                type="button"
                className="artwork-thumbnail-picker-close"
                onClick={() => setShowThumbnailPicker(false)}
                aria-label="关闭"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="artwork-thumbnail-picker-content">
              {/* 标签页 */}
              <div className="artwork-thumbnail-picker-tabs">
                <button
                  type="button"
                  className={`artwork-thumbnail-picker-tab ${editCollectionTab === "thumbnail" ? "artwork-thumbnail-picker-tab--active" : ""}`}
                  onClick={() => {
                    setEditCollectionTab("thumbnail");
                    if (!collectionNameEdit && artwork.collectionName) {
                      setCollectionNameEdit(artwork.collectionName);
                    }
                  }}
                >
                  选择首图
                </button>
                <button
                  type="button"
                  className={`artwork-thumbnail-picker-tab ${editCollectionTab === "name" ? "artwork-thumbnail-picker-tab--active" : ""}`}
                  onClick={() => {
                    setEditCollectionTab("name");
                    if (!collectionNameEdit && artwork.collectionName) {
                      setCollectionNameEdit(artwork.collectionName);
                    }
                  }}
                >
                  编辑名称
                </button>
              </div>

              {/* 选择首图标签页 */}
              {editCollectionTab === "thumbnail" && (
                <div className="artwork-thumbnail-picker-tab-content">
                  <p className="artwork-thumbnail-picker-hint">选择一张图片作为套图的首图</p>
                  <div className="artwork-thumbnail-picker-grid">
                    {collectionArtworks.map((item) => {
                      const isSelected = item.id === artwork.id;
                      const itemImageSrc = item.imageSrc || "";
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`artwork-thumbnail-picker-item ${isSelected ? "artwork-thumbnail-picker-item--selected" : ""}`}
                          onClick={() => {
                            if (artwork.collectionId && onUpdateCollectionThumbnail) {
                              onUpdateCollectionThumbnail(artwork.collectionId, item.id);
                            }
                            setShowThumbnailPicker(false);
                          }}
                        >
                          {itemImageSrc && isValidImageUrl(itemImageSrc) ? (
                            <img
                              src={itemImageSrc}
                              alt={item.title || "作品图片"}
                              className="artwork-thumbnail-picker-image"
                            />
                          ) : (
                            <div className="artwork-thumbnail-picker-placeholder">
                              <MaterialIcon name="image" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="artwork-thumbnail-picker-check">
                              <MaterialIcon name="check_circle" filled />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 编辑名称标签页 */}
              {editCollectionTab === "name" && (
                <div className="artwork-thumbnail-picker-tab-content">
                  <p className="artwork-thumbnail-picker-hint">编辑套图名称</p>
                  <input
                    type="text"
                    className="artwork-thumbnail-picker-name-input"
                    value={collectionNameEdit}
                    onChange={(e) => setCollectionNameEdit(e.target.value)}
                    placeholder="输入套图名称"
                    autoFocus
                  />
                  <div className="artwork-thumbnail-picker-actions">
                    <button
                      type="button"
                      className="artwork-thumbnail-picker-button artwork-thumbnail-picker-button--secondary"
                      onClick={() => {
                        setCollectionNameEdit(artwork.collectionName || "");
                      }}
                    >
                      重置
                    </button>
                    <button
                      type="button"
                      className="artwork-thumbnail-picker-button artwork-thumbnail-picker-button--primary"
                      onClick={() => {
                        if (artwork.collectionId && onUpdateCollectionName && collectionNameEdit.trim()) {
                          onUpdateCollectionName(artwork.collectionId, collectionNameEdit.trim());
                          // API 会更新所有套图作品的名称，不需要手动更新
                        }
                        setShowThumbnailPicker(false);
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  // 调用删除回调，父组件会处理关闭详情页的逻辑
                  try {
                    const result = onDelete?.(artwork);
                    // 如果返回 Promise，等待完成
                    if (result && typeof (result as Promise<unknown>).then === "function") {
                      await (result as Promise<unknown>);
                    }
                  } catch (error) {
                    // 如果删除失败，不关闭详情页，让用户看到错误信息
                    console.warn("[ArtworkDetails] Delete failed:", error);
                  }
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SingleArtworkTemplateDesigner
        open={showExportModal}
        artworks={[
          {
            id: artwork.id,
            title: artwork.title,
            date: artwork.date,
            imageSrc: artwork.imageSrc,
            alt: artwork.alt,
            description: artwork.description,
            duration: artwork.duration,
            mood: artwork.mood,
            rating: artwork.rating,
            tags: artwork.tags,
            collectionId: artwork.collectionId,
            collectionName: artwork.collectionName,
            collectionIndex: artwork.collectionIndex,
            incrementalDurationMinutes: artwork.incrementalDurationMinutes,
            uploadedAt: artwork.uploadedAt,
            durationMinutes: artwork.durationMinutes,
          } as Artwork,
        ]}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
}

export default ArtworkDetails;


