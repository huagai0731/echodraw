import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";

import "./SingleArtworkTemplateDesigner.css";

type SingleArtworkTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type TemplateViewModel = {
  title: string;
  subtitle: string;
  tags: string[];
  timestampLabel: string;
  dateLabel: string;
  durationLabel: string;
  username: string;
  accentColor: string;
  textColor: string;
  shadowColor: string;
  overlayMode: "dark" | "light";
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1760;
const DEFAULT_USERNAME = "@EchoUser";
const MAX_TAG_COUNT = 6;
const MIN_IMAGE_HEIGHT_RATIO = 0.6;
const MAX_IMAGE_HEIGHT_RATIO = 1.35;
const MIN_FOOTER_HEIGHT_RATIO = 0.35;
const MAX_FOOTER_HEIGHT_RATIO = 0.7;

type CanvasLayout = {
  imageHeight: number;
  footerHeight: number;
  canvasHeight: number;
};

const DEFAULT_CANVAS_LAYOUT: CanvasLayout = {
  imageHeight: CANVAS_WIDTH,
  footerHeight: CANVAS_HEIGHT - CANVAS_WIDTH,
  canvasHeight: CANVAS_HEIGHT,
};

function SingleArtworkTemplateDesigner({ open, artworks, onClose }: SingleArtworkTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const [title, setTitle] = useState<string>("自定义标题名");
  const [subtitle, setSubtitle] = useState<string>("自定义文案");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showTitle, setShowTitle] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [showUsername, setShowUsername] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [showDuration, setShowDuration] = useState(true);
  const [shadowTone, setShadowTone] = useState(40);
  const [textTone, setTextTone] = useState(70);
  const [overlayMode, setOverlayMode] = useState<"dark" | "light">("dark");
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayout>(DEFAULT_CANVAS_LAYOUT);

  const hasArtworks = artworks.length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!hasArtworks) {
      return;
    }

    setSelectedId((prev) => {
      if (prev && artworks.some((item) => item.id === prev)) {
        return prev;
      }
      return artworks[0]?.id ?? null;
    });
  }, [artworks, hasArtworks, open]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveActiveUsername();
        if (!cancelled) {
          setUsername(resolved);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[SingleTemplateDesigner] 无法加载用户昵称：", error);
          setUsername(DEFAULT_USERNAME);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [onClose, open]);

  const selectedArtwork = useMemo(() => {
    if (!hasArtworks) {
      return null;
    }
    const current = artworks.find((item) => item.id === selectedId);
    return current ?? artworks[0] ?? null;
  }, [artworks, hasArtworks, selectedId]);

  const availableTags = useMemo(() => {
    if (!selectedArtwork) {
      return [];
    }
    return Array.from(
      new Set(
        (selectedArtwork.tags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    );
  }, [selectedArtwork]);

  useEffect(() => {
    if (!selectedArtwork) {
      setTitle("自定义标题名");
      setSubtitle("自定义文案");
      setSelectedTags([]);
      return;
    }

    setTitle(selectedArtwork.title?.trim() || "自定义标题名");
    setSubtitle(selectedArtwork.description?.trim() || "自定义文案");

    const defaults = Array.from(
      new Set(
        (selectedArtwork.tags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ).slice(0, MAX_TAG_COUNT);
    setSelectedTags(defaults);
  }, [selectedArtwork?.id, selectedArtwork]);

  useEffect(() => {
    if (!open || !selectedArtwork) {
      return;
    }
    const img = new Image();
    setImageStatus("loading");
    img.crossOrigin = "anonymous";
    const handleLoad = () => {
      setImage(img);
      setImageStatus("ready");
      const ratio =
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? img.naturalWidth / img.naturalHeight
          : CANVAS_WIDTH / DEFAULT_CANVAS_LAYOUT.imageHeight;
      const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
      const desiredImageHeight = CANVAS_WIDTH / safeRatio;
      const imageHeight = clamp(
        desiredImageHeight,
        CANVAS_WIDTH * MIN_IMAGE_HEIGHT_RATIO,
        CANVAS_WIDTH * MAX_IMAGE_HEIGHT_RATIO,
      );
      const footerHeight = clamp(
        imageHeight * 0.55,
        CANVAS_WIDTH * MIN_FOOTER_HEIGHT_RATIO,
        CANVAS_WIDTH * MAX_FOOTER_HEIGHT_RATIO,
      );
      setCanvasLayout({
        imageHeight,
        footerHeight,
        canvasHeight: Math.round(imageHeight + footerHeight),
      });
    };
    const handleError = () => {
      setImage(null);
      setImageStatus("error");
      setCanvasLayout(DEFAULT_CANVAS_LAYOUT);
    };
    img.addEventListener("load", handleLoad);
    img.addEventListener("error", handleError);
    img.src = selectedArtwork.imageSrc;
    return () => {
      img.removeEventListener("load", handleLoad);
      img.removeEventListener("error", handleError);
    };
  }, [open, selectedArtwork]);

  const templateData = useMemo<TemplateViewModel | null>(() => {
    if (!selectedArtwork) {
      return null;
    }

    const preparedTags = Array.from(
      new Set(
        selectedTags
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ).slice(0, MAX_TAG_COUNT);

    const accentColor = "#98dbc6";
    const textColor = mixHexColors("#d9d2cc", "#ffffff", textTone / 100);
    const shadowColor =
      overlayMode === "dark"
        ? mixHexColors("#221b1b", "#4a3f4a", shadowTone / 100)
        : mixHexColors("#f5f0e8", "#ffffff", textTone / 100);

    const meta = composeMetaLabels(selectedArtwork, {
      showDate,
      showDuration,
    });
    const dateLabel = showDate ? meta.dateLabel : "";
    const durationLabel = showDuration ? meta.durationLabel : "";

    return {
      title: showTitle ? title.trim() || "自定义标题名" : "",
      subtitle: showSubtitle ? subtitle.trim() : "",
      tags: preparedTags,
      timestampLabel: meta.timestampLabel,
      dateLabel,
      durationLabel,
      username: showUsername ? normalizeUsername(username) : "",
      accentColor,
      textColor,
      shadowColor,
      overlayMode,
    };
  }, [
    selectedArtwork,
    selectedTags,
    shadowTone,
    showDate,
    showDuration,
    showSubtitle,
    showTitle,
    showUsername,
    subtitle,
    textTone,
    title,
    username,
    overlayMode,
  ]);

  const timestampLabel = templateData?.timestampLabel ?? "日期未知";
  const sliderShadowColor =
    overlayMode === "dark"
      ? mixHexColors("#4a3f4a", "#98dbc6", shadowTone / 100)
      : mixHexColors("#bfb8af", "#ffffff", shadowTone / 100);
  const sliderTextColor = mixHexColors("#efeae7", "#ffffff", textTone / 100);
  const downloadDisabled = !templateData || imageStatus === "loading";

  const renderToggle = (active: boolean, onToggle: () => void, label: string) => (
    <button
      type="button"
      className={`single-template-designer__toggle${active ? " is-active" : ""}`}
      aria-pressed={active}
      aria-label={`切换${label}`}
      onClick={onToggle}
    >
      <MaterialIcon name={active ? "toggle_on" : "toggle_off"} filled />
    </button>
  );

  const handleToggleTag = (tag: string) => {
    if (!availableTags.includes(tag)) {
      return;
    }
    setSelectedTags((previous) => {
      const cleanedPrevious = previous.filter((item) => availableTags.includes(item));
      const exists = cleanedPrevious.includes(tag);
      if (exists) {
        return cleanedPrevious.filter((item) => item !== tag);
      }
      if (cleanedPrevious.length >= MAX_TAG_COUNT) {
        return cleanedPrevious;
      }
      const tentative = [...cleanedPrevious, tag];
      return availableTags.filter((item) => tentative.includes(item));
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas || !templateData) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    if (canvas.width !== CANVAS_WIDTH || canvas.height !== canvasLayout.canvasHeight) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = canvasLayout.canvasHeight;
    }

    drawTemplate(
      context,
      CANVAS_WIDTH,
      canvasLayout.canvasHeight,
      canvasLayout.imageHeight,
      canvasLayout.footerHeight,
      templateData,
      image,
    );
  }, [canvasLayout.canvasHeight, canvasLayout.footerHeight, canvasLayout.imageHeight, image, open, templateData]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    const timestamp = new Date();
    const formatted = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}`;
    link.download = `EchoDraw-single-${formatted}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="single-template-designer" role="dialog" aria-modal="true">
        <div className="single-template-designer__background" aria-hidden="true">
          <div className="single-template-designer__glow single-template-designer__glow--left" />
          <div className="single-template-designer__glow single-template-designer__glow--right" />
        </div>
        <div className="single-template-designer__content">
          <header className="single-template-designer__header">
            <button type="button" aria-label="关闭模板" onClick={onClose}>
              <MaterialIcon name="arrow_back_ios_new" />
            </button>
            <div className="single-template-designer__header-text">
              <p>EchoDraw 模版中心</p>
              <h1>单张图博物馆展板</h1>
            </div>
            <div className="single-template-designer__header-placeholder" />
          </header>

          <div className="single-template-designer__layout">
            <section className="single-template-designer__mockup">
              {hasArtworks ? (
                <div className="single-template-designer__device">
                  <div
                    className="single-template-designer__device-screen"
                    style={{ aspectRatio: CANVAS_WIDTH / canvasLayout.canvasHeight }}
                  >
                    <canvas ref={canvasRef} className="single-template-designer__canvas" />
                    {imageStatus === "loading" ? (
                      <div className="single-template-designer__status">正在加载作品…</div>
                    ) : null}
                    {imageStatus === "error" ? (
                      <div className="single-template-designer__status single-template-designer__status--error">
                        图片加载失败，请选择其他作品或稍后重试。
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="single-template-designer__preview-empty">
                  <MaterialIcon name="photo_library" />
                  <p>你还没有上传作品</p>
                  <span>请先在「画集」里完成一次上传，再体验展板模板。</span>
                  <button type="button" onClick={onClose}>
                    返回画集
                  </button>
                </div>
              )}
            </section>

            <section className="single-template-designer__controls">
              {hasArtworks ? (
                <>
                  <div className="single-template-designer__group single-template-designer__group--hero">
                    <div className="single-template-designer__group-header">
                      <h2>作品选择</h2>
                      <p>挑选你的代表作，预览真机效果。</p>
                    </div>
                    <button
                      type="button"
                      className="single-template-designer__selection"
                      onClick={() => setPickerOpen(true)}
                    >
                      {selectedArtwork ? (
                        <>
                          <img src={selectedArtwork.imageSrc} alt={selectedArtwork.alt} loading="lazy" />
                          <div>
                            <p>当前作品</p>
                            <h4>{selectedArtwork.title || "未命名"}</h4>
                            <small>{selectedArtwork.mood || "未知心情"}</small>
                          </div>
                          <MaterialIcon name="chevron_right" />
                        </>
                      ) : (
                        <div>
                          <p>当前作品</p>
                          <h4>尚未选择</h4>
                          <small>点击打开作品库</small>
                        </div>
                      )}
                    </button>
                  </div>

                  <div className="single-template-designer__group">
                    <div className="single-template-designer__field-row">
                      <label htmlFor="single-template-title">
                        <span>标题</span>
                        <input
                          id="single-template-title"
                          type="text"
                          value={title}
                          maxLength={40}
                          onChange={(event) => setTitle(event.target.value)}
                          placeholder="请输入作品名称"
                        />
                      </label>
                      {renderToggle(showTitle, () => setShowTitle((prev) => !prev), "标题")}
                    </div>
                    <div className="single-template-designer__field-row single-template-designer__field-row--textarea">
                      <label htmlFor="single-template-desc">
                        <span>简介</span>
                        <textarea
                          id="single-template-desc"
                          rows={3}
                          value={subtitle}
                          maxLength={160}
                          onChange={(event) => setSubtitle(event.target.value)}
                          placeholder="为作品写一句陈列说明"
                        />
                      </label>
                      {renderToggle(showSubtitle, () => setShowSubtitle((prev) => !prev), "简介")}
                    </div>
                  </div>

                  <div className="single-template-designer__group">
                    <div className="single-template-designer__field-row">
                      <label htmlFor="single-template-username">
                        <span>署名</span>
                        <input
                          id="single-template-username"
                          type="text"
                          value={username}
                          maxLength={32}
                          onChange={(event) => setUsername(event.target.value)}
                          placeholder="将呈现在右下角"
                        />
                      </label>
                      {renderToggle(showUsername, () => setShowUsername((prev) => !prev), "署名")}
                    </div>
                    <div className="single-template-designer__field-row single-template-designer__field-row--meta">
                      <div>
                        <p>日期与时长</p>
                        <span>{timestampLabel}</span>
                      </div>
                      <div className="single-template-designer__meta-toggles">
                        {renderToggle(showDate, () => setShowDate((prev) => !prev), "日期")}
                        {renderToggle(showDuration, () => setShowDuration((prev) => !prev), "时长")}
                      </div>
                    </div>
                  </div>

                  <div className="single-template-designer__group">
                    <div className="single-template-designer__group-header">
                      <h3>标签陈列</h3>
                      <p>至多选择 {MAX_TAG_COUNT} 个标签，呈现在画板右上角。</p>
                    </div>
                    <div className="single-template-designer__tag-list" role="listbox" aria-label="可展示的标签">
                      {availableTags.length === 0 ? (
                        <span className="single-template-designer__hint">该作品尚未设置标签。</span>
                      ) : (
                        availableTags.map((tag) => {
                          const active = selectedTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`single-template-designer__tag-option${active ? " single-template-designer__tag-option--active" : ""}`}
                              onClick={() => handleToggleTag(tag)}
                            >
                              <span>{tag}</span>
                              {active ? <MaterialIcon name="check" /> : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                    {selectedTags.length > 0 ? (
                      <button
                        type="button"
                        className="single-template-designer__tag-reset"
                        onClick={() => setSelectedTags([])}
                      >
                        清空标签
                      </button>
                    ) : null}
                  </div>

                  <div className="single-template-designer__group single-template-designer__group--tuning">
                    <div className="single-template-designer__tuning single-template-designer__tuning--mode">
                      <div>
                        <p>信息背景色</p>
                        <span>选择黑色或白色渐变风格。</span>
                      </div>
                      <div className="single-template-designer__mode-toggle">
                        <button
                          type="button"
                          className={overlayMode === "dark" ? "is-active" : ""}
                          onClick={() => setOverlayMode("dark")}
                        >
                          深色
                        </button>
                        <button
                          type="button"
                          className={overlayMode === "light" ? "is-active" : ""}
                          onClick={() => setOverlayMode("light")}
                        >
                          浅色
                        </button>
                      </div>
                    </div>
                    <div className="single-template-designer__tuning">
                      <div>
                        <p>自定义阴影区颜色</p>
                        <span>让画框更符合展厅光线。</span>
                      </div>
                      <div className="single-template-designer__slider">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={shadowTone}
                          onChange={(event) => setShadowTone(Number(event.target.value))}
                          style={{
                            backgroundImage: `linear-gradient(90deg, rgba(34,27,27,0.4), ${sliderShadowColor})`,
                          }}
                        />
                        <span className="single-template-designer__slider-dot" style={{ backgroundColor: sliderShadowColor }} />
                      </div>
                    </div>
                    <div className="single-template-designer__tuning">
                      <div>
                        <p>自定义文字颜色</p>
                        <span>微调展板文字亮度。</span>
                      </div>
                      <div className="single-template-designer__slider">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={textTone}
                          onChange={(event) => setTextTone(Number(event.target.value))}
                          style={{
                            backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.25), ${sliderTextColor})`,
                          }}
                        />
                        <span className="single-template-designer__slider-dot" style={{ backgroundColor: sliderTextColor }} />
                      </div>
                    </div>
                  </div>

                  <div className="single-template-designer__actions">
                    <button
                      type="button"
                      className="single-template-designer__download"
                      onClick={handleDownload}
                      disabled={downloadDisabled}
                    >
                      <MaterialIcon name="download" />
                      保存为图片
                    </button>
                    <p>导出 PNG · 1080 × {canvasLayout.canvasHeight} 像素 · 适配社交媒体展示。</p>
                  </div>
                </>
              ) : (
                <div className="single-template-designer__empty">
                  <MaterialIcon name="photo_library" />
                  <p>尚无可用作品</p>
                  <p>完成首次上传后即可使用博物馆模板。</p>
                  <button type="button" onClick={onClose}>
                    去上传
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {pickerOpen && hasArtworks ? (
        <div className="single-template-designer__picker" role="dialog" aria-modal="true">
          <div className="single-template-designer__picker-backdrop" onClick={() => setPickerOpen(false)} />
          <div className="single-template-designer__picker-panel">
            <div className="single-template-designer__picker-header">
              <h3>选择作品</h3>
              <button
                type="button"
                className="single-template-designer__picker-close"
                aria-label="关闭作品选择"
                onClick={() => setPickerOpen(false)}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="single-template-designer__artwork-grid" role="listbox" aria-label="可套用的作品">
              {artworks.map((artwork) => {
                const isActive = (selectedArtwork?.id ?? null) === artwork.id;
                return (
                  <button
                    key={artwork.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`single-template-designer__artwork-button${isActive ? " single-template-designer__artwork-button--active" : ""}`}
                    onClick={() => {
                      setSelectedId(artwork.id);
                      setPickerOpen(false);
                    }}
                  >
                    <img src={artwork.imageSrc} alt={artwork.alt} loading="lazy" />
                    <span>{artwork.title || "未命名"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default SingleArtworkTemplateDesigner;

function normalizeUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "@EchoUser";
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

async function resolveActiveUsername(): Promise<string> {
  if (typeof window === "undefined") {
    return DEFAULT_USERNAME;
  }

  const email = getActiveUserEmail();
  if (!email) {
    return DEFAULT_USERNAME;
  }

  const fallback = normalizeUsername(formatNameFromEmail(email));

  try {
    const preferences = await fetchProfilePreferences();
    const displayName =
      preferences.displayName.trim() ||
      preferences.defaultDisplayName.trim() ||
      formatNameFromEmail(email);
    return normalizeUsername(displayName);
  } catch (error) {
    console.warn("[SingleTemplateDesigner] 无法获取用户昵称配置：", error);
    return fallback;
  }
}

function formatNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  if (!localPart) {
    return "回声艺术家";
  }
  return localPart.slice(0, 1).toUpperCase() + localPart.slice(1);
}

type TimestampOptions = {
  showDate: boolean;
  showDuration: boolean;
};

type MetaLabels = {
  timestampLabel: string;
  dateLabel: string;
  durationLabel: string;
};

function composeMetaLabels(artwork: Artwork, options: TimestampOptions): MetaLabels {
  const date = options.showDate ? resolveArtworkDate(artwork) : null;
  const dateLabel = date ? formatDateLabel(date) : "";
  const durationLabel = options.showDuration ? buildDurationLabel(artwork) ?? "" : "";

  const labelParts: string[] = [];
  if (dateLabel) {
    labelParts.push(dateLabel);
  }
  if (durationLabel) {
    labelParts.push(durationLabel);
  }

  return {
    timestampLabel: labelParts.join(" • ") || "日期未知",
    dateLabel,
    durationLabel,
  };
}

function resolveArtworkDate(artwork: Artwork): Date | null {
  const candidates = [artwork.uploadedAt, artwork.uploadedDate, artwork.date];
  for (const source of candidates) {
    const parsed = parseDateTime(source);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function formatDateLabel(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDurationLabel(artwork: Artwork): string | null {
  const value = artwork.durationMinutes;
  if (typeof value !== "number" || value <= 0) {
    return null;
  }
  return formatDurationCompact(value);
}

function formatDurationCompact(minutesTotal: number): string {
  const hours = Math.floor(minutesTotal / 60);
  const minutes = Math.max(0, minutesTotal % 60);
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function parseDateTime(source: string | null | undefined): Date | null {
  if (!source) {
    return null;
  }
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }
  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct)) {
    return new Date(direct);
  }

  const normalized = trimmed
    .replace(/[年月]/g, "-")
    .replace(/[日号]/g, "")
    .replace(/[点：]/g, ":")
    .replace(/[时hH]/g, ":")
    .replace(/[分mM]/g, ":")
    .replace(/[秒sS]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const [datePart, timePart] = normalized.split(" ");
  const date = parseDate(datePart ?? "");
  if (!date) {
    return null;
  }

  if (timePart) {
    const timeMatch = timePart.match(/(\d{1,2})(?::(\d{1,2}))?/);
    if (timeMatch) {
      const hours = Number.parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? Number.parseInt(timeMatch[2], 10) : 0;
      if (!Number.isNaN(hours)) {
        date.setHours(Math.max(0, Math.min(23, hours)));
      }
      if (!Number.isNaN(minutes)) {
        date.setMinutes(Math.max(0, Math.min(59, minutes)));
      }
      date.setSeconds(0, 0);
    }
  }

  return date;
}

function parseDate(source: string | null | undefined): Date | null {
  if (!source) {
    return null;
  }
  const normalized = source
    .replace(/[年月.\-/]/g, (match) => (match === "年" || match === "." || match === "/" || match === "-" ? "-" : ""))
    .replace(/日|号/g, "");

  const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
}

function drawTemplate(
  context: CanvasRenderingContext2D,
  width: number,
  canvasHeight: number,
  imageHeight: number,
  footerHeight: number,
  data: TemplateViewModel,
  image: HTMLImageElement | null,
) {
  context.save();
  context.clearRect(0, 0, width, canvasHeight);

  const rect = createImageRect(width, imageHeight);

  drawCanvasBackground(context, width, canvasHeight, data.shadowColor);
  drawPrimaryImage(context, rect, image);
  drawGradientFooter(context, rect, footerHeight, data);

  context.restore();
}

type ImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

function createImageRect(width: number, imageHeight: number): ImageRect {
  const rectHeight = Math.max(1, imageHeight);
  return {
    x: 0,
    y: 0,
    width,
    height: rectHeight,
    radius: width * 0.03,
  };
}

function drawCanvasBackground(context: CanvasRenderingContext2D, width: number, height: number, shadowColor: string) {
  context.fillStyle = "#120c0b";
  context.fillRect(0, 0, width, height);

  const overlay = context.createLinearGradient(0, 0, width, height);
  overlay.addColorStop(0, withAlpha(shadowColor || "#4a3f4a", 0.25));
  overlay.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  context.fillStyle = overlay;
  context.fillRect(0, 0, width, height);
}

function drawPrimaryImage(context: CanvasRenderingContext2D, rect: ImageRect, image: HTMLImageElement | null) {
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.25)";
  context.shadowBlur = rect.width * 0.03;
  context.shadowOffsetY = rect.width * 0.01;
  drawRoundedRectPath(context, rect.x, rect.y, rect.width, rect.height, rect.radius);
  context.fillStyle = "#0d0b0a";
  context.fill();
  context.save();
  drawRoundedRectPath(context, rect.x, rect.y, rect.width, rect.height, rect.radius);
  context.clip();

  if (image && image.width > 0 && image.height > 0) {
    const scale = Math.max(rect.width / image.width, rect.height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = rect.x + (rect.width - drawWidth) / 2;
    const dy = rect.y + (rect.height - drawHeight) / 2;
    context.drawImage(image, dx, dy, drawWidth, drawHeight);
  } else {
    const placeholder = context.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    placeholder.addColorStop(0, "rgba(230, 216, 189, 0.6)");
    placeholder.addColorStop(1, "rgba(180, 164, 138, 0.6)");
    context.fillStyle = placeholder;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  context.restore();
}

function drawGradientFooter(
  context: CanvasRenderingContext2D,
  rect: ImageRect,
  footerHeight: number,
  data: TemplateViewModel,
) {
  const overlayHeight = Math.min(rect.height * 0.35, rect.width * 0.6);
  const overlayY = rect.y + rect.height - overlayHeight;

  const footerY = rect.y + rect.height;
  context.save();
  context.fillStyle = data.overlayMode === "light" ? "#f3efe9" : "#100d0d";
  context.fillRect(rect.x, footerY, rect.width, footerHeight);
  context.restore();

  const gradient = context.createLinearGradient(0, overlayY, 0, rect.y + rect.height);
  if (data.overlayMode === "light") {
    gradient.addColorStop(0, withAlpha("#ffffff", 0));
    gradient.addColorStop(0.35, withAlpha("#fefcf7", 0.85));
    gradient.addColorStop(1, withAlpha("#f2ede4", 0.98));
  } else {
    gradient.addColorStop(0, withAlpha("#000000", 0));
    gradient.addColorStop(0.35, withAlpha(data.shadowColor || "#221b1b", 0.85));
    gradient.addColorStop(1, withAlpha("#000000", 0.98));
  }

  context.save();
  drawRoundedRectPath(context, rect.x, overlayY, rect.width, overlayHeight, rect.radius);
  context.clip();
  context.fillStyle = gradient;
  context.fillRect(rect.x, overlayY, rect.width, overlayHeight);
  context.restore();

  const paddingX = rect.width * 0.06;
  let cursorY = overlayY + rect.width * 0.08;
  const contentX = rect.x + paddingX;
  const contentWidth = rect.width - paddingX * 2;

  context.save();
  context.textAlign = "left";
  context.fillStyle = data.accentColor || "#9edac4";
  context.font = `600 ${Math.round(rect.width * 0.065)}px "Manrope", "Segoe UI", sans-serif`;
  const displayTitle = data.title || "未命名作品";
  context.fillText(displayTitle, contentX, cursorY);

  cursorY += Math.round(rect.width * 0.085);

  const subtitle = data.subtitle.trim() || "An expressive abstract awaiting its story.";
  context.font = `400 ${Math.round(rect.width * 0.035)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillStyle =
    data.overlayMode === "light" ? withAlpha("#0c0a09", 0.9) : withAlpha("#f7f2ec", 0.92);
  const descriptionLines = wrapText(context, subtitle, contentWidth);
  descriptionLines.forEach((line) => {
    context.fillText(line, contentX, cursorY);
    cursorY += Math.round(rect.width * 0.05);
  });

  cursorY += Math.round(rect.width * 0.02);

  const tags = data.tags.slice(0, 5);
  if (tags.length > 0) {
    context.font = `500 ${Math.round(rect.width * 0.032)}px "Manrope", "Segoe UI", sans-serif`;
    const gap = rect.width * 0.02;
    let tagX = contentX;
    let tagY = cursorY;
    const maxX = contentX + contentWidth;
    const lineHeight = rect.width * 0.06;

    tags.forEach((tag) => {
      const label = `#${tag}`;
      const width = measureTagBadgeWidth(context, label, rect.width);
      if (tagX + width > maxX) {
        tagX = contentX;
        tagY += lineHeight;
      }
      drawTagBadge(context, tagX, tagY, label, rect.width);
      tagX += width + gap;
    });

    cursorY = tagY + lineHeight;
  }

  cursorY += Math.round(rect.width * 0.02);

  const metaLineParts: string[] = [];
  if (data.dateLabel) {
    metaLineParts.push(data.dateLabel);
  }
  if (data.durationLabel) {
    metaLineParts.push(data.durationLabel);
  }
  const metaLine = metaLineParts.join(" / ") || data.timestampLabel || "日期未知";

  if (metaLine) {
    context.font = `400 ${Math.round(rect.width * 0.032)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillStyle =
    data.overlayMode === "light" ? withAlpha("#0c0a09", 0.8) : withAlpha("#f7f2ec", 0.92);
    context.fillStyle =
      data.overlayMode === "light" ? withAlpha("#0c0a09", 0.85) : withAlpha("#f7f2ec", 0.9);
    context.textAlign = "left";
    context.fillText(metaLine, contentX, cursorY);
  }

  const usernameLine = (data.username || "").trim();
  if (usernameLine) {
    context.textAlign = "right";
    context.font = `500 ${Math.round(rect.width * 0.038)}px "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle =
      data.overlayMode === "light" ? withAlpha("#0c0a09", 0.92) : withAlpha("#f7f2ec", 0.92);
    context.fillText(usernameLine, contentX + contentWidth, cursorY);
  }

  context.restore();
}

function drawTagBadge(context: CanvasRenderingContext2D, x: number, y: number, text: string, baseWidth: number) {
  const paddingX = baseWidth * 0.015;
  const textWidth = context.measureText(text).width;
  const height = baseWidth * 0.045;
  const width = textWidth + paddingX * 2;
  drawRoundedRectPath(context, x, y, width, height, height / 2);
  context.fillStyle = "rgba(152, 219, 198, 0.12)";
  context.fill();
  context.strokeStyle = "rgba(152, 219, 198, 0.4)";
  context.stroke();
  context.fillStyle = "rgba(152, 219, 198, 0.9)";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(text, x + paddingX, y + height / 2);
}

function measureTagBadgeWidth(context: CanvasRenderingContext2D, text: string, baseWidth: number): number {
  const paddingX = baseWidth * 0.015;
  const textWidth = context.measureText(text).width;
  return textWidth + paddingX * 2;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph) {
      lines.push("");
      return;
    }
    let current = "";
    for (const char of paragraph) {
      const tentative = current + char;
      if (context.measureText(tentative).width > maxWidth && current) {
        lines.push(current);
        current = char.trim().length > 0 ? char : "";
      } else {
        current = tentative;
      }
    }
    if (current) {
      lines.push(current);
    }
    if (paragraphIndex < paragraphs.length - 1) {
      lines.push("");
    }
  });

  return lines.filter((line, index, arr) => !(line === "" && (index === 0 || arr[index - 1] === "")));
}

function drawRoundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.lineTo(x + width - clampedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  context.lineTo(x + width, y + height - clampedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  context.lineTo(x + clampedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  context.lineTo(x, y + clampedRadius);
  context.quadraticCurveTo(x, y, x + clampedRadius, y);
  context.closePath();
}

type RGBColor = {
  r: number;
  g: number;
  b: number;
};

function mixHexColors(colorA: string, colorB: string, ratio: number): string {
  const rgbA = hexToRgb(colorA);
  const rgbB = hexToRgb(colorB);
  if (!rgbA || !rgbB) {
    return colorA;
  }
  const clamped = clamp01(ratio);
  const mixed: RGBColor = {
    r: Math.round(rgbA.r + (rgbB.r - rgbA.r) * clamped),
    g: Math.round(rgbA.g + (rgbB.g - rgbA.g) * clamped),
    b: Math.round(rgbA.b + (rgbB.b - rgbA.b) * clamped),
  };
  return rgbToHex(mixed);
}

function withAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return `rgba(0, 0, 0, ${clamp01(alpha)})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

function hexToRgb(hex: string): RGBColor | null {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) {
    return null;
  }
  const expanded =
    normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return null;
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(color: RGBColor): string {
  const toHex = (component: number) => component.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  if (min > max) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
