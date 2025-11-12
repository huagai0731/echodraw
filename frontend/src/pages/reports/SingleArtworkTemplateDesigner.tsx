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
  dateLabel: string;
  mood: string;
  tags: string[];
  durationLabel: string;
  username: string;
  title: string;
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_SIZE = 1080;
const DEFAULT_USERNAME = "@EchoUser";

function SingleArtworkTemplateDesigner({ open, artworks, onClose }: SingleArtworkTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [pickerOpen, setPickerOpen] = useState(false);

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
    };
    const handleError = () => {
      setImage(null);
      setImageStatus("error");
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

    const dateLabel = buildDateLabel(selectedArtwork);
    const moodLabel = selectedArtwork.mood?.trim() || "未知心情";
    const tags = buildTags(selectedArtwork.tags);
    const durationLabel = buildDurationLabel(selectedArtwork);
    const normalizedUsername = normalizeUsername(username);

    return {
      dateLabel,
      mood: moodLabel,
      tags,
      durationLabel,
      username: normalizedUsername,
      title: selectedArtwork.title,
    };
  }, [selectedArtwork, username]);

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

    drawTemplate(context, CANVAS_SIZE, templateData, image);
  }, [image, open, templateData]);

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
        <div className="single-template-designer__backdrop" onClick={onClose} />
        <div className="single-template-designer__panel">
          <div className="single-template-designer__preview">
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

          <aside className="single-template-designer__sidebar">
            <div className="single-template-designer__heading">
              <h2>单张图模板</h2>
              <p>选择一张已上传作品，生成咖啡色主题的 EchoDraw 画框。</p>
            </div>

            {hasArtworks ? (
              <>
                <div className="single-template-designer__group">
                  <h3>选择作品</h3>
                  <button
                    type="button"
                    className="single-template-designer__selected"
                    onClick={() => setPickerOpen(true)}
                  >
                    {selectedArtwork ? (
                      <>
                        <img src={selectedArtwork.imageSrc} alt={selectedArtwork.alt} loading="lazy" />
                        <div className="single-template-designer__selected-info">
                          <span>当前选择</span>
                          <h4>{selectedArtwork.title || "未命名"}</h4>
                          <p>{selectedArtwork.mood || "未知心情"}</p>
                        </div>
                      </>
                    ) : (
                      <div className="single-template-designer__selected-info">
                        <span>当前选择</span>
                        <h4>尚未选择作品</h4>
                        <p>点击挑选一张作品</p>
                      </div>
                    )}
                  </button>
                </div>

                <div className="single-template-designer__actions">
                  <button
                    type="button"
                    className="single-template-designer__download"
                    onClick={handleDownload}
                    disabled={!templateData || imageStatus === "loading"}
                  >
                    <MaterialIcon name="download" />
                    保存为图片
                  </button>
                  <p className="single-template-designer__fineprint">
                    图片会以 PNG 格式下载，尺寸为 1080 × 1080 像素。
                  </p>
                </div>
              </>
            ) : (
              <div className="single-template-designer__empty">
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

function buildDateLabel(artwork: Artwork): string {
  const candidates = [artwork.uploadedAt, artwork.uploadedDate, artwork.date];
  for (const source of candidates) {
    const parsed = parseDate(source);
    if (parsed) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}.${month}.${day}`;
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
  image: HTMLImageElement | null,
) {
  context.save();
  context.clearRect(0, 0, size, size);

  drawBackground(context, size);
  drawDecorations(context, size);
  drawImageFrame(context, size, image);
  drawTopLeftTitle(context, size);
  drawTopRightTags(context, size, data.tags);
  drawLeftVerticalCaption(context, size, data.dateLabel, data.mood);
  drawRightBottomInfo(context, size, data.durationLabel, data.username);

  context.restore();
}

function drawBackground(context: CanvasRenderingContext2D, size: number) {
  context.fillStyle = "#2f1f1b";
  context.fillRect(0, 0, size, size);

  const gradientOne = context.createRadialGradient(size * 0.22, size * 0.28, size * 0.1, size * 0.22, size * 0.28, size * 0.68);
  gradientOne.addColorStop(0, "rgba(152, 219, 198, 0.32)");
  gradientOne.addColorStop(1, "rgba(152, 219, 198, 0)");
  context.fillStyle = gradientOne;
  context.fillRect(0, 0, size, size);

  const gradientTwo = context.createRadialGradient(size * 0.82, size * 0.74, size * 0.08, size * 0.82, size * 0.74, size * 0.55);
  gradientTwo.addColorStop(0, "rgba(104, 189, 165, 0.28)");
  gradientTwo.addColorStop(1, "rgba(104, 189, 165, 0)");
  context.fillStyle = gradientTwo;
  context.fillRect(0, 0, size, size);
}

function drawDecorations(context: CanvasRenderingContext2D, size: number) {
  const stripeWidth = size * 0.005;
  const maxY = size;
  const spacing = size * 0.032;
  context.save();
  context.globalAlpha = 0.08;
  context.fillStyle = "#efeae7";
  for (let x = size * 0.12; x < size; x += spacing) {
    context.fillRect(x, size * 0.05, stripeWidth, maxY - size * 0.1);
  }
  context.restore();
}

function drawImageFrame(context: CanvasRenderingContext2D, size: number, image: HTMLImageElement | null) {
  const frameSize = size * 0.72;
  const frameX = size * 0.24;
  const frameY = size * 0.15;
  const radius = size * 0.04;

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.42)";
  context.shadowBlur = size * 0.06;
  context.shadowOffsetX = size * 0.03;
  context.shadowOffsetY = size * 0.04;
  drawRoundedRectPath(context, frameX + size * 0.01, frameY + size * 0.01, frameSize, frameSize, radius);
  context.fillStyle = "rgba(0, 0, 0, 0.4)";
  context.fill();
  context.restore();

  context.save();
  drawRoundedRectPath(context, frameX, frameY, frameSize, frameSize, radius);
  context.clip();

  if (image && image.width > 0 && image.height > 0) {
    const scale = Math.max(frameSize / image.width, frameSize / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = frameX + (frameSize - drawWidth) / 2;
    const dy = frameY + (frameSize - drawHeight) / 2;
    context.drawImage(image, dx, dy, drawWidth, drawHeight);
  } else {
    const placeholderGradient = context.createLinearGradient(frameX, frameY, frameX + frameSize, frameY + frameSize);
    placeholderGradient.addColorStop(0, "rgba(152, 219, 198, 0.16)");
    placeholderGradient.addColorStop(1, "rgba(152, 219, 198, 0.04)");
    context.fillStyle = placeholderGradient;
    context.fillRect(frameX, frameY, frameSize, frameSize);

    context.fillStyle = "rgba(239, 234, 231, 0.72)";
    context.font = `600 ${Math.round(size * 0.045)}px "Manrope", "Segoe UI", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("加载中", frameX + frameSize / 2, frameY + frameSize / 2);
  }
  context.restore();

  context.save();
  drawRoundedRectPath(context, frameX, frameY, frameSize, frameSize, radius);
  context.lineWidth = size * 0.009;
  context.strokeStyle = "rgba(239, 234, 231, 0.22)";
  context.globalAlpha = 0.9;
  context.stroke();
  context.restore();
}

function drawTopLeftTitle(context: CanvasRenderingContext2D, size: number) {
  const margin = size * 0.12;
  context.save();
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "rgba(239, 234, 231, 0.92)";
  context.font = `700 ${Math.round(size * 0.075)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText("EchoDraw", margin, margin);
  context.restore();
}

function drawTopRightTags(context: CanvasRenderingContext2D, size: number, tags: string[]) {
  const margin = size * 0.12;
  const rows = [tags.slice(0, 3), tags.slice(3, 5)];
  const tagFontSize = Math.round(size * 0.028);
  const tagHeight = tagFontSize + size * 0.028;
  const gap = size * 0.018;

  context.save();
  context.textBaseline = "top";
  context.font = `500 ${tagFontSize}px "Manrope", "Segoe UI", sans-serif`;

  rows.forEach((row, rowIndex) => {
    if (row.length === 0) {
      return;
    }
    const boxes = row.map((label) => {
      const text = label.toUpperCase();
      const width = context.measureText(text).width + size * 0.05;
      return { text, width };
    });
    const totalWidth = boxes.reduce((acc, box) => acc + box.width, 0) + gap * (boxes.length - 1);
    let x = size - margin - totalWidth;
    const y = margin + rowIndex * (tagHeight + size * 0.015);

    boxes.forEach(({ text, width }) => {
      drawRoundedRectPath(context, x, y, width, tagHeight, size * 0.012);
      context.fillStyle = "rgba(34, 26, 22, 0.75)";
      context.fill();
      context.strokeStyle = "rgba(239, 234, 231, 0.16)";
      context.lineWidth = size * 0.0022;
      context.stroke();

      context.fillStyle = "rgba(239, 234, 231, 0.85)";
      context.fillText(text, x + size * 0.024, y + size * 0.012);
      x += width + gap;
    });
  });
  context.restore();
}

function drawLeftVerticalCaption(context: CanvasRenderingContext2D, size: number, dateLabel: string, mood: string) {
  const caption = `${dateLabel} · ${mood}`;
  const offsetX = size * 0.08;
  const offsetY = size * 0.86;

  context.save();
  context.translate(offsetX, offsetY);
  context.rotate(-Math.PI / 2);
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "rgba(239, 234, 231, 0.78)";
  context.font = `500 ${Math.round(size * 0.034)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText(caption, 0, 0);
  context.restore();
}

function drawRightBottomInfo(context: CanvasRenderingContext2D, size: number, durationLabel: string, username: string) {
  const margin = size * 0.12;
  const durationFont = Math.round(size * 0.09);
  const usernameFont = Math.round(size * 0.032);

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


