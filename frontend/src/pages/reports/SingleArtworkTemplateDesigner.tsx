import { useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import ImagePreviewModal from "@/components/ImagePreviewModal";
import type { Artwork } from "@/types/artwork";
import { fetchProfilePreferences } from "@/services/api";
import { getActiveUserEmail } from "@/services/authStorage";
import { getOrLoadImage } from "@/utils/imageCache";
import { loadTagPreferencesAsync, buildTagOptionsAsync } from "@/services/tagPreferences";

import "./SingleArtworkTemplateDesigner.css";
import "@/components/templateDesigner/ContentEditor.css";

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
  dateLabel: string;
  durationLabel: string;
  username: string;
  accentColor: string;
  textColor: string;
  textOpacity: number;
  shadowColor: string;
  overlayOpacity: number;
};

type ImageStatus = "idle" | "loading" | "ready" | "error";

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1760;
const DEFAULT_USERNAME = "@EchoUser";
const MAX_TAG_COUNT = 6;
const MIN_IMAGE_HEIGHT_RATIO = 0.3; // 放宽最小比例，支持更长的图片
// const MAX_IMAGE_HEIGHT_RATIO = 3.0; // 放宽最大比例，支持竖版长图（未使用）
// 移除未使用的页脚高度比例常量以通过构建

// 阴影颜色现在通过 HSL 参数动态生成，不再需要预设颜色

const PRESET_ACCENT_COLORS = [
  "#98dbc6", // 薄荷绿（现有）
  "#b0b0b0", // 灰黑
  "#f5a3c7", // 粉色
  "#7db3ff", // 蓝色
  "#ffd66b", // 黄色
  "#ffffff", // 白色
];

type CanvasLayout = {
  imageHeight: number;
  footerHeight: number;
  canvasHeight: number;
};

