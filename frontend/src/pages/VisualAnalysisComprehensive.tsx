import { useState, useEffect } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "./VisualAnalysis.css";

// 图片弹窗组件
type ImageModalProps = {
  imageUrl: string | null;
  alt: string;
  onClose: () => void;
};

function ImageModal({ imageUrl, alt, onClose }: ImageModalProps) {
  useEffect(() => {
    // 阻止背景滚动
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    // ESC键关闭
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (!imageUrl) return null;

  return (
    <div 
      className="visual-analysis-image-modal-overlay"
      onClick={onClose}
    >
      <div 
        className="visual-analysis-image-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="visual-analysis-image-modal-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <MaterialIcon name="close" />
        </button>
        <img 
          src={imageUrl} 
          alt={alt}
          className="visual-analysis-image-modal-image"
        />
      </div>
    </div>
  );
}

// 辅助函数：HSL转RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// 辅助函数：获取色相颜色名称
function getHueColorName(hue: number): string {
  if (hue < 15) return "红";
  if (hue < 45) return "橙";
  if (hue < 75) return "黄";
  if (hue < 105) return "黄绿";
  if (hue < 135) return "绿";
  if (hue < 165) return "青绿";
  if (hue < 195) return "青";
  if (hue < 225) return "青蓝";
  if (hue < 255) return "蓝";
  if (hue < 285) return "紫蓝";
  if (hue < 315) return "紫";
  if (hue < 345) return "紫红";
  return "红";
}

// 辅助函数：反色处理（将图片反色）
function invertImage(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法创建canvas上下文"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // 反色：每个像素的RGB值取反
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];     // R
        data[i + 1] = 255 - data[i + 1]; // G
        data[i + 2] = 255 - data[i + 2]; // B
        // data[i + 3] 是 alpha，保持不变
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imageDataUrl;
  });
}

type ComprehensiveAnalysisProps = {
  results?: any;
  basicResults?: any; // 基础分析结果（包含二值化、灰度等）
  savedResult?: any; // 保存的结果（包含服务器保存的图片URL）
  onClose?: () => void;
  onThresholdChange?: (threshold: number) => void; // 二值化阈值变化回调
  selectedThreshold?: number; // 当前选中的二值化阈值
  onDeleteAndRestart?: () => void; // 删除并开启新分析的回调
};

// 二值化阈值选项（6个等级，从高到低）
const BINARY_THRESHOLD_OPTIONS = [
  { label: "等级1（最高）", value: 200 },
  { label: "等级2", value: 170 },
  { label: "等级3", value: 140 },
  { label: "等级4", value: 110 },
  { label: "等级5", value: 80 },
  { label: "等级6（最低）", value: 50 },
];

