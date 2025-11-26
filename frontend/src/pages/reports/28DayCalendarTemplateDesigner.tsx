import { useEffect, useMemo, useRef, useState } from "react";
import React from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";
import { getOrLoadImages } from "@/utils/imageCache";

import "./SingleArtworkTemplateDesigner.css";
import "./28DayCalendarTemplateDesigner.css";

type TemplateViewModel = {
  days: CalendarDay[];
  username: string;
  textColor: string;
  textOpacity: number;
  accentColor: string;
};

type Calendar28DayTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type CalendarDay = {
  date: number; // 日期，如 2, 3, 4...
  artworkId: string | null; // 该日期选中的作品ID
};

const DEFAULT_USERNAME = "@EchoUser";
const PRESET_SHADOW_COLORS = ["#221b1b", "#4a3f4a", "#98dbc6", "#c5e1e2", "#efeae7", "#0c0a09", "#bfb8af", "#6b7280", "#1f2937", "#ffffff"];
const PRESET_ACCENT_COLORS = ["#98dbc6", "#b0b0b0", "#f5a3c7", "#7db3ff", "#ffd66b"];

const WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
const CATEGORIES = [
  { label: "素描", span: 3, color: "rgba(255, 255, 255, 0.6)" },
  { label: "色彩", span: 3, color: "rgba(239, 68, 68, 0.8)" },
];

// 生成6月2日到6月29日的28天
function generateDays(): CalendarDay[] {
  const days: CalendarDay[] = [];
  for (let i = 2; i <= 29; i++) {
    days.push({ date: i, artworkId: null });
  }
  return days;
}

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1760;

