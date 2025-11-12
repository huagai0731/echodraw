import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";

import "./FourArtworkTemplateDesigner.css";

type FourArtworkTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type TemplateItem = {
  id: string;
  title: string;
  dateLabel: string;
  mood: string;
  durationLabel: string;
  tags: string[];
};

type TemplateViewModel = {
  username: string;
  dateRangeLabel: string;
  totalDurationLabel: string;
  tagCloud: string[];
  items: TemplateItem[];
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_SIZE = 1080;
const MAX_ITEMS = 4;
const DEFAULT_USERNAME = "@EchoUser";

function FourArtworkTemplateDesigner({ open, artworks, onClose }: FourArtworkTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});
  const [pickerOpen, setPickerOpen] = useState(false);

  const hasArtworks = artworks.length > 0;

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!hasArtworks) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds((prev) => {
      const valid = prev.filter((id) => artworks.some((item) => item.id === id)).slice(0, MAX_ITEMS);
      if (valid.length >= Math.min(MAX_ITEMS, artworks.length)) {
        return valid;
      }

      const needed: string[] = [];
      for (const artwork of artworks) {
        if (valid.includes(artwork.id)) {
          continue;
        }
        needed.push(artwork.id);
        if (valid.length + needed.length >= Math.min(MAX_ITEMS, artworks.length)) {
          break;
        }
      }
      return [...valid, ...needed];
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
          console.warn("[FourTemplateDesigner] 无法加载用户昵称：", error);
          setUsername(DEFAULT_USERNAME);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedArtworks = useMemo(() => {
    if (!hasArtworks) {
      return [];
    }
    return selectedIds
      .map((id) => artworks.find((item) => item.id === id) ?? null)
      .filter((item): item is Artwork => item !== null);
  }, [artworks, hasArtworks, selectedIds]);

  useEffect(() => {
    if (!open) {
      setLoadedImages({});
      setImageStatus("idle");
      return;
    }

    if (selectedArtworks.length === 0) {
      setLoadedImages({});
      setImageStatus("idle");
      return;
    }

    let isCancelled = false;
    setImageStatus("loading");

    const loaders = selectedArtworks.map(
      (artwork) =>
        new Promise<{ id: string; image: HTMLImageElement }>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          const handleLoad = () => resolve({ id: artwork.id, image: img });
          const handleError = () => reject(new Error(`Failed to load image ${artwork.id}`));
          img.addEventListener("load", handleLoad);
          img.addEventListener("error", handleError);
          img.src = artwork.imageSrc;
        }),
    );

    Promise.all(loaders)
      .then((results) => {
        if (isCancelled) {
          return;
        }
        const next: Record<string, HTMLImageElement> = {};
        results.forEach(({ id, image }) => {
          next[id] = image;
        });
        setLoadedImages(next);
        setImageStatus("ready");
      })
      .catch(() => {
        if (!isCancelled) {
          setLoadedImages({});
          setImageStatus("error");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open, selectedArtworks]);

  const templateData = useMemo<TemplateViewModel | null>(() => {
    if (selectedArtworks.length === 0) {
      return null;
    }

    const items = selectedArtworks.map<TemplateItem>((artwork) => ({
      id: artwork.id,
      title: artwork.title || "未命名",
      dateLabel: buildDateLabel(artwork),
      mood: artwork.mood?.trim() || "未知心情",
      durationLabel: buildDurationLabel(artwork),
      tags: buildTags(artwork.tags),
    }));

    const allDates = items
      .map((item) => parseDate(item.dateLabel.replace(/\./g, "-")))
      .filter((date): date is Date => date !== null);

    const dateRangeLabel = (() => {
      if (allDates.length === 0) {
        return "日期未知";
      }
      const sorted = allDates.sort((a, b) => a.getTime() - b.getTime());
      const start = sorted[0];
      const end = sorted[sorted.length - 1];
      if (start.getTime() === end.getTime()) {
        return formatDateLabel(start);
      }
      return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
    })();

    const totalDurationMinutes = selectedArtworks.reduce((acc, artwork) => {
      if (typeof artwork.durationMinutes === "number" && Number.isFinite(artwork.durationMinutes)) {
        return acc + Math.max(artwork.durationMinutes, 0);
      }
      const parsed = parseDurationString(artwork.duration);
      if (parsed !== null) {
        return acc + parsed;
      }
      return acc;
    }, 0);

    const totalDurationLabel =
      totalDurationMinutes > 0 ? formatDurationMinutes(totalDurationMinutes) : "00H00M";

    const tagCloud = buildTagCloud(items.flatMap((item) => item.tags));

    return {
      username: normalizeUsername(username),
      dateRangeLabel,
      totalDurationLabel,
      tagCloud,
      items,
    };
  }, [selectedArtworks, username]);

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

    if (canvas.width !== CANVAS_SIZE || canvas.height !== CANVAS_SIZE) {
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
    }

    drawTemplate(context, CANVAS_SIZE, templateData, loadedImages);
  }, [loadedImages, open, templateData]);

  const handleToggleSelection = (artworkId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(artworkId)) {
        return prev.filter((id) => id !== artworkId);
      }
      if (prev.length >= MAX_ITEMS) {
        const [, ...rest] = prev;
        return [...rest, artworkId];
      }
      return [...prev, artworkId];
    });
  };

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="quad-template-designer" role="dialog" aria-modal="true">
        <div className="quad-template-designer__backdrop" onClick={onClose} />
        <div className="quad-template-designer__panel">
          <div className="quad-template-designer__preview">
            <canvas ref={canvasRef} className="quad-template-designer__canvas" />

            {imageStatus === "loading" ? (
              <div className="quad-template-designer__status">正在加载作品…</div>
            ) : null}

            {imageStatus === "error" ? (
              <div className="quad-template-designer__status quad-template-designer__status--error">
                图片加载失败，请选择其他作品或稍后重试。
              </div>
            ) : null}
          </div>

          <aside className="quad-template-designer__sidebar">
            <div className="quad-template-designer__heading">
              <h2>四张图模板</h2>
              <p>挑选四幅已上传作品，生成两行两列的 EchoDraw 拼贴海报。</p>
            </div>

            {hasArtworks ? (
              <>
                <div className="quad-template-designer__group">
                  <h3>已选作品</h3>
                  <button
                    type="button"
                    className="quad-template-designer__selected"
                    onClick={() => setPickerOpen(true)}
                  >
                    <div className="quad-template-designer__selected-grid" aria-hidden="true">
                      {Array.from({ length: MAX_ITEMS }).map((_, index) => {
                        const artwork = selectedArtworks[index] ?? null;
                        if (!artwork) {
                          return <span key={index} className="quad-template-designer__slot-placeholder" />;
                        }
                        return (
                          <img
                            key={artwork.id}
                            src={artwork.imageSrc}
                            alt={artwork.alt}
                            loading="lazy"
                          />
                        );
                      })}
                    </div>
                    <div className="quad-template-designer__selected-info">
                      <span>当前选中 {selectedArtworks.length} / 4</span>
                      <h4>{selectedArtworks[0]?.title || "尚未选择作品"}</h4>
                      <p>点击更换或调整顺序（超出 4 张自动替换最早选择）</p>
                    </div>
                  </button>
                </div>

                <div className="quad-template-designer__actions">
                  <button
                    type="button"
                    className="quad-template-designer__download"
                    onClick={() => {
                      const canvas = canvasRef.current;
                      if (!canvas) {
                        return;
                      }
                      const link = document.createElement("a");
                      const timestamp = new Date();
                      const formatted = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}`;
                      link.download = `EchoDraw-quad-${formatted}.png`;
                      link.href = canvas.toDataURL("image/png");
                      link.click();
                    }}
                    disabled={!templateData || imageStatus === "loading"}
                  >
                    <MaterialIcon name="download" />
                    保存为图片
                  </button>
                  <p className="quad-template-designer__fineprint">
                    图片会以 PNG 格式下载，尺寸为 1080 × 1080 像素。
                  </p>
                </div>
              </>
            ) : (
              <div className="quad-template-designer__empty">
                <MaterialIcon name="photo_library" />
                <p>你还没有上传作品，无法生成模版。</p>
                <p>请先前往「画集」上传至少一张作品，再回来尝试。</p>
                <button type="button" onClick={onClose}>
                  好的
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>

      {pickerOpen && hasArtworks ? (
        <div className="quad-template-picker" role="dialog" aria-modal="true">
          <div className="quad-template-picker__backdrop" onClick={() => setPickerOpen(false)} />
          <div className="quad-template-picker__panel">
            <div className="quad-template-picker__header">
              <h3>选择作品（最多 4 张）</h3>
              <button
                type="button"
                className="quad-template-picker__close"
                aria-label="关闭作品选择"
                onClick={() => setPickerOpen(false)}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="quad-template-picker__grid" role="listbox" aria-label="可套用的作品">
              {artworks.map((artwork) => {
                const isActive = selectedIds.includes(artwork.id);
                const orderIndex = selectedIds.indexOf(artwork.id);
                return (
                  <button
                    key={artwork.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`quad-template-picker__item${isActive ? " quad-template-picker__item--active" : ""}`}
                    onClick={() => handleToggleSelection(artwork.id)}
                  >
                    <img src={artwork.imageSrc} alt={artwork.alt} loading="lazy" />
                    <span>{artwork.title || "未命名"}</span>
                    {isActive ? (
                      <span className="quad-template-picker__badge">{orderIndex + 1}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="quad-template-picker__hint">
              <p>再次点击已选作品可取消选择。超过 4 张时会替换最早选中的作品。</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default FourArtworkTemplateDesigner;

function buildTags(tags: string[]): string[] {
  const sanitized = Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .slice(0, 5),
    ),
  );
  const placeholders = ["Echo", "Mood", "Diary", "Creation", "Flow"];
  while (sanitized.length < 5) {
    sanitized.push(placeholders[sanitized.length % placeholders.length]);
  }
  return sanitized.slice(0, 5);
}

function buildTagCloud(tags: string[]): string[] {
  const sanitized = Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  );
  return sanitized.slice(0, 6);
}

function normalizeUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_USERNAME;
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
    console.warn("[FourTemplateDesigner] 无法获取用户昵称配置：", error);
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

function buildDateLabel(artwork: Artwork): string {
  const candidates = [artwork.uploadedAt, artwork.uploadedDate, artwork.date];
  for (const source of candidates) {
    const parsed = parseDate(source);
    if (parsed) {
      return formatDateLabel(parsed);
    }
  }
  return "日期未知";
}

function parseDate(source: string | null | undefined): Date | null {
  if (!source) {
    return null;
  }
  const direct = Date.parse(source);
  if (!Number.isNaN(direct)) {
    return new Date(direct);
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

function formatDateLabel(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function buildDurationLabel(artwork: Artwork): string {
  if (typeof artwork.durationMinutes === "number" && Number.isFinite(artwork.durationMinutes)) {
    return formatDurationMinutes(Math.max(artwork.durationMinutes, 0));
  }

  const parsed = parseDurationString(artwork.duration);
  if (parsed !== null) {
    return formatDurationMinutes(parsed);
  }

  return "01H00M";
}

function parseDurationString(source: string | undefined): number | null {
  if (!source) {
    return null;
  }
  const match = source.match(/(?:(\d+)\s*(?:小时|h|H))?\s*(?:(\d+)\s*(?:分钟|分|m|M))?/);
  if (!match) {
    return null;
  }
  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = `${String(Math.min(hours, 99)).padStart(2, "0")}H`;
  const minuteLabel = `${String(minutes).padStart(2, "0")}M`;
  return `${hourLabel}${minuteLabel}`;
}

function drawTemplate(
  context: CanvasRenderingContext2D,
  size: number,
  data: TemplateViewModel,
  images: Record<string, HTMLImageElement>,
) {
  context.save();
  context.clearRect(0, 0, size, size);

  drawBackground(context, size);
  drawDecorations(context, size);
  drawGridFrames(context, size, data.items, images);
  drawTopLeftTitle(context, size);
  drawTopRightTags(context, size, data.tagCloud);
  drawLeftVerticalCaption(context, size, data.dateRangeLabel);
  drawBottomRightInfo(context, size, data.totalDurationLabel, data.username);
  drawFrameLabels(context, size, data.items);

  context.restore();
}

function drawBackground(context: CanvasRenderingContext2D, size: number) {
  context.fillStyle = "#2f1f1b";
  context.fillRect(0, 0, size, size);

  const gradientOne = context.createRadialGradient(size * 0.22, size * 0.28, size * 0.1, size * 0.22, size * 0.28, size * 0.68);
  gradientOne.addColorStop(0, "rgba(152, 219, 198, 0.28)");
  gradientOne.addColorStop(1, "rgba(152, 219, 198, 0)");
  context.fillStyle = gradientOne;
  context.fillRect(0, 0, size, size);

  const gradientTwo = context.createRadialGradient(size * 0.78, size * 0.72, size * 0.08, size * 0.78, size * 0.72, size * 0.55);
  gradientTwo.addColorStop(0, "rgba(104, 189, 165, 0.24)");
  gradientTwo.addColorStop(1, "rgba(104, 189, 165, 0)");
  context.fillStyle = gradientTwo;
  context.fillRect(0, 0, size, size);
}

function drawDecorations(context: CanvasRenderingContext2D, size: number) {
  const stripeWidth = size * 0.004;
  const spacing = size * 0.03;
  context.save();
  context.globalAlpha = 0.08;
  context.fillStyle = "#efeae7";
  for (let x = size * 0.12; x < size; x += spacing) {
    context.fillRect(x, size * 0.05, stripeWidth, size * 0.9);
  }
  context.restore();
}

function drawGridFrames(
  context: CanvasRenderingContext2D,
  size: number,
  items: TemplateItem[],
  images: Record<string, HTMLImageElement>,
) {
  const margin = size * 0.09;
  const gap = size * 0.045;
  const frameSize = (size - margin * 2 - gap) / 2;
  const radius = size * 0.035;

  items.forEach((item, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const frameX = margin + col * (frameSize + gap);
    const frameY = margin + row * (frameSize + gap);

    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.42)";
    context.shadowBlur = size * 0.05;
    context.shadowOffsetX = size * 0.02;
    context.shadowOffsetY = size * 0.03;
    drawRoundedRectPath(context, frameX + size * 0.01, frameY + size * 0.01, frameSize, frameSize, radius);
    context.fillStyle = "rgba(0, 0, 0, 0.4)";
    context.fill();
    context.restore();

    context.save();
    drawRoundedRectPath(context, frameX, frameY, frameSize, frameSize, radius);
    context.clip();

    const image = images[item.id];
    if (image && image.width > 0 && image.height > 0) {
      const scale = Math.max(frameSize / image.width, frameSize / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const dx = frameX + (frameSize - drawWidth) / 2;
      const dy = frameY + (frameSize - drawHeight) / 2;
      context.drawImage(image, dx, dy, drawWidth, drawHeight);
    } else {
      const placeholderGradient = context.createLinearGradient(frameX, frameY, frameX + frameSize, frameY + frameSize);
      placeholderGradient.addColorStop(0, "rgba(152, 219, 198, 0.18)");
      placeholderGradient.addColorStop(1, "rgba(152, 219, 198, 0.05)");
      context.fillStyle = placeholderGradient;
      context.fillRect(frameX, frameY, frameSize, frameSize);

      context.fillStyle = "rgba(239, 234, 231, 0.7)";
      context.font = `600 ${Math.round(size * 0.04)}px "Manrope", "Segoe UI", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("待加载", frameX + frameSize / 2, frameY + frameSize / 2);
    }
    context.restore();

    context.save();
    drawRoundedRectPath(context, frameX, frameY, frameSize, frameSize, radius);
    context.lineWidth = size * 0.008;
    context.strokeStyle = "rgba(239, 234, 231, 0.18)";
    context.globalAlpha = 0.9;
    context.stroke();
    context.restore();
  });
}

