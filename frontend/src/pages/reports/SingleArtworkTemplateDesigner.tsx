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
  username: string;
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_SIZE = 1080;
const DEFAULT_USERNAME = "@EchoUser";
const MAX_TAG_COUNT = 6;

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

    const preparedTags = Array.from(
      new Set(
        selectedTags
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
    ).slice(0, MAX_TAG_COUNT);

    return {
      title: title.trim() || "自定义标题名",
      subtitle: subtitle.trim(),
      tags: preparedTags,
      timestampLabel: buildTimestampLabel(selectedArtwork),
      username: normalizeUsername(username),
    };
  }, [selectedArtwork, selectedTags, subtitle, title, username]);

  const timestampLabel = templateData?.timestampLabel ?? "日期未知";

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

                <div className="single-template-designer__group">
                  <h3>模版文案</h3>
                  <label className="single-template-designer__field">
                    <span>标题</span>
                    <input
                      type="text"
                      value={title}
                      maxLength={40}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="请输入模版主标题"
                    />
                  </label>
                  <label className="single-template-designer__field">
                    <span>文案</span>
                    <textarea
                      rows={3}
                      value={subtitle}
                      maxLength={120}
                      onChange={(event) => setSubtitle(event.target.value)}
                      placeholder="为作品写一句说明（可选）"
                    />
                  </label>
                  <p className="single-template-designer__hint">标题与文案会显示在画面左上角，可随时修改。</p>
                </div>

                <div className="single-template-designer__group">
                  <h3>展示标签</h3>
                  <p className="single-template-designer__hint">
                    至多选择 {MAX_TAG_COUNT} 个标签，顺序按照上传时的原始排序展示。未选择时右上角不会显示标签。
                  </p>
                  <div className="single-template-designer__tag-list" role="listbox" aria-label="可展示的标签">
                    {availableTags.length === 0 ? (
                      <span className="single-template-designer__hint single-template-designer__hint--muted">
                        该作品尚未设置标签。
                      </span>
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
                      清空已选标签
                    </button>
                  ) : null}
                </div>

                <div className="single-template-designer__group">
                  <h3>署名信息</h3>
                  <label className="single-template-designer__field">
                    <span>显示昵称</span>
                    <input
                      type="text"
                      value={username}
                      maxLength={32}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="将展示在模板右下角"
                    />
                  </label>
                  <p className="single-template-designer__meta">
                    上传时间 <strong>{timestampLabel}</strong>
                  </p>
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

function buildTimestampLabel(artwork: Artwork): string {
  const candidates = [artwork.uploadedAt, artwork.uploadedDate, artwork.date];
  for (const source of candidates) {
    const parsed = parseDateTime(source);
    if (parsed) {
      return formatTimestamp(parsed);
    }
  }
  return "日期未知";
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

function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}H${minutes}M`;
}

function drawTemplate(
  context: CanvasRenderingContext2D,
  size: number,
  data: TemplateViewModel,
  image: HTMLImageElement | null,
) {
  context.save();
  context.clearRect(0, 0, size, size);

  const layout = createTemplateLayout(size);

  drawCanvasBackground(context, size);
  drawPaper(context, layout);
  drawArtworkFrame(context, layout, image);
  drawTopLeftCopy(context, size, data.title, data.subtitle);
  drawTagGrid(context, size, data.tags);
  drawFooterInfo(context, size, data.timestampLabel, data.username);

  context.restore();
}

type TemplateLayout = {
  paperX: number;
  paperY: number;
  paperSize: number;
  paperRadius: number;
  frameX: number;
  frameY: number;
  frameSize: number;
  frameRadius: number;
};

function createTemplateLayout(size: number): TemplateLayout {
  const paperSize = size * 0.84;
  const paperX = (size - paperSize) / 2;
  const paperY = size * 0.11;
  const paperRadius = paperSize * 0.06;
  const frameInset = paperSize * 0.045;
  const frameSize = paperSize - frameInset * 2;
  const frameX = paperX + frameInset;
  const frameY = paperY + frameInset;
  const frameRadius = paperSize * 0.05;
  return { paperX, paperY, paperSize, paperRadius, frameX, frameY, frameSize, frameRadius };
}

function drawCanvasBackground(context: CanvasRenderingContext2D, size: number) {
  context.fillStyle = "#2f2521";
  context.fillRect(0, 0, size, size);

  const overlay = context.createLinearGradient(0, 0, size, size);
  overlay.addColorStop(0, "rgba(146, 215, 193, 0.2)");
  overlay.addColorStop(1, "rgba(146, 215, 193, 0)");
  context.fillStyle = overlay;
  context.fillRect(0, 0, size, size);
}

function drawPaper(context: CanvasRenderingContext2D, layout: TemplateLayout) {
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.32)";
  context.shadowBlur = layout.paperSize * 0.06;
  context.shadowOffsetX = layout.paperSize * 0.03;
  context.shadowOffsetY = layout.paperSize * 0.035;
  drawRoundedRectPath(
    context,
    layout.paperX + layout.paperSize * 0.012,
    layout.paperY + layout.paperSize * 0.012,
    layout.paperSize,
    layout.paperSize,
    layout.paperRadius,
  );
  context.fillStyle = "rgba(0, 0, 0, 0.28)";
  context.fill();
  context.restore();

  context.save();
  drawRoundedRectPath(context, layout.paperX, layout.paperY, layout.paperSize, layout.paperSize, layout.paperRadius);
  const paperGradient = context.createLinearGradient(layout.paperX, layout.paperY, layout.paperX + layout.paperSize, layout.paperY + layout.paperSize);
  paperGradient.addColorStop(0, "#f7f2c9");
  paperGradient.addColorStop(1, "#f1e5a9");
  context.fillStyle = paperGradient;
  context.fill();
  context.lineWidth = layout.paperSize * 0.008;
  context.strokeStyle = "rgba(34, 26, 22, 0.12)";
  context.stroke();
  context.restore();
}

function drawArtworkFrame(context: CanvasRenderingContext2D, layout: TemplateLayout, image: HTMLImageElement | null) {
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.22)";
  context.shadowBlur = layout.paperSize * 0.05;
  context.shadowOffsetX = layout.paperSize * 0.02;
  context.shadowOffsetY = layout.paperSize * 0.03;
  drawRoundedRectPath(
    context,
    layout.frameX + layout.paperSize * 0.009,
    layout.frameY + layout.paperSize * 0.009,
    layout.frameSize,
    layout.frameSize,
    layout.frameRadius,
  );
  context.fillStyle = "rgba(0, 0, 0, 0.28)";
  context.fill();
  context.restore();

  context.save();
  drawRoundedRectPath(context, layout.frameX, layout.frameY, layout.frameSize, layout.frameSize, layout.frameRadius);
  context.clip();
  if (image && image.width > 0 && image.height > 0) {
    const scale = Math.max(layout.frameSize / image.width, layout.frameSize / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = layout.frameX + (layout.frameSize - drawWidth) / 2;
    const dy = layout.frameY + (layout.frameSize - drawHeight) / 2;
    context.drawImage(image, dx, dy, drawWidth, drawHeight);
  } else {
    const placeholder = context.createLinearGradient(
      layout.frameX,
      layout.frameY,
      layout.frameX + layout.frameSize,
      layout.frameY + layout.frameSize,
    );
    placeholder.addColorStop(0, "rgba(251, 245, 210, 0.9)");
    placeholder.addColorStop(1, "rgba(240, 230, 190, 0.85)");
    context.fillStyle = placeholder;
    context.fillRect(layout.frameX, layout.frameY, layout.frameSize, layout.frameSize);

    context.fillStyle = "rgba(47, 37, 34, 0.6)";
    context.font = `600 ${Math.round(layout.paperSize * 0.05)}px "Manrope", "Segoe UI", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("加载中", layout.frameX + layout.frameSize / 2, layout.frameY + layout.frameSize / 2);
  }
  context.restore();

  context.save();
  drawRoundedRectPath(context, layout.frameX, layout.frameY, layout.frameSize, layout.frameSize, layout.frameRadius);
  context.lineWidth = layout.paperSize * 0.0085;
  context.strokeStyle = "rgba(34, 26, 22, 0.16)";
  context.stroke();
  context.restore();
}

