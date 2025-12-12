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

type YearlyTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type TemplateViewModel = {
  durationLabel: string;
  overlayOpacity: number;
  durationTagShow: boolean;
  durationTagOpacity: number;
  username: string;
  yearInfo: {
    year: string;
  };
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT_SQUARE = 1080; // 正方形：1080x1080
const CANVAS_HEIGHT_RECTANGLE = 1350; // 长方形：1080x1350
const DURATION_TEXT_HEIGHT = CANVAS_WIDTH * 0.02; // 底部时长文字区域高度，为图片间隙的2倍
const DEFAULT_USERNAME = "@EchoUser";
const MAX_TAG_COUNT = 6;
const GRID_COLS = 4; // 4列
const GRID_ROWS = 3; // 3行
const TOTAL_CELLS = 12; // 4x3 = 12个月

type ImageSizePreset = "square" | "rectangle"; // square: 1080x1080, rectangle: 1080x1350

function YearlyTemplateDesigner({ open, artworks, onClose }: YearlyTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [_image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [textTone, _setTextTone] = useState<"light" | "dark">("light");
  const [tagOptions, setTagOptions] = useState<Array<{ id: string | number; name: string }>>([]);
  // 时长标签设置状态
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
    showUsername: false, // 全年模版不需要显示署名
    showDate: true,
    showDuration: true,
    selectedTags: [],
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    // 默认设置为当前年份
    return new Date().getFullYear();
  });
  // 3x4网格图片选择：12个位置，对应12个月
  const [gridImages, setGridImages] = useState<GridImage[]>(
    new Array(TOTAL_CELLS).fill(null).map(() => ({ artworkId: null, image: null })),
  );
  const gridImagesRef = useRef<GridImage[]>(gridImages);
  // 月份图片选择弹窗状态
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12; // 每页显示12张图片

  const hasArtworks = artworks.length > 0;

  // 同步gridImages到ref
  useEffect(() => {
    gridImagesRef.current = gridImages;
  }, [gridImages]);

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

  // 全年模版不需要加载用户名，已移除

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      setMonthPickerOpen(false);
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

  // 自动填充功能：打开模板或切换年份时，自动填充空位
  useEffect(() => {
    if (!open || !hasArtworks) {
      return;
    }

    let cancelled = false;

    const autoFillImages = async () => {
      const currentGrid = gridImagesRef.current;
      const fillTasks: Array<{ position: number; artwork: Artwork }> = [];

      // 遍历12个月（位置0-11对应月份0-11）
      for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        // 只填充空位
        const currentImage = currentGrid[monthIndex];
        if (currentImage?.artworkId) {
          continue;
        }

        // 获取符合条件的图片（该月的所有图片）
        const filtered = getFilteredArtworks(monthIndex);
        if (filtered.length === 0) {
          continue;
        }

        // 按时间降序排序（最新的在前）
        const sorted = [...filtered].sort((a, b) => {
          const dateA = resolveArtworkDate(a);
          const dateB = resolveArtworkDate(b);
          if (!dateA || !dateB) return 0;
          // 如果日期相同，按uploadedAt排序（降序）
          if (dateA.getTime() === dateB.getTime()) {
            const timeA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
            const timeB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
            return timeB - timeA;
          }
          return dateB.getTime() - dateA.getTime();
        });

        const firstArtwork = sorted[0];
        if (firstArtwork) {
          fillTasks.push({ position: monthIndex, artwork: firstArtwork });
        }
      }

      // 异步加载所有图片并填充
      if (fillTasks.length > 0) {
        const loadPromises = fillTasks.map(async ({ position, artwork }) => {
          try {
            const img = await getOrLoadImage(artwork.imageSrc);
            if (cancelled) return null;

            return { position, artworkId: artwork.id, image: img };
          } catch (error) {
            // 静默处理加载失败，不显示错误
            console.warn(`[YearlyTemplateDesigner] 自动填充位置 ${position} 失败:`, error);
            return null;
          }
        });

        const results = await Promise.allSettled(loadPromises);
        if (cancelled) return;

        setGridImages((current) => {
          const newGrid = [...current];
          let hasChanges = false;

          results.forEach((result) => {
            if (result.status === "fulfilled" && result.value) {
              const { position, artworkId, image } = result.value;
              // 再次检查是否仍为空位（避免并发填充）
              if (!newGrid[position]?.artworkId) {
                newGrid[position] = { artworkId, image };
                hasChanges = true;
              }
            }
          });

          return hasChanges ? newGrid : current;
        });
      }
    };

    autoFillImages();

    return () => {
      cancelled = true;
    };
  }, [open, hasArtworks, selectedYear, artworks]);

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
        console.warn("[YearlyTemplateDesigner] Failed to load tag options:", error);
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

  // 计算年份信息
  const yearInfo = useMemo(() => {
    return {
      year: String(selectedYear),
    };
  }, [selectedYear]);

  const templateData = useMemo<TemplateViewModel | null>(() => {
    if (!selectedArtwork) {
      return null;
    }

    const meta = composeMetaLabels(selectedArtwork, {
      showDate: false,
      showDuration: true,
    });
    const durationLabel = meta.durationLabel || "";

    // 全年模版不需要署名，直接设置为空字符串
    const displayUsername = "";

    return {
      durationLabel,
      overlayOpacity: 0, // 不再使用
      durationTagShow: imageInfoSettings.showDurationTag,
      durationTagOpacity: 0.8, // 固定透明度为80%
      username: displayUsername,
      yearInfo,
    };
  }, [
    selectedArtwork,
    imageInfoSettings.showDurationTag,
    contentState,
    yearInfo,
  ]);

  // 根据小图尺寸比例计算实际画布高度
  const actualCanvasHeight = useMemo(() => {
    const gap = CANVAS_WIDTH * 0.01;
    const totalGapWidth = gap * (GRID_COLS - 1);
    const totalGapHeight = gap * (GRID_ROWS - 1);
    const availableWidth = CANVAS_WIDTH - totalGapWidth;
    
    let cellWidth: number;
    let cellHeight: number;
    
    if (imageInfoSettings.imageSizePreset === "square") {
      // 正方形：cellWidth = cellHeight
      cellWidth = availableWidth / GRID_COLS;
      cellHeight = cellWidth; // 保持1:1比例
    } else {
      // 长方形：cellWidth : cellHeight = 1080 : 1350 = 4 : 5
      cellWidth = availableWidth / GRID_COLS;
      cellHeight = cellWidth * 5 / 4; // 保持4:5比例
    }
    
    // 计算实际需要的总高度：网格高度（3行 * cell高度 + 行间距）+ 底部时长标签空间
    const gridTotalHeight = GRID_ROWS * cellHeight + totalGapHeight;
    // 如果显示时长标签，需要在底部预留空间
    const bottomDurationSpace = imageInfoSettings.showDurationTag ? DURATION_TEXT_HEIGHT : 0;
    return gridTotalHeight + bottomDurationSpace;
  }, [imageInfoSettings.imageSizePreset, imageInfoSettings.showDurationTag]);

  const downloadDisabled = !templateData || imageStatus === "loading";

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

    if (canvas.width !== CANVAS_WIDTH || canvas.height !== actualCanvasHeight) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = actualCanvasHeight;
    }

    const draw = () => {
      drawTemplate(
        context,
        CANVAS_WIDTH,
        actualCanvasHeight,
        templateData,
        gridImages,
        artworks,
        selectedYear,
        imageInfoSettings.imageSizePreset,
      );
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setTimeout(draw, 50);
      });
    } else {
      setTimeout(draw, 150);
    }
  }, [gridImages, open, templateData, imageInfoSettings.imageSizePreset, selectedYear, actualCanvasHeight]);

  // 根据月份索引（0-11）获取该月的所有图片
  const getFilteredArtworks = (monthIndex: number): Artwork[] => {
    if (monthIndex < 0 || monthIndex > 11) {
      return [];
    }
    
    // 计算该月的开始和结束日期
    const startDate = new Date(selectedYear, monthIndex, 1);
    const endDate = new Date(selectedYear, monthIndex + 1, 0); // 该月最后一天
    endDate.setHours(23, 59, 59, 999); // 设置为当天的最后一刻
    
    return artworks.filter((artwork) => {
      const artworkDate = resolveArtworkDate(artwork);
      if (!artworkDate) return false;
      return artworkDate >= startDate && artworkDate <= endDate;
    });
  };

  const getPickerTitle = (monthIndex: number): string => {
    if (monthIndex < 0 || monthIndex > 11) {
      return "选择图片";
    }
    const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
    return `选择图片 - ${selectedYear}年${monthNames[monthIndex]}`;
  };

  // 处理月份点击，显示该月所有图片的弹窗
  const handleMonthClick = (monthIndex: number) => {
    setSelectedMonthIndex(monthIndex);
    setCurrentPage(1); // 重置到第一页
    setMonthPickerOpen(true);
  };

  // 处理从月份弹窗中选择图片
  const handleMonthImageSelect = async (artwork: Artwork) => {
    if (selectedMonthIndex === null) return;
    
    try {
      const img = await getOrLoadImage(artwork.imageSrc);
      const newGrid = [...gridImages];
      newGrid[selectedMonthIndex] = { artworkId: artwork.id, image: img };
      setGridImages(newGrid);
      setMonthPickerOpen(false);
      setSelectedMonthIndex(null);
    } catch (error) {
      console.error("加载图片失败:", error);
    }
  };

  // 获取当前选中月份的所有图片
  const monthArtworks = selectedMonthIndex !== null ? getFilteredArtworks(selectedMonthIndex) : [];
  const monthPickerTitle = selectedMonthIndex !== null ? getPickerTitle(selectedMonthIndex) : "选择图片";
  
  // 分页计算
  const totalPages = Math.ceil(monthArtworks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentPageArtworks = monthArtworks.slice(startIndex, endIndex);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !templateData) {
      return;
    }

    try {
      // 确保所有图片都通过 fetch 获取 blob URL，避免跨域问题
      const reloadedGridImages: GridImage[] = [];
      const loadPromises: Promise<GridImage>[] = [];
      
      for (let i = 0; i < gridImages.length; i++) {
        const gridImage = gridImages[i];
        if (gridImage.artworkId) {
          const loadPromise = (async (): Promise<GridImage> => {
            try {
              // 找到对应的 artwork
              const artwork = artworks.find(a => a.id === gridImage.artworkId);
              if (!artwork) {
                return { artworkId: null, image: null };
              }

              // 强制通过 fetch 获取 blob，确保使用 blob URL
              let blob: Blob;
              try {
                const response = await fetch(artwork.imageSrc, { mode: "cors" });
                if (!response.ok) {
                  throw new Error(`Failed to fetch: ${response.statusText}`);
                }
                blob = await response.blob();
              } catch (fetchError) {
                // 如果 CORS 失败，尝试检查是否是同源
                const url = new URL(artwork.imageSrc, window.location.href);
                if (url.origin === window.location.origin) {
                  // 同源，直接 fetch
                  const response = await fetch(artwork.imageSrc);
                  blob = await response.blob();
                } else {
                  throw new Error("图片服务器不允许跨域访问（CORS）。无法导出包含跨域图片的内容。");
                }
              }

              // 创建 blob URL
              const blobUrl = URL.createObjectURL(blob);
              
              // 加载图片
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
              throw error; // 不返回原图片，直接抛出错误
            }
          })();
          loadPromises.push(loadPromise);
        } else {
          loadPromises.push(Promise.resolve({ artworkId: null, image: null }));
        }
      }

      // 等待所有图片加载完成，保持顺序
      const loadedImages = await Promise.all(loadPromises);
      reloadedGridImages.push(...loadedImages);

      // 计算实际画布高度（与预览一致）
      const gap = CANVAS_WIDTH * 0.01;
      const totalGapWidth = gap * (GRID_COLS - 1);
      const totalGapHeight = gap * (GRID_ROWS - 1);
      const availableWidth = CANVAS_WIDTH - totalGapWidth;
      
      let cellWidth: number;
      let cellHeight: number;
      
      if (imageInfoSettings.imageSizePreset === "square") {
        cellWidth = availableWidth / GRID_COLS;
        cellHeight = cellWidth;
      } else {
        cellWidth = availableWidth / GRID_COLS;
        cellHeight = cellWidth * 5 / 4;
      }
      
      const gridTotalHeight = GRID_ROWS * cellHeight + totalGapHeight;
      // 如果显示时长标签，需要在底部预留空间
      const bottomDurationSpace = imageInfoSettings.showDurationTag ? DURATION_TEXT_HEIGHT : 0;
      const exportCanvasHeight = gridTotalHeight + bottomDurationSpace;

      // 创建一个新的 canvas 用于导出，避免污染原始 canvas
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = CANVAS_WIDTH;
      exportCanvas.height = exportCanvasHeight;
      const exportContext = exportCanvas.getContext("2d");
      
      if (!exportContext) {
        throw new Error("无法创建导出 canvas");
      }

      // 在新 canvas 上绘制，使用重新加载的图片
      await new Promise<void>((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            setTimeout(() => {
              drawTemplate(exportContext, CANVAS_WIDTH, exportCanvasHeight, templateData, reloadedGridImages, artworks, selectedYear, imageInfoSettings.imageSizePreset);
              resolve();
            }, 50);
          });
        } else {
          setTimeout(() => {
            drawTemplate(exportContext, CANVAS_WIDTH, exportCanvasHeight, templateData, reloadedGridImages, artworks, selectedYear, imageInfoSettings.imageSizePreset);
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
                    style={{ aspectRatio: `${CANVAS_WIDTH} / ${actualCanvasHeight}` }}
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
                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>年份设置</h3>
                  </div>
                  <div className="single-template-designer__field-row">
                    <label>
                      <span>选择年份</span>
                      <input
                        type="number"
                        value={selectedYear}
                        onChange={(e) => {
                          const year = Number.parseInt(e.target.value, 10);
                          if (!isNaN(year) && year > 0) {
                            setSelectedYear(year);
                          }
                        }}
                        min="2000"
                        max="2100"
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: 8, padding: "0.5rem", background: "rgba(255,255,255,0.05)", borderRadius: "0.5rem" }}>
                    <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", margin: 0 }}>
                      {yearInfo.year}年
                    </p>
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>月份图片选择</h3>
                  </div>
                  <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)", margin: "0.5rem 0" }}>
                    点击月份格子选择该月的图片
                  </p>
                  <div className="image-grid-selector__grid" style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gap: "0.5rem" }}>
                    {Array.from({ length: TOTAL_CELLS }, (_, index) => {
                      const monthIndex = index;
                      const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                      const gridImage = gridImages[monthIndex];
                      const hasImage = gridImage?.image !== null;
                      
                      return (
                        <button
                          key={monthIndex}
                          type="button"
                          className="image-grid-selector__cell"
                          onClick={() => handleMonthClick(monthIndex)}
                          style={{
                            position: "relative",
                            aspectRatio: "1",
                            background: hasImage ? "transparent" : "rgba(152, 219, 198, 0.1)",
                            border: "1px solid rgba(152, 219, 198, 0.3)",
                            borderRadius: "0.5rem",
                            cursor: "pointer",
                            overflow: "hidden",
                          }}
                        >
                          {hasImage && gridImage.image ? (
                            <img
                              src={gridImage.image.src}
                              alt={monthNames[monthIndex]}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "100%",
                              color: "rgba(152, 219, 198, 0.6)",
                            }}>
                              <MaterialIcon name="add_photo_alternate" style={{ fontSize: "2rem", marginBottom: "0.25rem" }} />
                              <span style={{ fontSize: "0.75rem", fontFamily: '"Ethereal", "Manrope", "Segoe UI", sans-serif', fontWeight: 600 }}>{monthNames[monthIndex]}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

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
                    disabled={downloadDisabled}
                  >
                    <MaterialIcon name="download" />
                    保存为图片
                  </button>
                  <p>导出 PNG · {CANVAS_WIDTH} × {Math.round(actualCanvasHeight)} 像素 · 适配社交媒体展示。</p>
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

      {/* 月份图片选择弹窗 */}
      {monthPickerOpen && hasArtworks ? (
        <div className="single-template-designer__picker" role="dialog" aria-modal="true">
          <div className="single-template-designer__picker-backdrop" onClick={() => {
            setMonthPickerOpen(false);
            setSelectedMonthIndex(null);
          }} />
          <div className="single-template-designer__picker-panel">
            <div className="single-template-designer__picker-header">
              <h3>{monthPickerTitle}</h3>
              <button
                type="button"
                className="single-template-designer__picker-close"
                aria-label="关闭图片选择"
                onClick={() => {
                  setMonthPickerOpen(false);
                  setSelectedMonthIndex(null);
                }}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            {monthArtworks.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
                <MaterialIcon name="image_not_supported" style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.5 }} />
                <p>该月没有上传的图片</p>
              </div>
            ) : (
              <>
                <div className="single-template-designer__artwork-grid" role="listbox" aria-label="可套用的作品">
                  {currentPageArtworks.map((artwork) => {
                    const isActive = gridImages[selectedMonthIndex ?? -1]?.artworkId === artwork.id;
                    return (
                      <button
                        key={artwork.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`single-template-designer__artwork-button${isActive ? " single-template-designer__artwork-button--active" : ""}`}
                        onClick={() => handleMonthImageSelect(artwork)}
                      >
                        <img src={artwork.imageSrc} alt={artwork.alt} loading="lazy" />
                        <span>{artwork.title || "未命名"}</span>
                      </button>
                    );
                  })}
                </div>
                {totalPages > 1 && (
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "center", 
                    alignItems: "center", 
                    gap: "1rem", 
                    padding: "1rem",
                    borderTop: "1px solid rgba(152, 219, 198, 0.2)"
                  }}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      style={{
                        padding: "0.5rem 1rem",
                        background: currentPage === 1 ? "rgba(255,255,255,0.1)" : "rgba(152, 219, 198, 0.2)",
                        border: "1px solid rgba(152, 219, 198, 0.3)",
                        borderRadius: "0.5rem",
                        color: currentPage === 1 ? "rgba(255,255,255,0.3)" : "#98dbc6",
                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <MaterialIcon name="chevron_left" />
                      <span>上一页</span>
                    </button>
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.875rem" }}>
                      第 {currentPage} / {totalPages} 页
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: "0.5rem 1rem",
                        background: currentPage === totalPages ? "rgba(255,255,255,0.1)" : "rgba(152, 219, 198, 0.2)",
                        border: "1px solid rgba(152, 219, 198, 0.3)",
                        borderRadius: "0.5rem",
                        color: currentPage === totalPages ? "rgba(255,255,255,0.3)" : "#98dbc6",
                        cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span>下一页</span>
                      <MaterialIcon name="chevron_right" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      <ImagePreviewModal
        open={showPreviewModal}
        imageUrl={previewImageUrl}
        onClose={handleClosePreview}
        title="全年模板图片"
      />
    </>
  );
}

export default YearlyTemplateDesigner;

// 以下函数与其他模板相同，直接复用
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
    console.warn("[YearlyTemplateDesigner] 无法获取用户昵称配置：", error);
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

function drawTemplate(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TemplateViewModel,
  gridImages: GridImage[],
  artworks: Artwork[],
  selectedYear: number,
  imageSizePreset: ImageSizePreset,
) {
  context.save();
  context.clearRect(0, 0, width, height);

  drawCanvasBackground(context, width, height);

  const gap = width * 0.01;
  const totalGapWidth = gap * (GRID_COLS - 1);
  const totalGapHeight = gap * (GRID_ROWS - 1);
  const availableWidth = width - totalGapWidth;
  
  // 根据小图尺寸比例计算 cell 尺寸
  let actualCellWidth: number;
  let actualCellHeight: number;
  
  if (imageSizePreset === "square") {
    // 正方形：cellWidth = cellHeight，保持1:1比例
    actualCellWidth = availableWidth / GRID_COLS;
    actualCellHeight = actualCellWidth;
  } else {
    // 长方形：cellWidth : cellHeight = 1080 : 1350 = 4 : 5
    actualCellWidth = availableWidth / GRID_COLS;
    actualCellHeight = actualCellWidth * 5 / 4; // 保持4:5比例
  }
  
  // 计算网格总高度（不包括底部时长标签空间）
  const gridTotalHeight = GRID_ROWS * actualCellHeight + totalGapHeight;
  
  // 4列3行网格位置映射（12个月）
  const gridPositions = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const index = row * GRID_COLS + col;
      gridPositions.push({ row, col, index });
    }
  }
  
  gridPositions.forEach(({ row, col, index }) => {
    const x = col * (actualCellWidth + gap);
    const y = row * (actualCellHeight + gap);
    
    // 绘制月份图片
    const gridImage = gridImages[index];
    const imageToDraw = gridImage?.image || null;
    const artwork = gridImage?.artworkId ? artworks.find(a => a.id === gridImage.artworkId) ?? null : null;
    const monthIndex = index; // 0-11对应1-12月
    // 传递网格总高度给 drawImageCell，用于计算时长标签位置
    drawImageCell(context, x, y, actualCellWidth, actualCellHeight, imageToDraw, artwork, gap, data.durationTagShow, data.durationTagOpacity, height, gridTotalHeight, row === GRID_ROWS - 1, monthIndex);
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
  durationTagOpacity: number,
  canvasHeight: number,
  availableHeight: number,
  isBottomRow: boolean,
  monthIndex: number,
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
    // 使用 cover 模式：确保图片填满整个 cell，保持宽高比
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

    // 绘制月份文字（英文缩写）
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const centerX = cellX + cellWidth / 2;
    const centerY = cellY + cellHeight / 2;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const fontSize = Math.round(cellWidth * 0.12);
    const textColor = "rgba(152, 219, 198, 0.6)";
    context.font = `600 ${fontSize}px "Ethereal", "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle = textColor;
    context.fillText(monthNames[monthIndex] || "", centerX, centerY);
  }
  
  // 在图片下方间距（gap）中绘制时长，右对齐
  if (showDuration && image && image.width > 0 && image.height > 0) {
    if (artwork && artwork.durationMinutes && artwork.durationMinutes > 0) {
      const durationText = formatDurationForTemplate(artwork.durationMinutes);
      // 增大字体大小，参考单月模版，使用更大的比例
      const fontSize = Math.round(width * 0.06); // 从 0.04 增加到 0.06，使字体更大
      const textPadding = width * 0.02;
      const padding = width * 0.02;
      const textY = isBottomRow && availableHeight > 0 && canvasHeight > 0
        ? availableHeight + DURATION_TEXT_HEIGHT / 2
        : y + height + Math.max(gap * 0.5, padding);
      const textX = x + width - textPadding;
      
      context.save();
      context.font = `400 ${fontSize}px "Manrope", "Segoe UI", sans-serif`;
      const opacity = clamp01(durationTagOpacity);
      context.fillStyle = `rgba(152, 219, 198, ${opacity})`;
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(durationText, textX, textY);
      context.restore();
    }
  }
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

