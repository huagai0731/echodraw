import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import ImageCropper, { type CropData } from "@/components/ImageCropper";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";
import { getOrLoadImages } from "@/utils/imageCache";

import "./SingleArtworkTemplateDesigner.css";

type FourArtworkTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type SizePresetKey = "1080x1080" | "1080x1350" | "1440x1800";

type TemplateItem = {
  id: string;
  title: string;
  dateLabel: string;
  mood: string;
  durationLabel: string;
  tags: string[];
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
  textOpacity: number;
  shadowColor: string;
  overlayOpacity: number;
  items: TemplateItem[];
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const MAX_ITEMS = 4;
const DEFAULT_USERNAME = "@EchoUser";
const PRESET_SHADOW_COLORS = ["#221b1b", "#4a3f4a", "#98dbc6", "#c5e1e2", "#efeae7", "#0c0a09", "#bfb8af", "#6b7280", "#1f2937", "#ffffff"];
const PRESET_ACCENT_COLORS = ["#98dbc6", "#b0b0b0", "#f5a3c7", "#7db3ff", "#ffd66b"];

function FourArtworkTemplateDesigner({ open, artworks, onClose }: FourArtworkTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sizePreset, setSizePreset] = useState<SizePresetKey>("1080x1080");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  // 单张图片的目标尺寸（每格尺寸），最终导出画布为 2x2 拼接（无边距、无背景）
  const tileSize = useMemo(() => {
    if (sizePreset === "1080x1350") return { width: 1080, height: 1350 };
    if (sizePreset === "1440x1800") return { width: 1440, height: 1800 };
    return { width: 1080, height: 1080 };
  }, [sizePreset]);
  const canvasSize = useMemo(() => {
    // 2x2 直接拼接，无间隔
    return { width: tileSize.width * 2, height: tileSize.height * 2 };
  }, [tileSize.height, tileSize.width]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const [title, setTitle] = useState<string>("自定义标题名");
  const [subtitle, setSubtitle] = useState<string>("自定义文案");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTitle, setShowTitle] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [showUsername, setShowUsername] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [showDuration, setShowDuration] = useState(true);
  const [shadowBaseHex, setShadowBaseHex] = useState<string>("#4a3f4a");
  const [shadowOpacity, setShadowOpacity] = useState<number>(85);
  const [shadowSaturation, setShadowSaturation] = useState<number>(70);
  const [textOpacityPercent, setTextOpacityPercent] = useState<number>(92);
  const [accentHex, setAccentHex] = useState<string>("#98dbc6");
  const [textTone, setTextTone] = useState<"light" | "dark">("light");
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropData, setCropData] = useState<Record<string, CropData>>({});
  const [cropperOpen, setCropperOpen] = useState(false);
  const [croppingArtworkId, setCroppingArtworkId] = useState<string | null>(null);
  // 模式切换：紧凑 or 详细
  const [displayMode, setDisplayMode] = useState<"compact" | "detailed">("compact");
  // 紧凑模式：每张图显示的信息类型（标题/时长/日期）
  const [compactInfoType, setCompactInfoType] = useState<Record<string, "title" | "duration" | "date">>({});
  // 详细模式：底部小条颜色
  const [detailBarColor, setDetailBarColor] = useState<string>("#98dbc6");

  const hasArtworks = artworks.length > 0;

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      setCropperOpen(false);
      setCroppingArtworkId(null);
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
        if (valid.includes(artwork.id)) continue;
        needed.push(artwork.id);
        if (valid.length + needed.length >= Math.min(MAX_ITEMS, artworks.length)) break;
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

  const availableTags = useMemo(() => {
    const first = selectedArtworks[0] ?? null;
    if (!first) return [];
    return Array.from(new Set((first.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0)));
  }, [selectedArtworks]);

  useEffect(() => {
    const first = selectedArtworks[0] ?? null;
    if (!first) {
      setTitle("自定义标题名");
      setSubtitle("自定义文案");
      setSelectedTags([]);
      return;
    }
    setTitle(first.title?.trim() || "自定义标题名");
    setSubtitle(first.description?.trim() || "自定义文案");
    const defaults = Array.from(
      new Set((first.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    ).slice(0, 6);
    setSelectedTags(defaults);
  }, [selectedArtworks]);

  useEffect(() => {
    if (!open) {
      // 不清空 loadedImages，保留缓存以便下次快速加载
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
    
    // 使用共享的图片缓存工具加载图片
    const imageSrcs = selectedArtworks.map((artwork) => artwork.imageSrc);
    getOrLoadImages(imageSrcs)
      .then((imageMap) => {
        if (isCancelled) return;
        const next: Record<string, HTMLImageElement> = {};
        selectedArtworks.forEach((artwork) => {
          const img = imageMap.get(artwork.imageSrc);
          if (img) {
            next[artwork.id] = img;
          }
        });
        // 只在图片真正变化时才更新状态，避免不必要的重新绘制
        setLoadedImages((prev) => {
          const prevKeys = Object.keys(prev).sort();
          const nextKeys = Object.keys(next).sort();
          if (prevKeys.length !== nextKeys.length) {
            return next;
          }
          // 检查是否有图片变化
          for (const key of prevKeys) {
            if (prev[key] !== next[key]) {
              return next;
            }
          }
          // 如果图片没有变化，返回之前的对象，避免触发重新绘制
          return prev;
        });
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
    const meta = composeMetaLabels(selectedArtworks[0]!, {
      showDate,
      showDuration,
    });
    const accentColor = accentHex;
    const effectiveShadow = adjustHexSaturation(shadowBaseHex, clamp01(shadowSaturation / 100));
    const overlayOpacity = clamp01(shadowOpacity / 100);
    const textBase = textTone === "light" ? "#f7f2ec" : "#161514";
    const textOpacity = clamp01(textOpacityPercent / 100);
    return {
      title: showTitle ? title.trim() || "自定义标题名" : "",
      subtitle: showSubtitle ? subtitle.trim() : "",
      tags: Array.from(new Set(selectedTags.map((t) => t.trim()).filter((t) => t.length > 0))).slice(0, 6),
      timestampLabel: meta.timestampLabel,
      dateLabel: showDate ? meta.dateLabel : "",
      durationLabel: showDuration ? meta.durationLabel : "",
      username: showUsername ? normalizeUsername(username) : "",
      accentColor,
      textColor: textBase,
      textOpacity,
      shadowColor: effectiveShadow,
      overlayOpacity,
      items,
    };
  }, [
    selectedArtworks,
    showDate,
    showDuration,
    accentHex,
    shadowBaseHex,
    shadowOpacity,
    shadowSaturation,
    textTone,
    textOpacityPercent,
    showTitle,
    showSubtitle,
    showUsername,
    title,
    subtitle,
    username,
    selectedTags,
  ]);

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
    if (canvas.width !== canvasSize.width || canvas.height !== canvasSize.height) {
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
    }
    // 使用 requestAnimationFrame 优化绘制性能
    const rafId = requestAnimationFrame(() => {
      drawTemplate(context, canvasSize.width, canvasSize.height, tileSize.width, tileSize.height, templateData, loadedImages, cropData, displayMode, compactInfoType, detailBarColor, showUsername ? normalizeUsername(username) : "");
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [loadedImages, open, templateData, canvasSize.height, canvasSize.width, cropData, displayMode, compactInfoType, detailBarColor, username, showUsername, tileSize.width, tileSize.height]);

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

  const renderToggle = (active: boolean, onToggle: () => void, label: string) => (
    <button
      type="button"
      className="quad-template__toggle"
      aria-pressed={active}
      aria-label={`切换${label}`}
      onClick={onToggle}
    >
      <MaterialIcon name={active ? "toggle_on" : "toggle_off"} filled />
    </button>
  );

  const timestampLabel = useMemo(() => templateData?.timestampLabel ?? "日期未知", [templateData]);

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
                  <div className="single-template-designer__device-screen" style={{ aspectRatio: canvasSize.width / canvasSize.height }}>
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
              <section className="single-template-designer__controls">
                <div className="single-template-designer__group single-template-designer__group--hero">
                  <div className="single-template-designer__group-header">
                    <h2>四张图模板</h2>
                    <p>挑选四幅作品，2×2 网格；信息展示与单图导出一致。</p>
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>显示模式</h3>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setDisplayMode("compact")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: displayMode === "compact" ? "1px solid rgba(152,219,198,0.6)" : "1px solid rgba(255,255,255,0.18)",
                        background: displayMode === "compact" ? "rgba(152,219,198,0.16)" : "rgba(255,255,255,0.03)",
                        color: displayMode === "compact" ? "#98dbc6" : "rgba(255,255,255,0.8)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: "0.75rem",
                        letterSpacing: "0.12em",
                      }}
                    >
                      紧凑
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode("detailed")}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: displayMode === "detailed" ? "1px solid rgba(152,219,198,0.6)" : "1px solid rgba(255,255,255,0.18)",
                        background: displayMode === "detailed" ? "rgba(152,219,198,0.16)" : "rgba(255,255,255,0.03)",
                        color: displayMode === "detailed" ? "#98dbc6" : "rgba(255,255,255,0.8)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: "0.75rem",
                        letterSpacing: "0.12em",
                      }}
                    >
                      详细
                    </button>
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>导出尺寸</h3>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(["1080x1080", "1080x1350", "1440x1800"] as SizePresetKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSizePreset(key)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: sizePreset === key ? "1px solid rgba(152,219,198,0.6)" : "1px solid rgba(255,255,255,0.18)",
                          background: sizePreset === key ? "rgba(152,219,198,0.16)" : "rgba(255,255,255,0.03)",
                          color: sizePreset === key ? "#98dbc6" : "rgba(255,255,255,0.8)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: "0.75rem",
                          letterSpacing: "0.12em",
                        }}
                      >
                        {key.replace("x", " × ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>已选作品</h3>
                  </div>
                  <button
                    type="button"
                    className="single-template-designer__selection"
                    onClick={() => setPickerOpen(true)}
                  >
                    {selectedArtworks.length > 0 ? (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 60px)", gridTemplateRows: "repeat(2, 60px)", gap: "0.35rem", flexShrink: 0 }}>
                          {Array.from({ length: MAX_ITEMS }).map((_, index) => {
                            const artwork = selectedArtworks[index] ?? null;
                            if (!artwork) {
                              return <div key={index} style={{ width: 60, height: 60, borderRadius: "0.85rem", border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: "1.4rem" }}>+</div>;
                            }
                            return (
                              <div key={artwork.id} style={{ position: "relative" }}>
                                <img
                                  src={artwork.imageSrc}
                                  alt={artwork.alt}
                                  loading="lazy"
                                  style={{ width: 60, height: 60, borderRadius: "0.85rem", border: "1px solid rgba(255,255,255,0.18)", objectFit: "cover" }}
                                />
                                {cropData[artwork.id] && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: 2,
                                      right: 2,
                                      width: 16,
                                      height: 16,
                                      borderRadius: "50%",
                                      background: "#98dbc6",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "0.7rem",
                                    }}
                                    title="已裁剪"
                                  >
                                    <MaterialIcon name="crop" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div>
                          <p>当前选中 {selectedArtworks.length} / 4</p>
                          <h4>{selectedArtworks[0]?.title || "尚未选择作品"}</h4>
                          <small>点击更换或调整顺序（超出 4 张自动替换最早选择）</small>
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
                  {selectedArtworks.length > 0 && (
                    <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {selectedArtworks.map((artwork) => (
                        <button
                          key={artwork.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCroppingArtworkId(artwork.id);
                            setCropperOpen(true);
                          }}
                          style={{
                            padding: "0.5rem 0.75rem",
                            borderRadius: "0.5rem",
                            border: "1px solid rgba(152,219,198,0.3)",
                            background: cropData[artwork.id] ? "rgba(152,219,198,0.15)" : "rgba(255,255,255,0.05)",
                            color: cropData[artwork.id] ? "#98dbc6" : "rgba(255,255,255,0.8)",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.375rem",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            if (!cropData[artwork.id]) {
                              e.currentTarget.style.background = "rgba(152,219,198,0.1)";
                              e.currentTarget.style.borderColor = "rgba(152,219,198,0.5)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!cropData[artwork.id]) {
                              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                              e.currentTarget.style.borderColor = "rgba(152,219,198,0.3)";
                            }
                          }}
                        >
                          <MaterialIcon name="crop" />
                          <span>{artwork.title || "未命名"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {displayMode === "compact" && selectedArtworks.length > 0 && (
                  <div className="single-template-designer__group">
                    <div className="single-template-designer__group-header">
                      <h3>每张图显示信息（紧凑模式）</h3>
                      <small>每张图右下角只显示一个信息</small>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {selectedArtworks.map((artwork) => (
                        <div key={artwork.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem", borderRadius: "0.5rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <img
                            src={artwork.imageSrc}
                            alt={artwork.alt}
                            loading="lazy"
                            style={{ width: 40, height: 40, borderRadius: "0.5rem", objectFit: "cover", flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.9)", marginBottom: "0.25rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {artwork.title || "未命名"}
                            </p>
                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                              {(["title", "duration", "date"] as const).map((type) => {
                                const currentType = compactInfoType[artwork.id] || "title";
                                const isActive = currentType === type;
                                const labels = { title: "标题", duration: "时长", date: "日期" };
                                return (
                                  <button
                                    key={type}
                                    type="button"
                                    onClick={() => setCompactInfoType((prev) => ({ ...prev, [artwork.id]: type }))}
                                    style={{
                                      padding: "0.25rem 0.5rem",
                                      borderRadius: "0.375rem",
                                      border: isActive ? "1px solid rgba(152,219,198,0.6)" : "1px solid rgba(255,255,255,0.2)",
                                      background: isActive ? "rgba(152,219,198,0.16)" : "rgba(255,255,255,0.05)",
                                      color: isActive ? "#98dbc6" : "rgba(255,255,255,0.7)",
                                      fontSize: "0.7rem",
                                      cursor: "pointer",
                                      transition: "all 0.2s",
                                    }}
                                  >
                                    {labels[type]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {displayMode === "detailed" && (
                  <div className="single-template-designer__group">
                    <div className="single-template-designer__group-header">
                      <h3>底部小条颜色（详细模式）</h3>
                    </div>
                    <div className="single-template-designer__swatches" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "4px 0" }}>
                      {PRESET_ACCENT_COLORS.map((hex) => {
                        const active = detailBarColor.toLowerCase() === hex.toLowerCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`选择颜色 ${hex}`}
                            onClick={() => setDetailBarColor(hex)}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              border: active ? "2px solid #98dbc6" : "1px solid rgba(255,255,255,0.25)",
                              background: hex,
                              boxShadow: active ? "0 0 0 2px rgba(152,219,198,0.35)" : "none",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="single-template-designer__group">
                  <div className="single-template-designer__field-row single-template-designer__field-row--inline">
                    <label htmlFor="quad-title">
                      <span>标题</span>
                      <input
                        id="quad-title"
                        type="text"
                        value={title}
                        maxLength={40}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="请输入作品名称"
                      />
                    </label>
                    {renderToggle(showTitle, () => setShowTitle((prev) => !prev), "标题")}
                  </div>
                  <div className="single-template-designer__field-row single-template-designer__field-row--textarea single-template-designer__field-row--inline">
                    <label htmlFor="quad-subtitle">
                      <span>简介</span>
                      <textarea
                        id="quad-subtitle"
                        rows={3}
                        value={subtitle}
                        maxLength={160}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="为作品写一句陈列说明"
                      />
                    </label>
                    {renderToggle(showSubtitle, () => setShowSubtitle((prev) => !prev), "简介")}
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__field-row single-template-designer__field-row--inline">
                    <label htmlFor="quad-username">
                      <span>署名</span>
                      <input
                        id="quad-username"
                        type="text"
                        value={username}
                        maxLength={32}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="将呈现在右下角"
                      />
                    </label>
                    {renderToggle(showUsername, () => setShowUsername((prev) => !prev), "署名")}
                  </div>
                  <div className="single-template-designer__field-row single-template-designer__field-row--meta single-template-designer__field-row--inline">
                    <div>
                      <p>日期与时长</p>
                      <small>{timestampLabel}</small>
                    </div>
                    <div className="single-template-designer__meta-toggles">
                      {renderToggle(showDate, () => setShowDate((prev) => !prev), "日期")}
                      {renderToggle(showDuration, () => setShowDuration((prev) => !prev), "时长")}
                    </div>
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h3>标签陈列</h3>
                    <button
                      type="button"
                      className="single-template-designer__tag-reset"
                      onClick={() => setSelectedTags([])}
                      style={{ visibility: selectedTags.length > 0 ? "visible" : "hidden" }}
                    >
                      清空标签
                    </button>
                  </div>
                  <div className="single-template-designer__tag-list" role="listbox" aria-label="可展示的标签">
                    {availableTags.length === 0 ? (
                      <span className="single-template-designer__hint">所选作品暂无标签。</span>
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
                            onClick={() =>
                              setSelectedTags((prev) => {
                                const exists = prev.includes(tag);
                                if (exists) return prev.filter((t) => t !== tag);
                                if (prev.length >= 6) return prev;
                                const tentative = [...prev, tag];
                                return availableTags.filter((t) => tentative.includes(t));
                              })
                            }
                          >
                            <span>{tag}</span>
                            {active ? <MaterialIcon name="check" /> : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="single-template-designer__group" style={{ marginTop: 0, paddingTop: 8, paddingBottom: 8 }}>
                  <div className="single-template-designer__group-header" style={{ marginBottom: 6 }}>
                    <h3>阴影区设置</h3>
                  </div>
                  <div className="single-template-designer__swatches" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "4px 0" }}>
                    {PRESET_SHADOW_COLORS.map((hex) => {
                      const active = shadowBaseHex.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`选择颜色 ${hex}`}
                          onClick={() => setShadowBaseHex(hex)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            border: active ? "2px solid #98dbc6" : "1px solid rgba(255,255,255,0.25)",
                            background: hex,
                            boxShadow: active ? "0 0 0 2px rgba(152,219,198,0.35)" : "none",
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="single-template-designer__tuning" style={{ marginTop: 6 }}>
                    <div><p>透明度</p></div>
                    <div className="single-template-designer__slider">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={shadowOpacity}
                        onChange={(e) => setShadowOpacity(Number(e.target.value))}
                        style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.05), rgba(0,0,0,0.9))` }}
                      />
                      <span className="single-template-designer__slider-dot" />
                    </div>
                  </div>
                  <div className="single-template-designer__tuning" style={{ marginTop: 6 }}>
                    <div><p>饱和度</p></div>
                    <div className="single-template-designer__slider">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={shadowSaturation}
                        onChange={(e) => setShadowSaturation(Number(e.target.value))}
                        style={{ backgroundImage: `linear-gradient(90deg, ${desaturateHex(shadowBaseHex, 0.0)}, ${desaturateHex(shadowBaseHex, 1.0)})` }}
                      />
                      <span className="single-template-designer__slider-dot" />
                    </div>
                  </div>
                  <div className="single-template-designer__tuning" style={{ marginTop: 8 }}>
                    <div><p>主题色彩</p></div>
                    <div className="single-template-designer__swatches" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "2px 0" }}>
                      {PRESET_ACCENT_COLORS.map((hex) => {
                        const active = accentHex.toLowerCase() === hex.toLowerCase();
                        return (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`选择主题色 ${hex}`}
                            onClick={() => setAccentHex(hex)}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              border: active ? "2px solid #98dbc6" : "1px solid rgba(255,255,255,0.25)",
                              background: hex,
                              boxShadow: active ? "0 0 0 2px rgba(152,219,198,0.35)" : "none",
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="single-template-designer__tuning" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
                    <div><p>文字色彩</p></div>
                    <div style={{ display: "inline-flex", gap: 6, background: "rgba(255,255,255,0.04)", borderRadius: 999, padding: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
                      <button
                        type="button"
                        aria-pressed={textTone === "light"}
                        onClick={() => setTextTone("light")}
                        style={{
                          minWidth: 64,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: textTone === "light" ? "1px solid rgba(152,219,198,0.6)" : "1px solid transparent",
                          background: textTone === "light" ? "rgba(152,219,198,0.16)" : "transparent",
                          color: textTone === "light" ? "#98dbc6" : "rgba(255,255,255,0.75)",
                          cursor: "pointer",
                        }}
                      >
                        浅色
                      </button>
                      <button
                        type="button"
                        aria-pressed={textTone === "dark"}
                        onClick={() => setTextTone("dark")}
                        style={{
                          minWidth: 64,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: textTone === "dark" ? "1px solid rgba(152,219,198,0.6)" : "1px solid transparent",
                          background: textTone === "dark" ? "rgba(152,219,198,0.16)" : "transparent",
                          color: textTone === "dark" ? "#98dbc6" : "rgba(255,255,255,0.75)",
                          cursor: "pointer",
                        }}
                      >
                        深灰
                      </button>
                    </div>
                  </div>
                  <div className="single-template-designer__tuning" style={{ marginTop: 6 }}>
                    <div><p>文字透明度</p></div>
                    <div className="single-template-designer__slider">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={textOpacityPercent}
                        onChange={(e) => setTextOpacityPercent(Number(e.target.value))}
                        style={{ backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,1))` }}
                      />
                      <span className="single-template-designer__slider-dot" />
                    </div>
                  </div>
                </div>

                <div className="single-template-designer__actions">
                  <button
                    type="button"
                    className="single-template-designer__download"
                    onClick={() => {
                      const canvas = canvasRef.current;
                      if (!canvas) {
                        return;
                      }
                      try {
                        const dataURL = canvas.toDataURL("image/png");
                        setPreviewImageUrl(dataURL);
                        setShowPreviewModal(true);
                      } catch (error) {
                        console.error("生成图片失败:", error);
                        alert("生成图片失败，请稍后重试");
                      }
                    }}
                    disabled={!templateData || imageStatus === "loading"}
                  >
                    <MaterialIcon name="download" />
                    保存为图片
                  </button>
                  <p>导出 PNG · 合成尺寸 {canvasSize.width} × {canvasSize.height}（每张 {tileSize.width} × {tileSize.height}）</p>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {pickerOpen && hasArtworks ? (
        <div className="single-template-designer__picker" role="dialog" aria-modal="true">
          <div className="single-template-designer__picker-backdrop" onClick={() => setPickerOpen(false)} />
          <div className="single-template-designer__picker-panel">
            <div className="single-template-designer__picker-header">
              <h3>选择作品（最多 4 张）</h3>
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
                const isActive = selectedIds.includes(artwork.id);
                const orderIndex = selectedIds.indexOf(artwork.id);
                return (
                  <button
                    key={artwork.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`single-template-designer__artwork-button${isActive ? " single-template-designer__artwork-button--active" : ""}`}
                    onClick={() => handleToggleSelection(artwork.id)}
                  >
                    <img src={artwork.imageSrc} alt={artwork.alt} loading="lazy" />
                    <span>{artwork.title || "未命名"}</span>
                    {isActive ? (
                      <span style={{ position: "absolute", top: "0.5rem", right: "0.5rem", width: "1.8rem", height: "1.8rem", borderRadius: "50%", background: "rgba(152,219,198,0.9)", color: "#1d1111", fontSize: "0.9rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{orderIndex + 1}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {cropperOpen && croppingArtworkId && (() => {
        const artwork = selectedArtworks.find((a) => a.id === croppingArtworkId);
        if (!artwork) return null;
        return (
          <ImageCropper
            open={cropperOpen}
            imageSrc={artwork.imageSrc}
            targetWidth={tileSize.width}
            targetHeight={tileSize.height}
            initialCrop={cropData[croppingArtworkId]}
            onClose={() => {
              setCropperOpen(false);
              setCroppingArtworkId(null);
            }}
            onConfirm={(crop) => {
              setCropData((prev) => ({
                ...prev,
                [croppingArtworkId]: crop,
              }));
            }}
          />
        );
      })()}

      <ImagePreviewModal
        open={showPreviewModal}
        imageUrl={previewImageUrl}
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewImageUrl(null);
        }}
        title="四图导出"
      />
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
      return formatDateDot(parsed);
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

function formatDateDot(date: Date): string {
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
  width: number,
  height: number,
  tileWidth: number,
  tileHeight: number,
  data: TemplateViewModel,
  images: Record<string, HTMLImageElement>,
  cropData: Record<string, CropData>,
  displayMode: "compact" | "detailed",
  compactInfoType: Record<string, "title" | "duration" | "date">,
  detailBarColor: string,
  username: string,
) {
  context.save();
  context.clearRect(0, 0, width, height);
  // 不绘制背景；直接在 2×2 网格内铺满（无间隔、无边距）
  const startX = 0;
  const startY = 0;
  const gap = 0;
  drawGridFrames(context, startX, startY, tileWidth, tileHeight, gap, width, height, data, images, cropData, displayMode, compactInfoType, detailBarColor, username);
  context.restore();
}

// 移除未使用的 drawBackground 以通过构建

function drawGridFrames(
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  frameWidth: number,
  frameHeight: number,
  gap: number,
  _width: number,
  _height: number,
  data: TemplateViewModel,
  images: Record<string, HTMLImageElement>,
  cropData: Record<string, CropData>,
  displayMode: "compact" | "detailed",
  compactInfoType: Record<string, "title" | "duration" | "date">,
  detailBarColor: string,
  username: string,
) {
  const radius = Math.min(frameWidth, frameHeight) * 0.035;
  const shadowBlur = Math.min(frameWidth, frameHeight) * 0.05;
  const shadowOffsetX = Math.min(frameWidth, frameHeight) * 0.02;
  const shadowOffsetY = Math.min(frameWidth, frameHeight) * 0.03;
  const offset = Math.min(frameWidth, frameHeight) * 0.01;
  
  // 预先计算一些常用值，避免在循环中重复计算
  const clipRadius = radius * 0.8;
  const borderWidth = Math.min(frameWidth, frameHeight) * 0.02;
  
  data.items.forEach((item, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const frameX = startX + col * (frameWidth + gap);
    const frameY = startY + row * (frameHeight + gap);
    
    // 绘制阴影（合并到一个 save/restore 中）
    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.42)";
    context.shadowBlur = shadowBlur;
    context.shadowOffsetX = shadowOffsetX;
    context.shadowOffsetY = shadowOffsetY;
    drawRoundedRectPath(context, frameX + offset, frameY + offset, frameWidth, frameHeight, radius);
    context.fillStyle = "rgba(0, 0, 0, 0.4)";
    context.fill();
    context.restore();

    // 绘制图片（合并裁剪和绘制操作）
    context.save();
    const tileRect = { x: frameX, y: frameY, width: frameWidth, height: frameHeight };
    drawRoundedRectPath(context, tileRect.x, tileRect.y, tileRect.width, tileRect.height, clipRadius);
    context.clip();
    
    const image = images[item.id];
    if (image && image.width > 0 && image.height > 0) {
      const crop = cropData[item.id];
      if (crop) {
        // 使用裁剪数据
        const sourceX = crop.x * image.width;
        const sourceY = crop.y * image.height;
        const sourceWidth = crop.width * image.width;
        const sourceHeight = crop.height * image.height;
        const scale = Math.max(tileRect.width / sourceWidth, tileRect.height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        const dx = tileRect.x + (tileRect.width - drawWidth) / 2;
        const dy = tileRect.y + (tileRect.height - drawHeight) / 2;
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, dx, dy, drawWidth, drawHeight);
      } else {
        // 没有裁剪数据，使用原来的逻辑
        const scale = Math.max(tileRect.width / image.width, tileRect.height / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        const dx = tileRect.x + (tileRect.width - drawWidth) / 2;
        const dy = tileRect.y + (tileRect.height - drawHeight) / 2;
        context.drawImage(image, dx, dy, drawWidth, drawHeight);
      }
    } else {
      // 占位符
      const placeholderGradient = context.createLinearGradient(tileRect.x, tileRect.y, tileRect.x + tileRect.width, tileRect.y + tileRect.height);
      placeholderGradient.addColorStop(0, "rgba(152, 219, 198, 0.18)");
      placeholderGradient.addColorStop(1, "rgba(152, 219, 198, 0.05)");
      context.fillStyle = placeholderGradient;
      context.fillRect(tileRect.x, tileRect.y, tileRect.width, tileRect.height);
      context.fillStyle = "rgba(239, 234, 231, 0.7)";
      context.font = `600 ${Math.round(Math.min(frameWidth, frameHeight) * 0.12)}px "Manrope", "Segoe UI", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("待加载", tileRect.x + tileRect.width / 2, tileRect.y + tileRect.height / 2);
    }
    context.restore();

    // 绘制边框（合并到一次操作）
    context.save();
    drawRoundedRectPath(context, tileRect.x, tileRect.y, tileRect.width, tileRect.height, clipRadius);
    context.lineWidth = borderWidth;
    context.strokeStyle = "rgba(239, 234, 231, 0.18)";
    context.globalAlpha = 0.9;
    context.stroke();
    context.restore();

    // 根据模式绘制不同的底部信息
    if (displayMode === "compact") {
      const infoType = compactInfoType[item.id] || "title";
      drawTileFooterCompact(context, tileRect, data, item, frameWidth, infoType);
    } else {
      drawTileFooterDetailed(context, tileRect, data, item, frameWidth, detailBarColor);
    }
  });

  // 详细模式：在整个大图的右下角显示名字
  if (displayMode === "detailed" && username) {
    const paddingX = frameWidth * 0.06;
    const paddingY = frameHeight * 0.05;
    const rightX = startX + frameWidth * 2 - paddingX;
    const bottomY = startY + frameHeight * 2 - paddingY;
    
    context.save();
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.font = `500 ${Math.round(Math.min(frameWidth, frameHeight) * 0.10)}px "Manrope", "Segoe UI", sans-serif`;
    
    // 添加背景以提高可读性
    const metrics = context.measureText(username);
    const textWidth = metrics.width;
    const textHeight = Math.round(Math.min(frameWidth, frameHeight) * 0.10);
    const bgPadding = Math.round(Math.min(frameWidth, frameHeight) * 0.02);
    const bgX = rightX - textWidth - bgPadding;
    const bgY = bottomY - textHeight - bgPadding;
    const bgWidth = textWidth + bgPadding * 2;
    const bgHeight = textHeight + bgPadding * 2;

    context.fillStyle = withAlpha(data.shadowColor || "#221b1b", 0.7);
    context.fillRect(bgX, bgY, bgWidth, bgHeight);

    context.fillStyle = withAlpha(data.textColor, data.textOpacity);
    context.fillText(username, rightX, bottomY);
    context.restore();
  }
}

// 紧凑模式：每张图右下角只显示一个信息
function drawTileFooterCompact(
  context: CanvasRenderingContext2D,
  tile: { x: number; y: number; width: number; height: number },
  data: TemplateViewModel,
  item: TemplateItem,
  _baseWidth: number,
  infoType?: "title" | "duration" | "date",
) {
  if (!infoType) return;

  const paddingX = tile.width * 0.06;
  const paddingY = tile.height * 0.05;
  const rightX = tile.x + tile.width - paddingX;
  const bottomY = tile.y + tile.height - paddingY;

  let displayText = "";
  if (infoType === "title") {
    displayText = (item.title || "").trim();
  } else if (infoType === "duration") {
    displayText = item.durationLabel || data.durationLabel || "";
  } else if (infoType === "date") {
    displayText = item.dateLabel || data.dateLabel || "";
  }

  if (!displayText) return;

  context.save();
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.font = `500 ${Math.round(tile.width * 0.10)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillStyle = withAlpha(data.textColor, data.textOpacity);
  
  // 添加背景以提高可读性
  const metrics = context.measureText(displayText);
  const textWidth = metrics.width;
  const textHeight = Math.round(tile.width * 0.10);
  const bgPadding = Math.round(tile.width * 0.02);
  const bgX = rightX - textWidth - bgPadding;
  const bgY = bottomY - textHeight - bgPadding;
  const bgWidth = textWidth + bgPadding * 2;
  const bgHeight = textHeight + bgPadding * 2;

  context.fillStyle = withAlpha(data.shadowColor || "#221b1b", 0.7);
  context.fillRect(bgX, bgY, bgWidth, bgHeight);

  context.fillStyle = withAlpha(data.textColor, data.textOpacity);
  context.fillText(displayText, rightX, bottomY);
  context.restore();
}

// 详细模式：每张图下面有一个纯色小条，显示标题、时长、日期
function drawTileFooterDetailed(
  context: CanvasRenderingContext2D,
  tile: { x: number; y: number; width: number; height: number },
  data: TemplateViewModel,
  item: TemplateItem,
  _baseWidth: number,
  barColor: string,
) {
  const barHeight = Math.min(tile.height * 0.12, tile.width * 0.15);
  const barY = tile.y + tile.height - barHeight;
  const paddingX = tile.width * 0.06;
  const contentX = tile.x + paddingX;
  const contentWidth = tile.width - paddingX * 2;

  // 绘制纯色小条
  context.save();
  drawRoundedRectPath(context, tile.x, barY, tile.width, barHeight, tile.width * 0.06);
  context.clip();
  context.fillStyle = barColor;
  context.fillRect(tile.x, barY, tile.width, barHeight);
  context.restore();

  // 在小条内绘制文字
  const centerY = barY + barHeight / 2;

  context.save();
  context.textAlign = "left";
  context.textBaseline = "middle";

  const title = (item.title || "").trim();
  const dateLabel = item.dateLabel || data.dateLabel || "";
  const durationLabel = item.durationLabel || data.durationLabel || "";

  const parts: string[] = [];
  if (title) parts.push(title);
  if (dateLabel) parts.push(dateLabel);
  if (durationLabel) parts.push(durationLabel);

  const textLine = parts.join(" · ");

  if (textLine) {
    // 根据背景颜色决定文字颜色（浅色背景用深色字，深色背景用浅色字）
    const rgb = hexToRgb(barColor);
    const isLight = rgb ? (rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114) > 186 : false;
    const textColor = isLight ? "#161514" : "#f7f2ec";

    context.font = `500 ${Math.round(barHeight * 0.4)}px "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle = textColor;
    const truncated = ellipsizeToWidth(context, textLine, contentWidth);
    context.fillText(truncated, contentX, centerY);
  }

  context.restore();
}

// 移除未使用的 drawGradientFooter 以通过构建

// 已移除未使用的 drawTagBadge 以通过构建

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

// 已移除未使用的 measureTagBadgeWidth 以通过构建

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

type RGBColor = { r: number; g: number; b: number };
function withAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return `rgba(0, 0, 0, ${clamp01(alpha)})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}
function hexToRgb(hex: string): RGBColor | null {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) return null;
  const expanded = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) return null;
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
// 移除未使用的 clamp 以通过构建
type HSL = { h: number; s: number; l: number };
function rgbToHsl({ r, g, b }: RGBColor): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0; let s = 0;
  const l = (max - min) / 2 + min;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, l };
}
function hslToRgb({ h, s, l }: HSL): RGBColor {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0, gn = 0, bn = 0;
  if (h >= 0 && h < 60) { rn = c; gn = x; bn = 0; }
  else if (h < 120) { rn = x; gn = c; bn = 0; }
  else if (h < 180) { rn = 0; gn = c; bn = x; }
  else if (h < 240) { rn = 0; gn = x; bn = c; }
  else if (h < 300) { rn = x; gn = 0; bn = c; }
  else { rn = c; gn = 0; bn = x; }
  return { r: Math.round((rn + m) * 255), g: Math.round((gn + m) * 255), b: Math.round((bn + m) * 255) };
}
function desaturateHex(hex: string, t: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  const s = clamp01(t);
  const adjusted = hslToRgb({ h: hsl.h, s, l: hsl.l });
  return rgbToHex(adjusted);
}
function rgbToHex(color: RGBColor): string {
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function adjustHexSaturation(hex: string, saturation: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  const clampedS = clamp01(saturation);
  const adjusted = hslToRgb({ h: hsl.h, s: clampedS, l: hsl.l });
  return rgbToHex(adjusted);
}

type TimestampOptions = { showDate: boolean; showDuration: boolean };
type MetaLabels = { timestampLabel: string; dateLabel: string; durationLabel: string };
function composeMetaLabels(artwork: Artwork, options: TimestampOptions): MetaLabels {
  const date = options.showDate ? resolveArtworkDate(artwork) : null;
  const dateLabel = date ? formatDateLabel(date) : "";
  const durationLabel = options.showDuration ? buildDurationCompact(artwork) ?? "" : "";
  const labelParts: string[] = [];
  if (dateLabel) labelParts.push(dateLabel);
  if (durationLabel) labelParts.push(durationLabel);
  return {
    timestampLabel: labelParts.join(" • ") || "日期未知",
    dateLabel,
    durationLabel,
  };
}
function resolveArtworkDate(artwork: Artwork): Date | null {
  const candidates = [artwork.uploadedAt, artwork.uploadedDate, artwork.date];
  for (const source of candidates) {
    const parsed = parseDate(source);
    if (parsed) return parsed;
  }
  return null;
}
function formatDateLabel(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function buildDurationCompact(artwork: Artwork): string | null {
  const value = artwork.durationMinutes;
  if (typeof value !== "number" || value <= 0) return null;
  const hours = Math.floor(value / 60);
  const minutes = Math.max(0, value % 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