function Calendar28DayTemplateDesigner({ open, artworks, onClose }: Calendar28DayTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [days, setDays] = useState<CalendarDay[]>(generateDays());
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const [shadowBaseHex, setShadowBaseHex] = useState<string>("#221b1b");
  const [shadowOpacity, setShadowOpacity] = useState<number>(85);
  const [shadowSaturation, setShadowSaturation] = useState<number>(70);
  const [textOpacityPercent, setTextOpacityPercent] = useState<number>(92);
  const [accentHex, setAccentHex] = useState<string>("#98dbc6");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [textTone, setTextTone] = useState<"light" | "dark">("light");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDayIndex, setPickerDayIndex] = useState<number | null>(null);
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});

  const hasArtworks = artworks.length > 0;

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      setPickerDayIndex(null);
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
          setUsername(resolved);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("[28DayCalendarTemplateDesigner] 无法加载用户昵称：", error);
          setUsername(DEFAULT_USERNAME);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleDayClick = (dayIndex: number) => {
    setPickerDayIndex(dayIndex);
    setPickerOpen(true);
  };

  const handleArtworkSelect = (artworkId: string) => {
    if (pickerDayIndex === null) return;
    setDays((prev) => {
      const next = [...prev];
      next[pickerDayIndex] = { ...next[pickerDayIndex], artworkId };
      return next;
    });
    setPickerOpen(false);
    setPickerDayIndex(null);
  };

  const handleClearDay = (dayIndex: number) => {
    setDays((prev) => {
      const next = [...prev];
      next[dayIndex] = { ...next[dayIndex], artworkId: null };
      return next;
    });
  };

  // 获取所有选中的作品ID
  const selectedArtworkIds = useMemo(() => {
    const ids = days.map((day) => day.artworkId).filter((id): id is string => id !== null);
    return Array.from(new Set(ids));
  }, [days]);

  // 加载图片
  useEffect(() => {
    if (!open) {
      setLoadedImages({});
      return;
    }
    if (selectedArtworkIds.length === 0) {
      setLoadedImages({});
      return;
    }
    let isCancelled = false;
    
    // 收集需要加载的图片 URL
    const imageSrcs: string[] = [];
    const artworkIdToSrc = new Map<string, string>();
    
    selectedArtworkIds.forEach((artworkId) => {
      const artwork = artworks.find((a) => a.id === artworkId);
      if (artwork && !imageSrcs.includes(artwork.imageSrc)) {
        imageSrcs.push(artwork.imageSrc);
        artworkIdToSrc.set(artworkId, artwork.imageSrc);
      }
    });
    
    if (imageSrcs.length === 0) {
      setLoadedImages({});
      return;
    }
    
    // 使用共享的图片缓存工具加载图片
    getOrLoadImages(imageSrcs)
      .then((imageMap) => {
        if (isCancelled) return;
        const next: Record<string, HTMLImageElement> = {};
        selectedArtworkIds.forEach((artworkId) => {
          const src = artworkIdToSrc.get(artworkId);
          if (src) {
            const img = imageMap.get(src);
            if (img) {
              next[artworkId] = img;
            }
          }
        });
        setLoadedImages(next);
      })
      .catch(() => {
        if (!isCancelled) {
          setLoadedImages({});
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [open, selectedArtworkIds, artworks]);

  // 构建模板数据
  const templateData = useMemo<TemplateViewModel | null>(() => {
    if (!open) {
      return null;
    }
    const textBase = textTone === "light" ? "#f7f2ec" : "#161514";
    const textOpacity = clamp01(textOpacityPercent / 100);
    return {
      days,
      username: normalizeUsername(username),
      textColor: textBase,
      textOpacity,
      accentColor: accentHex,
    };
  }, [open, days, username, textTone, textOpacityPercent, accentHex]);

  // 绘制canvas
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
    drawTemplate(context, CANVAS_WIDTH, CANVAS_HEIGHT, templateData, loadedImages, artworks);
  }, [open, templateData, loadedImages, artworks]);

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

          <div className="calendar-28day-template-designer__layout">
            <section>
              <div className="calendar-28day-template-designer__group calendar-28day-template-designer__group--hero">
                <div className="calendar-28day-template-designer__heading">
                  <h2>28天作品日历</h2>
                  <p>为每个日期选择作品，生成深色风格的日历模板。</p>
                </div>
              </div>
            </section>

            {!hasArtworks ? (
              <section>
                <div className="calendar-28day-template-designer__preview-empty">
                  <MaterialIcon name="photo_library" />
                  <p>你还没有上传作品</p>
                  <span>请先在「画集」里完成一次上传，再体验展板模板。</span>
                  <button type="button" onClick={onClose}>
                    返回画集
                  </button>
                </div>
              </section>
            ) : null}

            {hasArtworks ? (
              <section style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
                <div style={{ flex: "1", minWidth: 0 }}>
                  <div className="single-template-designer__mockup">
                    <div className="single-template-designer__device">
                      <div className="single-template-designer__device-screen" style={{ aspectRatio: CANVAS_WIDTH / CANVAS_HEIGHT }}>
                        <canvas
                          ref={canvasRef}
                          className="calendar-28day-template-designer__canvas single-template-designer__canvas"
                          style={{ width: "100%", height: "100%", display: "block" }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <aside className="calendar-28day-template-designer__sidebar">
                  <div className="calendar-28day-template-designer__group">
                    <h3>日历选择</h3>
                    <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
                      点击日期格子选择作品，或点击已选中的格子更换作品
                    </p>
                    <div className="calendar-28day-template-designer__calendar-grid" style={{ gridTemplateRows: "auto auto repeat(4, auto auto)" }}>
                    {/* 分类标题行 */}
                    <div style={{ gridColumn: 1, gridRow: 1 }}></div>
                    <div
                      className="calendar-28day-template-designer__category-header"
                      style={{ gridColumn: "2 / 5", gridRow: 1, color: CATEGORIES[0].color }}
                    >
                      {CATEGORIES[0].label}
                    </div>
                    <div
                      className="calendar-28day-template-designer__category-header"
                      style={{ gridColumn: "5 / 8", gridRow: 1, color: CATEGORIES[1].color }}
                    >
                      {CATEGORIES[1].label}
                    </div>
                    <div style={{ gridColumn: 8, gridRow: 1 }}></div>

                    {/* 星期标题行 */}
                    <div style={{ gridColumn: 1, gridRow: 2 }}></div>
                    {WEEKDAYS.map((day, idx) => (
                      <div
                        key={day}
                        className="calendar-28day-template-designer__weekday-header"
                        style={{ gridColumn: idx + 2, gridRow: 2 }}
                      >
                        {day}
                      </div>
                    ))}

                    {/* 4周，每周2行（日期标签行 + 作品格子行） */}
                    {Array.from({ length: 4 }).map((_, week) => {
                      const dateRow = week * 2 + 3;
                      const cellRow = week * 2 + 4;

                      return (
                        <React.Fragment key={`week-${week}`}>
                          {/* 日期标签行 */}
                          <div style={{ gridColumn: 1, gridRow: dateRow }}></div>
                          {Array.from({ length: 7 }).map((_, dayIdx) => {
                            const dayIndex = week * 7 + dayIdx;
                            if (dayIndex >= days.length) return null;
                            const day = days[dayIndex];
                            return (
                              <div
                                key={`date-${week}-${dayIdx}`}
                                className="calendar-28day-template-designer__date-label"
                                style={{ gridColumn: dayIdx + 2, gridRow: dateRow }}
                              >
                                {dayIdx === 0 ? `6月${day.date}日` : ""}
                              </div>
                            );
                          })}
                          <div style={{ gridColumn: 8, gridRow: dateRow }}></div>

                          {/* 作品格子行 */}
                          {Array.from({ length: 7 }).map((_, dayIdx) => {
                            const dayIndex = week * 7 + dayIdx;
                            if (dayIndex >= days.length) return null;
                            const day = days[dayIndex];
                            const artwork = day.artworkId ? artworks.find((a) => a.id === day.artworkId) : null;

                            return (
                              <React.Fragment key={`cell-fragment-${week}-${dayIdx}`}>
                                {/* 左侧标签（每周第一列） */}
                                {dayIdx === 0 && (
                                  <div
                                    className="calendar-28day-template-designer__week-label"
                                    style={{ gridColumn: 1, gridRow: cellRow }}
                                  >
                                    粉粉
                                  </div>
                                )}
                                {/* 作品格子 */}
                                <button
                                  key={`cell-${week}-${dayIdx}`}
                                  type="button"
                                  className="calendar-28day-template-designer__day-cell"
                                  onClick={() => handleDayClick(dayIndex)}
                                  style={{ gridColumn: dayIdx + 2, gridRow: cellRow }}
                                >
                                  {artwork ? (
                                    <>
                                      <img src={artwork.imageSrc} alt={artwork.alt} loading="lazy" />
                                      <button
                                        type="button"
                                        className="calendar-28day-template-designer__clear-button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleClearDay(dayIndex);
                                        }}
                                        aria-label="清除作品"
                                      >
                                        <MaterialIcon name="close" />
                                      </button>
                                    </>
                                  ) : (
                                    <MaterialIcon name="add_photo_alternate" />
                                  )}
                                </button>
                              </React.Fragment>
                            );
                          })}
                          <div style={{ gridColumn: 8, gridRow: cellRow }}></div>
                        </React.Fragment>
                      );
                    })}
                    </div>
                  </div>

                  <div className="calendar-28day-template-designer__group">
                    <h3>署名</h3>
                    <input
                      id="calendar-username"
                      type="text"
                      value={username}
                      maxLength={32}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="将呈现在底部"
                      style={{ width: "100%", border: "none", borderBottom: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "rgba(255,255,255,0.92)", fontSize: "0.95rem", padding: "0.2rem 0", fontFamily: "inherit" }}
                    />
                  </div>

                  <div className="calendar-28day-template-designer__group">
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
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "2px 0" }}>
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

                  <div className="calendar-28day-template-designer__actions">
                    <button
                      type="button"
                      className="calendar-28day-template-designer__download"
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
                    >
                      <MaterialIcon name="download" />
                      保存为图片
                    </button>
                    <p className="calendar-28day-template-designer__fineprint">导出 PNG · 28天作品日历</p>
                  </div>
                </aside>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {pickerOpen && hasArtworks && pickerDayIndex !== null ? (
        <div className="calendar-28day-template-picker" role="dialog" aria-modal="true">
          <div className="calendar-28day-template-picker__backdrop" onClick={() => setPickerOpen(false)} />
          <div className="calendar-28day-template-picker__panel">
            <div className="calendar-28day-template-picker__header">
              <h3>选择作品 - 6月{days[pickerDayIndex]?.date}日</h3>
              <button
                type="button"
                className="calendar-28day-template-picker__close"
                aria-label="关闭作品选择"
                onClick={() => setPickerOpen(false)}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="calendar-28day-template-picker__grid" role="listbox" aria-label="可套用的作品">
              {artworks.map((artwork) => {
                const isActive = days[pickerDayIndex]?.artworkId === artwork.id;
                return (
                  <button
                    key={artwork.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`calendar-28day-template-picker__item${isActive ? " calendar-28day-template-picker__item--active" : ""}`}
                    onClick={() => handleArtworkSelect(artwork.id)}
                  >
                    <img src={artwork.imageSrc} alt={artwork.alt} loading="lazy" />
                    <span>{artwork.title || "未命名"}</span>
                    {isActive ? <MaterialIcon name="check" className="calendar-28day-template-picker__check" /> : null}
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
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewImageUrl(null);
        }}
        title="28天日历导出"
      />
    </>
  );
}

export default Calendar28DayTemplateDesigner;

// Helper functions (从其他文件复用)
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
    console.warn("[28DayCalendarTemplateDesigner] 无法获取用户昵称配置：", error);
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

type RGBColor = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

function hexToRgb(hex: string): RGBColor | null {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) return null;
  const expanded = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) return null;
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

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

function rgbToHex(color: RGBColor): string {
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function desaturateHex(hex: string, t: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  const s = clamp01(t);
  const adjusted = hslToRgb({ h: hsl.h, s, l: hsl.l });
  return rgbToHex(adjusted);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function withAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return `rgba(0, 0, 0, ${clamp01(alpha)})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

// Canvas绘制函数
function drawTemplate(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TemplateViewModel,
  loadedImages: Record<string, HTMLImageElement>,
  artworks: Artwork[],
) {
  context.save();
  context.clearRect(0, 0, width, height);

  // 绘制深色背景
  context.fillStyle = "#221b1b";
  context.fillRect(0, 0, width, height);

  // 网格参数
  const padding = width * 0.05;
  const labelColumnWidth = width * 0.08;
  const cellWidth = (width - padding * 2 - labelColumnWidth) / 7;
  const headerHeight = width * 0.08;
  const cellHeight = cellWidth; // 正方形格子

  const startY = padding;
  let currentY = startY;

  // 绘制分类标题行
  currentY += headerHeight;
  const categoryY = currentY - headerHeight;
  context.fillStyle = "rgba(255, 255, 255, 0.03)";
  context.fillRect(padding + labelColumnWidth, categoryY, width - padding * 2 - labelColumnWidth, headerHeight);

  // 绘制星期标题行
  currentY += headerHeight;
  const weekdayY = currentY - headerHeight;
  context.fillStyle = "rgba(255, 255, 255, 0.02)";
  context.fillRect(padding + labelColumnWidth, weekdayY, width - padding * 2 - labelColumnWidth, headerHeight);

  // 绘制星期标签
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = withAlpha(data.textColor, data.textOpacity * 0.7);
  context.font = `400 ${Math.round(headerHeight * 0.35)}px "Manrope", "Segoe UI", sans-serif`;
  WEEKDAYS.forEach((day, idx) => {
    const x = padding + labelColumnWidth + idx * cellWidth + cellWidth / 2;
    context.fillText(day, x, weekdayY + headerHeight / 2);
  });

  // 绘制日期和作品格子
  data.days.forEach((day, index) => {
    const week = Math.floor(index / 7);
    const weekDay = index % 7;
    const cellX = padding + labelColumnWidth + weekDay * cellWidth;
    const cellY = currentY + week * (cellHeight + headerHeight * 0.3);

    // 绘制日期标签（每周第一列）
    if (weekDay === 0) {
      context.textAlign = "left";
      context.fillStyle = withAlpha(data.textColor, data.textOpacity * 0.5);
      context.font = `300 ${Math.round(cellWidth * 0.12)}px "Manrope", "Segoe UI", sans-serif`;
      context.fillText(`6月${day.date}日`, cellX - labelColumnWidth + padding * 0.5, cellY + cellHeight / 2);
    }

    // 绘制左侧标签（每周第一行）
    if (week === Math.floor(index / 7) && index % 7 === 0) {
      context.save();
      context.translate(padding + labelColumnWidth * 0.5, cellY + cellHeight / 2);
      context.rotate(-Math.PI / 2);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = withAlpha(data.accentColor, 0.8);
      context.font = `400 ${Math.round(labelColumnWidth * 0.25)}px "Manrope", "Segoe UI", sans-serif`;
      context.fillText("粉粉", 0, 0);
      context.restore();
    }

    // 绘制格子边框
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;
    context.strokeRect(cellX, cellY, cellWidth, cellHeight);

    // 绘制作品图片或占位符
    if (day.artworkId) {
      const artwork = artworks.find((a) => a.id === day.artworkId);
      const image = artwork ? loadedImages[day.artworkId!] : null;
      if (image && image.width > 0 && image.height > 0) {
        context.save();
        // 裁剪到格子内
        context.beginPath();
        context.rect(cellX, cellY, cellWidth, cellHeight);
        context.clip();
        // 绘制图片
        const scale = Math.max(cellWidth / image.width, cellHeight / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        const dx = cellX + (cellWidth - drawWidth) / 2;
        const dy = cellY + (cellHeight - drawHeight) / 2;
        context.drawImage(image, dx, dy, drawWidth, drawHeight);
        context.restore();
      } else {
        // 占位符
        context.fillStyle = "rgba(255, 255, 255, 0.02)";
        context.fillRect(cellX, cellY, cellWidth, cellHeight);
      }
    } else {
      // 空格子
      context.fillStyle = "rgba(255, 255, 255, 0.02)";
      context.fillRect(cellX, cellY, cellWidth, cellHeight);
    }
  });

  // 绘制底部署名
  const footerY = height - padding * 1.5;
  context.textAlign = "center";
  context.fillStyle = withAlpha(data.textColor, data.textOpacity * 0.4);
  context.font = `400 ${Math.round(width * 0.025)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText(`小红书号: ${data.username || "9548836594"}`, width / 2, footerY);

  context.restore();
}

