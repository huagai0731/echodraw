import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";

import "./FourArtworkTemplateDesigner.css";

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
        if (isCancelled) return;
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
    drawTemplate(context, canvasSize.width, canvasSize.height, tileSize.width, tileSize.height, templateData, loadedImages);
  }, [loadedImages, open, templateData, canvasSize.height, canvasSize.width]);

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
      <div className="quad-template-designer" role="dialog" aria-modal="true">
        <div className="quad-template-designer__backdrop" onClick={onClose} />
        <div className="quad-template-designer__panel">
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
              <p>挑选四幅作品，2×2 网格；信息展示与单图导出一致。</p>
            </div>

            {hasArtworks ? (
              <>
                <div className="quad-template-designer__group">
                  <h3>导出尺寸</h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(["1080x1080", "1080x1350", "1440x1800"] as SizePresetKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSizePreset(key)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: sizePreset === key ? "1px solid rgba(152,219,198,0.6)" : "1px solid rgba(239,234,231,0.18)",
                          background: sizePreset === key ? "rgba(152,219,198,0.16)" : "rgba(239,234,231,0.06)",
                          color: sizePreset === key ? "#98dbc6" : "rgba(239,234,231,0.85)",
                          cursor: "pointer",
                        }}
                      >
                        {key.replace("x", " × ")}
                      </button>
                    ))}
                  </div>
                </div>

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

                <div className="quad-template-designer__group">
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <label htmlFor="quad-title" style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 4 }}>标题</span>
                      <input
                        id="quad-title"
                        type="text"
                        value={title}
                        maxLength={40}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="请输入作品名称"
                        style={{ width: "100%" }}
                      />
                    </label>
                    {renderToggle(showTitle, () => setShowTitle((prev) => !prev), "标题")}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 8 }}>
                    <label htmlFor="quad-subtitle" style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 4 }}>简介</span>
                      <textarea
                        id="quad-subtitle"
                        rows={3}
                        value={subtitle}
                        maxLength={160}
                        onChange={(e) => setSubtitle(e.target.value)}
                        placeholder="为作品写一句陈列说明"
                        style={{ width: "100%" }}
                      />
                    </label>
                    {renderToggle(showSubtitle, () => setShowSubtitle((prev) => !prev), "简介")}
                  </div>
                </div>

                <div className="quad-template-designer__group">
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <label htmlFor="quad-username" style={{ flex: 1 }}>
                      <span style={{ display: "block", fontSize: 12, opacity: 0.75, marginBottom: 4 }}>署名</span>
                      <input
                        id="quad-username"
                        type="text"
                        value={username}
                        maxLength={32}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="将呈现在右下角"
                        style={{ width: "100%" }}
                      />
                    </label>
                    {renderToggle(showUsername, () => setShowUsername((prev) => !prev), "署名")}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ margin: "6px 0 0 0", opacity: 0.75, fontSize: 12 }}>日期与时长</p>
                      <span style={{ fontSize: 12, opacity: 0.7 }}>{timestampLabel}</span>
                    </div>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      {renderToggle(showDate, () => setShowDate((prev) => !prev), "日期")}
                      {renderToggle(showDuration, () => setShowDuration((prev) => !prev), "时长")}
                    </div>
                  </div>
                </div>

                <div className="quad-template-designer__group">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

                <div className="quad-template-designer__group">
                  <h3>阴影区与主题</h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "4px 0" }}>
                    {PRESET_SHADOW_COLORS.map((hex) => {
                      const active = shadowBaseHex.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          aria-label={`选择阴影色 ${hex}`}
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
                  <p className="quad-template-designer__fineprint">导出 PNG · 合成尺寸 {canvasSize.width} × {canvasSize.height}（每张 {tileSize.width} × {tileSize.height}）</p>
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
) {
  context.save();
  context.clearRect(0, 0, width, height);
  // 不绘制背景；直接在 2×2 网格内铺满（无间隔、无边距）
  const startX = 0;
  const startY = 0;
  const gap = 0;
  drawGridFrames(context, startX, startY, tileWidth, tileHeight, gap, width, height, data, images);
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
) {
  const radius = Math.min(frameWidth, frameHeight) * 0.035;
  data.items.forEach((item, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const frameX = startX + col * (frameWidth + gap);
    const frameY = startY + row * (frameHeight + gap);
    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.42)";
    context.shadowBlur = Math.min(frameWidth, frameHeight) * 0.05;
    context.shadowOffsetX = Math.min(frameWidth, frameHeight) * 0.02;
    context.shadowOffsetY = Math.min(frameWidth, frameHeight) * 0.03;
    drawRoundedRectPath(context, frameX + Math.min(frameWidth, frameHeight) * 0.01, frameY + Math.min(frameWidth, frameHeight) * 0.01, frameWidth, frameHeight, radius);
    context.fillStyle = "rgba(0, 0, 0, 0.4)";
    context.fill();
    context.restore();

    context.save();
    // 当前格即为图片+文案的承载区
    const tileRect = { x: frameX, y: frameY, width: frameWidth, height: frameHeight };

    drawRoundedRectPath(context, tileRect.x, tileRect.y, tileRect.width, tileRect.height, radius * 0.8);
    context.clip();
    const image = images[item.id];
    if (image && image.width > 0 && image.height > 0) {
      const scale = Math.max(tileRect.width / image.width, tileRect.height / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const dx = tileRect.x + (tileRect.width - drawWidth) / 2;
      const dy = tileRect.y + (tileRect.height - drawHeight) / 2;
      context.drawImage(image, dx, dy, drawWidth, drawHeight);
    } else {
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

    context.save();
    drawRoundedRectPath(context, tileRect.x, tileRect.y, tileRect.width, tileRect.height, radius * 0.8);
    context.lineWidth = Math.min(frameWidth, frameHeight) * 0.02;
    context.strokeStyle = "rgba(239, 234, 231, 0.18)";
    context.globalAlpha = 0.9;
    context.stroke();
    context.restore();

    // 每张图底部渐变与文字（标题/日期/时长/用户名），对齐单图导出风格，缩放到 tileRect 尺寸
    drawTileFooter(context, tileRect, data, item, frameWidth);
  });
}

function drawTileFooter(
  context: CanvasRenderingContext2D,
  tile: { x: number; y: number; width: number; height: number },
  data: TemplateViewModel,
  item: TemplateItem,
  _baseWidth: number,
) {
  const overlayHeight = Math.min(tile.height * 0.35, tile.width * 0.55);
  const overlayY = tile.y + tile.height - overlayHeight;
  const gradient = context.createLinearGradient(0, overlayY, 0, tile.y + tile.height);
  const base = data.shadowColor || "#221b1b";
  gradient.addColorStop(0, withAlpha(base, 0));
  gradient.addColorStop(1, withAlpha(base, 0.95 * data.overlayOpacity));

  context.save();
  drawRoundedRectPath(context, tile.x, overlayY, tile.width, overlayHeight, tile.width * 0.06);
  context.clip();
  context.fillStyle = gradient;
  context.fillRect(tile.x, overlayY, tile.width, overlayHeight);
  context.restore();

  const paddingX = tile.width * 0.06;
  const contentX = tile.x + paddingX;
  const contentWidth = tile.width - paddingX * 2;
  const lineHeight = Math.round(tile.width * 0.12);
  const bottomPadding = Math.round(tile.width * 0.05);
  const usernameY = tile.y + tile.height - bottomPadding;
  const blockBottomY = usernameY - Math.round(tile.width * 0.04);

  const title = (item.title || "").trim();
  const metaParts: string[] = [];
  if (data.dateLabel || item.dateLabel) metaParts.push(item.dateLabel || data.dateLabel);
  if (data.durationLabel || item.durationLabel) metaParts.push(item.durationLabel || data.durationLabel);
  const metaLine = metaParts.join(" / ");

  const enabledLines: Array<"title" | "meta"> = [];
  if (title) enabledLines.push("title");
  if (metaLine) enabledLines.push("meta");

  const totalLines = enabledLines.length;
  const getLineY = (indexFromTop: number) => {
    const indexFromBottom = totalLines - 1 - indexFromTop;
    return blockBottomY - lineHeight * indexFromBottom;
  };

  context.save();
  context.textAlign = "left";
  enabledLines.forEach((kind, indexFromTop) => {
    const y = getLineY(indexFromTop);
    if (kind === "title") {
      context.fillStyle = withAlpha(data.accentColor || "#9edac4", data.textOpacity);
      context.font = `600 ${Math.round(tile.width * 0.12)}px "Manrope", "Segoe UI", sans-serif`;
      const truncated = ellipsizeToWidth(context, title, contentWidth);
      context.fillText(truncated, contentX, y);
      return;
    }
    if (kind === "meta") {
      context.font = `400 ${Math.round(tile.width * 0.09)}px "Manrope", "Segoe UI", sans-serif`;
      context.fillStyle = withAlpha(data.textColor, data.textOpacity);
      const truncated = ellipsizeToWidth(context, metaLine, contentWidth);
      context.fillText(truncated, contentX, y);
    }
  });
  context.restore();

  const username = (data.username || "").trim();
  if (username) {
    context.textAlign = "right";
    context.font = `500 ${Math.round(tile.width * 0.10)}px "Manrope", "Segoe UI", sans-serif`;
    context.fillStyle = withAlpha(data.textColor, data.textOpacity);
    context.fillText(username, tile.x + tile.width - paddingX, usernameY);
  }
}

// 移除未使用的 drawGradientFooter 以通过构建

function drawTagBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  baseWidth: number,
  textOpacity: number,
  accentHex: string,
) {
  const paddingX = baseWidth * 0.012;
  const textWidth = context.measureText(text).width;
  const height = baseWidth * 0.034;
  const width = textWidth + paddingX * 2;
  drawRoundedRectPath(context, x, y, width, height, height / 2);
  context.fillStyle = withAlpha(accentHex || "#98dbc6", 0.12);
  context.fill();
  context.strokeStyle = withAlpha(accentHex || "#98dbc6", 0.4);
  context.stroke();
  context.fillStyle = withAlpha(accentHex || "#98dbc6", clamp01(0.9 * textOpacity));
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(text, x + paddingX, y + Math.round(height * 0.52));
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

function measureTagBadgeWidth(context: CanvasRenderingContext2D, text: string, baseWidth: number): number {
  const paddingX = baseWidth * 0.015;
  const textWidth = context.measureText(text).width;
  return textWidth + paddingX * 2;
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

