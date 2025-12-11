import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";
import { getOrLoadImage } from "@/utils/imageCache";
import { formatDurationLabel } from "@/pages/Gallery";

import "./SingleArtworkTemplateDesigner.css";
import "./WeeklyCalendarTemplateDesigner.css";

type WeeklyCalendarTemplateDesignerProps = {
  open: boolean;
  artworks: Artwork[];
  onClose: () => void;
};

type WeekDayData = {
  date: Date;
  weekday: string;
  dateLabel: string;
  artwork: Artwork | null;
};

type TemplateViewModel = {
  year: number;
  month: number;
  weekNumber: number;
  weekDays: WeekDayData[];
  username: string;
  totalDuration: number;
  totalUploads: number;
  accentColor: string;
  textColor: string;
  textOpacity: number;
  shadowColor: string;
  overlayOpacity: number;
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1080;
const DEFAULT_USERNAME = "@EchoUser";
const GRID_SIZE = 3; // 3x3 网格
const EMPTY_POSITIONS = [2, 6]; // 第3张（索引2）和第7张（索引6）留空

const PRESET_SHADOW_COLORS = [
  "#221b1b",
  "#4a3f4a",
  "#98dbc6",
  "#c5e1e2",
  "#efeae7",
  "#0c0a09",
  "#bfb8af",
  "#6b7280",
  "#1f2937",
  "#ffffff",
];

const PRESET_ACCENT_COLORS = [
  "#98dbc6", // 薄荷绿
  "#b0b0b0", // 灰黑
  "#f5a3c7", // 粉色
  "#7db3ff", // 蓝色
  "#ffd66b", // 黄色
];

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function WeeklyCalendarTemplateDesigner({ open, artworks, onClose }: WeeklyCalendarTemplateDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const [weekDays, setWeekDays] = useState<WeekDayData[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, HTMLImageElement>>({});
  const [imageStatus, setImageStatus] = useState<ImageStatus>("idle");
  const [shadowBaseHex, setShadowBaseHex] = useState<string>("#4a3f4a");
  const [shadowOpacity, setShadowOpacity] = useState<number>(85);
  const [shadowSaturation, setShadowSaturation] = useState<number>(70);
  const [textOpacityPercent, setTextOpacityPercent] = useState<number>(92);
  const [accentHex, setAccentHex] = useState<string>("#98dbc6");
  const [textTone, setTextTone] = useState<"light" | "dark">("light");

  const hasArtworks = artworks.length > 0;

  // 计算指定年月的周数
  const weekCount = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const firstWeekStart = startOfWeek(firstDay);
    const lastWeekStart = startOfWeek(lastDay);
    const diffWeeks = Math.ceil((lastWeekStart.getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return Math.max(1, diffWeeks + 1);
  }, [selectedYear, selectedMonth]);

  // 计算指定周的开始日期
  const weekStartDate = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const firstWeekStart = startOfWeek(firstDay);
    const weekStart = new Date(firstWeekStart);
    weekStart.setDate(firstWeekStart.getDate() + (selectedWeek - 1) * 7);
    return weekStart;
  }, [selectedYear, selectedMonth, selectedWeek]);

  // 生成一周的日期数据
  useEffect(() => {
    const days: WeekDayData[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStartDate);
      date.setDate(weekStartDate.getDate() + i);
      const weekday = WEEKDAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1];
      const dateLabel = formatDateLabel(date);
      days.push({
        date,
        weekday,
        dateLabel,
        artwork: null,
      });
    }
    setWeekDays(days);
  }, [weekStartDate]);

  // 根据日期筛选作品
  const getArtworksByDate = useCallback((date: Date): Artwork[] => {
    const dateKey = formatISODate(date);
    return artworks.filter((artwork) => {
      const artworkDate = resolveArtworkDate(artwork);
      if (!artworkDate) return false;
      return formatISODate(artworkDate) === dateKey;
    });
  }, [artworks]);

  // 计算本周总时长和总上传数
  const weekStats = useMemo(() => {
    let totalDuration = 0;
    let totalUploads = 0;
    weekDays.forEach((day) => {
      const dayArtworks = getArtworksByDate(day.date);
      totalUploads += dayArtworks.length;
      dayArtworks.forEach((artwork) => {
        const duration = parseDurationMinutes(artwork);
        if (duration !== null) {
          totalDuration += duration;
        }
      });
    });
    return { totalDuration, totalUploads };
  }, [weekDays, getArtworksByDate]);

  // 加载图片
  useEffect(() => {
    if (!open) {
      setLoadedImages({});
      setImageStatus("idle");
      return;
    }
    const artworksToLoad = weekDays.filter((day) => day.artwork !== null).map((day) => day.artwork!);
    if (artworksToLoad.length === 0) {
      setImageStatus("ready");
      return;
    }
    let isCancelled = false;
    setImageStatus("loading");
    Promise.all(artworksToLoad.map((artwork) => getOrLoadImage(artwork.imageSrc)))
      .then((images) => {
        if (isCancelled) return;
        const next: Record<string, HTMLImageElement> = {};
        artworksToLoad.forEach((artwork, index) => {
          const img = images[index];
          if (img) {
            next[artwork.id] = img;
          }
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
  }, [open, weekDays]);

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
          console.warn("[WeeklyCalendarTemplateDesigner] 无法加载用户昵称：", error);
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

  const templateData = useMemo<TemplateViewModel | null>(() => {
    if (weekDays.length === 0) {
      return null;
    }
    const accentColor = accentHex;
    const effectiveShadow = adjustHexSaturation(shadowBaseHex, clamp01(shadowSaturation / 100));
    const overlayOpacity = clamp01(shadowOpacity / 100);
    const textBase = textTone === "light" ? "#f7f2ec" : "#161514";
    const textOpacity = clamp01(textOpacityPercent / 100);
    return {
      year: selectedYear,
      month: selectedMonth,
      weekNumber: selectedWeek,
      weekDays,
      username: normalizeUsername(username),
      totalDuration: weekStats.totalDuration,
      totalUploads: weekStats.totalUploads,
      accentColor,
      textColor: textBase,
      textOpacity,
      shadowColor: effectiveShadow,
      overlayOpacity,
    };
  }, [
    selectedYear,
    selectedMonth,
    selectedWeek,
    weekDays,
    username,
    weekStats,
    accentHex,
    shadowBaseHex,
    shadowOpacity,
    shadowSaturation,
    textTone,
    textOpacityPercent,
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

    if (canvas.width !== CANVAS_WIDTH || canvas.height !== CANVAS_HEIGHT) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
    }

    drawTemplate(context, CANVAS_WIDTH, CANVAS_HEIGHT, templateData, loadedImages);
  }, [open, templateData, loadedImages]);

  const handleDayClick = (dayIndex: number) => {
    if (EMPTY_POSITIONS.includes(dayIndex)) {
      return; // 空位置不可点击
    }
    setSelectedDayIndex(dayIndex);
    setPickerOpen(true);
  };

  const handleSelectArtwork = (artwork: Artwork) => {
    if (selectedDayIndex === null) return;
    setWeekDays((prev) => {
      const next = [...prev];
      next[selectedDayIndex] = {
        ...next[selectedDayIndex],
        artwork,
      };
      return next;
    });
    setPickerOpen(false);
    setSelectedDayIndex(null);
  };

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    try {
      // 等待绘制完成（移动设备可能需要更长时间）
      const { waitForCanvasRender, exportCanvasToDataURL } = await import("@/utils/canvasExport");
      await waitForCanvasRender();

      // 现在尝试导出（使用安全的导出函数，包含移动端处理）
      const dataURL = exportCanvasToDataURL(canvas, "image/png");
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

  const selectedDay = selectedDayIndex !== null && selectedDayIndex >= 0 && selectedDayIndex < weekDays.length ? weekDays[selectedDayIndex] : null;
  const dayArtworks = selectedDay ? getArtworksByDate(selectedDay.date) : [];

  return (
    <>
      <div className="single-template-designer" role="dialog" aria-modal="true">
        <div className="single-template-designer__background" aria-hidden="true">
          <div className="single-template-designer__glow single-template-designer__glow--left" />
          <div className="single-template-designer__glow single-template-designer__glow--right" />
        </div>
        <div className="single-template-designer__content">
          <TopNav
            title="周历模版"
            subtitle="Weekly Calendar"
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
                  <span>请先在「画集」里完成一次上传，再体验周历模板。</span>
                  <button type="button" onClick={onClose}>
                    返回画集
                  </button>
                </div>
              )}
            </section>

            {hasArtworks ? (
              <section>
                <div className="single-template-designer__group single-template-designer__group--hero">
                  <div className="single-template-designer__group-header">
                    <h2>周历设置</h2>
                    <p>选择年、月、周数，为每一天选择作品。</p>
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>选择时间</h3>
                  </div>
                  <div className="weekly-calendar__time-selector">
                    <div className="weekly-calendar__time-field">
                      <label>年份</label>
                      <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                      >
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="weekly-calendar__time-field">
                      <label>月份</label>
                      <select
                        value={selectedMonth}
                        onChange={(e) => {
                          setSelectedMonth(Number(e.target.value));
                          setSelectedWeek(1);
                        }}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                          <option key={month} value={month}>
                            {month}月
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="weekly-calendar__time-field">
                      <label>周数</label>
                      <select
                        value={selectedWeek}
                        onChange={(e) => setSelectedWeek(Number(e.target.value))}
                      >
                        {Array.from({ length: weekCount }, (_, i) => i + 1).map((week) => (
                          <option key={week} value={week}>
                            第{week}周
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>选择作品</h3>
                    <p>点击每一天的格子，选择该日期上传的作品。</p>
                  </div>
                  <div className="weekly-calendar__grid-preview">
                    {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
                      const isEmpty = EMPTY_POSITIONS.includes(index);
                      
                      if (isEmpty) {
                        if (index === 2) {
                          // 第3个位置（索引2）显示周数信息
                          return (
                            <div key={index} className="weekly-calendar__grid-cell weekly-calendar__grid-cell--info">
                              <div className="weekly-calendar__week-info">
                                <p>{selectedYear}/{String(selectedMonth).padStart(2, "0")}</p>
                                <p>第{selectedWeek}周</p>
                              </div>
                            </div>
                          );
                        }
                        if (index === 6) {
                          // 第7个位置（索引6）显示统计信息
                          return (
                            <div key={index} className="weekly-calendar__grid-cell weekly-calendar__grid-cell--info">
                              <div className="weekly-calendar__stats-info">
                                <p>{normalizeUsername(username)}</p>
                                <p>本周总时长：{formatDurationLabel(weekStats.totalDuration)}</p>
                                <p>本周总上传：{weekStats.totalUploads} 张</p>
                              </div>
                            </div>
                          );
                        }
                      }
                      
                      // 计算对应的日期索引
                      // 网格布局：0,1,2(空),3,4,5,6(空),7,8
                      // 日期索引：0,1,    2,3,4,    5,6
                      let dayIndex = -1;
                      if (index < 2) {
                        dayIndex = index; // 0, 1
                      } else if (index < 6) {
                        dayIndex = index - 1; // 2, 3, 4
                      } else {
                        dayIndex = index - 2; // 5, 6
                      }
                      
                      const day = dayIndex >= 0 && dayIndex < weekDays.length ? weekDays[dayIndex] : null;
                      if (!day) return null;
                      
                      return (
                        <button
                          key={index}
                          type="button"
                          className="weekly-calendar__grid-cell"
                          onClick={() => handleDayClick(dayIndex)}
                        >
                          {day.artwork ? (
                            <>
                              <img src={day.artwork.imageSrc} alt={day.artwork.alt} loading="lazy" />
                              <div className="weekly-calendar__day-label">
                                {day.weekday}·{day.dateLabel}
                              </div>
                            </>
                          ) : (
                            <div className="weekly-calendar__grid-cell-empty">
                              <MaterialIcon name="add_photo_alternate" />
                              <span>{day.weekday}</span>
                              <small>{day.dateLabel}</small>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="single-template-designer__group" style={{ marginTop: 0, paddingTop: 8, paddingBottom: 8 }}>
                  <div className="single-template-designer__group-header" style={{ marginBottom: 6 }}>
                    <h3>样式设置</h3>
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
                    onClick={handleDownload}
                    disabled={!templateData || imageStatus === "loading"}
                  >
                    <MaterialIcon name="download" />
                    保存为图片
                  </button>
                  <p>导出 PNG · 1080 × 1080 像素 · 适配社交媒体展示。</p>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {pickerOpen && selectedDay && (
        <div className="single-template-designer__picker" role="dialog" aria-modal="true">
          <div className="single-template-designer__picker-backdrop" onClick={() => {
            setPickerOpen(false);
            setSelectedDayIndex(null);
          }} />
          <div className="single-template-designer__picker-panel">
            <div className="single-template-designer__picker-header">
              <h3>选择作品 - {selectedDay.weekday} {selectedDay.dateLabel}</h3>
              <button
                type="button"
                className="single-template-designer__picker-close"
                aria-label="关闭作品选择"
                onClick={() => {
                  setPickerOpen(false);
                  setSelectedDayIndex(null);
                }}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            {dayArtworks.length === 0 ? (
              <div className="single-template-designer__picker-empty">
                <MaterialIcon name="image_not_supported" />
                <p>该日期没有上传作品</p>
              </div>
            ) : (
              <div className="single-template-designer__artwork-grid" role="listbox" aria-label="可套用的作品">
                {dayArtworks.map((artwork) => (
                  <button
                    key={artwork.id}
                    type="button"
                    role="option"
                    aria-selected={weekDays[selectedDayIndex!]?.artwork?.id === artwork.id}
                    className={`single-template-designer__artwork-button${weekDays[selectedDayIndex!]?.artwork?.id === artwork.id ? " single-template-designer__artwork-button--active" : ""}`}
                    onClick={() => handleSelectArtwork(artwork)}
                  >
                    <img src={artwork.imageSrc} alt={artwork.alt} loading="lazy" />
                    <span>{artwork.title || "未命名"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ImagePreviewModal
        open={showPreviewModal}
        imageUrl={previewImageUrl}
        onClose={handleClosePreview}
        title="周历导出"
      />
    </>
  );
}

export default WeeklyCalendarTemplateDesigner;

// 工具函数
function startOfWeek(reference: Date): Date {
  const result = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const day = result.getDay();
  const diff = (day + 6) % 7; // 周一作为一周开始
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
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
  const [datePart] = normalized.split(" ");
  return parseDate(datePart ?? "");
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

function parseDurationMinutes(source: Artwork): number | null {
  if (typeof source.durationMinutes === "number" && Number.isFinite(source.durationMinutes)) {
    return Math.max(source.durationMinutes, 0);
  }
  if (typeof source.duration === "string" && source.duration.trim().length > 0) {
    const match = source.duration.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
    if (match) {
      const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
      const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        const total = hours * 60 + minutes;
        return total >= 0 ? total : null;
      }
    }
  }
  return null;
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
    console.warn("[WeeklyCalendarTemplateDesigner] 无法获取用户昵称配置：", error);
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

// Canvas 绘制函数
function drawTemplate(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: TemplateViewModel,
  images: Record<string, HTMLImageElement>,
) {
  context.save();
  context.clearRect(0, 0, width, height);

  // 绘制背景
  drawCanvasBackground(context, width, height, data.shadowColor);

  // 计算网格布局
  const gridSize = 3;
  const gap = width * 0.02;
  const cellSize = (width - gap * (gridSize + 1)) / gridSize;

  // 绘制网格（7个日期位置）
  data.weekDays.forEach((day, dayIndex) => {
    // 计算网格位置：0,1,2(空),3,4,5,6(空),7,8
    // 日期索引：0,1,    2,3,4,    5,6
    let gridIndex = -1;
    if (dayIndex < 2) {
      gridIndex = dayIndex; // 0, 1
    } else if (dayIndex < 5) {
      gridIndex = dayIndex + 1; // 3, 4, 5
    } else {
      gridIndex = dayIndex + 2; // 7, 8
    }
    
    const row = Math.floor(gridIndex / gridSize);
    const col = gridIndex % gridSize;
    const x = gap + col * (cellSize + gap);
    const y = gap + row * (cellSize + gap);

    if (day.artwork) {
      const image = images[day.artwork.id];
      drawCellImage(context, x, y, cellSize, cellSize, image, data);
      // 绘制日期标签
      drawDayLabel(context, x, y, cellSize, cellSize, day.weekday, day.dateLabel, data);
    } else {
      drawCellPlaceholder(context, x, y, cellSize, cellSize, day.weekday, day.dateLabel, data);
    }
  });

  // 绘制第3个位置（周数信息）
  const infoRow1 = 0;
  const infoCol1 = 2;
  const infoX1 = gap + infoCol1 * (cellSize + gap);
  const infoY1 = gap + infoRow1 * (cellSize + gap);
  drawWeekInfo(context, infoX1, infoY1, cellSize, cellSize, data);

  // 绘制第7个位置（统计信息）
  const infoRow2 = 2;
  const infoCol2 = 0;
  const infoX2 = gap + infoCol2 * (cellSize + gap);
  const infoY2 = gap + infoRow2 * (cellSize + gap);
  drawStatsInfo(context, infoX2, infoY2, cellSize, cellSize, data);

  context.restore();
}

function drawCanvasBackground(context: CanvasRenderingContext2D, width: number, height: number, shadowColor: string) {
  context.fillStyle = "#120c0b";
  context.fillRect(0, 0, width, height);
  const overlay = context.createLinearGradient(0, 0, width, height);
  overlay.addColorStop(0, withAlpha(shadowColor || "#4a3f4a", 0.18));
  overlay.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  context.fillStyle = overlay;
  context.fillRect(0, 0, width, height);
}

function drawCellImage(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  image: HTMLImageElement | undefined,
  _data: TemplateViewModel,
) {
  context.save();
  const radius = width * 0.03;
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.clip();

  if (image && image.width > 0 && image.height > 0) {
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = x + (width - drawWidth) / 2;
    const dy = y + (height - drawHeight) / 2;
    context.drawImage(image, dx, dy, drawWidth, drawHeight);
  } else {
    const placeholder = context.createLinearGradient(x, y, x + width, y + height);
    placeholder.addColorStop(0, "rgba(152, 219, 198, 0.18)");
    placeholder.addColorStop(1, "rgba(152, 219, 198, 0.05)");
    context.fillStyle = placeholder;
    context.fillRect(x, y, width, height);
  }

  context.restore();

  // 绘制边框
  context.save();
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.lineWidth = width * 0.01;
  context.strokeStyle = "rgba(239, 234, 231, 0.18)";
  context.stroke();
  context.restore();
}

function drawCellPlaceholder(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  weekday: string,
  dateLabel: string,
  data: TemplateViewModel,
) {
  context.save();
  const radius = width * 0.03;
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = "rgba(255, 255, 255, 0.05)";
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.15)";
  context.lineWidth = width * 0.01;
  context.stroke();
  context.restore();

  // 绘制文字
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `500 ${Math.round(width * 0.08)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillStyle = withAlpha(data.textColor, data.textOpacity * 0.6);
  context.fillText(weekday, x + width / 2, y + height / 2 - width * 0.05);
  context.font = `400 ${Math.round(width * 0.06)}px "Manrope", "Segoe UI", sans-serif`;
  context.fillText(dateLabel, x + width / 2, y + height / 2 + width * 0.05);
  context.restore();
}

function drawDayLabel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  weekday: string,
  dateLabel: string,
  data: TemplateViewModel,
) {
  context.save();
  const labelText = `${weekday}·${dateLabel}`;
  const fontSize = Math.round(width * 0.04);
  context.font = `500 ${fontSize}px "Manrope", "Segoe UI", sans-serif`;
  const metrics = context.measureText(labelText);
  const textWidth = metrics.width;
  const textHeight = fontSize;
  const padding = width * 0.02;
  const bgX = x + width - textWidth - padding * 2;
  const bgY = y + height - textHeight - padding * 2;
  const bgWidth = textWidth + padding * 2;
  const bgHeight = textHeight + padding * 2;

  // 绘制背景
  context.fillStyle = withAlpha(data.shadowColor || "#221b1b", 0.7);
  context.fillRect(bgX, bgY, bgWidth, bgHeight);

  // 绘制文字
  context.textAlign = "left";
  context.textBaseline = "bottom";
  context.fillStyle = withAlpha(data.textColor, data.textOpacity);
  context.fillText(labelText, bgX + padding, bgY + bgHeight - padding);
  context.restore();
}

function drawWeekInfo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  data: TemplateViewModel,
) {
  context.save();
  const radius = width * 0.03;
  
  // 绘制渐变背景
  drawRoundedRectPath(context, x, y, width, height, radius);
  const bgGradient = context.createLinearGradient(x, y, x + width, y + height);
  bgGradient.addColorStop(0, "rgba(152, 219, 198, 0.12)");
  bgGradient.addColorStop(1, "rgba(74, 63, 74, 0.15)");
  context.fillStyle = bgGradient;
  context.fill();
  
  // 绘制径向渐变装饰
  const radialGradient = context.createRadialGradient(
    x + width * 0.3,
    y + height * 0.3,
    0,
    x + width * 0.3,
    y + height * 0.3,
    width * 0.7
  );
  radialGradient.addColorStop(0, "rgba(152, 219, 198, 0.08)");
  radialGradient.addColorStop(1, "transparent");
  context.fillStyle = radialGradient;
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.fill();
  
  context.restore();

  // 绘制文字
  context.save();
  const yearMonth = `${data.year}/${String(data.month).padStart(2, "0")}`;
  const weekText = `第${data.weekNumber}周`;
  
  // 主标题 - 年/月（大号，渐变文字效果）
  context.textAlign = "center";
  context.textBaseline = "middle";
  const mainFontSize = Math.round(width * 0.12);
  context.font = `700 ${mainFontSize}px "Manrope", "Segoe UI", sans-serif`;
  
  // 使用渐变填充文字
  const textGradient = context.createLinearGradient(x, y, x + width, y + height);
  const accentRgb = hexToRgb(data.accentColor);
  if (accentRgb) {
    textGradient.addColorStop(0, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${data.textOpacity})`);
    textGradient.addColorStop(1, `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, ${data.textOpacity * 0.8})`);
  } else {
    textGradient.addColorStop(0, withAlpha(data.accentColor, data.textOpacity));
    textGradient.addColorStop(1, withAlpha(data.accentColor, data.textOpacity * 0.8));
  }
  context.fillStyle = textGradient;
  context.fillText(yearMonth, x + width / 2, y + height / 2 - width * 0.06);
  
  // 装饰线
  const lineY = y + height / 2 + width * 0.01;
  const lineWidth = width * 0.15;
  const lineGradient = context.createLinearGradient(
    x + width / 2 - lineWidth / 2,
    lineY,
    x + width / 2 + lineWidth / 2,
    lineY
  );
  lineGradient.addColorStop(0, "transparent");
  lineGradient.addColorStop(0.5, withAlpha(data.accentColor, 0.6));
  lineGradient.addColorStop(1, "transparent");
  context.strokeStyle = lineGradient;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + width / 2 - lineWidth / 2, lineY);
  context.lineTo(x + width / 2 + lineWidth / 2, lineY);
  context.stroke();
  
  // 副标题 - 周数（小号，大写）
  const subFontSize = Math.round(width * 0.065);
  context.font = `500 ${subFontSize}px "Manrope", "Segoe UI", sans-serif`;
  context.fillStyle = withAlpha("#f7f2ec", data.textOpacity * 0.85);
  context.fillText(weekText.toUpperCase(), x + width / 2, y + height / 2 + width * 0.08);
  
  context.restore();
}

function drawStatsInfo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  data: TemplateViewModel,
) {
  context.save();
  const radius = width * 0.03;
  
  // 绘制渐变背景
  drawRoundedRectPath(context, x, y, width, height, radius);
  const bgGradient = context.createLinearGradient(x, y, x + width, y + height);
  bgGradient.addColorStop(0, "rgba(152, 219, 198, 0.12)");
  bgGradient.addColorStop(1, "rgba(74, 63, 74, 0.15)");
  context.fillStyle = bgGradient;
  context.fill();
  
  // 绘制径向渐变装饰
  const radialGradient = context.createRadialGradient(
    x + width * 0.3,
    y + height * 0.3,
    0,
    x + width * 0.3,
    y + height * 0.3,
    width * 0.7
  );
  radialGradient.addColorStop(0, "rgba(152, 219, 198, 0.08)");
  radialGradient.addColorStop(1, "transparent");
  context.fillStyle = radialGradient;
  drawRoundedRectPath(context, x, y, width, height, radius);
  context.fill();
  
  context.restore();

  // 绘制文字
  context.save();
  const padding = width * 0.06;
  const lineHeight = width * 0.055;
  let currentY = y + padding;

  // 用户名
  context.textAlign = "left";
  context.textBaseline = "top";
  const usernameFontSize = Math.round(width * 0.065);
  context.font = `600 ${usernameFontSize}px "Manrope", "Segoe UI", sans-serif`;
  context.fillStyle = withAlpha(data.accentColor, data.textOpacity * 0.95);
  context.fillText(data.username, x + padding, currentY);
  currentY += lineHeight * 1.6;

  // 统计信息
  const statFontSize = Math.round(width * 0.045);
  context.font = `400 ${statFontSize}px "Manrope", "Segoe UI", sans-serif`;
  context.fillStyle = withAlpha(data.textColor, data.textOpacity * 0.75);
  
  // 绘制项目符号和文字
  const bulletX = x + padding;
  const textX = x + padding + width * 0.05;
  const bulletColor = withAlpha(data.accentColor, data.textOpacity * 0.5);
  
  // 总时长
  const durationText = `本周总时长：${formatDurationLabel(data.totalDuration)}`;
  context.fillStyle = bulletColor;
  context.fillText("•", bulletX, currentY);
  context.fillStyle = withAlpha(data.textColor, data.textOpacity * 0.75);
  context.fillText(durationText, textX, currentY);
  currentY += lineHeight * 1.4;

  // 总上传
  const uploadsText = `本周总上传：${data.totalUploads} 张`;
  context.fillStyle = bulletColor;
  context.fillText("•", bulletX, currentY);
  context.fillStyle = withAlpha(data.textColor, data.textOpacity * 0.75);
  context.fillText(uploadsText, textX, currentY);
  
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

// 颜色工具函数
type RGBColor = { r: number; g: number; b: number };
type HSL = { h: number; s: number; l: number };

function withAlpha(color: string, alpha: number): string {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return `rgba(0, 0, 0, ${clamp01(alpha)})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

function hexToRgb(hex: string): RGBColor | null {
  const normalized = hex.replace("#", "").trim();
  if (![3, 6].includes(normalized.length)) {
    return null;
  }
  const expanded =
    normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return null;
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function rgbToHsl({ r, g, b }: RGBColor): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max - min) / 2 + min;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

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

function adjustHexSaturation(hex: string, saturation: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const hsl = rgbToHsl(rgb);
  const clampedS = clamp01(saturation);
  const adjusted = hslToRgb({ h: hsl.h, s: clampedS, l: hsl.l });
  return rgbToHex(adjusted);
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
  const toHex = (component: number) => component.toString(16).padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

