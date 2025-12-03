import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import LazyImage from "@/components/LazyImage";
import type { ShortTermGoal, UserUploadRecord } from "@/services/api";
import { API_BASE_URL } from "@/services/api";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";
import { getOrLoadImage } from "@/utils/imageCache";
import type { DayCard } from "./ShortTermGoalDetails";

import "./ShortTermGoalSummaryTemplate.css";

type ShortTermGoalSummaryTemplateProps = {
  open: boolean;
  goal: ShortTermGoal;
  cycleState: {
    days: DayCard[];
  };
  taskImages: Record<string, UserUploadRecord | null>;
  onClose: () => void;
};

// 根据天数确定模版类型
function getTemplateType(durationDays: number): "week" | "doubleWeek" | "threeWeek" | "month" {
  if (durationDays === 7) return "week";
  if (durationDays === 14) return "doubleWeek";
  if (durationDays === 21) return "threeWeek";
  if (durationDays === 28) return "month";
  // 默认使用单周模版
  return "week";
}

// 获取任务图片列表（按日期顺序）
function getTaskImagesInOrder(
  goal: ShortTermGoal,
  cycleState: { days: DayCard[] },
  taskImages: Record<string, UserUploadRecord | null>
): (UserUploadRecord | null)[] {
  const images: (UserUploadRecord | null)[] = [];
  
  // 按dayIndex排序
  const sortedDays = [...cycleState.days].sort((a, b) => a.dayNumber - b.dayNumber);
  
  for (const day of sortedDays) {
    // 获取该天所有任务的图片
    const dayImages: (UserUploadRecord | null)[] = [];
    
    for (const task of day.tasks) {
      const taskKey = `${day.dateKey}-${task.taskId}`;
      const image = taskImages[taskKey];
      if (image) {
        dayImages.push(image);
      }
    }
    
    // 如果该天有图片，取第一张；如果没有，则为null
    images.push(dayImages.length > 0 ? dayImages[0] : null);
  }
  
  return images;
}

