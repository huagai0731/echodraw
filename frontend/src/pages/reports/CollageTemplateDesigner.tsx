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

type CollageTemplateDesignerProps = {
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
const MAX_IMAGES = 9; // 最多9张图片

type ImageSizePreset = "square" | "rectangle"; // square: 1080x1080, rectangle: 1080x1350

// 根据图片数量确定布局
type LayoutConfig = {
  cols: number;
  rows: number;
  totalCells: number;
  placeholderIndices: number[]; // 占位符的位置索引
};

function getLayoutConfig(imageCount: number): LayoutConfig {
  if (imageCount <= 0) {
    return { cols: 1, rows: 1, totalCells: 1, placeholderIndices: [0] };
  }
  
  if (imageCount === 2) {
    // 2张：左右拼（1行2列）
    return { cols: 2, rows: 1, totalCells: 2, placeholderIndices: [] };
  }
  
  if (imageCount === 3) {
    // 3张：四图模板，右下角用占位符（2行2列）
    return { cols: 2, rows: 2, totalCells: 4, placeholderIndices: [3] };
  }
  
  if (imageCount === 4) {
    // 4张：2行2列
    return { cols: 2, rows: 2, totalCells: 4, placeholderIndices: [] };
  }
  
  if (imageCount === 5) {
    // 5张：两行三列，右下角用占位符（2行3列）
    return { cols: 3, rows: 2, totalCells: 6, placeholderIndices: [5] };
  }
  
  if (imageCount === 6) {
    // 6张：两行三列
    return { cols: 3, rows: 2, totalCells: 6, placeholderIndices: [] };
  }
  
  if (imageCount === 7) {
    // 7张：9宫格，最后两张占位符（3行3列）
    return { cols: 3, rows: 3, totalCells: 9, placeholderIndices: [7, 8] };
  }
  
  if (imageCount === 8) {
    // 8张：9宫格，最后一张占位符（3行3列）
    return { cols: 3, rows: 3, totalCells: 9, placeholderIndices: [8] };
  }
  
  if (imageCount >= 9) {
    // 9张：9宫格，最后一张占位符（3行3列）
    return { cols: 3, rows: 3, totalCells: 9, placeholderIndices: [8] };
  }
  
  // 默认情况
  return { cols: 3, rows: 3, totalCells: 9, placeholderIndices: [] };
}

function CollageTemplateDesigner({ open, artworks, onClose }: CollageTemplateDesignerProps) {
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
  
  // 动态网格图片选择：根据实际选择的图片数量自动确定布局
  const [gridImages, setGridImages] = useState<GridImage[]>([]);
  // 选中的套图ID
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  // 套图选择器是否打开
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);

  const hasArtworks = artworks.length > 0;

  // 获取所有套图（按 collectionId 分组）
  const collections = useMemo(() => {
    const collectionMap = new Map<string, { id: string; name: string; artworks: Artwork[]; thumbnail: Artwork | null }>();
    
    artworks.forEach((artwork) => {
      if (artwork.collectionId) {
        if (!collectionMap.has(artwork.collectionId)) {
          collectionMap.set(artwork.collectionId, {
            id: artwork.collectionId,
            name: artwork.collectionName || `套图 ${artwork.collectionId}`,
            artworks: [],
            thumbnail: null,
          });
        }
        const collection = collectionMap.get(artwork.collectionId)!;
        collection.artworks.push(artwork);
        // 设置缩略图（collectionIndex 为 1 的，或者第一个）
        if (!collection.thumbnail) {
          if (artwork.collectionIndex === 1) {
            collection.thumbnail = artwork;
          } else if (collection.artworks.length === 1) {
            collection.thumbnail = artwork;
          }
        } else if (artwork.collectionIndex === 1) {
          collection.thumbnail = artwork;
        }
      }
    });
    
    // 按上传时间排序每个套图的作品（上传顺序）
    collectionMap.forEach((collection) => {
      collection.artworks.sort((a, b) => {
        // 优先使用 uploadedAt，其次 uploadedDate，最后 date
        const getDate = (artwork: Artwork): Date => {
          const candidates = [artwork.uploadedAt, artwork.uploadedDate, artwork.date];
          for (const source of candidates) {
            if (source) {
              const parsed = new Date(source);
              if (!isNaN(parsed.getTime())) {
                return parsed;
              }
            }
          }
          return new Date(0); // 默认值
        };
        const dateA = getDate(a);
        const dateB = getDate(b);
        return dateA.getTime() - dateB.getTime(); // 按时间升序，最早的在前面
      });
      // 如果没有缩略图，使用第一个作品（最早上传的）
      if (!collection.thumbnail && collection.artworks.length > 0) {
        collection.thumbnail = collection.artworks[0];
      }
    });
    
    return Array.from(collectionMap.values());
  }, [artworks]);

  // 当前选中的套图
  const selectedCollection = useMemo(() => {
    if (!selectedCollectionId) return null;
    return collections.find(c => c.id === selectedCollectionId) || null;
  }, [selectedCollectionId, collections]);

  // 当选择套图时，自动加载套图的所有作品
  useEffect(() => {
    if (!selectedCollection) {
      setGridImages([]);
      return;
    }
    
    // 加载套图的所有作品
    const loadPromises = selectedCollection.artworks.map(async (artwork) => {
      try {
        const image = await getOrLoadImage(artwork.imageSrc);
        return { artworkId: artwork.id, image };
      } catch {
        return { artworkId: artwork.id, image: null };
      }
    });
    
    Promise.all(loadPromises).then((loadedImages) => {
      setGridImages(loadedImages);
    });
  }, [selectedCollection]);

  // 计算实际选择的图片数量（排除占位符）
  const actualImageCount = useMemo(() => {
    return gridImages.filter(g => g.artworkId !== null).length;
  }, [gridImages]);

  // 根据实际图片数量自动调整布局
  useEffect(() => {
    if (!open) {
      return;
    }
    
    // 如果没有选择任何图片，不调整布局（保持空状态）
    if (actualImageCount === 0) {
      // 如果 gridImages 不为空但都是空的，清空它
      if (gridImages.length > 0 && gridImages.every(g => g.artworkId === null)) {
        setGridImages([]);
      }
      return;
    }
    
    const layout = getLayoutConfig(actualImageCount);
    const currentCount = gridImages.length;
    
    // 如果当前网格大小与需要的布局不匹配，需要调整
    if (currentCount !== layout.totalCells) {
      setGridImages((prevGridImages) => {
        const newGridImages: GridImage[] = new Array(layout.totalCells)
          .fill(null)
          .map(() => ({ artworkId: null, image: null }));
        
        // 保留已有的图片，按顺序填充到新布局中
        const existingImages = prevGridImages.filter(g => g.artworkId !== null);
        const maxImages = Math.min(existingImages.length, actualImageCount);
        
        for (let i = 0; i < maxImages && i < layout.totalCells; i++) {
          if (i < existingImages.length) {
            newGridImages[i] = existingImages[i];
          }
        }
        
        return newGridImages;
      });
    }
  }, [actualImageCount, open]);

  useEffect(() => {
    if (!open) {
      setSelectedCollectionId(null);
      setGridImages([]);
      setCollectionPickerOpen(false);
      return;
    }
  }, [open]);

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
          console.warn("[CollageTemplateDesigner] 无法加载用户昵称：", error);
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

  // 套图模板不需要选择单个作品，使用套图的第一个作品作为参考
  const selectedArtwork = useMemo(() => {
    if (selectedCollection && selectedCollection.artworks.length > 0) {
      return selectedCollection.artworks[0];
    }
    return null;
  }, [selectedCollection]);

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
        console.warn("[CollageTemplateDesigner] Failed to load tag options:", error);
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

  // 套图模板不需要日期过滤，直接返回所有作品
  const getFilteredArtworks = (_position: number): Artwork[] => {
    return artworks;
  };

  const getPickerTitle = (_position: number): string => {
    return "选择图片";
  };

  const layoutConfig = useMemo(() => getLayoutConfig(actualImageCount), [actualImageCount]);

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
      const drawArtworks = selectedCollection ? selectedCollection.artworks : artworks;
      drawTemplate(
        context,
        CANVAS_WIDTH,
        canvasHeight,
        templateData,
        gridImages,
        drawArtworks,
        layoutConfig,
      );
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setTimeout(draw, 50);
      });
    } else {
      setTimeout(draw, 150);
    }
  }, [gridImages, open, templateData, imageInfoSettings.imageSizePreset, layoutConfig, selectedCollection]);

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
              const collectionArtworks = selectedCollection ? selectedCollection.artworks : artworks;
              const artwork = collectionArtworks.find(a => a.id === gridImage.artworkId);
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

      const exportArtworks = selectedCollection ? selectedCollection.artworks : artworks;

      await new Promise<void>((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            setTimeout(() => {
              drawTemplate(exportContext, CANVAS_WIDTH, canvasHeight, templateData, reloadedGridImages, exportArtworks, layoutConfig);
              resolve();
            }, 50);
          });
        } else {
          setTimeout(() => {
            drawTemplate(exportContext, CANVAS_WIDTH, canvasHeight, templateData, reloadedGridImages, exportArtworks, layoutConfig);
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
            title="套图模板"
            subtitle="Collage Template"
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
                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>选择套图</h3>
                  </div>
                  <div className="single-template-designer__field-row">
                    {collections.length === 0 ? (
                      <p style={{ color: "rgba(239, 234, 231, 0.6)", fontSize: "0.9rem", margin: 0 }}>
                        您还没有创建套图，请先在画集中创建套图
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="single-template-designer__tag-option"
                        onClick={() => setCollectionPickerOpen(true)}
                        style={{ width: "100%", justifyContent: "flex-start", padding: "0.75rem 1rem" }}
                      >
                        <MaterialIcon name="apps" style={{ marginRight: "0.5rem" }} />
                        {selectedCollection ? selectedCollection.name : "选择套图"}
                        {selectedCollection && (
                          <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: "0.85rem" }}>
                            {selectedCollection.artworks.length} 张
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                  {selectedCollection && (
                    <div className="single-template-designer__field-row" style={{ marginTop: "0.5rem" }}>
                      <p style={{ color: "rgba(239, 234, 231, 0.7)", fontSize: "0.9rem", margin: 0 }}>
                        已选择套图「{selectedCollection.name}」，共 {actualImageCount} 张图片，自动匹配 {layoutConfig.rows}×{layoutConfig.cols} 布局
                        {layoutConfig.placeholderIndices.length > 0 && `（${layoutConfig.placeholderIndices.length} 个占位符）`}
                      </p>
                    </div>
                  )}
                </div>
                <ImageInfoSettings
                  state={imageInfoSettings}
                  onChange={setImageInfoSettings}
                />
              </section>
            ) : null}

            {hasArtworks && selectedCollection ? (
              <section>
                <ImageGridSelector
                  gridImages={gridImages}
                  artworks={selectedCollection.artworks}
                  placeholderPositions={layoutConfig.placeholderIndices}
                  placeholderLabels={Object.fromEntries(
                    layoutConfig.placeholderIndices.map(idx => [idx, "占位符"])
                  )}
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

      {collectionPickerOpen && collections.length > 0 ? (
        <div className="single-template-designer__picker" role="dialog" aria-modal="true">
          <div className="single-template-designer__picker-backdrop" onClick={() => setCollectionPickerOpen(false)} />
          <div className="single-template-designer__picker-panel">
            <div className="single-template-designer__picker-header">
              <h3>选择套图</h3>
              <button
                type="button"
                className="single-template-designer__picker-close"
                aria-label="关闭套图选择"
                onClick={() => setCollectionPickerOpen(false)}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="single-template-designer__artwork-grid" role="listbox" aria-label="可选择的套图">
              {collections.map((collection) => {
                const isActive = selectedCollectionId === collection.id;
                return (
                  <button
                    key={collection.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`single-template-designer__artwork-button${isActive ? " single-template-designer__artwork-button--active" : ""}`}
                    onClick={() => {
                      setSelectedCollectionId(collection.id);
                      setCollectionPickerOpen(false);
                    }}
                  >
                    {collection.thumbnail && (
                      <img src={collection.thumbnail.imageSrc} alt={collection.thumbnail.alt} loading="lazy" />
                    )}
                    <span>{collection.name}</span>
                    <span style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "0.25rem" }}>
                      {collection.artworks.length} 张图片
                    </span>
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
        title="套图模板"
      />
    </>
  );
}

export default CollageTemplateDesigner;

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
    console.warn("[CollageTemplateDesigner] 无法获取用户昵称配置：", error);
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
  gridImages: Array<{ artworkId: string | null; image: HTMLImageElement | null }>,
  artworks: Artwork[],
  layoutConfig: LayoutConfig,
) {
  context.save();
  context.clearRect(0, 0, width, height);

  // 绘制背景 - 深棕灰色
  drawCanvasBackground(context, width, height);

  // 如果没有图片，只绘制背景
  if (gridImages.length === 0) {
    context.restore();
    return;
  }

  // 计算网格尺寸，添加间隙
  const gap = width * 0.01; // 1%的间隙
  const totalGapWidth = gap * (layoutConfig.cols - 1);
  // 为底部时长文字留出空间，从总高度中减去
  const availableHeight = height - DURATION_TEXT_HEIGHT;
  const totalGapHeight = gap * (layoutConfig.rows - 1);
  const cellWidth = (width - totalGapWidth) / layoutConfig.cols;
  const cellHeight = (availableHeight - totalGapHeight) / layoutConfig.rows;

  // 根据布局配置绘制所有格子
  for (let row = 0; row < layoutConfig.rows; row++) {
    for (let col = 0; col < layoutConfig.cols; col++) {
      const index = row * layoutConfig.cols + col;
      const x = col * (cellWidth + gap);
      const y = row * (cellHeight + gap);
      
      const gridImage = gridImages[index];
      const isPlaceholder = layoutConfig.placeholderIndices.includes(index);
      const imageToDraw = isPlaceholder ? null : (gridImage?.image || null);
      const artwork = isPlaceholder ? null : (gridImage?.artworkId ? artworks.find(a => a.id === gridImage.artworkId) ?? null : null);
      drawImageCell(context, x, y, cellWidth, cellHeight, imageToDraw, artwork, gap, data.durationTagShow, height, availableHeight, row === layoutConfig.rows - 1);
    }
  }

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

    // 绘制 EchoDraw 文字
    const centerX = cellX + cellWidth / 2;
    const centerY = cellY + cellHeight / 2;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const fontSize = Math.round(cellWidth * 0.08);
    const textColor = "rgba(152, 219, 198, 0.1)";
    drawTextWithLigatures(
      context,
      "EchoDraw",
      centerX,
      centerY,
      fontSize,
      "Ethereal",
      "600",
      textColor,
      true,
    );
  }
  
  // 在图片下方间距（gap）的正中间绘制时长，右对齐
  if (showDuration && image && image.width > 0 && image.height > 0 && artwork) {
    const durationMinutes = artwork.durationMinutes;
    if (durationMinutes && durationMinutes > 0) {
      const durationText = formatDurationForTemplate(durationMinutes);
      const fontSize = Math.round(width * 0.04);
      const textPadding = width * 0.02;
      
      // 计算时长显示位置：在 cell 底部和下一个 cell 顶部之间的 gap 正中间
      // cell 底部是 y + height
      // gap 在 y + height 到 y + height + gap 之间
      // gap 的正中间是 y + height + gap / 2
      // 对于底部行，底部预留空间从 availableHeight 到 canvasHeight
      // 中心位置应该是 availableHeight + DURATION_TEXT_HEIGHT / 2
      const textY = isBottomRow && availableHeight > 0 && canvasHeight > 0
        ? availableHeight + DURATION_TEXT_HEIGHT / 2 // 底部预留空间的中心：从 availableHeight 开始，高度为 DURATION_TEXT_HEIGHT
        : y + height + gap / 2; // gap 的正中间位置
      const textX = x + width - textPadding;
      
      context.save();
      context.font = `400 ${fontSize}px "Manrope", "Segoe UI", sans-serif`;
      context.fillStyle = "#98dbc6";
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(durationText, textX, textY);
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
      
      img.onload = () => {
        context.drawImage(img, x - textWidth / 2, y - fontSize * 0.6);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        context.fillStyle = fillStyle;
        context.fillText(text, x, y);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    } else {
      context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      context.fillStyle = fillStyle;
      context.fillText(text, x, y);
      resolve();
    }
  });
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

