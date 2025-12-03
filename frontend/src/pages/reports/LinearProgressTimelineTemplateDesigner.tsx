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

import "./SingleArtworkTemplateDesigner.css";

type LinearProgressTimelineTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type TimelineLabelSettings = {
  showDaysOffset: boolean; // 显示x天前/后
  showImageOffset: boolean; // 显示x张前后
  showDurationOffset: boolean; // 显示画作时长xh前后
};

type TemplateViewModel = {
  durationLabel: string;
  durationTagShow: boolean;
  durationTagOpacity: number;
  username: string;
  timelineLabelSettings: TimelineLabelSettings;
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT_SQUARE = 1080; // 正方形：1080x1080
const CANVAS_HEIGHT_RECTANGLE = 1350; // 长方形：1080x1350
const DURATION_TEXT_HEIGHT = CANVAS_WIDTH * 0.02;
const DEFAULT_USERNAME = "@EchoUser";
const MAX_TAG_COUNT = 6;
const MIN_IMAGES = 4;
const MAX_IMAGES = 8;

type ImageSizePreset = "square" | "rectangle";

function LinearProgressTimelineTemplateDesigner({ open, artworks, onClose }: LinearProgressTimelineTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [_image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  // 图片信息设置状态（包含图片尺寸和显示时长标签）
  const [imageInfoSettings, setImageInfoSettings] = useState<ImageInfoSettingsState>({
    imageSizePreset: "square",
    showDurationTag: true,
  });
  const [textTone, _setTextTone] = useState<"light" | "dark">("light");
  const [tagOptions, setTagOptions] = useState<Array<{ id: string | number; name: string }>>([]);
  const [timelineLabelSettings, setTimelineLabelSettings] = useState<TimelineLabelSettings>({
    showDaysOffset: true,
    showImageOffset: true,
    showDurationOffset: true,
  });
  const [contentState, setContentState] = useState<ContentEditorState>({
    title: "线性进步轨迹",
    subtitle: "记录我的成长之路",
    username: DEFAULT_USERNAME,
    addSuffix: false,
    showTitle: true,
    showSubtitle: true,
    showUsername: true,
    showDate: true,
    showDuration: true,
    selectedTags: [],
  });
  // 支持4-8张图片的时间轴
  const [gridImages, setGridImages] = useState<GridImage[]>(
    new Array(MAX_IMAGES).fill(null).map(() => ({ artworkId: null, image: null })),
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
          console.warn("[LinearProgressTimelineTemplateDesigner] 无法加载用户昵称：", error);
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

  // 加载标签选项
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
        console.warn("[LinearProgressTimelineTemplateDesigner] Failed to load tag options:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
        title: "线性进步轨迹",
        subtitle: "记录我的成长之路",
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
      title: selectedArtwork.title?.trim() || "线性进步轨迹",
      subtitle: selectedArtwork.description?.trim() || "记录我的成长之路",
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

    const meta = composeMetaLabels(selectedArtwork, {
      showDate: false,
      showDuration: true,
    });
    const durationLabel = meta.durationLabel || "";

    let displayUsername = contentState.showUsername ? normalizeUsername(contentState.username) : "";
    if (displayUsername && contentState.addSuffix) {
      const baseName = displayUsername.startsWith("@") ? displayUsername.slice(1) : displayUsername;
      displayUsername = `${baseName}@EchoDraw`;
    }

    return {
      durationLabel,
      durationTagShow: imageInfoSettings.showDurationTag,
      durationTagOpacity: 0.8, // 固定透明度为80%
      username: displayUsername,
      timelineLabelSettings,
    };
  }, [
    selectedArtwork,
    imageInfoSettings,
    contentState,
    timelineLabelSettings,
  ]);

  const downloadDisabled = !templateData || imageStatus === "loading";

  // 获取已选择的图片数量
  const selectedImageCount = useMemo(() => {
    return gridImages.filter((img) => img.artworkId !== null).length;
  }, [gridImages]);

  // 计算时间轴相关的数据
  const timelineData = useMemo(() => {
    const selectedImages = gridImages
      .map((gridImage, index) => {
        if (!gridImage.artworkId) return null;
        const artwork = artworks.find((a) => a.id === gridImage.artworkId);
        if (!artwork) return null;
        const date = resolveArtworkDate(artwork);
        return {
          index,
          artwork,
          date,
          durationMinutes: artwork.durationMinutes || 0,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        // 按日期排序
        if (!a.date || !b.date) return 0;
        return a.date.getTime() - b.date.getTime();
      });

    if (selectedImages.length === 0) {
      return null;
    }

    // 计算每个图片相对于第一个图片的偏移
    const firstDate = selectedImages[0]?.date;
    const firstIndex = selectedImages[0]?.index;
    const firstDuration = selectedImages[0]?.durationMinutes || 0;
    let cumulativeDuration = 0;

    return selectedImages.map((item, idx) => {
      let daysOffset = 0;
      if (firstDate && item.date) {
        const diffMs = item.date.getTime() - firstDate.getTime();
        daysOffset = Math.round(diffMs / (1000 * 60 * 60 * 24));
      }

      const imageOffset = item.index - (firstIndex ?? 0);

      cumulativeDuration += item.durationMinutes || 0;
      const durationOffset = cumulativeDuration - firstDuration;

      return {
        ...item,
        daysOffset,
        imageOffset,
        durationOffset,
      };
    });
  }, [gridImages, artworks]);

  const getFilteredArtworks = (_position: number): Artwork[] => {
    return artworks;
  };

  const getPickerTitle = (_position: number): string => {
    return `选择图片 ${_position + 1}/${MAX_IMAGES}`;
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
    const canvasHeight = baseCanvasHeight + DURATION_TEXT_HEIGHT;
    if (canvas.width !== CANVAS_WIDTH || canvas.height !== canvasHeight) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = canvasHeight;
    }

    const draw = () => {
      const baseCanvasHeight = imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE;
      const canvasHeight = baseCanvasHeight + DURATION_TEXT_HEIGHT;
      drawTemplate(
        context,
        CANVAS_WIDTH,
        canvasHeight,
        templateData,
        gridImages,
        artworks,
        timelineData,
      );
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setTimeout(draw, 50);
      });
    } else {
      setTimeout(draw, 150);
    }
  }, [gridImages, open, templateData, imageInfoSettings.imageSizePreset, timelineData]);

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

              return { artworkId: gridImage.artworkId, image: reloadedImg, cropData: gridImage.cropData };
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
              drawTemplate(exportContext, CANVAS_WIDTH, canvasHeight, templateData, reloadedGridImages, artworks, timelineData);
              resolve();
            }, 50);
          });
        } else {
          setTimeout(() => {
            drawTemplate(exportContext, CANVAS_WIDTH, canvasHeight, templateData, reloadedGridImages, artworks, timelineData);
            resolve();
          }, 150);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const dataURL = exportCanvas.toDataURL("image/png");
      setPreviewImageUrl(dataURL);
      setShowPreviewModal(true);
    } catch (error) {
      console.error("生成图片失败:", error);
      if (error instanceof Error && (error.message.includes("Tainted") || error.message.includes("SecurityError") || error.message.includes("CORS"))) {
        alert("导出失败：图片跨域限制。请确保图片服务器允许跨域访问（CORS）。如果问题持续，请联系管理员。");
      } else if (error instanceof Error && error.message.includes("CORS")) {
        alert(error.message);
      } else {
        alert("生成图片失败，请稍后重试");
      }
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

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>时间轴标签设置</h3>
                    <p style={{ fontSize: "0.875rem", opacity: 0.7, marginTop: "0.25rem" }}>
                      已选择 {selectedImageCount} 张图片（最少 {MIN_IMAGES} 张，最多 {MAX_IMAGES} 张）
                    </p>
                  </div>
                  <div className="single-template-designer__field-row" style={{ flexDirection: "column", gap: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={timelineLabelSettings.showDaysOffset}
                        onChange={(e) => setTimelineLabelSettings(prev => ({ ...prev, showDaysOffset: e.target.checked }))}
                      />
                      <span>显示天数偏移（x天前/后）</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={timelineLabelSettings.showImageOffset}
                        onChange={(e) => setTimelineLabelSettings(prev => ({ ...prev, showImageOffset: e.target.checked }))}
                      />
                      <span>显示图片偏移（x张前后）</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={timelineLabelSettings.showDurationOffset}
                        onChange={(e) => setTimelineLabelSettings(prev => ({ ...prev, showDurationOffset: e.target.checked }))}
                      />
                      <span>显示时长偏移（xh前后）</span>
                    </label>
                  </div>
                </div>
              </section>
            ) : null}

            {hasArtworks ? (
              <section>
                <ImageGridSelector
                  gridImages={gridImages}
                  artworks={artworks}
                  placeholderPositions={[]}
                  placeholderLabels={{}}
                  onImageChange={(newGridImages) => {
                    // 限制最多选择MAX_IMAGES张图片
                    const selectedCount = newGridImages.filter(img => img.artworkId !== null).length;
                    if (selectedCount <= MAX_IMAGES) {
                      setGridImages(newGridImages);
                    }
                  }}
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
                    disabled={downloadDisabled || selectedImageCount < MIN_IMAGES}
                  >
                    <MaterialIcon name="download" />
                    保存为图片
                  </button>
                  <p>导出 PNG · {CANVAS_WIDTH} × {imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE} 像素 · 适配社交媒体展示。</p>
                  {selectedImageCount < MIN_IMAGES && (
                    <p style={{ color: "#ff6b6b", fontSize: "0.875rem", marginTop: "0.5rem" }}>
                      请至少选择 {MIN_IMAGES} 张图片
                    </p>
                  )}
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

      <ImagePreviewModal
        open={showPreviewModal}
        imageUrl={previewImageUrl}
        onClose={handleClosePreview}
        title="线性进步轨迹"
      />
    </>
  );
}

export default LinearProgressTimelineTemplateDesigner;

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
    console.warn("[LinearProgressTimelineTemplateDesigner] 无法获取用户昵称配置：", error);
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
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${hours} h`;
  }
  return `${hours} h ${minutes} min`;
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

type TimelineDataItem = {
  index: number;
  artwork: Artwork;
  date: Date | null;
  durationMinutes: number;
  daysOffset: number;
  imageOffset: number;
  durationOffset: number;
};

function drawTemplate(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TemplateViewModel,
  gridImages: GridImage[],
  artworks: Artwork[],
  timelineData: TimelineDataItem[] | null,
) {
  context.save();
  context.clearRect(0, 0, width, height);

  drawCanvasBackground(context, width, height);

  // 获取已选择的图片（按时间排序）
  const selectedImages = gridImages
    .map((gridImage, index) => {
      if (!gridImage.artworkId) return null;
      const artwork = artworks.find((a) => a.id === gridImage.artworkId);
      if (!artwork) return null;
      return { index, gridImage, artwork };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (selectedImages.length === 0) {
    context.restore();
    return;
  }

  // 按日期排序（如果日期相同，保持原顺序）
  selectedImages.sort((a, b) => {
    const dateA = resolveArtworkDate(a.artwork);
    const dateB = resolveArtworkDate(b.artwork);
    if (!dateA && !dateB) return a.index - b.index;
    if (!dateA) return 1;
    if (!dateB) return -1;
    const dateDiff = dateA.getTime() - dateB.getTime();
    return dateDiff !== 0 ? dateDiff : a.index - b.index;
  });

  // 时间轴布局：垂直排列
  const padding = width * 0.05;
  const imagePadding = width * 0.02;
  const timelineLineWidth = 2;
  const timelineLineColor = "rgba(152, 219, 198, 0.6)";
  
  // 计算每个图片的高度
  const availableHeight = height - DURATION_TEXT_HEIGHT - padding * 2;
  const imageHeight = (availableHeight - (selectedImages.length - 1) * imagePadding) / selectedImages.length;
  const imageWidth = width - padding * 2 - 60; // 留出时间轴标签的空间

  // 绘制时间轴线条
  const timelineX = padding + imageWidth + 20;
  const timelineStartY = padding;
  const timelineEndY = padding + availableHeight;
  
  context.strokeStyle = timelineLineColor;
  context.lineWidth = timelineLineWidth;
  context.beginPath();
  context.moveTo(timelineX, timelineStartY);
  context.lineTo(timelineX, timelineEndY);
  context.stroke();

  // 绘制每个图片和时间轴节点
  selectedImages.forEach((item, idx) => {
    const y = padding + idx * (imageHeight + imagePadding);
    const x = padding;
    
    // 绘制图片
    const imageToDraw = item.gridImage.image;
    if (imageToDraw && imageToDraw.width > 0 && imageToDraw.height > 0) {
      const radius = imageWidth * 0.01;
      context.save();
      drawRoundedRectPath(context, x, y, imageWidth, imageHeight, radius);
      context.clip();

      const scale = Math.max(imageWidth / imageToDraw.width, imageHeight / imageToDraw.height);
      const drawWidth = imageToDraw.width * scale;
      const drawHeight = imageToDraw.height * scale;
      const dx = x + (imageWidth - drawWidth) / 2;
      const dy = y + (imageHeight - drawHeight) / 2;
      context.drawImage(imageToDraw, dx, dy, drawWidth, drawHeight);
      context.restore();
    } else {
      // 绘制占位符
      const radius = imageWidth * 0.01;
      context.fillStyle = "#2a2525";
      drawRoundedRectPath(context, x, y, imageWidth, imageHeight, radius);
      context.fill();
      
      context.strokeStyle = "#98dbc6";
      context.lineWidth = 1;
      drawRoundedRectPath(context, x, y, imageWidth, imageHeight, radius);
      context.stroke();
    }

    // 绘制时间轴节点
    const nodeY = y + imageHeight / 2;
    context.fillStyle = timelineLineColor;
    context.beginPath();
    context.arc(timelineX, nodeY, 6, 0, Math.PI * 2);
    context.fill();

    // 绘制标签
    if (timelineData) {
      const timelineItem = timelineData.find(t => t.artwork.id === item.artwork.id);
      if (timelineItem) {
        const labelX = timelineX + 15;
        const labels: string[] = [];
        
        if (data.timelineLabelSettings.showDaysOffset && timelineItem.daysOffset !== 0) {
          labels.push(`${timelineItem.daysOffset > 0 ? '+' : ''}${timelineItem.daysOffset}天`);
        }
        if (data.timelineLabelSettings.showImageOffset && timelineItem.imageOffset !== 0) {
          labels.push(`${timelineItem.imageOffset > 0 ? '+' : ''}${timelineItem.imageOffset}张`);
        }
        if (data.timelineLabelSettings.showDurationOffset && timelineItem.durationOffset !== 0) {
          const hours = Math.floor(timelineItem.durationOffset / 60);
          const minutes = timelineItem.durationOffset % 60;
          if (hours > 0) {
            labels.push(`${timelineItem.durationOffset > 0 ? '+' : ''}${hours}h${minutes > 0 ? `${minutes}m` : ''}`);
          } else if (minutes > 0) {
            labels.push(`${timelineItem.durationOffset > 0 ? '+' : ''}${minutes}m`);
          }
        }

        if (labels.length > 0) {
          context.fillStyle = "rgba(152, 219, 198, 0.9)";
          context.font = `400 ${Math.round(width * 0.025)}px "Manrope", "Segoe UI", sans-serif`;
          context.textAlign = "left";
          context.textBaseline = "middle";
          context.fillText(labels.join(" · "), labelX, nodeY);
        }
      }
    }

    // 绘制时长标签（如果启用）
    if (data.durationTagShow && item.artwork.durationMinutes && item.artwork.durationMinutes > 0) {
      const durationText = formatDurationForTemplate(item.artwork.durationMinutes);
      const fontSize = Math.round(imageWidth * 0.03);
      const textPadding = imageWidth * 0.02;
      const textX = x + imageWidth - textPadding;
      const textY = y + imageHeight - fontSize / 2 - textPadding;
      
      context.save();
      context.font = `400 ${fontSize}px "Manrope", "Segoe UI", sans-serif`;
      context.fillStyle = `rgba(152, 219, 198, ${data.durationTagOpacity})`;
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(durationText, textX, textY);
      context.restore();
    }
  });

  // 绘制标题和用户名
  if (data.username) {
    const titleY = padding - 30;
    context.fillStyle = "rgba(152, 219, 198, 0.8)";
    context.font = `400 ${Math.round(width * 0.03)}px "Manrope", "Segoe UI", sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "bottom";
    context.fillText(data.username, padding, titleY);
  }

  context.restore();
}

function drawCanvasBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.fillStyle = "#2a2525";
  context.fillRect(0, 0, width, height);
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

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