function drawTopLeftCopy(context: CanvasRenderingContext2D, size: number, title: string, subtitle: string) {
  const margin = size * 0.08;
  context.save();
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "#9edac4";
  context.font = `700 ${Math.round(size * 0.06)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText(title, margin, margin);

  const trimmedSubtitle = subtitle.trim();
  if (trimmedSubtitle) {
    const maxWidth = size * 0.42;
    const subtitleTop = margin + Math.round(size * 0.07);
    const lineHeight = Math.round(size * 0.045);
    context.font = `400 ${Math.round(size * 0.035)}px "Manrope", "Segoe UI", sans-serif`;
    const lines = wrapText(context, trimmedSubtitle, maxWidth);
    lines.forEach((line, index) => {
      context.fillText(line, margin, subtitleTop + index * lineHeight);
    });
  }

  context.restore();
}

function drawTagGrid(context: CanvasRenderingContext2D, size: number, tags: string[]) {
  if (tags.length === 0) {
    return;
  }

  const columns = 2;
  const boxWidth = size * 0.16;
  const boxHeight = size * 0.055;
  const columnGap = size * 0.02;
  const rowGap = size * 0.02;
  const margin = size * 0.08;
  const startX = size - margin - columns * boxWidth - (columns - 1) * columnGap;
  const startY = margin;

  context.save();
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.font = `600 ${Math.round(size * 0.027)}px "Manrope", "Segoe UI", sans-serif`;

  tags.forEach((rawTag, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = startX + column * (boxWidth + columnGap);
    const y = startY + row * (boxHeight + rowGap);
    const text = rawTag.trim().toUpperCase();

    drawRoundedRectPath(context, x, y, boxWidth, boxHeight, size * 0.012);
    context.fillStyle = "rgba(34, 26, 22, 0.72)";
    context.fill();
    context.strokeStyle = "rgba(146, 215, 193, 0.55)";
    context.lineWidth = size * 0.0022;
    context.stroke();

    context.fillStyle = "#9edac4";
    context.fillText(text, x + size * 0.02, y + boxHeight / 2);
  });

  context.restore();
}

function drawFooterInfo(context: CanvasRenderingContext2D, size: number, timestampLabel: string, username: string) {
  const margin = size * 0.08;

  context.save();
  context.fillStyle = "#93d4bc";
  context.textBaseline = "alphabetic";

  context.textAlign = "center";
  context.font = `600 ${Math.round(size * 0.034)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText(timestampLabel, size / 2, size - margin);

  context.textAlign = "right";
  context.font = `600 ${Math.round(size * 0.038)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText(username, size - margin, size - margin * 0.35);

  context.restore();
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


