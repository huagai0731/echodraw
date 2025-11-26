import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import ImageCropper, { type CropData } from "@/components/ImageCropper";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";
import { getOrLoadImage } from "@/utils/imageCache";
// import { formatISODateInShanghai, parseISODateInShanghai } from "@/utils/dateUtils"; // 未使用

import "./SingleArtworkTemplateDesigner.css";

type TimeJumpComparisonTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type TemplateViewModel = {
  leftImage: HTMLImageElement | null;
  rightImage: HTMLImageElement | null;
  leftArtwork: Artwork | null;
  rightArtwork: Artwork | null;
  comparison: {
    daysDiff: number;
    daysLabel: string;
    artworksDiff: number;
    artworksLabel: string;
    durationDiff: number;
    durationLabel: string;
  };
  username: string;
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1080;
const DEFAULT_USERNAME = "@EchoUser";
const IMAGE_PADDING = CANVAS_WIDTH * 0.02;
const GAP_WIDTH = CANVAS_WIDTH * 0.03; // 中间分隔区域宽度

function TimeJumpComparisonTemplateDesigner({ open, artworks, onClose }: TimeJumpComparisonTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [leftArtworkId, setLeftArtworkId] = useState<string | null>(null);
  const [rightArtworkId, setRightArtworkId] = useState<string | null>(null);
  const [leftImage, setLeftImage] = useState<HTMLImageElement | null>(null);
  const [rightImage, setRightImage] = useState<HTMLImageElement | null>(null);
  const [leftImageStatus, setLeftImageStatus] = useState<ImageStatus>("idle");
  const [rightImageStatus, setRightImageStatus] = useState<ImageStatus>("idle");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const [leftCropData, setLeftCropData] = useState<CropData | null>(null);
  const [rightCropData, setRightCropData] = useState<CropData | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [croppingSide, setCroppingSide] = useState<"left" | "right" | null>(null);

  const hasArtworks = artworks.length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!hasArtworks) {
      return;
    }

    // 默认选择前两张作品
    setLeftArtworkId((prev) => {
      if (prev && artworks.some((item) => item.id === prev)) {
        return prev;
      }
      return artworks[0]?.id ?? null;
    });
    setRightArtworkId((prev) => {
      if (prev && artworks.some((item) => item.id === prev)) {
        return prev;
      }
      return artworks.length > 1 ? artworks[1]?.id ?? null : artworks[0]?.id ?? null;
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
          console.warn("[TimeJumpComparisonTemplateDesigner] 无法加载用户昵称：", error);
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
      setCropperOpen(false);
      setCroppingSide(null);
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

  const leftArtwork = useMemo(() => {
    if (!leftArtworkId) return null;
    return artworks.find((item) => item.id === leftArtworkId) ?? null;
  }, [artworks, leftArtworkId]);

  const rightArtwork = useMemo(() => {
    if (!rightArtworkId) return null;
    return artworks.find((item) => item.id === rightArtworkId) ?? null;
  }, [artworks, rightArtworkId]);

  // 加载左侧图片
  useEffect(() => {
    if (!open || !leftArtwork) {
      setLeftImage(null);
      setLeftImageStatus("idle");
      return;
    }
    setLeftImageStatus("loading");
    getOrLoadImage(leftArtwork.imageSrc)
      .then((img) => {
        setLeftImage(img);
        setLeftImageStatus("ready");
      })
      .catch(() => {
        setLeftImage(null);
        setLeftImageStatus("error");
      });
  }, [open, leftArtwork]);

  // 加载右侧图片
  useEffect(() => {
    if (!open || !rightArtwork) {
      setRightImage(null);
      setRightImageStatus("idle");
      return;
    }
    setRightImageStatus("loading");
    getOrLoadImage(rightArtwork.imageSrc)
      .then((img) => {
        setRightImage(img);
        setRightImageStatus("ready");
      })
      .catch(() => {
        setRightImage(null);
        setRightImageStatus("error");
      });
  }, [open, rightArtwork]);

  // 计算对比数据
  const comparison = useMemo(() => {
    if (!leftArtwork || !rightArtwork) {
      return {
        daysDiff: 0,
        daysLabel: "0天",
        artworksDiff: 0,
        artworksLabel: "0张",
        durationDiff: 0,
        durationLabel: "0h",
      };
    }

    // 计算日期差
    const leftDate = resolveArtworkDate(leftArtwork);
    const rightDate = resolveArtworkDate(rightArtwork);
    let daysDiff = 0;
    if (leftDate && rightDate) {
      const diffTime = rightDate.getTime() - leftDate.getTime();
      daysDiff = Math.round(diffTime / (1000 * 60 * 60 * 24));
    }
    const daysLabel = daysDiff > 0 ? `${daysDiff}天后` : daysDiff < 0 ? `${Math.abs(daysDiff)}天前` : "同一天";

    // 计算作品数差（在两张图之间的时间段内）
    let artworksDiff = 0;
    if (leftDate && rightDate) {
      const startDate = leftDate < rightDate ? leftDate : rightDate;
      const endDate = leftDate < rightDate ? rightDate : leftDate;
      artworksDiff = artworks.filter((artwork) => {
        const artworkDate = resolveArtworkDate(artwork);
        if (!artworkDate) return false;
        return artworkDate >= startDate && artworkDate <= endDate;
      }).length;
    }
    const artworksLabel = `${artworksDiff}张`;

    // 计算总时长差（在两张图之间的时间段内）
    let durationDiff = 0;
    if (leftDate && rightDate) {
      const startDate = leftDate < rightDate ? leftDate : rightDate;
      const endDate = leftDate < rightDate ? rightDate : leftDate;
      durationDiff = artworks
        .filter((artwork) => {
          const artworkDate = resolveArtworkDate(artwork);
          if (!artworkDate) return false;
          return artworkDate >= startDate && artworkDate <= endDate;
        })
        .reduce((sum, artwork) => {
          const minutes = artwork.durationMinutes ?? 0;
          return sum + minutes;
        }, 0);
    }
    const hours = Math.floor(durationDiff / 60);
    const minutes = durationDiff % 60;
    const durationLabel = hours > 0 ? `${hours}h${minutes > 0 ? `${minutes}m` : ""}` : `${minutes}m`;

    return {
      daysDiff,
      daysLabel,
      artworksDiff,
      artworksLabel,
      durationDiff,
      durationLabel,
    };
  }, [leftArtwork, rightArtwork, artworks]);

  const templateData = useMemo<TemplateViewModel | null>(() => {
    if (!leftArtwork || !rightArtwork) {
      return null;
    }

    return {
      leftImage,
      rightImage,
      leftArtwork,
      rightArtwork,
      comparison,
      username,
    };
  }, [leftImage, rightImage, leftArtwork, rightArtwork, comparison, username]);

  const downloadDisabled = !templateData || leftImageStatus === "loading" || rightImageStatus === "loading";

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

    if (canvas.width !== CANVAS_WIDTH || canvas.height !== CANVAS_HEIGHT) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
    }

    const draw = () => {
      drawTemplate(context, CANVAS_WIDTH, CANVAS_HEIGHT, templateData, leftCropData, rightCropData);
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        setTimeout(draw, 50);
      });
    } else {
      setTimeout(draw, 150);
    }
  }, [templateData, open, leftCropData, rightCropData]);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !templateData) {
      return;
    }

    try {
      // 重新加载图片以确保使用blob URL
      const reloadedLeftImage = leftArtwork
        ? await reloadImageForExport(leftArtwork.imageSrc)
        : null;
      const reloadedRightImage = rightArtwork
        ? await reloadImageForExport(rightArtwork.imageSrc)
        : null;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = CANVAS_WIDTH;
      exportCanvas.height = CANVAS_HEIGHT;
      const exportContext = exportCanvas.getContext("2d");

      if (!exportContext) {
        throw new Error("无法创建导出 canvas");
      }

      const exportTemplateData: TemplateViewModel = {
        ...templateData,
        leftImage: reloadedLeftImage,
        rightImage: reloadedRightImage,
      };

      await new Promise<void>((resolve) => {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => {
            setTimeout(() => {
              drawTemplate(exportContext, CANVAS_WIDTH, CANVAS_HEIGHT, exportTemplateData, leftCropData, rightCropData);
              resolve();
            }, 50);
          });
        } else {
          setTimeout(() => {
            drawTemplate(exportContext, CANVAS_WIDTH, CANVAS_HEIGHT, exportTemplateData, leftCropData, rightCropData);
            resolve();
          }, 150);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      const dataURL = exportCanvas.toDataURL("image/png");
      setPreviewImageUrl(dataURL);
      setShowPreviewModal(true);
    } catch (error) {
      console.error("生成图片失败:", error);
      if (error instanceof Error && (error.message.includes("Tainted") || error.message.includes("SecurityError") || error.message.includes("CORS"))) {
        alert("导出失败：图片跨域限制。请确保图片服务器允许跨域访问（CORS）。");
      } else {
        alert("生成图片失败，请稍后重试");
      }
    }
  };

  const _handleImageSelect = (side: "left" | "right", artworkId: string) => {
    if (side === "left") {
      setLeftArtworkId(artworkId);
    } else {
      setRightArtworkId(artworkId);
    }
  };

  const handleCrop = (side: "left" | "right") => {
    setCroppingSide(side);
    setCropperOpen(true);
  };

  const handleCropComplete = (cropData: CropData) => {
    if (croppingSide === "left") {
      setLeftCropData(cropData);
    } else {
      setRightCropData(cropData);
    }
    setCropperOpen(false);
    setCroppingSide(null);
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
            title="时间跳点对比"
            subtitle="Time Jump Comparison"
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
                    style={{ aspectRatio: CANVAS_WIDTH / CANVAS_HEIGHT }}
                  >
                    <canvas ref={canvasRef} className="single-template-designer__canvas" />
                    {(leftImageStatus === "loading" || rightImageStatus === "loading") ? (
                      <div className="single-template-designer__status">正在加载作品…</div>
                    ) : null}
                    {(leftImageStatus === "error" || rightImageStatus === "error") ? (
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
                    <h3>左侧图片</h3>
                  </div>
                  <div className="single-template-designer__field-row">
                    <select
                      value={leftArtworkId || ""}
                      onChange={(e) => setLeftArtworkId(e.target.value || null)}
                      className="single-template-designer__select"
                    >
                      <option value="">选择作品</option>
                      {artworks.map((artwork) => (
                        <option key={artwork.id} value={artwork.id}>
                          {artwork.title || "未命名"} - {formatArtworkDate(artwork)}
                        </option>
                      ))}
                    </select>
                    {leftArtwork && (
                      <button
                        type="button"
                        className="single-template-designer__button"
                        onClick={() => handleCrop("left")}
                      >
                        <MaterialIcon name="crop" />
                        裁剪
                      </button>
                    )}
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>右侧图片</h3>
                  </div>
                  <div className="single-template-designer__field-row">
                    <select
                      value={rightArtworkId || ""}
                      onChange={(e) => setRightArtworkId(e.target.value || null)}
                      className="single-template-designer__select"
                    >
                      <option value="">选择作品</option>
                      {artworks.map((artwork) => (
                        <option key={artwork.id} value={artwork.id}>
                          {artwork.title || "未命名"} - {formatArtworkDate(artwork)}
                        </option>
                      ))}
                    </select>
                    {rightArtwork && (
                      <button
                        type="button"
                        className="single-template-designer__button"
                        onClick={() => handleCrop("right")}
                      >
                        <MaterialIcon name="crop" />
                        裁剪
                      </button>
                    )}
                  </div>
                </div>

                {templateData && (
                  <div className="single-template-designer__group">
                    <div className="single-template-designer__group-header">
                      <h3>对比信息</h3>
                    </div>
                    <div className="single-template-designer__field-row" style={{ flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                        <span>时间间隔：</span>
                        <strong>{comparison.daysLabel}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                        <span>作品数量：</span>
                        <strong>{comparison.artworksLabel}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                        <span>总绘画时长：</span>
                        <strong>{comparison.durationLabel}</strong>
                      </div>
                    </div>
                  </div>
                )}

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
                  <p>导出 PNG · {CANVAS_WIDTH} × {CANVAS_HEIGHT} 像素 · 适配社交媒体展示。</p>
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

      {cropperOpen && croppingSide && (croppingSide === "left" ? leftArtwork : rightArtwork) && (
        <ImageCropper
          open={cropperOpen}
          imageSrc={(croppingSide === "left" ? leftArtwork : rightArtwork)!.imageSrc}
          initialCrop={(croppingSide === "left" ? leftCropData : rightCropData) ?? undefined}
          onConfirm={handleCropComplete}
          onClose={() => {
            setCropperOpen(false);
            setCroppingSide(null);
          }}
          targetWidth={CANVAS_WIDTH * 0.45}
          targetHeight={CANVAS_HEIGHT * 0.9}
        />
      )}

      {showPreviewModal && previewImageUrl && (
        <ImagePreviewModal
          open={showPreviewModal}
          imageUrl={previewImageUrl}
          onClose={() => {
            setShowPreviewModal(false);
            setPreviewImageUrl(null);
          }}
        />
      )}
    </>
  );
}

export default TimeJumpComparisonTemplateDesigner;

// 辅助函数
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
    console.warn("[TimeJumpComparisonTemplateDesigner] 无法获取用户昵称配置：", error);
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

function formatArtworkDate(artwork: Artwork): string {
  const date = resolveArtworkDate(artwork);
  if (!date) return "未知日期";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

async function reloadImageForExport(imageSrc: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(imageSrc, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    return new Promise<HTMLImageElement>((resolve, reject) => {
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
  } catch (error) {
    console.error("加载图片失败:", error);
    return null;
  }
}

function drawTemplate(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TemplateViewModel,
  leftCropData: CropData | null,
  rightCropData: CropData | null,
) {
  context.save();
  context.clearRect(0, 0, width, height);

  // 绘制背景
  context.fillStyle = "#2a2525";
  context.fillRect(0, 0, width, height);

  // 计算左右图片区域
  const imagePadding = IMAGE_PADDING;
  const gapWidth = GAP_WIDTH;
  const availableWidth = width - imagePadding * 2 - gapWidth;
  const imageWidth = availableWidth / 2;
  const imageHeight = height - imagePadding * 2;

  const leftImageX = imagePadding;
  const rightImageX = imagePadding + imageWidth + gapWidth;
  const imageY = imagePadding;

  // 绘制左侧图片
  if (data.leftImage && data.leftImage.width > 0 && data.leftImage.height > 0) {
    drawImageWithCrop(
      context,
      data.leftImage,
      leftImageX,
      imageY,
      imageWidth,
      imageHeight,
      leftCropData,
    );
  } else {
    drawPlaceholder(context, leftImageX, imageY, imageWidth, imageHeight, "左侧图片");
  }

  // 绘制右侧图片
  if (data.rightImage && data.rightImage.width > 0 && data.rightImage.height > 0) {
    drawImageWithCrop(
      context,
      data.rightImage,
      rightImageX,
      imageY,
      imageWidth,
      imageHeight,
      rightCropData,
    );
  } else {
    drawPlaceholder(context, rightImageX, imageY, imageWidth, imageHeight, "右侧图片");
  }

  // 绘制中间对比信息区域
  const centerX = imagePadding + imageWidth + gapWidth / 2;
  drawComparisonInfo(context, centerX, imageY, gapWidth, imageHeight, data.comparison);

  // 绘制底部用户名
  if (data.username) {
    const usernameFontSize = Math.round(width * 0.025);
    const usernameY = height - imagePadding;
    context.save();
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.font = `400 ${usernameFontSize}px "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle = "rgba(152, 219, 198, 0.6)";
    context.fillText(data.username, width / 2, usernameY);
    context.restore();
  }

  context.restore();
}

function drawImageWithCrop(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  cropData: CropData | null,
) {
  context.save();

  const radius = width * 0.02;
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.clip();

  if (cropData) {
    // 使用裁剪数据
    const sourceX = cropData.x;
    const sourceY = cropData.y;
    const sourceWidth = cropData.width;
    const sourceHeight = cropData.height;

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height,
    );
  } else {
    // 不使用裁剪，按比例填充
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = x + (width - drawWidth) / 2;
    const dy = y + (height - drawHeight) / 2;
    context.drawImage(image, dx, dy, drawWidth, drawHeight);
  }

  context.restore();

  // 绘制边框
  context.strokeStyle = "rgba(152, 219, 198, 0.3)";
  context.lineWidth = 1;
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.stroke();
}

function drawPlaceholder(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
) {
  const radius = width * 0.02;
  context.save();

  // 绘制背景
  context.fillStyle = "#1a1515";
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.fill();

  // 绘制边框
  context.strokeStyle = "rgba(152, 219, 198, 0.3)";
  context.lineWidth = 1;
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.stroke();

  // 绘制占位文字
  const fontSize = Math.round(width * 0.06);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `400 ${fontSize}px "Manrope", "Segoe UI", sans-serif`;
  context.fillStyle = "rgba(152, 219, 198, 0.4)";
  context.fillText(label, x + width / 2, y + height / 2);

  context.restore();
}

function drawComparisonInfo(
  context: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  gapWidth: number,
  height: number,
  comparison: TemplateViewModel["comparison"],
) {
  context.save();

  // 计算信息区域
  const infoWidth = gapWidth * 0.8;
  const infoX = centerX - infoWidth / 2;
  const infoPadding = height * 0.05;
  const infoStartY = y + infoPadding;
  const infoEndY = y + height - infoPadding;
  const infoHeight = infoEndY - infoStartY;
  const itemHeight = infoHeight / 3;
  const itemSpacing = itemHeight * 0.1;

  // 绘制分隔线
  context.strokeStyle = "rgba(152, 219, 198, 0.2)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(centerX, y);
  context.lineTo(centerX, y + height);
  context.stroke();

  // 绘制三个对比项
  const items = [
    { label: "时间", value: comparison.daysLabel },
    { label: "作品", value: comparison.artworksLabel },
    { label: "时长", value: comparison.durationLabel },
  ];

  items.forEach((item, index) => {
    const itemY = infoStartY + index * (itemHeight + itemSpacing) + itemHeight / 2;

    // 绘制标签
    const labelFontSize = Math.round(gapWidth * 0.12);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `400 ${labelFontSize}px "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle = "rgba(152, 219, 198, 0.5)";
    context.fillText(item.label, centerX, itemY - labelFontSize * 0.4);

    // 绘制数值
    const valueFontSize = Math.round(gapWidth * 0.18);
    context.font = `600 ${valueFontSize}px "Ethereal", "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle = "#98dbc6";
    context.fillText(item.value, centerX, itemY + valueFontSize * 0.3);
  });

  context.restore();
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