function drawTopLeftTitle(context: CanvasRenderingContext2D, size: number) {
  const margin = size * 0.1;
  context.save();
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "rgba(239, 234, 231, 0.92)";
  context.font = `700 ${Math.round(size * 0.07)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText("EchoDraw", margin, margin * 0.6);
  context.restore();
}

function drawTopRightTags(context: CanvasRenderingContext2D, size: number, tags: string[]) {
  const margin = size * 0.1;
  const tagFontSize = Math.round(size * 0.025);
  const tagHeight = tagFontSize + size * 0.024;
  const gap = size * 0.016;

  context.save();
  context.textBaseline = "top";
  context.font = `500 ${tagFontSize}px "Manrope", "Segoe UI", sans-serif`;

  let x = size - margin;
  const y = margin * 0.6;

  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const text = tags[i].toUpperCase();
    const width = context.measureText(text).width + size * 0.045;
    x -= width;

    drawRoundedRectPath(context, x, y, width, tagHeight, size * 0.01);
    context.fillStyle = "rgba(34, 26, 22, 0.78)";
    context.fill();
    context.strokeStyle = "rgba(239, 234, 231, 0.18)";
    context.lineWidth = size * 0.002;
    context.stroke();

    context.fillStyle = "rgba(239, 234, 231, 0.85)";
    context.fillText(text, x + size * 0.022, y + size * 0.012);

    x -= gap;
  }

  context.restore();
}

function drawLeftVerticalCaption(context: CanvasRenderingContext2D, size: number, dateRangeLabel: string) {
  const caption = `Collage · ${dateRangeLabel}`;
  const offsetX = size * 0.06;
  const offsetY = size * 0.88;

  context.save();
  context.translate(offsetX, offsetY);
  context.rotate(-Math.PI / 2);
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "rgba(239, 234, 231, 0.78)";
  context.font = `500 ${Math.round(size * 0.032)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText(caption, 0, 0);
  context.restore();
}

function drawBottomRightInfo(context: CanvasRenderingContext2D, size: number, durationLabel: string, username: string) {
  const margin = size * 0.1;
  const durationFont = Math.round(size * 0.08);
  const usernameFont = Math.round(size * 0.03);

  context.save();
  context.textAlign = "right";
  context.fillStyle = "rgba(239, 234, 231, 0.92)";

  context.font = `700 ${durationFont}px "Manrope", "Segoe UI", sans-serif`;
  context.textBaseline = "bottom";
  context.fillText(durationLabel, size - margin, size - margin * 1.05);

  context.font = `500 ${usernameFont}px "Manrope", "Segoe UI", sans-serif`;
  context.textBaseline = "alphabetic";
  context.fillText(username, size - margin, size - margin * 0.4);
  context.restore();
}

function drawFrameLabels(context: CanvasRenderingContext2D, size: number, items: TemplateItem[]) {
  const margin = size * 0.09;
  const gap = size * 0.045;
  const frameSize = (size - margin * 2 - gap) / 2;
  const labelHeight = size * 0.07;

  context.save();
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.font = `600 ${Math.round(size * 0.026)}px "Manrope", "Segoe UI", sans-serif`;

  items.forEach((item, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const frameX = margin + col * (frameSize + gap);
    const frameY = margin + row * (frameSize + gap);
    const labelY = frameY + frameSize + size * 0.02;

    const labelWidth = frameSize;

    drawRoundedRectPath(context, frameX, labelY, labelWidth, labelHeight, size * 0.02);
    context.fillStyle = "rgba(34, 26, 22, 0.78)";
    context.fill();
    context.strokeStyle = "rgba(239, 234, 231, 0.16)";
    context.lineWidth = size * 0.002;
    context.stroke();

    context.fillStyle = "rgba(239, 234, 231, 0.88)";
    context.fillText(item.title.toUpperCase(), frameX + size * 0.03, labelY + labelHeight / 2 - size * 0.012);

    context.font = `400 ${Math.round(size * 0.02)}px "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle = "rgba(239, 234, 231, 0.65)";
    context.fillText(item.dateLabel, frameX + size * 0.03, labelY + labelHeight / 2 + size * 0.02);
    context.font = `600 ${Math.round(size * 0.026)}px "Manrope", "Segoe UI", sans-serif`;
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



