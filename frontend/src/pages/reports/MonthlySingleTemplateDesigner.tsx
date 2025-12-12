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
import { formatISODateInShanghai } from "@/utils/dateUtils";

import "./SingleArtworkTemplateDesigner.css";

type MonthlySingleTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type TemplateViewModel = {
  durationLabel: string;
  overlayOpacity: number;
  durationTagShow: boolean;
  durationTagOpacity: number;
  monthInfo: {
    month: string;
    year: string;
  };
  username: string;
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT_SQUARE = 1080; // 正方形：1080x1080
const CANVAS_HEIGHT_RECTANGLE = 1350; // 长方形：1080x1350
// 顶部年月信息区域高度：包含年月信息本身 + 年月信息到第一行图片的间距（和署名距离底部的间距一样）
const TOP_INFO_HEIGHT = CANVAS_WIDTH * 0.12; // 增加高度以确保有足够空间
const DEFAULT_USERNAME = "@EchoUser";
const MAX_TAG_COUNT = 6;
const GRID_COLS = 7; // 一周7天
// GRID_ROWS 和 TOTAL_CELLS 将根据月份动态计算

type ImageSizePreset = "square" | "rectangle"; // square: 1080x1080, rectangle: 1080x1350

function MonthlySingleTemplateDesigner({ open, artworks, onClose }: MonthlySingleTemplateDesignerProps) {
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
    showUsername: true,
    showDate: true,
    showDuration: true,
    selectedTags: [],
  });
  const [monthDate, setMonthDate] = useState<Date>(() => {
    // 默认设置为当前月份的第一天
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  // 根据月份计算实际需要的行数和格子数
  const gridRowsAndCells = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    
    // 获取月份第一天和最后一天
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // 获取第一天是星期几（0=周日，1=周一，...，6=周六）
    const firstDayWeekday = firstDay.getDay();
    // 转换为周一为0的格式（0=周一，1=周二，...，6=周日）
    const firstDayMondayIndex = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1;
    
    // 计算开头占位符数量
    const leadingPlaceholders = firstDayMondayIndex;
    
    // 计算总天数（开头占位符 + 月份天数）
    const totalDays = leadingPlaceholders + daysInMonth;
    
    // 计算需要多少行（每行7列）
    const rows = Math.ceil(totalDays / GRID_COLS);
    
    // 计算总格子数
    const totalCells = rows * GRID_COLS;
    
    return { rows, totalCells };
  }, [monthDate]);

  // 动态初始化gridImages数组
  const [gridImages, setGridImages] = useState<GridImage[]>([]);
  const gridImagesRef = useRef<GridImage[]>(gridImages);
  
  // 当行数或格子数变化时，调整gridImages数组长度
  useEffect(() => {
    const { totalCells } = gridRowsAndCells;
    setGridImages((prev) => {
      const newGrid = [...prev];
      // 如果新数组更长，添加新元素
      while (newGrid.length < totalCells) {
        newGrid.push({ artworkId: null, image: null });
      }
      // 如果新数组更短，截断（但保留前totalCells个）
      if (newGrid.length > totalCells) {
        return newGrid.slice(0, totalCells);
      }
      return newGrid;
    });
  }, [gridRowsAndCells.totalCells]);

  // 同步gridImages到ref
  useEffect(() => {
    gridImagesRef.current = gridImages;
  }, [gridImages]);

  const hasArtworks = artworks.length > 0;

  // 计算实际canvas高度（用于预览容器的aspectRatio）
  const actualCanvasHeight = useMemo(() => {
    const gap = CANVAS_WIDTH * 0.01;
    const totalGapWidth = gap * (GRID_COLS - 1);
    const totalGapHeight = gap * (gridRowsAndCells.rows - 1);
    const availableWidth = CANVAS_WIDTH - totalGapWidth;
    
    let cellWidth: number;
    let cellHeight: number;
    
    if (imageInfoSettings.imageSizePreset === "square") {
      cellWidth = availableWidth / GRID_COLS;
      cellHeight = cellWidth; // 正方形
    } else {
      cellWidth = availableWidth / GRID_COLS;
      cellHeight = cellWidth * 5 / 4; // 4:5比例
    }
    
    const gridTotalHeight = gridRowsAndCells.rows * cellHeight + totalGapHeight;
    return TOP_INFO_HEIGHT + gridTotalHeight;
  }, [imageInfoSettings.imageSizePreset, gridRowsAndCells.rows]);

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
          console.warn("[MonthlySingleTemplateDesigner] 无法加载用户昵称：", error);
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

  // 自动填充功能：打开模板或切换日期时，自动填充空位
  useEffect(() => {
    if (!open || !hasArtworks) {
      return;
    }

    let cancelled = false;

    const autoFillImages = async () => {
      const { totalCells } = gridRowsAndCells;
      const currentGrid = gridImagesRef.current;

      // 获取当前状态
      const fillTasks: Array<{ position: number; artwork: Artwork }> = [];

      // 遍历所有位置
      for (let position = 0; position < totalCells; position++) {
        // 跳过占位符位置
        if (placeholderPositions.includes(position)) {
          continue;
        }

        // 只填充空位
        const currentImage = currentGrid[position];
        if (currentImage?.artworkId) {
          continue;
        }

        // 获取符合条件的图片
        const filtered = getFilteredArtworks(position);
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
          fillTasks.push({ position, artwork: firstArtwork });
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
            console.warn(`[MonthlySingleTemplateDesigner] 自动填充位置 ${position} 失败:`, error);
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
  }, [open, hasArtworks, monthDate, artworks, placeholderPositions, gridRowsAndCells]);

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
        console.warn("[MonthlySingleTemplateDesigner] Failed to load tag options:", error);
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

  // 计算月份信息和占位符位置
  const monthInfo = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    const monthName = `${month}月`;
    const yearStr = String(year);

    return {
      month: monthName,
      year: yearStr,
    };
  }, [monthDate]);

  // 计算占位符位置（使用动态计算的行数）
  const placeholderPositions = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    
    // 获取月份第一天
    const firstDay = new Date(year, month, 1);
    // 获取月份最后一天
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // 获取第一天是星期几（0=周日，1=周一，...，6=周六）
    const firstDayWeekday = firstDay.getDay();
    // 转换为周一为0的格式（0=周一，1=周二，...，6=周日）
    const firstDayMondayIndex = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1;
    
    // 获取最后一天是星期几
    const lastDayWeekday = lastDay.getDay();
    // 转换为周一为0的格式
    const lastDayMondayIndex = lastDayWeekday === 0 ? 6 : lastDayWeekday - 1;
    
    // 计算开头占位符数量（从周一到第一天之间的天数）
    const leadingPlaceholders = firstDayMondayIndex;
    
    // 计算结尾占位符数量（从最后一天到周日之间的天数）
    const trailingPlaceholders = 6 - lastDayMondayIndex;
    
    const positions: number[] = [];
    
    // 添加开头占位符（从0开始）
    for (let i = 0; i < leadingPlaceholders; i++) {
      positions.push(i);
    }
    
    // 添加结尾占位符
    if (trailingPlaceholders > 0) {
      // 计算总天数（开头占位符 + 月份天数）
      const totalDays = leadingPlaceholders + daysInMonth;
      // 计算需要多少行（每行7列）
      const totalRows = Math.ceil(totalDays / GRID_COLS);
      // 计算总格子数
      const totalCells = totalRows * GRID_COLS;
      // 结尾占位符从总格子数减去结尾占位符数量开始
      const trailingStart = totalCells - trailingPlaceholders;
      // 确保trailingStart不为负数
      const actualTrailingStart = Math.max(0, trailingStart);
      const actualTrailingPlaceholders = Math.min(trailingPlaceholders, totalCells - actualTrailingStart);
      for (let i = actualTrailingStart; i < actualTrailingStart + actualTrailingPlaceholders; i++) {
        if (i < totalCells) {
          positions.push(i);
        }
      }
    }
    
    return positions;
  }, [monthDate]);

  const templateData = useMemo<TemplateViewModel | null>(() => {
    if (!selectedArtwork) {
      return null;
    }

    const meta = composeMetaLabels(selectedArtwork, {
      showDate: false,
      showDuration: true,
    });
    const durationLabel = meta.durationLabel || "";

    // 获取用户名
    let displayUsername = contentState.showUsername ? normalizeUsername(contentState.username) : "";
    if (displayUsername && contentState.addSuffix) {
      const baseName = displayUsername.startsWith("@") ? displayUsername.slice(1) : displayUsername;
      displayUsername = `${baseName}@EchoDraw`;
    }

    return {
      durationLabel,
      overlayOpacity: 0, // 不再使用
      durationTagShow: imageInfoSettings.showDurationTag,
      durationTagOpacity: 0.8, // 固定透明度为80%
      monthInfo,
      username: displayUsername,
    };
  }, [
    selectedArtwork,
    imageInfoSettings.showDurationTag,
    monthInfo,
    contentState,
  ]);

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

    // 先计算实际需要的canvas高度
    const gap = CANVAS_WIDTH * 0.01;
    const totalGapWidth = gap * (GRID_COLS - 1);
    const totalGapHeight = gap * (gridRowsAndCells.rows - 1);
    const availableWidth = CANVAS_WIDTH - totalGapWidth;
    
    let cellWidth: number;
    let cellHeight: number;
    
    if (imageInfoSettings.imageSizePreset === "square") {
      // 正方形：cellWidth = cellHeight，基于宽度计算，确保是正方形
      cellWidth = availableWidth / GRID_COLS;
      cellHeight = cellWidth; // 强制正方形
    } else {
      // 长方形：cellWidth : cellHeight = 1080 : 1350 = 4 : 5
      cellWidth = availableWidth / GRID_COLS;
      cellHeight = cellWidth * 5 / 4; // 保持4:5比例
    }
    
    // 计算实际需要的总高度：顶部信息 + 网格高度
    const gridTotalHeight = gridRowsAndCells.rows * cellHeight + totalGapHeight;
    const actualCanvasHeight = TOP_INFO_HEIGHT + gridTotalHeight;
    
    if (canvas.width !== CANVAS_WIDTH || canvas.height !== actualCanvasHeight) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = actualCanvasHeight;
    }

    const draw = () => {
      // 使用计算出的实际高度
      drawTemplate(
        context,
        CANVAS_WIDTH,
        actualCanvasHeight,
        templateData,
        gridImages,
        placeholderPositions,
        monthDate,
        imageInfoSettings.imageSizePreset,
        artworks,
        gridRowsAndCells.rows,
      );
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setTimeout(draw, 50);
      });
    } else {
      setTimeout(draw, 150);
    }
  }, [gridImages, open, templateData, placeholderPositions, monthDate, imageInfoSettings.imageSizePreset, gridRowsAndCells.rows, artworks]);

  // 根据格子位置计算对应的日期（用于图片选择器）
  const getFilteredArtworks = (position: number): Artwork[] => {
    // 如果是占位符位置，返回空数组
    if (placeholderPositions.includes(position)) {
      return [];
    }
    
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstDayWeekday = firstDay.getDay();
    const firstDayMondayIndex = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1;
    
    // 计算这个位置对应的日期
    const dayOffset = position - firstDayMondayIndex;
    if (dayOffset < 0) {
      return [];
    }
    
    const targetDate = new Date(year, month, dayOffset + 1);
    const lastDay = new Date(year, month + 1, 0);
    if (targetDate > lastDay) {
      return [];
    }
    
    const targetDateStr = formatISODateInShanghai(targetDate);
    if (!targetDateStr) return [];
    return artworks.filter((artwork) => {
      const artworkDate = resolveArtworkDate(artwork);
      if (!artworkDate) return false;
      const artworkDateStr = formatISODateInShanghai(artworkDate);
      if (!artworkDateStr) return false;
      return artworkDateStr === targetDateStr;
    });
  };

  const getPickerTitle = (position: number): string => {
    if (placeholderPositions.includes(position)) {
      return "选择图片";
    }
    
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const firstDayWeekday = firstDay.getDay();
    const firstDayMondayIndex = firstDayWeekday === 0 ? 6 : firstDayWeekday - 1;
    
    const dayOffset = position - firstDayMondayIndex;
    if (dayOffset < 0) {
      return "选择图片";
    }
    
    const targetDate = new Date(year, month, dayOffset + 1);
    const lastDay = new Date(year, month + 1, 0);
    if (targetDate > lastDay) {
      return "选择图片";
    }
    
    const monthNum = targetDate.getMonth() + 1;
    const day = targetDate.getDate();
    return `选择图片 - ${monthNum}月${day}日`;
  };

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

      // 计算实际需要的canvas高度（和绘制时一样）
      const gap = CANVAS_WIDTH * 0.01;
      const totalGapWidth = gap * (GRID_COLS - 1);
      const totalGapHeight = gap * (gridRowsAndCells.rows - 1);
      const availableWidth = CANVAS_WIDTH - totalGapWidth;
      
      let exportCellWidth: number;
      let exportCellHeight: number;
      
      if (imageInfoSettings.imageSizePreset === "square") {
        // 正方形：cellWidth = cellHeight，基于宽度计算，确保是正方形
        exportCellWidth = availableWidth / GRID_COLS;
        exportCellHeight = exportCellWidth; // 强制正方形
      } else {
        // 长方形：cellWidth : cellHeight = 1080 : 1350 = 4 : 5
        exportCellWidth = availableWidth / GRID_COLS;
        exportCellHeight = exportCellWidth * 5 / 4; // 保持4:5比例
      }
      
      const gridTotalHeight = gridRowsAndCells.rows * exportCellHeight + totalGapHeight;
      const actualCanvasHeight = TOP_INFO_HEIGHT + gridTotalHeight;

      // 创建一个新的 canvas 用于导出，避免污染原始 canvas
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = CANVAS_WIDTH;
      exportCanvas.height = actualCanvasHeight;
      const exportContext = exportCanvas.getContext("2d");
      
      if (!exportContext) {
        throw new Error("无法创建导出 canvas");
      }

      // 在新 canvas 上绘制，使用重新加载的图片
      await new Promise<void>((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            setTimeout(() => {
              drawTemplate(exportContext, CANVAS_WIDTH, actualCanvasHeight, templateData, reloadedGridImages, placeholderPositions, monthDate, imageInfoSettings.imageSizePreset, artworks, gridRowsAndCells.rows);
              resolve();
            }, 50);
          });
        } else {
          setTimeout(() => {
            drawTemplate(exportContext, CANVAS_WIDTH, actualCanvasHeight, templateData, reloadedGridImages, placeholderPositions, monthDate, imageInfoSettings.imageSizePreset, artworks, gridRowsAndCells.rows);
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
                {(() => {
                  // 计算每个格子的尺寸（用于裁剪）
                  const gap = CANVAS_WIDTH * 0.01; // 1%的间隙
                  const totalGapWidth = gap * (GRID_COLS - 1);
                  const totalGapHeight = gap * (gridRowsAndCells.rows - 1);
                  const canvasHeight = imageInfoSettings.imageSizePreset === "square" ? CANVAS_HEIGHT_SQUARE : CANVAS_HEIGHT_RECTANGLE;
                  
                  let cellWidth: number;
                  let cellHeight: number;
                  
                  if (imageInfoSettings.imageSizePreset === "square") {
                    const maxCellWidth = (CANVAS_WIDTH - totalGapWidth) / GRID_COLS;
                    const maxCellHeight = (canvasHeight - totalGapHeight) / gridRowsAndCells.rows;
                    const targetSize = Math.min(maxCellWidth, maxCellHeight);
                    cellWidth = targetSize;
                    cellHeight = targetSize;
                  } else {
                    const maxCellWidth = (CANVAS_WIDTH - totalGapWidth) / GRID_COLS;
                    const maxCellHeight = (canvasHeight - totalGapHeight) / gridRowsAndCells.rows;
                    const aspectRatio = 5 / 4; // 长方形宽高比
                    const widthBased = maxCellWidth;
                    const heightBased = maxCellHeight / aspectRatio;
                    const targetWidth = Math.min(widthBased, heightBased);
                    cellWidth = targetWidth;
                    cellHeight = targetWidth * aspectRatio;
                  }
                  
                  return (
                    <ImageGridSelector
                      gridImages={gridImages}
                      artworks={artworks}
                      placeholderPositions={placeholderPositions}
                      placeholderLabels={Object.fromEntries(placeholderPositions.map((pos) => [pos, "EchoDraw"]))}
                      onImageChange={setGridImages}
                      getFilteredArtworks={getFilteredArtworks}
                      getPickerTitle={getPickerTitle}
                      enableCrop={true}
                      targetWidth={Math.floor(cellWidth)}
                      targetHeight={Math.floor(cellHeight)}
                    />
                  );
                })()}

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>月份信息设置</h3>
                  </div>
                  <div className="single-template-designer__field-row">
                    <label>
                      <span>选择月份</span>
                      <input
                        type="month"
                        value={`${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`}
                        onChange={(e) => {
                          const [year, month] = e.target.value.split("-").map(Number);
                          if (!isNaN(year) && !isNaN(month)) {
                            setMonthDate(new Date(year, month - 1, 1));
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: 8, padding: "0.5rem", background: "rgba(255,255,255,0.05)", borderRadius: "0.5rem" }}>
                    <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", margin: 0 }}>
                      {monthInfo.year}年 {monthInfo.month}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", margin: "0.25rem 0 0" }}>
                      占位符位置: {placeholderPositions.length} 个
                    </p>
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
        title="月报图片"
      />
    </>
  );
}

export default MonthlySingleTemplateDesigner;

// 以下函数与单周模版相同，直接复用
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
    console.warn("[MonthlySingleTemplateDesigner] 无法获取用户昵称配置：", error);
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

// Canvas绘制函数
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

function drawTemplate(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TemplateViewModel,
  gridImages: GridImage[],
  placeholderPositions: number[],
  _monthDate: Date,
  imageSizePreset: ImageSizePreset,
  artworks: Artwork[],
  rows: number, // 动态行数
) {
  context.save();
  context.clearRect(0, 0, width, height);

  drawCanvasBackground(context, width, height);

  // 绘制顶部年月信息
  drawMonthInfo(context, width, TOP_INFO_HEIGHT, data);

  const gap = width * 0.01;
  const totalGapWidth = gap * (GRID_COLS - 1);
  const totalGapHeight = gap * (rows - 1);
  
  // 根据选择的尺寸计算cell尺寸
  let cellWidth: number;
  let cellHeight: number;
  
  if (imageSizePreset === "square") {
    // 正方形：cellWidth = cellHeight，基于宽度计算，确保是正方形
    cellWidth = (width - totalGapWidth) / GRID_COLS;
    cellHeight = cellWidth; // 强制正方形
  } else {
    // 长方形：cellWidth : cellHeight = 1080 : 1350 = 4 : 5
    cellWidth = (width - totalGapWidth) / GRID_COLS;
    cellHeight = cellWidth * 5 / 4; // 保持4:5比例
  }

  // 动态行数列网格位置映射（一周7天，rows行）
  const gridPositions = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const index = row * GRID_COLS + col;
      gridPositions.push({ row, col, index });
    }
  }

  gridPositions.forEach(({ row, col, index }) => {
    const x = col * (cellWidth + gap);
    const y = TOP_INFO_HEIGHT + row * (cellHeight + gap); // 从顶部信息下方开始绘制
    
    if (placeholderPositions.includes(index)) {
      // 占位符位置
      drawEchoDraw(context, x, y, cellWidth, cellHeight, data);
    } else {
      // 图片位置
      const gridImage = gridImages[index];
      const imageToDraw = gridImage?.image || null;
      const artwork = gridImage?.artworkId ? artworks.find(a => a.id === gridImage.artworkId) ?? null : null;
      // 计算 row：index / GRID_COLS 向下取整
      const row = Math.floor(index / GRID_COLS);
      drawImageCell(context, x, y, cellWidth, cellHeight, imageToDraw, artwork, gap, data.durationTagShow, data.durationTagOpacity);
    }
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
) {
  const padding = width * 0.02;
  const cellX = x + padding;
  const cellY = y + padding;
  const cellWidth = width - padding * 2;
  const cellHeight = height - padding * 2;

  // 单月模板不需要圆角，直接绘制矩形
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

  if (!image || image.width === 0 || image.height === 0) {
    // 没有图片时，绘制和占位符一样的样式，包括EchoDraw字样（不需要圆角）
    context.strokeStyle = "#98dbc6";
    context.lineWidth = 1;
    context.strokeRect(cellX, cellY, cellWidth, cellHeight);
    
    context.fillStyle = "#2a2525";
    context.fillRect(cellX, cellY, cellWidth, cellHeight);
    
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

    // 绘制EchoDraw字样（和占位符一样）
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
  
  // 在图片下方间距（gap）中绘制时长，右对齐
  // 注意：这里使用 cell 的坐标（x, y, width, height），而不是图片坐标（cellX, cellY）
  // gap 是函数参数，已经在函数签名中定义
  if (showDuration && image && image.width > 0 && image.height > 0 && artwork) {
    const durationMinutes = artwork.durationMinutes;
    if (durationMinutes && durationMinutes > 0) {
      const durationText = formatDurationForTemplate(durationMinutes);
      const fontSize = Math.round(width * 0.04); // 增大字体，基于cell宽度
      const textPadding = width * 0.02; // 距离右边缘的padding
      // 图片的实际底部是 cellY + cellHeight = y + padding + (height - padding * 2) = y + height - padding
      // cell 的底部是 y + height
      // gap 在 y + height 到 y + height + gap 之间
      // 所以要在图片下方，应该在 y + height + gap * 0.5（gap中间，肯定在图片外部）
      const padding = width * 0.02; // 和图片的 padding 一致
      const textY = y + height + Math.max(gap * 0.5, padding); // 在cell下方，gap中间位置，但至少距离cell底部padding距离（肯定在图片外部）
      const textX = x + width - textPadding; // cell右下角X位置，右对齐
      
      context.save();
      context.font = `400 ${fontSize}px "Manrope", "Segoe UI", sans-serif`;
      const opacity = clamp01(durationTagOpacity);
      context.fillStyle = `rgba(152, 219, 198, ${opacity})`; // 薄荷绿色，使用透明度
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(durationText, textX, textY);
      context.restore();
    }
  }
}


// 绘制顶部年月信息
function drawMonthInfo(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TemplateViewModel,
) {
  context.save();
  // 深棕灰色背景，与整体背景一致
  context.fillStyle = "#2a2525";
  context.fillRect(0, 0, width, height);

  const paddingX = width * 0.02; // 减小左边距，让年月信息更靠近左边边缘
  const contentX = paddingX;
  
  // 署名距离底部的padding（年月信息到第一行图片的距离应该和这个一样）
  const usernamePadding = Math.round(width * 0.01);
  
  // 年月信息应该从顶部开始，留出顶部空间
  const topPadding = Math.round(width * 0.02); // 顶部留出空间
  const contentY = topPadding;

  context.textAlign = "left";
  context.textBaseline = "alphabetic";

  const yearText = data.monthInfo.year;
  const monthText = data.monthInfo.month;
  // 分离数字和"月"字
  const monthMatch = monthText.match(/^(\d+)(月)$/);
  const monthNumber = monthMatch ? monthMatch[1] : monthText.replace("月", "");
  
  // 使用固定的字体大小，基于宽度，稍微缩小一点
  const baseFontSize = width * 0.1; // 从0.12缩小到0.1
  const yearFontSize = Math.round(baseFontSize); // 年份数字
  const dotFontSize = Math.round(baseFontSize); // 点号，和年份一样大
  const monthFontSize = Math.round(baseFontSize); // 月份数字，和年份一样大
  
  context.fillStyle = "#98dbc6";
  
  // 计算年月信息的基线位置
  // 年月信息距离第一行图片的距离应该和署名距离底部的距离一样（都是usernamePadding）
  // 对于alphabetic baseline，文字的底部大约在baseLineY + fontSize * 0.25的位置
  // 所以：height - (baseLineY + yearFontSize * 0.25) = usernamePadding
  // 即：baseLineY = height - usernamePadding - yearFontSize * 0.25
  // 但也要确保年月信息有顶部空间，所以baseLineY应该 >= contentY + yearFontSize * 0.8
  const targetBaseLineY = height - usernamePadding - Math.round(yearFontSize * 0.25); // 目标位置：距离底部和署名一样
  const minBaseLineY = contentY + Math.round(yearFontSize * 0.8); // 最小位置：确保顶部有空间
  const baseLineY = Math.max(minBaseLineY, targetBaseLineY); // 取两者中的较大值，确保既有顶部空间，又距离底部和署名一样
  
  // 绘制年份数字
  context.font = `600 ${yearFontSize}px "Ethereal", "Manrope", "Segoe UI", sans-serif`;
  context.fillText(yearText, contentX, baseLineY);
  const yearWidth = context.measureText(yearText).width;
  
  // 绘制点号
  const dotX = contentX + yearWidth + Math.round(width * 0.005); // 减小间距
  const dotY = baseLineY;
  context.font = `400 ${dotFontSize}px "Ethereal", "Manrope", "Segoe UI", sans-serif`;
  context.fillText(".", dotX, dotY);
  const dotWidth = context.measureText(".").width;
  
  // 绘制月份数字（和年份一样大）
  const monthX = dotX + dotWidth + Math.round(width * 0.005); // 减小间距
  const monthY = baseLineY; // 和年份使用相同的基线
  context.font = `600 ${monthFontSize}px "Ethereal", "Manrope", "Segoe UI", sans-serif`;
  context.fillText(monthNumber, monthX, monthY);

  // 在格子右下角添加用户署名（小很多，并且贴边）
  if (data.username) {
    const usernameFontSize = Math.round(width * 0.025); // 减小字体
    const usernamePadding = Math.round(width * 0.01); // 减小padding，更贴边
    const usernameX = width - usernamePadding; // 贴右边
    const usernameY = height - usernamePadding; // 贴底边
    
    // 保存当前状态
    context.save();
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.font = `400 ${usernameFontSize}px "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle = "rgba(152, 219, 198, 0.6)"; // 稍微透明的颜色
    context.fillText(data.username, usernameX, usernameY);
    context.restore();
  }

  context.restore();
}

function drawEchoDraw(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  _data: TemplateViewModel,
) {
  context.save();
  context.fillStyle = "#2a2525";
  context.fillRect(x, y, width, height);

  const padding = width * 0.02;
  const cellX = x + padding;
  const cellY = y + padding;
  const cellWidth = width - padding * 2;
  const cellHeight = height - padding * 2;

  // 单月模板不需要圆角
  context.strokeStyle = "#98dbc6";
  context.lineWidth = 1;
  context.strokeRect(cellX, cellY, cellWidth, cellHeight);

  context.fillStyle = "#2a2525";
  context.fillRect(cellX, cellY, cellWidth, cellHeight);

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

  context.restore();
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

