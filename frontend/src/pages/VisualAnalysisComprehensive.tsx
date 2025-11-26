import { useState, useEffect } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "./VisualAnalysis.css";

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
  onClose,
  onThresholdChange,
  selectedThreshold = 140,
  onDeleteAndRestart
}: ComprehensiveAnalysisProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [hlsInverted, setHlsInverted] = useState(false);
  const [invertedHlsImage, setInvertedHlsImage] = useState<string | null>(null);

  // 计算反色的HLS图片
  useEffect(() => {
    if (basicResults?.step4HlsS && !invertedHlsImage) {
      invertImage(basicResults.step4HlsS)
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

  // 第一页：原图+二值化图片+3阶层灰度图片+4阶层灰度图片，两行两列排列
  // 左右两张图，下面是6个等级的按钮，用于切换从高到低的二值化
  const renderPage1 = () => (
    <div className="visual-analysis-page">
      <h2 className="visual-analysis-page-title">第一页：明暗可读性与形状构成</h2>
      
      <div className="visual-analysis-page-images" style={{ 
        gridTemplateColumns: "1fr 1fr",
        gap: "1.5rem"
      }}>
        {/* 第一行：原图和二值化 */}
        <div className="visual-analysis-page-image-item">
          <h3>原图</h3>
          {basicResults?.originalImage ? (
            <img src={basicResults.originalImage} alt="原图" />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无原图
            </div>
          )}
        </div>
        
        <div className="visual-analysis-page-image-item">
          <h3>二值化图片</h3>
          {basicResults?.step1Binary ? (
            <img src={basicResults.step1Binary} alt="二值化" />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无二值化图片
            </div>
          )}
        </div>
        
        {/* 第二行：3阶层灰度和4阶层灰度 */}
        <div className="visual-analysis-page-image-item">
          <h3>3阶层灰度</h3>
          {basicResults?.step2Grayscale3Level ? (
            <img src={basicResults.step2Grayscale3Level} alt="3阶层灰度" />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无3阶层灰度图片
            </div>
          )}
        </div>
        
        <div className="visual-analysis-page-image-item">
          <h3>4阶层灰度</h3>
          {basicResults?.step2Grayscale4Level ? (
            <img src={basicResults.step2Grayscale4Level} alt="4阶层灰度" />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无4阶层灰度图片
            </div>
          )}
        </div>
      </div>

      {/* 6个等级的二值化按钮 */}
      <div style={{ marginTop: "2rem" }}>
        <h3 style={{ 
          marginBottom: "1rem", 
          fontSize: "1rem", 
          fontWeight: 500, 
          color: "rgba(239, 234, 231, 0.8)" 
        }}>
          二值化阈值等级（从高到低）
        </h3>
        <div className="visual-analysis__threshold-controls">
          {BINARY_THRESHOLD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`visual-analysis__threshold-button ${
                selectedThreshold === option.value ? "visual-analysis__threshold-button--active" : ""
              }`}
              onClick={() => {
                if (onThresholdChange) {
                  onThresholdChange(option.value);
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // 第二页：rgb转明度和lab转视觉明度对比，两张图左右排列
  const renderPage2 = () => (
    <div className="visual-analysis-page">
      <h2 className="visual-analysis-page-title">第二页：RGB转明度 vs LAB转视觉明度</h2>
      
      <div className="visual-analysis-page-images" style={{ 
        gridTemplateColumns: "1fr 1fr",
        gap: "1.5rem"
      }}>
        <div className="visual-analysis-page-image-item">
          <h3>RGB转明度</h3>
          {basicResults?.step2Grayscale ? (
            <img src={basicResults.step2Grayscale} alt="RGB转明度" />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无RGB转明度图片
            </div>
          )}
        </div>
        
        <div className="visual-analysis-page-image-item">
          <h3>LAB转视觉明度</h3>
          {results?.value_structure?.lab_luminance?.l_channel ? (
            <img 
              src={`data:image/png;base64,${results.value_structure.lab_luminance.l_channel}`} 
              alt="LAB视觉明度" 
            />
          ) : basicResults?.step3LabL ? (
            <img src={basicResults.step3LabL} alt="LAB视觉明度" />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无LAB视觉明度图片
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // 第三页：hls转饱和度+lab转视觉明度对比（两张，一张正常hls转饱和度，一张反色），左右排列
  // 用户可以点击"切换反色"按钮，切换两种hls图
  const renderPage3 = () => (
    <div className="visual-analysis-page">
      <h2 className="visual-analysis-page-title">第三页：HLS转饱和度 vs LAB转视觉明度</h2>
      
      <div className="visual-analysis-page-images" style={{ 
        gridTemplateColumns: "1fr 1fr",
        gap: "1.5rem"
      }}>
        <div className="visual-analysis-page-image-item">
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: "0.75rem"
          }}>
            <h3 style={{ margin: 0 }}>HLS转饱和度</h3>
            <button
              type="button"
              className="visual-analysis__threshold-button"
              onClick={() => setHlsInverted(!hlsInverted)}
              style={{ 
                padding: "0.4rem 0.8rem",
                fontSize: "0.85rem"
              }}
            >
              {hlsInverted ? "显示正常" : "切换反色"}
            </button>
          </div>
          {basicResults?.step4HlsS ? (
            <img 
              src={hlsInverted && invertedHlsImage ? invertedHlsImage : basicResults.step4HlsS} 
              alt={hlsInverted ? "HLS饱和度（反色）" : "HLS饱和度"} 
            />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无HLS饱和度图片
            </div>
          )}
        </div>
        
        <div className="visual-analysis-page-image-item">
          <h3>LAB转视觉明度</h3>
          {results?.value_structure?.lab_luminance?.l_channel ? (
            <img 
              src={`data:image/png;base64,${results.value_structure.lab_luminance.l_channel}`} 
              alt="LAB视觉明度" 
            />
          ) : basicResults?.step3LabL ? (
            <img src={basicResults.step3LabL} alt="LAB视觉明度" />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无LAB视觉明度图片
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // 第四页：色相图+色相直方图
  const renderPage4 = () => (
    <div className="visual-analysis-page">
      <h2 className="visual-analysis-page-title">第四页：色相分析</h2>
      
      <div className="visual-analysis-page-images" style={{ 
        gridTemplateColumns: "1fr 1fr",
        gap: "1.5rem"
      }}>
        <div className="visual-analysis-page-image-item">
          <h3>色相图</h3>
          {basicResults?.step5Hue ? (
            <img src={basicResults.step5Hue} alt="色相图" />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
              暂无色相图
            </div>
          )}
        </div>
        
        <div className="visual-analysis-page-image-item">
          <h3>色相直方图</h3>
          {results?.color_quality?.hue_distribution?.hue_histogram ? (
            <div className="visual-analysis__histogram">
              <div className="visual-analysis__histogram-container">
                <div className="visual-analysis__histogram-bars">
                  {results.color_quality.hue_distribution.hue_histogram.map((value: number, index: number) => {
                    const maxValue = Math.max(...results.color_quality.hue_distribution.hue_histogram);
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
    </div>
  );

  // 第五页：K-means 色块分割 + 主色调分析
  const renderPage5 = () => (
    <div className="visual-analysis-page">
      <h2 className="visual-analysis-page-title">第五页：K-means 色块分割</h2>
      
      <div className="visual-analysis-page-images" style={{ 
        gridTemplateColumns: "1fr",
        gap: "1.5rem"
      }}>
        {results?.color_block_structure?.kmeans_segmentation?.segmented_image ? (
          <div className="visual-analysis-page-image-item">
            <h3>K-means 色块分割</h3>
            <img 
              src={`data:image/png;base64,${results.color_block_structure.kmeans_segmentation.segmented_image}`} 
              alt="色块分割" 
            />
          </div>
        ) : (
          <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
            暂无K-means色块分割图片
          </div>
        )}
      </div>
    </div>
  );

  // 第六页：主色调分析
  const renderPage6 = () => (
    <div className="visual-analysis-page">
      <h2 className="visual-analysis-page-title">第六页：主色调分析</h2>
      
      <div className="visual-analysis-page-images" style={{ 
        gridTemplateColumns: "1fr",
        gap: "1.5rem"
      }}>
        {results?.color_block_structure?.dominant_palette ? (
          <div className="visual-analysis-page-image-item">
            <h3>主色调分析</h3>
            <div className="visual-analysis__color-palette">
              <div className="visual-analysis__color-swatches">
                {results.color_block_structure.dominant_palette.palette.map((color: number[], index: number) => (
                  <div key={index} className="visual-analysis__color-swatch-container">
                    <div 
                      className="visual-analysis__color-swatch"
                      style={{ backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})` }}
                    />
                    {results.color_block_structure.dominant_palette.palette_ratios && (
                      <div className="visual-analysis__color-swatch-label">
                        {Math.round(results.color_block_structure.dominant_palette.palette_ratios[index] * 100)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "2rem", textAlign: "center", color: "rgba(239, 234, 231, 0.5)" }}>
            暂无主色调分析数据
          </div>
        )}
      </div>

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

  const totalPages = 6;

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
      {currentPage === 6 && renderPage6()}

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
          {[1, 2, 3, 4, 5, 6].map((page) => (
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
    </div>
  );
}

export default VisualAnalysisComprehensive;
