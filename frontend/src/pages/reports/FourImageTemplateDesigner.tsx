import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";
import { getOrLoadImage } from "@/utils/imageCache";
import { loadTagPreferencesAsync, buildTagOptionsAsync } from "@/services/tagPreferences";
import { ImageInfoSettings, type ImageInfoSettingsState } from "@/components/templateDesigner/ImageInfoSettings";
import { ImageGridSelector, type GridImage } from "@/components/templateDesigner/ImageGridSelector";
import { ContentEditor, type ContentEditorState } from "@/components/templateDesigner/ContentEditor";
import { type ShadowOpacitySettingsState } from "@/components/templateDesigner/ShadowOpacitySettings";

import "./SingleArtworkTemplateDesigner.css";

type FourImageTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type TemplateViewModel = {
  durationLabel: string;
  overlayOpacity: number;
  durationTagShow: boolean;
  durationTagOpacity: number;
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT_SQUARE = 1080; // 正方形：1080x1080
const CANVAS_HEIGHT_RECTANGLE = 1350; // 长方形：1080x1350
const DURATION_TEXT_HEIGHT = CANVAS_WIDTH * 0.02; // 底部时长文字区域高度，为图片间隙的2倍
const DEFAULT_USERNAME = "@EchoUser";
const MAX_TAG_COUNT = 6;
const GRID_COLS = 2;
const GRID_ROWS = 2;
const TOTAL_CELLS = 4; // 2x2 = 4个格子

type ImageSizePreset = "square" | "rectangle"; // square: 1080x1080, rectangle: 1080x1350

function FourImageTemplateDesigner({ open, artworks, onClose }: FourImageTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [_image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  // 阴影区透明度设置状态
  const [shadowOpacitySettings, setShadowOpacitySettings] = useState<ShadowOpacitySettingsState>({
    opacity: 85,
  });
  const [textTone, _setTextTone] = useState<"light" | "dark">("light");
  const [tagOptions, setTagOptions] = useState<Array<{ id: string | number; name: string }>>([]);
  // 图片信息设置状态（包含图片尺寸和显示时长标签）
  const [imageInfoSettings, setImageInfoSettings] = useState<ImageInfoSettingsState>({
    imageSizePreset: "square",
    showDurationTag: true,
  });
  // 内容编辑状态
  const [contentState, setContentState] = useState<ContentEditorState>({
    title: "自定义标题名",
    subtitle: "自定义文案",
    username: DEFAULT_USERNAME,
    addSuffix: false,
    showTitle: true,
    showSubtitle: true,
    showUsername: true,
    showDate: true,
    showDuration: true,
    selectedTags: [],
  });
  // 2x2网格图片选择：4个位置
  const [gridImages, setGridImages] = useState<GridImage[]>(
    new Array(TOTAL_CELLS).fill(null).map(() => ({ artworkId: null, image: null })),
  );

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
          setContentState((prev) => ({ ...prev, username: resolved }));
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[FourImageTemplateDesigner] 无法加载用户昵称：", error);
          setContentState((prev) => ({ ...prev, username: DEFAULT_USERNAME }));
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

  // 加载标签选项以转换标签ID为名称
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    loadTagPreferencesAsync()
      .then((preferences) => buildTagOptionsAsync(preferences))
      .then((options) => {
        if (!cancelled) {
          setTagOptions(options);
        }
      })
      .catch((error) => {
        console.warn("[FourImageTemplateDesigner] Failed to load tag options:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 将标签ID转换为标签名称
  const availableTags = useMemo(() => {
    if (!selectedArtwork) {
      return [];
    }
    return Array.from(
      new Set(
        (selectedArtwork.tags ?? [])
          .map((tag) => {
            if (typeof tag === "string" && !/^\d+$/.test(tag)) {
              return tag;
            }
            const tagId = typeof tag === "number" ? tag : Number.parseInt(tag, 10);
            if (Number.isFinite(tagId) && tagId > 0) {
              const option = tagOptions.find((opt) => opt.id === tagId);
              return option ? option.name : tag;
            }
            return tag;
          })
          .filter((tag) => tag && String(tag).trim().length > 0)
          .map((tag) => String(tag).trim()),
      ),
    );
  }, [selectedArtwork, tagOptions]);

  useEffect(() => {
    if (!selectedArtwork) {
      setContentState((prev) => ({
        ...prev,
        title: "自定义标题名",
        subtitle: "自定义文案",
        selectedTags: [],
      }));
      return;
    }

    const defaults = Array.from(
      new Set(
        (selectedArtwork.tags ?? [])
          .map((tag) => {
            if (typeof tag === "string" && !/^\d+$/.test(tag)) {
              return tag.trim();
            }
            const tagId = typeof tag === "number" ? tag : Number.parseInt(tag, 10);
            if (Number.isFinite(tagId) && tagId > 0) {
              const option = tagOptions.find((opt) => opt.id === tagId);
              return option ? option.name : String(tag).trim();
            }
            return String(tag).trim();
          })
          .filter((tag) => tag.length > 0),
      ),
    ).slice(0, MAX_TAG_COUNT);

    setContentState((prev) => ({
      ...prev,
      title: selectedArtwork.title?.trim() || "自定义标题名",
      subtitle: selectedArtwork.description?.trim() || "自定义文案",
      selectedTags: defaults,
    }));
  }, [selectedArtwork?.id, tagOptions]);

  useEffect(() => {
    if (!open || !selectedArtwork) {
      return;
    }
    setImageStatus("loading");
    getOrLoadImage(selectedArtwork.imageSrc)
      .then((img) => {
        setImage(img);
        setImageStatus("ready");
      })
      .catch(() => {
        setImage(null);
        setImageStatus("error");
      });
  }, [open, selectedArtwork]);

  const templateData = useMemo<TemplateViewModel | null>(() => {
    if (!selectedArtwork) {
      return null;
    }

    const overlayOpacity = clamp01(shadowOpacitySettings.opacity / 100);

    const meta = composeMetaLabels(selectedArtwork, {
      showDate: false,
      showDuration: true,
    });
    const durationLabel = meta.durationLabel || "";

    return {
      durationLabel,
      overlayOpacity,
      durationTagShow: imageInfoSettings.showDurationTag,
      durationTagOpacity: 0.8, // 固定透明度为80%
    };
  }, [
    selectedArtwork,
    shadowOpacitySettings,
    imageInfoSettings.showDurationTag,
  ]);

  const downloadDisabled = !templateData || imageStatus === "loading";

  // 四图模板不需要日期过滤，直接返回所有作品
  const getFilteredArtworks = (_position: number): Artwork[] => {
    return artworks;
  };

  const getPickerTitle = (_position: number): string => {
    return "选择图片";
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

    const baseCanvasHeight = imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE;
    const canvasHeight = baseCanvasHeight + DURATION_TEXT_HEIGHT; // 为底部时长文字增加空间
    if (canvas.width !== CANVAS_WIDTH || canvas.height !== canvasHeight) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = canvasHeight;
    }

    // 等待字体加载完成，然后绘制
    const draw = () => {
      const baseCanvasHeight = imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE;
      const canvasHeight = baseCanvasHeight + DURATION_TEXT_HEIGHT; // 为底部时长文字增加空间
      drawTemplate(
        context,
        CANVAS_WIDTH,
        canvasHeight,
        templateData,
        gridImages,
        artworks,
      );
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setTimeout(draw, 50);
      });
    } else {
      setTimeout(draw, 150);
    }
  }, [gridImages, open, templateData, imageInfoSettings.imageSizePreset]);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !templateData) {
      return;
    }

    try {
      const reloadedGridImages: GridImage[] = [];
      const loadPromises: Promise<GridImage>[] = [];
      
      for (let i = 0; i < gridImages.length; i++) {
        const gridImage = gridImages[i];
        if (gridImage.artworkId) {
          const loadPromise = (async (): Promise<GridImage> => {
            try {
              const artwork = artworks.find(a => a.id === gridImage.artworkId);
              if (!artwork) {
                return { artworkId: null, image: null };
              }

              let blob: Blob;
              try {
                const response = await fetch(artwork.imageSrc, { mode: "cors" });
                if (!response.ok) {
                  throw new Error(`Failed to fetch: ${response.statusText}`);
                }
                blob = await response.blob();
              } catch (fetchError) {
                const url = new URL(artwork.imageSrc, window.location.href);
                if (url.origin === window.location.origin) {
                  const response = await fetch(artwork.imageSrc);
                  blob = await response.blob();
                } else {
                  throw new Error("图片服务器不允许跨域访问（CORS）。无法导出包含跨域图片的内容。");
                }
              }

              const blobUrl = URL.createObjectURL(blob);
              
              const reloadedImg = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                const timeout = setTimeout(() => {
                  reject(new Error("图片加载超时"));
                }, 10000);
                
                img.onload = () => {
                  clearTimeout(timeout);
                  resolve(img);
                };
                img.onerror = () => {
                  clearTimeout(timeout);
                  URL.revokeObjectURL(blobUrl);
                  reject(new Error("图片加载失败"));
                };
                img.src = blobUrl;
              });

              return { artworkId: gridImage.artworkId, image: reloadedImg };
            } catch (error) {
              console.error("加载图片失败:", error);
              throw error;
            }
          })();
          loadPromises.push(loadPromise);
        } else {
          loadPromises.push(Promise.resolve({ artworkId: null, image: null }));
        }
      }

      const loadedImages = await Promise.all(loadPromises);
      reloadedGridImages.push(...loadedImages);

      const exportCanvas = document.createElement("canvas");
      const canvasHeight = imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE;
      exportCanvas.width = CANVAS_WIDTH;
      exportCanvas.height = canvasHeight;
      const exportContext = exportCanvas.getContext("2d");
      
      if (!exportContext) {
        throw new Error("无法创建导出 canvas");
      }

      await new Promise<void>((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            setTimeout(() => {
              drawTemplate(exportContext, CANVAS_WIDTH, canvasHeight, templateData, reloadedGridImages, artworks);
              resolve();
            }, 50);
          });
        } else {
          setTimeout(() => {
            drawTemplate(exportContext, CANVAS_WIDTH, canvasHeight, templateData, reloadedGridImages, artworks);
            resolve();
          }, 150);
        }
      });

      // 等待绘制完成（移动设备可能需要更长时间）
      const { waitForCanvasRender, exportCanvasToDataURL } = await import("@/utils/canvasExport");
      await waitForCanvasRender();

      // 现在尝试导出（使用安全的导出函数，包含移动端处理）
      const dataURL = exportCanvasToDataURL(exportCanvas, "image/png");
      setPreviewImageUrl(dataURL);
      setShowPreviewModal(true);
    } catch (error) {
      console.error("生成图片失败:", error);
      let errorMessage = "生成图片失败，请稍后重试";
      
      if (error instanceof Error) {
        if (error.message.includes("Tainted") || error.message.includes("SecurityError") || error.message.includes("CORS") || error.message.includes("跨域")) {
          errorMessage = "导出失败：图片跨域限制。请确保图片服务器允许跨域访问（CORS）。如果问题持续，请联系管理员。";
        } else if (error.message.includes("尺寸过大") || error.message.includes("尺寸无效")) {
          errorMessage = error.message;
        } else {
          errorMessage = `导出失败：${error.message}`;
        }
      }
      
      alert(errorMessage);
    }
  };

  const handleClosePreview = () => {
    setShowPreviewModal(false);
    setPreviewImageUrl(null);
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
          <TopNav
            title="模版"
            subtitle="Templates"
            className="top-nav--fixed top-nav--flush"
            leadingAction={{
              icon: "arrow_back",
              label: "返回",
              onClick: onClose,
            }}
          />
          <div style={{ height: "var(--top-nav-height, 64px)" }} />

          <div className="single-template-designer__layout" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <section className="single-template-designer__mockup">
              {hasArtworks ? (
                <div className="single-template-designer__device">
                  <div
                    className="single-template-designer__device-screen"
                    style={{ aspectRatio: CANVAS_WIDTH / (imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE) }}
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

            {hasArtworks ? (
              <section>
                <ImageInfoSettings
                  state={imageInfoSettings}
                  onChange={setImageInfoSettings}
                />
              </section>
            ) : null}

            {hasArtworks ? (
              <section>
                <ImageGridSelector
                  gridImages={gridImages}
                  artworks={artworks}
                  placeholderPositions={[]}
                  placeholderLabels={{}}
                  onImageChange={setGridImages}
                  getFilteredArtworks={getFilteredArtworks}
                  getPickerTitle={getPickerTitle}
                  enableCrop={true}
                  targetWidth={CANVAS_WIDTH}
                  targetHeight={imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE}
                />

                <ContentEditor
                  state={contentState}
                  availableTags={availableTags}
                  maxTagCount={MAX_TAG_COUNT}
                  selectedArtwork={selectedArtwork}
                  onStateChange={setContentState}
                  showAddSuffix={false}
                  getDateLabel={(artwork) => {
                    const meta = composeMetaLabels(artwork, { showDate: true, showDuration: false });
                    return meta.dateLabel || "未设置";
                  }}
                  getDurationLabel={(artwork) => {
                    const meta = composeMetaLabels(artwork, { showDate: false, showDuration: true });
                    return meta.durationLabel || "未设置";
                  }}
                />

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
                  <p>导出 PNG · {CANVAS_WIDTH} × {imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE} 像素 · 适配社交媒体展示。</p>
                </div>
              </section>
            ) : null}
          </div>
          <footer style={{ display: "flex", justifyContent: "center", paddingTop: "12px", paddingBottom: "calc(var(--bottom-nav-safe-area, calc(var(--bottom-nav-height, 74px) + env(safe-area-inset-bottom, 0px))) + 3rem)" }}>
            <div className="single-template-designer__header-text">
              <p style={{ opacity: 0.7 }}>EchoDraw 模版中心</p>
            </div>
          </footer>
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

      <ImagePreviewModal
        open={showPreviewModal}
        imageUrl={previewImageUrl}
        onClose={handleClosePreview}
        title="四图模板"
      />
    </>
  );
}

export default FourImageTemplateDesigner;

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
    console.warn("[FourImageTemplateDesigner] 无法获取用户昵称配置：", error);
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

function formatDurationForTemplate(minutesTotal: number): string {
  const hours = Math.floor(minutesTotal / 60);
  const minutes = Math.max(0, minutesTotal % 60);
  if (hours === 0) {
    return `${minutes}min`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${minutes}min`;
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
  height: number,
  data: TemplateViewModel,
  gridImages: Array<{ artworkId: string | null; image: HTMLImageElement | null }>,
  artworks: Artwork[],
) {
  context.save();
  context.clearRect(0, 0, width, height);

  // 绘制背景 - 深棕灰色
  drawCanvasBackground(context, width, height);

  // 计算网格尺寸，添加间隙
  const gap = width * 0.01; // 1%的间隙
  const totalGapWidth = gap * (GRID_COLS - 1);
  // 为底部时长文字留出空间，从总高度中减去
  const availableHeight = height - DURATION_TEXT_HEIGHT;
  const totalGapHeight = gap * (GRID_ROWS - 1);
  const cellWidth = (width - totalGapWidth) / GRID_COLS;
  const cellHeight = (availableHeight - totalGapHeight) / GRID_ROWS;

  // 网格索引映射：0,1 | 2,3
  const gridPositions = [
    { row: 0, col: 0, index: 0 }, // 左上
    { row: 0, col: 1, index: 1 }, // 右上
    { row: 1, col: 0, index: 2 }, // 左下
    { row: 1, col: 1, index: 3 }, // 右下
  ];

  // 绘制所有格子（都是图片）
  gridPositions.forEach(({ row, col, index }) => {
    const x = col * (cellWidth + gap);
    const y = row * (cellHeight + gap);
    
    const gridImage = gridImages[index];
    const imageToDraw = gridImage?.image || null;
    const artwork = gridImage?.artworkId ? artworks.find(a => a.id === gridImage.artworkId) ?? null : null;
    drawImageCell(context, x, y, cellWidth, cellHeight, imageToDraw, artwork, gap, data.durationTagShow, height, availableHeight, row === GRID_ROWS - 1);
  });

  context.restore();
}

function drawCanvasBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#2a2525";
  context.fillRect(0, 0, width, height);
}

function drawImageCell(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  image: HTMLImageElement | null,
  artwork: Artwork | null,
  gap: number,
  showDuration: boolean,
  canvasHeight: number,
  availableHeight: number,
  isBottomRow: boolean,
) {
  const radius = width * 0.01;
  const padding = width * 0.02;
  const cellX = x + padding;
  const cellY = y + padding;
  const cellWidth = width - padding * 2;
  const cellHeight = height - padding * 2;

  context.save();
  drawRoundedRectPath(context, cellX, cellY, cellWidth, cellHeight, radius);
  context.clip();

  if (image && image.width > 0 && image.height > 0) {
    const scale = Math.max(cellWidth / image.width, cellHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = cellX + (cellWidth - drawWidth) / 2;
    const dy = cellY + (cellHeight - drawHeight) / 2;
    context.drawImage(image, dx, dy, drawWidth, drawHeight);
  } else {
    context.fillStyle = "#2a2525";
    context.fillRect(cellX, cellY, cellWidth, cellHeight);
  }
  context.restore();

  if (!image || image.width === 0 || image.height === 0) {
    context.strokeStyle = "#98dbc6";
    context.lineWidth = 1;
    drawRoundedRectPath(context, cellX, cellY, cellWidth, cellHeight, radius);
    context.stroke();
    
    context.fillStyle = "#2a2525";
    drawRoundedRectPath(context, cellX, cellY, cellWidth, cellHeight, radius);
    context.fill();
    
    const lineWidth = 1;
    context.strokeStyle = "rgba(186, 211, 204, 0.6)";
    context.lineWidth = lineWidth;
    
    const dashPattern = [4, 4];
    context.setLineDash(dashPattern);
    
    context.beginPath();
    context.moveTo(cellX, cellY);
    context.lineTo(cellX + cellWidth, cellY + cellHeight);
    context.stroke();
    
    context.beginPath();
    context.moveTo(cellX, cellY + cellHeight);
    context.lineTo(cellX + cellWidth, cellY);
    context.stroke();
    
    context.setLineDash([]);

    // 绘制 EchoDraw 文字（和左下角EchoDraw完全一样）
    const centerX = cellX + cellWidth / 2;
    const centerY = cellY + cellHeight / 2;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const fontSize = Math.round(cellWidth * 0.08); // 进一步减小字体
    const textColor = "rgba(152, 219, 198, 0.1)"; // 更低的透明度
    drawTextWithLigatures(
      context,
      "EchoDraw",
      centerX,
      centerY,
      fontSize,
      "Ethereal",
      "600",
      textColor,
      true, // 启用文体替代字
    );
  }
  
  // 在图片下方间距（gap）中绘制时长，右对齐
  // 注意：这里使用 cell 的坐标（x, y, width, height），而不是图片坐标（cellX, cellY）
  // gap 是函数参数，已经在函数签名中定义
  if (showDuration && image && image.width > 0 && image.height > 0 && artwork) {
    const durationMinutes = artwork.durationMinutes;
    if (durationMinutes && durationMinutes > 0) {
      // 获取日期和时长，组合成 "0000-00-00·1h30min" 格式
      const date = resolveArtworkDate(artwork);
      const dateLabel = date ? formatDateLabel(date) : "";
      const durationText = formatDurationForTemplate(durationMinutes);
      const fullText = dateLabel ? `${dateLabel}·${durationText}` : durationText;
      
      const fontSize = Math.round(width * 0.04); // 增大字体，基于cell宽度
      const textPadding = width * 0.02; // 距离右边缘的padding
      // 图片的实际底部是 cellY + cellHeight = y + padding + (height - padding * 2) = y + height - padding
      // cell 的底部是 y + height
      // gap 在 y + height 到 y + height + gap 之间
      // 所以要在图片下方，应该在 y + height + gap * 0.5（gap中间，肯定在图片外部）
      // 确保文字在 clip 区域外：图片底部是 y + height - padding，所以文字应该在 y + height 之后
      const padding = width * 0.02; // 和图片的 padding 一致
      const textY = isBottomRow && availableHeight > 0 && canvasHeight > 0
        ? availableHeight + DURATION_TEXT_HEIGHT / 2 // 底部预留空间的中心：从 availableHeight 开始，高度为 DURATION_TEXT_HEIGHT
        : y + height + Math.max(gap * 0.5, padding); // 在cell下方，gap中间位置，但至少距离cell底部padding距离（肯定在图片外部）
      const textX = x + width - textPadding; // cell右下角X位置，右对齐
      
      context.save();
      context.font = `400 ${fontSize}px "Manrope", "Segoe UI", sans-serif`;
      context.fillStyle = "#98dbc6"; // 薄荷绿色
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(fullText, textX, textY);
      context.restore();
    }
  }
}


// 辅助函数：在Canvas中绘制带连笔和文体替代字的文本
function drawTextWithLigatures(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string | number = "normal",
  fillStyle: string,
  useStylisticAlternates: boolean = false,
): Promise<void> {
  return new Promise((resolve) => {
    if (useStylisticAlternates && typeof document !== "undefined") {
      // 使用隐藏的DOM元素来测量和渲染带文体替代字的文本
      const tempDiv = document.createElement("div");
      tempDiv.style.position = "absolute";
      tempDiv.style.visibility = "hidden";
      tempDiv.style.whiteSpace = "nowrap";
      tempDiv.style.fontFamily = fontFamily;
      tempDiv.style.fontSize = `${fontSize}px`;
      tempDiv.style.fontWeight = String(fontWeight);
      tempDiv.style.fontFeatureSettings = '"liga" 1, "kern" 1, "salt" 1';
      tempDiv.style.color = fillStyle;
      tempDiv.textContent = text;
      document.body.appendChild(tempDiv);
      
      const textWidth = Math.ceil(tempDiv.offsetWidth * 1.1);
      const textHeight = Math.ceil(fontSize * 1.3);
      
      // 创建SVG来渲染文本
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${textWidth}" height="${textHeight}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: ${fontFamily}; font-size: ${fontSize}px; font-weight: ${fontWeight}; font-feature-settings: 'liga' 1, 'kern' 1, 'salt' 1; color: ${fillStyle}; line-height: ${textHeight}px; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
            ${text}
          </div>
        </foreignObject>
      </svg>`;
      
      document.body.removeChild(tempDiv);
      
      const svgBlob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      
      // 只使用SVG方法，不绘制占位文本，避免重影
      img.onload = () => {
        context.drawImage(img, x - textWidth / 2, y - fontSize * 0.6);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        // 如果SVG方法失败，使用标准方法
        context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        context.fillStyle = fillStyle;
        context.fillText(text, x, y);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    } else {
      // 标准方法
      context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      context.fillStyle = fillStyle;
      context.fillText(text, x, y);
      resolve();
    }
  });
}

function ellipsizeToWidth(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  let best = "";
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const trial = text.slice(0, mid) + ellipsis;
    if (context.measureText(trial).width <= maxWidth) {
      best = trial;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best || ellipsis;
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

type HSL = { h: number; s: number; l: number };

function hslToRgb({ h, s, l }: HSL): RGBColor {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0, gn = 0, bn = 0;
  if (h >= 0 && h < 60) {
    rn = c; gn = x; bn = 0;
  } else if (h < 120) {
    rn = x; gn = c; bn = 0;
  } else if (h < 180) {
    rn = 0; gn = c; bn = x;
  } else if (h < 240) {
    rn = 0; gn = x; bn = c;
  } else if (h < 300) {
    rn = x; gn = 0; bn = c;
  } else {
    rn = c; gn = 0; bn = x;
  }
  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