function VisualAnalysisComprehensive({ 
  results, 
  basicResults,
  savedResult,
  onClose,
  onThresholdChange,
  selectedThreshold = 140,
  onDeleteAndRestart
}: ComprehensiveAnalysisProps) {
  // 合并results和savedResult的comprehensive_analysis数据
  // 优先使用savedResult中的comprehensive_analysis（服务器保存的数据）
  const comprehensiveData = savedResult?.comprehensive_analysis && typeof savedResult.comprehensive_analysis === 'object' && Object.keys(savedResult.comprehensive_analysis).length > 0
    ? savedResult.comprehensive_analysis
    : results;
  
  console.log("[VisualAnalysisComprehensive] 数据合并:", {
    hasSavedResultComprehensiveAnalysis: !!(savedResult?.comprehensive_analysis && typeof savedResult.comprehensive_analysis === 'object' && Object.keys(savedResult.comprehensive_analysis).length > 0),
    hasResults: !!results,
    usingSavedResult: comprehensiveData === savedResult?.comprehensive_analysis,
    comprehensiveDataKeys: comprehensiveData ? Object.keys(comprehensiveData) : [],
    hasStep5: !!comprehensiveData?.step5,
    step5Keys: comprehensiveData?.step5 ? Object.keys(comprehensiveData.step5) : [],
    hasDominantPalette8: !!comprehensiveData?.step5?.dominant_palette_8,
    hasDominantPalette12: !!comprehensiveData?.step5?.dominant_palette_12,
    palette8Length: comprehensiveData?.step5?.dominant_palette_8?.palette?.length || 0,
    palette12Length: comprehensiveData?.step5?.dominant_palette_12?.palette?.length || 0,
    hasKmeans12Image: !!savedResult?.kmeans_segmentation_image_12,
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  const [hlsInverted, setHlsInverted] = useState(false);
  const [invertedHlsImage, setInvertedHlsImage] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<{ url: string; alt: string } | null>(null);
  const [expandedGuidance, setExpandedGuidance] = useState<{ [key: number]: boolean }>({});

  // 计算反色的HLS图片（优先使用服务器保存的图片）
  useEffect(() => {
    // 如果有服务器保存的HLS反色图，直接使用（通过代理URL）
    if (savedResult?.step4_hls_s_inverted) {
      setInvertedHlsImage(savedResult.step4_hls_s_inverted);
      return;
    }
    // 如果没有保存的图片，才生成
    if (basicResults?.step4HlsS && !invertedHlsImage) {
      // 辅助函数：将URL转换为base64（如果需要）
      const convertUrlToBase64 = async (url: string): Promise<string> => {
        // 如果已经是base64数据URL，直接返回
        if (url.startsWith('data:')) {
          return url;
        }
        // 如果是URL，需要先加载图片再转换为base64（使用代理URL以避免CORS问题）
        try {
          // 后端已经返回代理URL，直接使用
          const response = await fetch(url);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.error("[VisualAnalysisComprehensive] 转换URL到base64失败:", err);
          throw err;
        }
      };
      
      // 先转换URL为base64（如果需要），然后进行反色处理
      convertUrlToBase64(basicResults.step4HlsS)
        .then((base64Image) => {
          return invertImage(base64Image);
        })
        .then((inverted) => {
          setInvertedHlsImage(inverted);
        })
        .catch((err) => {
          console.error("反色处理失败:", err);
        });
    }
  }, [basicResults?.step4HlsS, invertedHlsImage]);

  if (!results && !basicResults) {
    return (
      <div className="visual-analysis__loading">
        <MaterialIcon name="hourglass_empty" className="visual-analysis__loading-icon" />
        <p>正在加载分析结果...</p>
      </div>
    );
  }

  // 第一页：原图+二值化图片+3阶层灰度图片+4阶层灰度图片，四宫格排列，无文字，无缝隙
  const renderPage1 = () => {
    // 获取图片数据（优先使用savedResult，然后是basicResults，最后是comprehensiveData）
    const originalImg = savedResult?.original_image || basicResults?.originalImage;
    const binaryImg = savedResult?.step1_binary || basicResults?.step1Binary || comprehensiveData?.step1?.binary;
    const grayscale3Img = savedResult?.step2_grayscale_3_level || basicResults?.step2Grayscale3Level || comprehensiveData?.step1?.grayscale_3_level;
    const grayscale4Img = savedResult?.step2_grayscale_4_level || basicResults?.step2Grayscale4Level || comprehensiveData?.step1?.grayscale_4_level;
    
    return (
      <div className="visual-analysis-page">
        <div className="visual-analysis-page-images" style={{ 
          gridTemplateColumns: "1fr 1fr",
          gap: 0
        }}>
          <div className="visual-analysis-page-image-item">
            <h3>原图</h3>
            {originalImg ? (
              <img 
                src={originalImg} 
                alt="原图"
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ url: originalImg, alt: "原图" })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无原图
              </div>
            )}
          </div>
          
          <div className="visual-analysis-page-image-item">
            <h3>二阶</h3>
            {binaryImg ? (
              <img 
                src={binaryImg} 
                alt="二阶"
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ url: binaryImg, alt: "二阶" })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无二值化图片
              </div>
            )}
          </div>
          
          <div className="visual-analysis-page-image-item">
            {grayscale3Img ? (
              <img 
                src={grayscale3Img} 
                alt="三阶"
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ url: grayscale3Img, alt: "三阶" })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无3阶层灰度图片
              </div>
            )}
            <h3>三阶</h3>
          </div>
          
          <div className="visual-analysis-page-image-item">
            {grayscale4Img ? (
              <img 
                src={grayscale4Img} 
                alt="四阶"
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ url: grayscale4Img, alt: "四阶" })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无4阶层灰度图片
              </div>
            )}
            <h3>四阶</h3>
          </div>
        </div>
        {renderGuidance(1, guidanceContent[1])}
      </div>
    );
  };

  // 第二页：rgb转明度和lab转视觉明度对比，两张图左右排列
  const renderPage2 = () => {
    // 获取图片数据（优先使用savedResult，然后是basicResults，最后是comprehensiveData）
    // RGB转明度图：从savedResult的step2_grayscale字段获取（新流程中保存到这里）
    const rgbLuminanceImg = savedResult?.step2_grayscale || comprehensiveData?.step2?.rgb_luminance;
    const labLuminanceImg = savedResult?.step3_lab_l || basicResults?.step3LabL || comprehensiveData?.step2?.lab_luminance;
    
    return (
      <div className="visual-analysis-page">
        <div className="visual-analysis-page-images" style={{ 
          gridTemplateColumns: "1fr 1fr",
          gap: 0
        }}>
          <div className="visual-analysis-page-image-item">
            <h3>RGB转明度</h3>
            {rgbLuminanceImg ? (
              <img 
                src={rgbLuminanceImg} 
                alt="RGB转明度"
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ url: rgbLuminanceImg, alt: "RGB转明度" })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无RGB转明度图片
              </div>
            )}
          </div>
          
          <div className="visual-analysis-page-image-item">
            <h3>LAB转视觉明度</h3>
            {labLuminanceImg ? (
              <img 
                src={labLuminanceImg} 
                alt="LAB转视觉明度"
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ url: labLuminanceImg, alt: "LAB转视觉明度" })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无LAB视觉明度图片
              </div>
            )}
          </div>
        </div>
        {renderGuidance(2, guidanceContent[2])}
      </div>
    );
  };

  // 第三页：hls转饱和度+lab转视觉明度对比（两张，一张正常hls转饱和度，一张反色），左右排列
  // 用户可以点击"切换反色"按钮，切换两种hls图
  const renderPage3 = () => {
    // 获取HLS图片（优先使用savedResult）
    const hlsSImg = savedResult?.step4_hls_s || basicResults?.step4HlsS || comprehensiveData?.step3?.hls_saturation;
    const hlsSInvertedImg = savedResult?.step4_hls_s_inverted || invertedHlsImage || comprehensiveData?.step3?.hls_saturation_inverted;
    const labLImg = savedResult?.step3_lab_l || basicResults?.step3LabL || comprehensiveData?.step2?.lab_luminance;
    
    return (
      <div className="visual-analysis-page">
        <div className="visual-analysis-page-images" style={{ 
          gridTemplateColumns: "1fr 1fr",
          gap: 0
        }}>
          <div className="visual-analysis-page-image-item">
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "0.5rem",
              minHeight: "2rem"
            }}>
              <h3 style={{ margin: 0 }}>HLS转饱和度</h3>
              <button
                type="button"
                className="visual-analysis__threshold-button"
                onClick={() => setHlsInverted(!hlsInverted)}
                style={{ 
                  padding: "0.4rem 0.8rem",
                  fontSize: "0.85rem",
                  flexShrink: 0
                }}
              >
                切换
              </button>
            </div>
            {hlsSImg ? (
              <img 
                src={hlsInverted && hlsSInvertedImg ? hlsSInvertedImg : hlsSImg} 
                alt={hlsInverted ? "HLS饱和度（反色）" : "HLS饱和度"}
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ 
                  url: hlsInverted && hlsSInvertedImg ? hlsSInvertedImg : hlsSImg, 
                  alt: hlsInverted ? "HLS饱和度（反色）" : "HLS饱和度" 
                })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无HLS饱和度图片
              </div>
            )}
          </div>
          
          <div className="visual-analysis-page-image-item">
            <div style={{ 
              marginBottom: "0.5rem",
              minHeight: "2rem",
              display: "flex",
              alignItems: "center"
            }}>
              <h3 style={{ margin: 0 }}>LAB转视觉明度</h3>
            </div>
            {labLImg ? (
              <img 
                src={labLImg} 
                alt="LAB视觉明度"
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ url: labLImg, alt: "LAB视觉明度" })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无LAB视觉明度图片
              </div>
            )}
          </div>
        </div>
        {renderGuidance(3, guidanceContent[3])}
      </div>
    );
  };

  // 第四页：色相图+色相直方图
  const renderPage4 = () => {
    // 获取图片数据（优先使用savedResult，然后是basicResults，最后是comprehensiveData）
    const hueMapImg = savedResult?.step5_hue || basicResults?.step5Hue || comprehensiveData?.step4?.hue_map;
    const hueHistogram = comprehensiveData?.step4?.hue_histogram || comprehensiveData?.color_quality?.hue_distribution?.hue_histogram;
    
    return (
      <div className="visual-analysis-page">
        <div className="visual-analysis-page-images" style={{ 
          gridTemplateColumns: "1fr 1fr",
          gap: 0
        }}>
          <div className="visual-analysis-page-image-item">
            <h3>色相图</h3>
            {hueMapImg ? (
              <img 
                src={hueMapImg} 
                alt="色相图"
                style={{ cursor: "pointer", borderRadius: 0, border: "none" }}
                onClick={() => setModalImage({ url: hueMapImg, alt: "色相图" })}
              />
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无色相图
              </div>
            )}
          </div>
          
          <div className="visual-analysis-page-image-item">
            <h3>色相直方图</h3>
            {hueHistogram ? (
              <div className="visual-analysis__histogram">
                <div className="visual-analysis__histogram-container">
                  <div className="visual-analysis__histogram-bars">
                    {hueHistogram.map((value: number, index: number) => {
                      const maxValue = Math.max(...hueHistogram);
                      const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
                      const hue = (index * 10 + 5) / 360;
                      const rgb = hslToRgb(hue, 1, 0.5);
                      return (
                        <div key={index} className="visual-analysis__histogram-bar-container">
                          <div 
                            className="visual-analysis__histogram-bar"
                            style={{ 
                              height: `${height}%`,
                              backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
                            }}
                            title={`色相 ${index * 10}°-${(index + 1) * 10}° (${getHueColorName(index * 10)}): ${value} 像素`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="visual-analysis__histogram-labels">
                    <span>红</span>
                    <span>黄</span>
                    <span>绿</span>
                    <span>青</span>
                    <span>蓝</span>
                    <span>紫</span>
                    <span>红</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
                暂无色相直方图数据
              </div>
            )}
          </div>
        </div>
        {renderGuidance(4, guidanceContent[4])}
      </div>
    );
  };

  // 第五页：K-means 色块分割 + 主色调分析（8色和12色）
  const renderPage5 = () => {
    // 获取K-means图片（优先使用savedResult，图片已保存到ImageField字段）
    // 8色：优先使用savedResult的ImageField字段
    const kmeansImg8 = savedResult?.kmeans_segmentation_image || comprehensiveData?.step5?.kmeans_segmentation_8 || comprehensiveData?.step5?.kmeans_segmentation;
    // 12色：使用savedResult的新ImageField字段（从TOS读取）
    const kmeansImg12 = savedResult?.kmeans_segmentation_image_12 || comprehensiveData?.step5?.kmeans_segmentation_12;
    
    console.log("[VisualAnalysisComprehensive] 第五页图片数据:", {
      hasKmeans8: !!kmeansImg8,
      hasKmeans12: !!kmeansImg12,
      kmeans8Source: kmeansImg8 ? (savedResult?.kmeans_segmentation_image ? 'savedResult' : 'comprehensiveData') : 'none',
      kmeans12Source: kmeansImg12 ? (savedResult?.kmeans_segmentation_image_12 ? 'savedResult' : 'comprehensiveData') : 'none',
      savedResultHasKmeans12: !!savedResult?.kmeans_segmentation_image_12,
    });
    
    // 获取主色调数据（优先使用savedResult的comprehensive_analysis）
    // 8色：优先使用新字段，否则使用旧字段（向后兼容）
    const dominantPalette8 = comprehensiveData?.step5?.dominant_palette_8 || comprehensiveData?.step5?.dominant_palette || comprehensiveData?.color_block_structure?.dominant_palette;
    // 12色：使用新字段
    const dominantPalette12 = comprehensiveData?.step5?.dominant_palette_12;
    
    console.log("[VisualAnalysisComprehensive] 主色调数据:", {
      hasDominantPalette8: !!dominantPalette8,
      hasDominantPalette12: !!dominantPalette12,
      palette8Length: dominantPalette8?.palette?.length || 0,
      palette12Length: dominantPalette12?.palette?.length || 0,
      palette8Source: dominantPalette8 ? (
        comprehensiveData?.step5?.dominant_palette_8 ? 'dominant_palette_8' :
        comprehensiveData?.step5?.dominant_palette ? 'dominant_palette (old)' :
        'color_block_structure (old)'
      ) : 'none',
    });
    
    // 渲染主色调分析的辅助函数
    const renderPalette = (palette: any, title: string) => {
      if (!palette) {
        return (
          <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
            暂无{title}数据
          </div>
        );
      }
      return (
        <div className="visual-analysis-page-image-item">
          <h3>{title}</h3>
          <div className="visual-analysis__color-palette">
            <div className="visual-analysis__color-swatches">
              {palette.palette?.map((color: number[], index: number) => (
                <div key={index} className="visual-analysis__color-swatch-container">
                  <div 
                    className="visual-analysis__color-swatch"
                    style={{ backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})` }}
                  />
                  {palette.palette_ratios && (
                    <div className="visual-analysis__color-swatch-label">
                      {Math.round(palette.palette_ratios[index] * 100)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    };
    
    return (
      <div className="visual-analysis-page">
        <div className="visual-analysis-page-images" style={{ 
          gridTemplateColumns: "1fr",
          gap: "1.5rem"
        }}>
          {/* 8色K-means 色块分割 */}
          {kmeansImg8 ? (
            <div className="visual-analysis-page-image-item">
              <h3>8色 色块分割</h3>
              <img 
                src={kmeansImg8} 
                alt="8色 色块分割"
                style={{ cursor: "pointer" }}
                onClick={() => setModalImage({ url: kmeansImg8, alt: "8色 色块分割" })}
              />
            </div>
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无8色K-means色块分割图片
            </div>
          )}
          
          {/* 8色主色调分析 */}
          {renderPalette(dominantPalette8, "8色主色调")}
          
          {/* 12色K-means 色块分割 */}
          {kmeansImg12 ? (
            <div className="visual-analysis-page-image-item">
              <h3>12色 色块分割</h3>
              <img 
                src={kmeansImg12} 
                alt="12色 色块分割"
                style={{ cursor: "pointer" }}
                onClick={() => setModalImage({ url: kmeansImg12, alt: "12色 色块分割" })}
              />
            </div>
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无12色K-means色块分割图片
            </div>
          )}
          
          {/* 12色主色调分析 */}
          {renderPalette(dominantPalette12, "12色主色调")}
        </div>

        {renderGuidance(5, guidanceContent[5])}

        {/* 删除并开启新分析按钮 */}
        {onDeleteAndRestart && (
          <div style={{ 
            marginTop: "2rem", 
            display: "flex", 
            justifyContent: "center",
            paddingTop: "2rem",
            borderTop: "1px solid rgba(152, 219, 198, 0.2)"
          }}>
            <button
              type="button"
              className="visual-analysis__threshold-button"
              onClick={onDeleteAndRestart}
              style={{
                background: "rgba(255, 156, 156, 0.2)",
                color: "#ff9c9c",
                borderColor: "rgba(255, 156, 156, 0.35)",
                padding: "0.75rem 2rem",
                fontSize: "1rem"
              }}
            >
              <MaterialIcon name="delete" style={{ marginRight: "0.5rem", verticalAlign: "middle" }} />
              删除并开启新分析
            </button>
          </div>
        )}
      </div>
    );
  };

  // 解读说明组件
  const renderGuidance = (pageNumber: number, content: string) => {
    const isExpanded = expandedGuidance[pageNumber] || false;
    
    return (
      <div style={{ 
        marginTop: "1.5rem", 
        paddingTop: "1.5rem",
        borderTop: "1px solid rgba(152, 219, 198, 0.2)"
      }}>
        <button
          type="button"
          onClick={() => setExpandedGuidance(prev => ({ ...prev, [pageNumber]: !prev[pageNumber] }))}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            background: "transparent",
            border: "none",
            color: "rgba(239, 234, 231, 0.8)",
            fontSize: "0.95rem",
            cursor: "pointer",
            padding: "0.5rem 0",
            textAlign: "left"
          }}
        >
          <span style={{ fontWeight: 500 }}>解读说明</span>
          <MaterialIcon 
            name={isExpanded ? "expand_less" : "expand_more"} 
            style={{ fontSize: "1.2rem" }}
          />
        </button>
        {isExpanded && (
          <div style={{
            marginTop: "1rem",
            padding: "1rem",
            background: "rgba(152, 219, 198, 0.05)",
            borderRadius: "0.5rem",
            color: "rgba(239, 234, 231, 0.7)",
            fontSize: "0.9rem",
            lineHeight: "1.6",
            whiteSpace: "pre-line"
          }}>
            {pageNumber === 1 ? (
              <>
                <div style={{
                  color: "#98dbc6",
                  fontSize: "0.9rem",
                  lineHeight: "1.6",
                  marginBottom: "1.5rem",
                  paddingBottom: "1.5rem",
                  borderBottom: "1px solid rgba(152, 219, 198, 0.2)"
                }}>
                  分析图和提示只是希望让大家更方便地看画面，只是一个用于参考的工具，不一定"正确"，也不一定适合所有风格。每part下的解读说明都是针对当前part。画画本身就有取舍，比如线稿强了上色就要简单，素描关系强了饱和度也不一定拉满，更何况主观处理是画画里绝对重要的部分。看看哪里对你有启发就好，enjoy。
                </div>
                <div style={{ whiteSpace: "pre-line" }}>
                  {content}
                </div>
              </>
            ) : (
              content
            )}
          </div>
        )}
      </div>
    );
  };

  // 各页解读说明内容
  const guidanceContent = {
    1: `黑白分布有大块的吗？还是都是细细碎碎的？

亮区和暗区的比例有做到明显的多少对比，而不是五五分吗？

主体轮廓还能清楚读出来吗？

点、线、面是否至少出现两种？哪一种最弱？如果补强，需要加线条？加大色块？还是增加节奏点？

如果是大插，是否存在明显的趋势线（S 型 / C 型 / /\\ 型）？

主体剪影是否统一？正形 / 负形交界形状如何？`,
    2: `两个明度图是否有差异很大的地方，比如rgb图压暗的区域在lab图对比度变弱了，或者本来打算画较弱的明暗对比但是在lab图里完全融为一体了。

是否存在整体偏灰，看不出明确黑白格子的问题。

对比是否在关键区域集中？非关键区域是否减少对比？

是否有大面积亮/暗区，是否存在明暗跳跃是否过多，让视线难以集中的问题。能一眼看出哪里是视觉中心吗？

前、中、后是否分得开？

明暗分布是否避免五五开？

空气透视和光衰做了吗？

视觉中心附近是否比其他区域层次更丰富？`,
    3: `如果画的是亮灰暗纯，那么hls转饱和度图应该类似lab转视觉明度图拉高对比度的感觉，有明确的黑白关系。

如果画的是亮纯暗灰，请点击切换

视觉中心是否有饱和度优势？

如果画面要做透光，是不是使用了"提饱和"而不是"提亮度"？

Hls转饱和度的图，是否更像黑白关系图，而不是更像填底色的图？如果是后者的话，可能存在饱和度完全跟着固有色走（比如不同颜色的衣服）的问题。`,
    4: `比较理想的情况是直方图聚集在一个区间内，或者聚集在区间+对比色一点，而不是完全跟着固有色各种分布

如果是没有明显规律，平均分布，且是大插而不是立绘or色调大头那样的，需要检查是否是自己有意设计的。`,
    5: `色块有比较明确的大小分布、互相穿插吗？有出现不该糊在一起的地方被归为一个色块吗？

目前使用的色块提取方法可能会出现让整体色调更统一，尤其是比如"oc是红毛但是在绿色场景"这种容易固有色各干各的的情况，可能会提取出更和谐的颜色，可以看看能不能带来修改灵感

同时可以用于检查配色是否存在本身就很难画好看的颜色，or检查颜色配比，or衣服头发的二分。`
  };

  const totalPages = 5;

  return (
    <div className="visual-analysis-comprehensive">
      <div className="visual-analysis-pagination">
        <button
          type="button"
          className="visual-analysis-page-button"
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <MaterialIcon name="chevron_left" />
          上一页
        </button>
        <span className="visual-analysis-page-indicator">
          第 {currentPage} 页 / 共 {totalPages} 页
        </span>
        <button
          type="button"
          className="visual-analysis-page-button"
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          下一页
          <MaterialIcon name="chevron_right" />
        </button>
      </div>

      {currentPage === 1 && renderPage1()}
      {currentPage === 2 && renderPage2()}
      {currentPage === 3 && renderPage3()}
      {currentPage === 4 && renderPage4()}
      {currentPage === 5 && renderPage5()}

      <div className="visual-analysis-pagination">
        <button
          type="button"
          className="visual-analysis-page-button"
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <MaterialIcon name="chevron_left" />
          上一页
        </button>
        <div className="visual-analysis-page-dots">
          {[1, 2, 3, 4, 5].map((page) => (
            <button
              key={page}
              type="button"
              className={`visual-analysis-page-dot ${currentPage === page ? 'active' : ''}`}
              onClick={() => setCurrentPage(page)}
              aria-label={`第${page}页`}
            />
          ))}
        </div>
        <button
          type="button"
          className="visual-analysis-page-button"
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          下一页
          <MaterialIcon name="chevron_right" />
        </button>
      </div>

      {/* 图片弹窗 */}
      {modalImage && (
        <ImageModal
          imageUrl={modalImage.url}
          alt={modalImage.alt}
          onClose={() => setModalImage(null)}
        />
      )}
    </div>
  );
}

export default VisualAnalysisComprehensive;