function ShortTermGoalSummaryTemplate({
  open,
  goal,
  cycleState,
  taskImages,
  onClose,
}: ShortTermGoalSummaryTemplateProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [failedImageCount, setFailedImageCount] = useState(0);
  
  const templateType = getTemplateType(goal.durationDays);
  const taskImagesInOrder = useMemo(
    () => getTaskImagesInOrder(goal, cycleState, taskImages),
    [goal, cycleState, taskImages]
  );
  
  // 根据模版类型确定网格布局
  const gridConfig = useMemo(() => {
    switch (templateType) {
      case "week": // 7天：3x3网格，7个可编辑位置（位置2和6是占位符）
        return {
          cols: 3,
          rows: 3,
          totalCells: 9,
          placeholderIndices: [2, 6], // 位置2和6是占位符
          editableIndices: [0, 1, 3, 4, 5, 7, 8], // 7个可编辑位置
        };
      case "doubleWeek": // 14天：4x4网格，位置1和2显示周信息，位置3-16是14天的图片
        return {
          cols: 4,
          rows: 4,
          totalCells: 16,
          placeholderIndices: [0, 1], // 位置0和1显示周信息（占位）
          editableIndices: Array.from({ length: 14 }, (_, i) => i + 2), // 位置2-15
        };
      case "threeWeek": // 21天：5x5网格，4个占位符，21个可编辑位置
        return {
          cols: 5,
          rows: 5,
          totalCells: 25,
          placeholderIndices: [0, 4, 20, 24], // 四个角的占位符
          editableIndices: Array.from({ length: 25 }, (_, i) => i).filter(
            (i) => ![0, 4, 20, 24].includes(i)
          ),
        };
      case "month": // 28天：4行7列，28个位置，无占位符
        return {
          cols: 7,
          rows: 4,
          totalCells: 28,
          placeholderIndices: [],
          editableIndices: Array.from({ length: 28 }, (_, i) => i),
        };
      default:
        return {
          cols: 3,
          rows: 3,
          totalCells: 9,
          placeholderIndices: [2, 6],
          editableIndices: [0, 1, 3, 4, 5, 7, 8],
        };
    }
  }, [templateType]);
  
  // 生成网格图片数组
  const gridImages = useMemo(() => {
    const images: (UserUploadRecord | null)[] = new Array(gridConfig.totalCells).fill(null);
    
    // 将任务图片按顺序填充到可编辑位置
    gridConfig.editableIndices.forEach((index, i) => {
      if (i < taskImagesInOrder.length) {
        images[index] = taskImagesInOrder[i];
      }
    });
    
    return images;
  }, [gridConfig, taskImagesInOrder]);
  
  // 绘制canvas
  const drawCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const CANVAS_WIDTH = 1080;
    const gap = CANVAS_WIDTH * 0.01;
    const totalGapWidth = gap * (gridConfig.cols - 1);
    const totalGapHeight = gap * (gridConfig.rows - 1);
    const availableWidth = CANVAS_WIDTH - totalGapWidth;
    const cellWidth = availableWidth / gridConfig.cols;
    const cellHeight = cellWidth; // 正方形
    
    // 计算canvas高度
    const gridTotalHeight = gridConfig.rows * cellHeight + totalGapHeight;
    const CANVAS_HEIGHT = gridTotalHeight + 100; // 底部留一些空间
    
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    
    // 清空画布
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 绘制网格图片
    let imageLoadPromises: Promise<void>[] = [];
    
    for (let row = 0; row < gridConfig.rows; row++) {
      for (let col = 0; col < gridConfig.cols; col++) {
        const index = row * gridConfig.cols + col;
        const image = gridImages[index];
        const isPlaceholder = gridConfig.placeholderIndices.includes(index);
        
        const x = col * (cellWidth + gap);
        const y = row * (cellHeight + gap);
        
        if (isPlaceholder) {
          // 绘制占位符（灰色背景）
          ctx.fillStyle = "#f0f0f0";
          ctx.fillRect(x, y, cellWidth, cellHeight);
        } else if (image && image.image) {
          // 使用getOrLoadImage加载图片，避免跨域问题
          const imageUrl = replaceLocalhostInUrl(image.image);
          
          const loadPromise = (async () => {
            try {
              // 首先尝试使用getOrLoadImage（会处理跨域问题）
              const img = await getOrLoadImage(imageUrl);
              ctx.drawImage(img, x, y, cellWidth, cellHeight);
            } catch (error) {
              console.warn(`Failed to load image at position ${index}:`, error);
              setFailedImageCount((prev) => prev + 1);
              
              // 如果加载失败，绘制一个占位符
              ctx.fillStyle = "#e0e0e0";
              ctx.fillRect(x, y, cellWidth, cellHeight);
              
              // 绘制一个简单的图标表示图片加载失败
              ctx.fillStyle = "#999";
              ctx.font = `${Math.min(cellWidth, cellHeight) * 0.15}px Arial`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText("?", x + cellWidth / 2, y + cellHeight / 2);
            }
          })();
          
          imageLoadPromises.push(loadPromise);
        } else {
          // 空位置（白色背景，已有白色背景）
        }
      }
    }
    
    // 等待所有图片加载完成
    await Promise.all(imageLoadPromises);
    
    // 生成预览图
    const dataUrl = canvas.toDataURL("image/png");
    setPreviewImageUrl(dataUrl);
  }, [gridConfig, gridImages]);
  
  useEffect(() => {
    if (open) {
      setFailedImageCount(0);
      drawCanvas();
    }
  }, [open, drawCanvas]);
  
  const handleDownload = useCallback(() => {
    if (!previewImageUrl) return;
    
    const link = document.createElement("a");
    link.download = `${goal.title}_总结.png`;
    link.href = previewImageUrl;
    link.click();
  }, [previewImageUrl, goal.title]);
  
  if (!open) return null;
  
  return (
    <div className="short-term-summary-template__overlay" onClick={onClose}>
      <div
        className="short-term-summary-template__modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="short-term-summary-template__header">
          <h2>总结本次短期目标</h2>
          <button
            type="button"
            className="short-term-summary-template__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        
        <div className="short-term-summary-template__content">
          {failedImageCount > 0 && (
            <div className="short-term-summary-template__warning">
              <MaterialIcon name="warning" />
              <span>
                有 {failedImageCount} 张图片因跨域限制无法加载，已显示为占位符。
                如需完整显示，请联系管理员配置图片服务器的CORS设置。
              </span>
            </div>
          )}
          <div className="short-term-summary-template__preview">
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {previewImageUrl ? (
              <img
                src={previewImageUrl}
                alt="总结预览"
                className="short-term-summary-template__preview-image"
              />
            ) : (
              <div className="short-term-summary-template__loading">生成中...</div>
            )}
          </div>
          
          <div className="short-term-summary-template__grid-preview">
            <div
              className="short-term-summary-template__grid"
              style={{
                gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
                gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
              }}
            >
              {gridImages.map((image, index) => {
                const isPlaceholder = gridConfig.placeholderIndices.includes(index);
                
                return (
                  <div
                    key={index}
                    className={`short-term-summary-template__grid-item ${
                      isPlaceholder ? "short-term-summary-template__grid-item--placeholder" : ""
                    }`}
                  >
                    {isPlaceholder ? (
                      <div className="short-term-summary-template__placeholder" />
                    ) : image && image.image ? (
                      <LazyImage
                        src={replaceLocalhostInUrl(image.image)}
                        alt={`第${Math.floor(index / gridConfig.cols) + 1}行第${(index % gridConfig.cols) + 1}列`}
                      />
                    ) : (
                      <div className="short-term-summary-template__empty" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        <div className="short-term-summary-template__footer">
          <button
            type="button"
            className="short-term-summary-template__button short-term-summary-template__button--secondary"
            onClick={onClose}
          >
            关闭
          </button>
          <button
            type="button"
            className="short-term-summary-template__button short-term-summary-template__button--primary"
            onClick={handleDownload}
            disabled={!previewImageUrl}
          >
            下载图片
          </button>
        </div>
      </div>
    </div>
  );
}

export default ShortTermGoalSummaryTemplate;