const DEFAULT_CANVAS_LAYOUT: CanvasLayout = {
  imageHeight: CANVAS_WIDTH,
  footerHeight: CANVAS_HEIGHT - CANVAS_WIDTH,
  canvasHeight: CANVAS_HEIGHT,
};

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
  const [showTitle, setShowTitle] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [showUsername, setShowUsername] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [showDuration, setShowDuration] = useState(true);
  const [shadowHue, setShadowHue] = useState<number>(15); // 色相 (0-360)，默认15度（红褐色）
  const [shadowLightness, setShadowLightness] = useState<number>(10); // 亮度 (0-100)，默认10%（深色）
  const [shadowOpacity, setShadowOpacity] = useState<number>(85);
  const [shadowSaturation, setShadowSaturation] = useState<number>(20);
  const [textOpacityPercent, setTextOpacityPercent] = useState<number>(92);
  const [canvasLayout, setCanvasLayout] = useState<CanvasLayout>(DEFAULT_CANVAS_LAYOUT);
  const [accentHex, setAccentHex] = useState<string>("#98dbc6");
  const [textTone, _setTextTone] = useState<"light" | "dark">("light");
  const [tagOptions, setTagOptions] = useState<Array<{ id: string | number; name: string }>>([]);
  const [addSuffix, setAddSuffix] = useState<boolean>(false);
  const [shadowSettingsExpanded, setShadowSettingsExpanded] = useState<boolean>(false);
  const [showSuffixTooltip, setShowSuffixTooltip] = useState(false);
  const suffixTooltipRef = useRef<HTMLDivElement>(null);
  const suffixIconRef = useRef<HTMLButtonElement>(null);

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
      setShowSuffixTooltip(false);
    }
  }, [open]);

  // 点击外部关闭tooltip
  useEffect(() => {
    if (!showSuffixTooltip) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        suffixTooltipRef.current &&
        suffixIconRef.current &&
        !suffixTooltipRef.current.contains(event.target as Node) &&
        !suffixIconRef.current.contains(event.target as Node)
      ) {
        setShowSuffixTooltip(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSuffixTooltip]);

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
        console.warn("[SingleArtworkTemplateDesigner] Failed to load tag options:", error);
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
            // 如果标签已经是字符串且不是纯数字，直接返回
            if (typeof tag === "string" && !/^\d+$/.test(tag)) {
              return tag;
            }
            // 尝试将标签转换为数字ID
            const tagId = typeof tag === "number" ? tag : Number.parseInt(tag, 10);
            if (Number.isFinite(tagId) && tagId > 0) {
              // 查找标签选项
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
      setTitle("自定义标题名");
      setSubtitle("自定义文案");
      setSelectedTags([]);
      return;
    }

    setTitle(selectedArtwork.title?.trim() || "自定义标题名");
    setSubtitle(selectedArtwork.description?.trim() || "自定义文案");

    // 将标签ID转换为标签名称
    const defaults = Array.from(
      new Set(
        (selectedArtwork.tags ?? [])
          .map((tag) => {
            // 如果标签已经是字符串且不是纯数字，直接返回
            if (typeof tag === "string" && !/^\d+$/.test(tag)) {
              return tag.trim();
            }
            // 尝试将标签转换为数字ID
            const tagId = typeof tag === "number" ? tag : Number.parseInt(tag, 10);
            if (Number.isFinite(tagId) && tagId > 0) {
              // 查找标签选项
              const option = tagOptions.find((opt) => opt.id === tagId);
              return option ? option.name : String(tag).trim();
            }
            return String(tag).trim();
          })
          .filter((tag) => tag.length > 0),
      ),
    ).slice(0, MAX_TAG_COUNT);
    setSelectedTags(defaults);
  }, [selectedArtwork?.id, tagOptions]);

  useEffect(() => {
    if (!open || !selectedArtwork) {
      return;
    }
    setImageStatus("loading");
    // 使用共享的图片缓存工具加载图片
    getOrLoadImage(selectedArtwork.imageSrc)
      .then((img) => {
        setImage(img);
        setImageStatus("ready");
        const ratio =
          img.naturalWidth > 0 && img.naturalHeight > 0
            ? img.naturalWidth / img.naturalHeight
            : CANVAS_WIDTH / DEFAULT_CANVAS_LAYOUT.imageHeight;
        const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
        const desiredImageHeight = CANVAS_WIDTH / safeRatio;
        // 对于长图片，使用实际高度，不再限制最大高度，确保图片完整显示
        const imageHeight = Math.max(
          CANVAS_WIDTH * MIN_IMAGE_HEIGHT_RATIO,
          desiredImageHeight, // 不再限制最大高度，让长图完整显示
        );
        const footerHeight = 0; // 移除底部大块面板
        setCanvasLayout({
          imageHeight,
          footerHeight,
          canvasHeight: Math.round(imageHeight),
        });
      })
      .catch(() => {
        setImage(null);
        setImageStatus("error");
        setCanvasLayout(DEFAULT_CANVAS_LAYOUT);
      });
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

    const accentColor = accentHex;
    
    // 使用 HSL 生成阴影颜色：色相、饱和度、亮度
    const shadowHueClamped = shadowHue % 360;
    const shadowSaturationClamped = clamp01(shadowSaturation / 100);
    const shadowLightnessClamped = clamp01(shadowLightness / 100);
    const shadowRgb = hslToRgb({
      h: shadowHueClamped,
      s: shadowSaturationClamped,
      l: shadowLightnessClamped,
    });
    const shadowColorHex = rgbToHex(shadowRgb);
    const shadowColor = shadowColorHex;
    
    const overlayOpacity = clamp01(shadowOpacity / 100);
    // 由用户选择字色（浅色或深灰），不使用自动判断
    const textBase = textTone === "light" ? "#f7f2ec" : "#161514";
    const textOpacity = clamp01(textOpacityPercent / 100);
    const textColor = textBase;

    const meta = composeMetaLabels(selectedArtwork, {
      showDate,
      showDuration,
    });
    const dateLabel = showDate ? meta.dateLabel : "";
    const durationLabel = showDuration ? meta.durationLabel : "";

    // 处理用户名显示：如果勾选了添加后缀，显示"用户名@EchoDraw"
    let displayUsername = showUsername ? normalizeUsername(username) : "";
    if (displayUsername && addSuffix) {
      // 移除原有的@符号（如果有），然后添加@EchoDraw
      const baseName = displayUsername.startsWith("@") ? displayUsername.slice(1) : displayUsername;
      displayUsername = `${baseName}@EchoDraw`;
    }

    return {
      title: showTitle ? title.trim() || "自定义标题名" : "",
      subtitle: showSubtitle ? subtitle.trim() : "",
      tags: preparedTags,
      timestampLabel: meta.timestampLabel,
      dateLabel,
      durationLabel,
      username: displayUsername,
      accentColor,
      textColor,
      textOpacity,
      shadowColor,
      overlayOpacity,
    };
  }, [
    selectedArtwork,
    selectedTags,
    shadowHue,
    shadowLightness,
    shadowOpacity,
    shadowSaturation,
    showDate,
    showDuration,
    showSubtitle,
    showTitle,
    showUsername,
    subtitle,
    title,
    username,
    textOpacityPercent,
    accentHex,
    textTone,
    addSuffix,
  ]);

  // const _timestampLabel = templateData?.timestampLabel ?? "日期未知";
  const downloadDisabled = !templateData || imageStatus === "loading";

  const renderToggle = (active: boolean, onToggle: () => void, label: string) => (
    <button
      type="button"
      className={`single-template-designer__toggle${active ? " is-active" : ""}`}
      aria-pressed={active}
      aria-label={`切换${label}`}
      onClick={onToggle}
    >
      <MaterialIcon name={active ? "toggle_on" : "toggle_off"} filled />
    </button>
  );

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

    if (canvas.width !== CANVAS_WIDTH || canvas.height !== canvasLayout.canvasHeight) {
      canvas.width = CANVAS_WIDTH;
      canvas.height = canvasLayout.canvasHeight;
    }

    drawTemplate(
      context,
      CANVAS_WIDTH,
      canvasLayout.canvasHeight,
      canvasLayout.imageHeight,
      canvasLayout.footerHeight,
      templateData,
      image,
    );
  }, [canvasLayout.canvasHeight, canvasLayout.footerHeight, canvasLayout.imageHeight, image, open, templateData]);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const handleDownload = () => {
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
                    style={{ aspectRatio: CANVAS_WIDTH / canvasLayout.canvasHeight }}
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

            {/* 阴影调整卡片（紧凑版，单独作为图片下方的一个区域） */}
            {hasArtworks ? (
              <section>
                <div className="single-template-designer__group" style={{ marginTop: 0, paddingTop: 8, paddingBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShadowSettingsExpanded(!shadowSettingsExpanded)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      marginBottom: shadowSettingsExpanded ? 6 : 0,
                    }}
                  >
                    <h3 style={{ margin: 0 }}>阴影区设置</h3>
                    <MaterialIcon 
                      name={shadowSettingsExpanded ? "expand_less" : "expand_more"} 
                      style={{ fontSize: "1.5rem", color: "rgba(255, 255, 255, 0.7)" }}
                    />
                  </button>
                  {shadowSettingsExpanded && (
                    <>
                  {/* 色相滑块 */}
                  <div className="single-template-designer__tuning" style={{ marginTop: 6 }}>
                    <div><p>色相</p></div>
                    <div className="single-template-designer__slider">
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={shadowHue}
                        onChange={(e) => setShadowHue(Number(e.target.value))}
                        style={{
                          backgroundImage: `linear-gradient(90deg, 
                            hsl(0, ${shadowSaturation}%, ${shadowLightness}%),
                            hsl(60, ${shadowSaturation}%, ${shadowLightness}%),
                            hsl(120, ${shadowSaturation}%, ${shadowLightness}%),
                            hsl(180, ${shadowSaturation}%, ${shadowLightness}%),
                            hsl(240, ${shadowSaturation}%, ${shadowLightness}%),
                            hsl(300, ${shadowSaturation}%, ${shadowLightness}%),
                            hsl(360, ${shadowSaturation}%, ${shadowLightness}%)
                          )`,
                        }}
                      />
                      <span className="single-template-designer__slider-dot" />
                    </div>
                  </div>
                  {/* 亮度滑块 */}
                  <div className="single-template-designer__tuning" style={{ marginTop: 6 }}>
                    <div><p>亮度</p></div>
                    <div className="single-template-designer__slider">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={shadowLightness}
                        onChange={(e) => setShadowLightness(Number(e.target.value))}
                        style={{
                          backgroundImage: `linear-gradient(90deg, 
                            hsl(${shadowHue}, ${shadowSaturation}%, 0%),
                            hsl(${shadowHue}, ${shadowSaturation}%, 50%),
                            hsl(${shadowHue}, ${shadowSaturation}%, 100%)
                          )`,
                        }}
                      />
                      <span className="single-template-designer__slider-dot" />
                    </div>
                  </div>
                  {/* 饱和度滑块 */}
                  <div className="single-template-designer__tuning" style={{ marginTop: 6 }}>
                    <div><p>饱和度</p></div>
                    <div className="single-template-designer__slider">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={shadowSaturation}
                        onChange={(e) => setShadowSaturation(Number(e.target.value))}
                        style={{
                          backgroundImage: `linear-gradient(90deg, 
                            hsl(${shadowHue}, 0%, ${shadowLightness}%),
                            hsl(${shadowHue}, 100%, ${shadowLightness}%)
                          )`,
                        }}
                      />
                      <span className="single-template-designer__slider-dot" />
                    </div>
                  </div>
                  {/* 透明度滑块 */}
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
                    </>
                  )}
                </div>
              </section>
            ) : null}

            {/* 恢复原有的信息编辑区域（标题、简介、署名、标签等） */}
            {hasArtworks ? (
              <section>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__field-row single-template-designer__field-row--inline">
                    <label htmlFor="single-template-title">
                      <span>标题</span>
                      <input
                        id="single-template-title"
                        type="text"
                        value={title}
                        maxLength={40}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="请输入作品名称"
                      />
                    </label>
                    {renderToggle(showTitle, () => setShowTitle((prev) => !prev), "标题")}
                  </div>
                  <div className="single-template-designer__field-row single-template-designer__field-row--textarea single-template-designer__field-row--inline">
                    <label htmlFor="single-template-desc">
                      <span>简介</span>
                      <textarea
                        id="single-template-desc"
                        rows={3}
                        value={subtitle}
                        maxLength={160}
                        onChange={(event) => setSubtitle(event.target.value)}
                        placeholder="为作品写一句陈列说明"
                      />
                    </label>
                    {renderToggle(showSubtitle, () => setShowSubtitle((prev) => !prev), "简介")}
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__field-row single-template-designer__field-row--inline">
                    <label htmlFor="single-template-username">
                      <span>署名</span>
                      <input
                        id="single-template-username"
                        type="text"
                        value={username}
                        maxLength={32}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="将呈现在右下角"
                      />
                    </label>
                    {renderToggle(showUsername, () => setShowUsername((prev) => !prev), "署名")}
                  </div>
                  <div className="single-template-designer__field-row single-template-designer__field-row--inline" style={{ marginTop: 8, position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span>增加后缀</span>
                      <button
                        ref={suffixIconRef}
                        type="button"
                        className="content-editor__help-icon"
                        onClick={() => setShowSuffixTooltip(!showSuffixTooltip)}
                        aria-label="关于增加后缀"
                      >
                        <MaterialIcon name="help" />
                      </button>
                      {showSuffixTooltip && (
                        <div
                          ref={suffixTooltipRef}
                          className="content-editor__tooltip"
                        >
                          <p>如果愿意通过此方法让更多人了解到EchoDraw的话，可以开启，非常感谢&gt;&lt;</p>
                        </div>
                      )}
                    </div>
                    {renderToggle(addSuffix, () => setAddSuffix((prev) => !prev), "增加后缀")}
                  </div>
                  <div className="single-template-designer__field-row single-template-designer__field-row--meta" style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0 }}>日期</p>
                          <span style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.6)" }}>{selectedArtwork ? (() => {
                            const meta = composeMetaLabels(selectedArtwork, { showDate: true, showDuration: false });
                            return meta.dateLabel || "未设置";
                          })() : "未设置"}</span>
                        </div>
                        {renderToggle(showDate, () => setShowDate((prev) => !prev), "日期")}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0 }}>时长</p>
                          <span style={{ fontSize: "0.85rem", color: "rgba(255, 255, 255, 0.6)" }}>{selectedArtwork ? (() => {
                            const meta = composeMetaLabels(selectedArtwork, { showDate: false, showDuration: true });
                            return meta.durationLabel || "未设置";
                          })() : "未设置"}</span>
                        </div>
                        {renderToggle(showDuration, () => setShowDuration((prev) => !prev), "时长")}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="single-template-designer__group">
                  <div className="single-template-designer__group-header">
                    <h3>标签陈列</h3>
                    <p>至多选择 {MAX_TAG_COUNT} 个标签，呈现在画板右上角。</p>
                  </div>
                  <div className="single-template-designer__tag-list" role="listbox" aria-label="可展示的标签">
                    {availableTags.length === 0 ? (
                      <span className="single-template-designer__hint">该作品尚未设置标签。</span>
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
                      清空标签
                    </button>
                  ) : null}
                </div>

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
                  <p>导出 PNG · 1080 × {canvasLayout.canvasHeight} 像素 · 适配社交媒体展示。</p>
                </div>
              </section>
            ) : null}
          </div>
          <footer style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
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
        title="单图导出"
      />
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
  canvasHeight: number,
  imageHeight: number,
  footerHeight: number,
  data: TemplateViewModel,
  image: HTMLImageElement | null,
) {
  context.save();
  context.clearRect(0, 0, width, canvasHeight);

  const rect = createImageRect(width, imageHeight);

  drawCanvasBackground(context, width, canvasHeight, data.shadowColor);
  drawPrimaryImage(context, rect, image);
  drawGradientFooter(context, rect, footerHeight, data);

  context.restore();
}

type ImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

function createImageRect(width: number, imageHeight: number): ImageRect {
  const rectHeight = Math.max(1, imageHeight);
  return {
    x: 0,
    y: 0,
    width,
    height: rectHeight,
    radius: width * 0.03,
  };
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

function drawPrimaryImage(context: CanvasRenderingContext2D, rect: ImageRect, image: HTMLImageElement | null) {
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.25)";
  context.shadowBlur = rect.width * 0.03;
  context.shadowOffsetY = rect.width * 0.01;
  drawRoundedRectPath(context, rect.x, rect.y, rect.width, rect.height, rect.radius);
  context.fillStyle = "#0d0b0a";
  context.fill();
  context.save();
  drawRoundedRectPath(context, rect.x, rect.y, rect.width, rect.height, rect.radius);
  context.clip();

  if (image && image.width > 0 && image.height > 0) {
    const scale = Math.max(rect.width / image.width, rect.height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const dx = rect.x + (rect.width - drawWidth) / 2;
    const dy = rect.y + (rect.height - drawHeight) / 2;
    context.drawImage(image, dx, dy, drawWidth, drawHeight);
  } else {
    const placeholder = context.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    placeholder.addColorStop(0, "rgba(230, 216, 189, 0.6)");
    placeholder.addColorStop(1, "rgba(180, 164, 138, 0.6)");
    context.fillStyle = placeholder;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  context.restore();
}

function drawGradientFooter(
  context: CanvasRenderingContext2D,
  rect: ImageRect,
  _footerHeight: number,
  data: TemplateViewModel,
) {
  // 更窄的覆盖高度，靠近底部，营造细薄但更集中于底部的遮罩
  const overlayHeight = Math.min(rect.height * 0.22, rect.width * 0.45);
  const overlayY = rect.y + rect.height - overlayHeight;

  const gradient = context.createLinearGradient(0, overlayY, 0, rect.y + rect.height);
  // 线性渐变：顶部完全透明，底部最深，仅使用阴影色
  const base = data.shadowColor || "#221b1b";
  gradient.addColorStop(0, withAlpha(base, 0));
  gradient.addColorStop(1, withAlpha(base, 0.95 * data.overlayOpacity));

  context.save();
  drawRoundedRectPath(context, rect.x, overlayY, rect.width, overlayHeight, rect.radius);
  context.clip();
  context.fillStyle = gradient;
  context.fillRect(rect.x, overlayY, rect.width, overlayHeight);
  context.restore();

  const paddingX = rect.width * 0.06;
  const contentX = rect.x + paddingX;
  const contentWidth = rect.width - paddingX * 2;

  // 统一行距与底部对齐：自适应从底部向上排布的若干行（标题/简介/tag/日期）
  const lineHeight = Math.round(rect.width * 0.055); // 统一行高
  const gapAboveUsername = Math.round(rect.width * 0.02);
  const bottomPadding = Math.round(rect.width * 0.02);
  const usernameY = rect.y + rect.height - bottomPadding;
  const blockBottomY = usernameY - gapAboveUsername; // 元信息块的底边（紧贴用户名上方）

  // 预先准备各行内容
  const displayTitle = (data.title || "").trim();
  const subtitle = (data.subtitle || "").replace(/\s+/g, " ").trim();
  const subtitleDisplay = (() => {
    // 先用简介字号测量，超出则省略
    const tempFont = `400 ${Math.round(rect.width * 0.026)}px "Manrope", "Segoe UI", sans-serif`;
    context.save();
    context.font = tempFont;
    const base = subtitle || "";
    const result = base ? ellipsizeToWidth(context, base, contentWidth) : "";
    context.restore();
    return result;
  })();

  const metaLineParts: string[] = [];
  if (data.dateLabel) {
    metaLineParts.push(data.dateLabel);
  }
  if (data.durationLabel) {
    metaLineParts.push(data.durationLabel);
  }
  // 当日期与时长都关闭时，显示为空
  const metaLine = metaLineParts.length > 0 ? metaLineParts.join(" / ") : "";

  // 组装启用的行（从上到下的语义顺序：标题、简介、标签、日期）
  const enabledLines: Array<"title" | "subtitle" | "tags" | "meta"> = [];
  if (displayTitle) enabledLines.push("title");
  if (subtitleDisplay) enabledLines.push("subtitle");
  if (data.tags && data.tags.length > 0) enabledLines.push("tags");
  if (metaLine) enabledLines.push("meta");

  // 计算每一行的 Y 坐标（从下至上排布）
  const totalLines = enabledLines.length;
  const getLineY = (indexFromTop: number) => {
    // indexFromTop: 0 表示顶部那一行
    const indexFromBottom = totalLines - 1 - indexFromTop;
    return blockBottomY - lineHeight * indexFromBottom;
    // 与原实现一致：数值为文本基线的 Y
  };

  context.save();
  context.textAlign = "left";

  // 逐行绘制
  enabledLines.forEach((kind, indexFromTop) => {
    const y = getLineY(indexFromTop);
    if (kind === "title") {
      // 标题：字号仅比简介稍大
      context.fillStyle = withAlpha(data.accentColor || "#9edac4", data.textOpacity);
      context.font = `600 ${Math.round(rect.width * 0.030)}px "Manrope", "Segoe UI", sans-serif`;
      context.fillText(displayTitle, contentX, y);
      return;
    }
    if (kind === "subtitle") {
      // 简介（单行省略）
      context.font = `400 ${Math.round(rect.width * 0.026)}px "Manrope", "Segoe UI", sans-serif`;
      context.fillStyle = withAlpha(data.textColor, data.textOpacity);
      context.fillText(subtitleDisplay, contentX, y);
      return;
    }
    if (kind === "tags") {
      // 标签行（单行，溢出截断）
      const tags = data.tags.slice(0, 5);
      if (tags.length > 0) {
        context.font = `500 ${Math.round(rect.width * 0.024)}px "Manrope", "Segoe UI", sans-serif`;
        const gap = rect.width * 0.016;
        let tagX = contentX;
        const maxX = contentX + contentWidth;
        for (const tag of tags) {
          const label = tag;
          const width = measureTagBadgeWidth(context, label, rect.width);
          if (tagX + width > maxX) {
            break;
          }
          // 使徽章在该行行高内垂直居中
          const badgeTop = Math.round(y - (rect.width * 0.034) * 0.6);
          drawTagBadge(context, tagX, badgeTop, label, rect.width, data.textOpacity, data.accentColor);
          tagX += width + gap;
        }
      }
      return;
    }
    if (kind === "meta") {
      // 日期/时长行
      context.font = `400 ${Math.round(rect.width * 0.024)}px "Manrope", "Segoe UI", sans-serif`;
      context.fillStyle = withAlpha(data.textColor, data.textOpacity);
      context.textAlign = "left";
      context.fillText(metaLine, contentX, y);
      return;
    }
  });

  context.restore();

  // 用户名仍然固定在底边最右侧
  const usernameLine = (data.username || "").trim();
  if (usernameLine) {
    context.textAlign = "right";
    context.font = `500 ${Math.round(rect.width * 0.022)}px "Manrope", "Segoe UI", sans-serif`; // 缩小字号从0.028到0.022
    context.fillStyle = withAlpha(data.textColor, data.textOpacity);
    context.fillText(usernameLine, contentX + contentWidth, usernameY);
  }

  context.restore();
}

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
  // 背景与描边采用主题色的不同透明度
  context.fillStyle = withAlpha(accentHex || "#98dbc6", 0.12);
  context.fill();
  context.strokeStyle = withAlpha(accentHex || "#98dbc6", 0.4);
  context.stroke();
  context.fillStyle = withAlpha(accentHex || "#98dbc6", clamp01(0.9 * textOpacity));
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(text, x + paddingX, y + Math.round(height * 0.52));
}

// 将文本截断为单行，末尾添加省略号以适配给定宽度
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

// 移除未使用的 wrapText 以通过构建

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

// 移除未使用的 mixHexColors 以通过构建

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

// function clamp(value: number, min: number, max: number): number {
//   if (Number.isNaN(value)) {
//     return min;
//   }
//   if (min > max) {
//     return min;
//   }
//   return Math.min(max, Math.max(min, value));
// }

type HSL = { h: number; s: number; l: number };

// function rgbToHsl({ r, g, b }: RGBColor): HSL {
//   const rn = r / 255;
//   const gn = g / 255;
//   const bn = b / 255;
//   const max = Math.max(rn, gn, bn);
//   const min = Math.min(rn, gn, bn);
//   let h = 0;
//   let s = 0;
//   const l = (max - min) / 2 + min;
//   const d = max - min;
//   if (d !== 0) {
//     s = d / (1 - Math.abs(2 * l - 1));
//     switch (max) {
//       case rn:
//         h = ((gn - bn) / d) % 6;
//         break;
//       case gn:
//         h = (bn - rn) / d + 2;
//         break;
//       default:
//         h = (rn - gn) / d + 4;
//         break;
//     }
//     h *= 60;
//     if (h < 0) h += 360;
//   }
//   return { h, s, l };
// }

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

// function adjustHexSaturation(hex: string, saturation: number): string {
//   const rgb = hexToRgb(hex);
//   if (!rgb) return hex;
//   const hsl = rgbToHsl(rgb);
//   const clampedS = clamp01(saturation);
//   const adjusted = hslToRgb({ h: hsl.h, s: clampedS, l: hsl.l });
//   return rgbToHex(adjusted);
// }

// 移除未使用的 relativeLuminance 以通过构建

// function desaturateHex(hex: string, t: number): string {
//   const rgb = hexToRgb(hex);
//   if (!rgb) return hex;
//   const hsl = rgbToHsl(rgb);
//   const s = clamp01(t);
//   const adjusted = hslToRgb({ h: hsl.h, s, l: hsl.l });
//   return rgbToHex(adjusted);
// }
