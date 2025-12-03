import { useMemo, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import ImageCropper, { type CropData } from "@/components/ImageCropper";
import type { Artwork } from "@/types/artwork";
import { getOrLoadImage } from "@/utils/imageCache";
import "./ImageGridSelector.css";

export type GridImage = {
  artworkId: string | null;
  image: HTMLImageElement | null;
  cropData?: CropData; // 裁剪数据（可选）
};

type WeekSelectorProps = {
  weekStartDate: Date;
  onWeekStartDateChange: (date: Date) => void;
};

function WeekSelector({ weekStartDate, onWeekStartDateChange }: WeekSelectorProps) {
  const currentYear = weekStartDate.getFullYear();
  const currentMonth = weekStartDate.getMonth() + 1; // 1-12

  // 生成年份选项（当前年份前后各5年）
  const years = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const options: number[] = [];
    for (let i = thisYear - 5; i <= thisYear + 5; i++) {
      options.push(i);
    }
    return options;
  }, []);

  // 生成月份选项
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  // 计算指定年月的所有周（从周一开始）
  const weeks = useMemo(() => {
    const year = currentYear;
    const month = currentMonth;
    const weeksList: Array<{ start: Date; end: Date; label: string }> = [];

    // 获取该月的第一天和最后一天
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0); // 最后一天

    // 找到该月第一周的周一
    const firstDayWeekday = firstDay.getDay(); // 0=周日, 1=周一, ...
    const firstMondayOffset = firstDayWeekday === 0 ? -6 : 1 - firstDayWeekday;
    let currentWeekStart = new Date(year, month - 1, 1 + firstMondayOffset);

    // 遍历所有周，直到超过该月最后一天
    while (currentWeekStart <= lastDay) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6); // 周日

      // 如果周的开始日期或结束日期在该月内，则包含这一周
      if (
        (currentWeekStart.getMonth() === month - 1 || currentWeekStart <= lastDay) &&
        (weekEnd.getMonth() === month - 1 || weekEnd >= firstDay)
      ) {
        // 计算实际显示的日期范围（只显示该月内的日期）
        const displayStart = currentWeekStart < firstDay ? firstDay : currentWeekStart;
        const displayEnd = weekEnd > lastDay ? lastDay : weekEnd;

        weeksList.push({
          start: new Date(currentWeekStart),
          end: weekEnd,
          label: `${displayStart.getDate()}-${displayEnd.getDate()}`,
        });
      }

      // 下一周
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }

    return weeksList;
  }, [currentYear, currentMonth]);

  // 找到当前周在列表中的索引
  const currentWeekIndex = useMemo(() => {
    return weeks.findIndex((week) => {
      const weekStart = week.start.toISOString().split("T")[0];
      const selectedStart = weekStartDate.toISOString().split("T")[0];
      return weekStart === selectedStart;
    });
  }, [weeks, weekStartDate]);

  // 当前周（如果找不到匹配的，使用第一周或空）
  const selectedWeekIndex = currentWeekIndex >= 0 ? currentWeekIndex : 0;

  const handleYearChange = (year: number) => {
    // 尝试保持相同的月份和日期，如果日期无效则使用该月第一周的周一
    const month = currentMonth;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const firstDayWeekday = firstDay.getDay();
    const firstMondayOffset = firstDayWeekday === 0 ? -6 : 1 - firstDayWeekday;
    let targetWeekStart = new Date(year, month - 1, 1 + firstMondayOffset);
    
    // 尝试找到包含原日期的那一周
    let currentWeekStart = new Date(targetWeekStart);
    while (currentWeekStart <= lastDay) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      if (weekStartDate >= currentWeekStart && weekStartDate <= weekEnd) {
        targetWeekStart = new Date(currentWeekStart);
        break;
      }
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    
    onWeekStartDateChange(new Date(targetWeekStart));
  };

  const handleMonthChange = (month: number) => {
    // 尝试保持相同的年份和日期，如果日期无效则使用该月第一周的周一
    const year = currentYear;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const firstDayWeekday = firstDay.getDay();
    const firstMondayOffset = firstDayWeekday === 0 ? -6 : 1 - firstDayWeekday;
    let targetWeekStart = new Date(year, month - 1, 1 + firstMondayOffset);
    
    // 尝试找到包含原日期的那一周
    let currentWeekStart = new Date(targetWeekStart);
    while (currentWeekStart <= lastDay) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      if (weekStartDate >= currentWeekStart && weekStartDate <= weekEnd) {
        targetWeekStart = new Date(currentWeekStart);
        break;
      }
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    
    onWeekStartDateChange(new Date(targetWeekStart));
  };

  const handleWeekChange = (weekIndex: number) => {
    const selectedWeek = weeks[weekIndex];
    if (selectedWeek) {
      onWeekStartDateChange(new Date(selectedWeek.start));
    }
  };

  return (
    <div className="image-grid-selector__week-selector">
      <select
        className="image-grid-selector__week-select"
        value={currentYear}
        onChange={(e) => handleYearChange(Number.parseInt(e.target.value, 10))}
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}年
          </option>
        ))}
      </select>
      <select
        className="image-grid-selector__week-select"
        value={currentMonth}
        onChange={(e) => handleMonthChange(Number.parseInt(e.target.value, 10))}
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {month}月
          </option>
        ))}
      </select>
      <select
        className="image-grid-selector__week-select"
        value={selectedWeekIndex}
        onChange={(e) => handleWeekChange(Number.parseInt(e.target.value, 10))}
      >
        {weeks.map((week, index) => (
          <option key={index} value={index}>
            {week.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type ImageGridSelectorProps = {
  gridImages: GridImage[];
  artworks: Artwork[];
  placeholderPositions?: number[]; // 占位符位置索引
  placeholderLabels?: Record<number, string>; // 占位符标签
  onImageChange: (gridImages: GridImage[]) => void;
  getFilteredArtworks?: (position: number) => Artwork[]; // 可选：根据位置筛选作品
  getPickerTitle?: (position: number) => string; // 可选：自定义选择器标题
  // 周信息选择器（可选）
  showWeekSelector?: boolean;
  weekStartDate?: Date;
  onWeekStartDateChange?: (date: Date) => void;
  // 裁剪配置（可选）
  enableCrop?: boolean; // 是否启用裁剪
  targetWidth?: number; // 目标宽度（用于裁剪）
  targetHeight?: number; // 目标高度（用于裁剪）
};

export function ImageGridSelector({
  gridImages,
  artworks,
  placeholderPositions = [],
  placeholderLabels = {},
  onImageChange,
  getFilteredArtworks,
  getPickerTitle,
  showWeekSelector = false,
  weekStartDate,
  onWeekStartDateChange,
  enableCrop = false,
  targetWidth = 1080,
  targetHeight = 1080,
}: ImageGridSelectorProps) {
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [pickingPosition, setPickingPosition] = useState<number | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [croppingArtwork, setCroppingArtwork] = useState<Artwork | null>(null);
  const [croppingPosition, setCroppingPosition] = useState<number | null>(null);
  
  // 根据gridImages的长度自动计算网格列数
  const gridCols = useMemo(() => {
    const total = gridImages.length;
    if (total === 35) return 7; // 单月模板：7列5行
    if (total === 16) return 4; // 4x4网格
    if (total === 9) return 3; // 3x3网格
    if (total === 4) return 2; // 2x2网格
    // 默认尝试计算平方根
    return Math.ceil(Math.sqrt(total));
  }, [gridImages.length]);

  const handleCellClick = (index: number) => {
    if (placeholderPositions.includes(index)) {
      return; // 占位符不可点击
    }
    setPickingPosition(index);
    setImagePickerOpen(true);
  };

  // 根据裁剪数据生成裁剪后的图片
  const applyCropToImage = async (sourceImage: HTMLImageElement, crop: CropData): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        reject(new Error("无法创建canvas上下文"));
        return;
      }

      // 计算源图中的裁剪区域
      const sourceX = crop.x * sourceImage.width;
      const sourceY = crop.y * sourceImage.height;
      const sourceWidth = crop.width * sourceImage.width;
      const sourceHeight = crop.height * sourceImage.height;

      // 绘制裁剪后的图片
      ctx.drawImage(
        sourceImage,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        targetWidth,
        targetHeight,
      );

      // 转换为图片
      const croppedImg = new Image();
      croppedImg.onload = () => resolve(croppedImg);
      croppedImg.onerror = () => reject(new Error("裁剪后的图片加载失败"));
      croppedImg.src = canvas.toDataURL("image/png");
    });
  };

  const handleImageSelect = async (artwork: Artwork) => {
    if (pickingPosition === null) return;
    
    if (enableCrop) {
      // 启用裁剪时，先打开裁剪器
      setImagePickerOpen(false);
      setCroppingArtwork(artwork);
      setCroppingPosition(pickingPosition);
      setCropperOpen(true);
      // 不立即清除 pickingPosition，以便裁剪完成后使用
    } else {
      // 不启用裁剪时，直接应用图片
      try {
        const img = await getOrLoadImage(artwork.imageSrc);
        const newGrid = [...gridImages];
        newGrid[pickingPosition] = { artworkId: artwork.id, image: img };
        onImageChange(newGrid);
        setImagePickerOpen(false);
        setPickingPosition(null);
      } catch (error) {
        console.error("加载图片失败:", error);
      }
    }
  };

  const handleCropConfirm = async (crop: CropData) => {
    if (croppingArtwork === null || croppingPosition === null) return;

    try {
      // 加载原图
      const sourceImg = await getOrLoadImage(croppingArtwork.imageSrc);
      console.log("原图尺寸:", sourceImg.width, sourceImg.height);
      console.log("裁剪数据:", crop);
      console.log("目标尺寸:", targetWidth, targetHeight);
      
      // 应用裁剪
      const croppedImg = await applyCropToImage(sourceImg, crop);
      console.log("裁剪后图片尺寸:", croppedImg.width, croppedImg.height);
      
      // 更新网格图片
      const newGrid = [...gridImages];
      newGrid[croppingPosition] = {
        artworkId: croppingArtwork.id,
        image: croppedImg,
        cropData: crop,
      };
      onImageChange(newGrid);
      
      // 清理状态
      setCropperOpen(false);
      setCroppingArtwork(null);
      setCroppingPosition(null);
      setPickingPosition(null);
    } catch (error) {
      console.error("裁剪图片失败:", error);
      alert("裁剪图片失败，请稍后重试");
    }
  };

  const handleCropClose = () => {
    setCropperOpen(false);
    setCroppingArtwork(null);
    setCroppingPosition(null);
    setPickingPosition(null);
  };

  const handleClearImage = () => {
    if (pickingPosition === null) return;
    const newGrid = [...gridImages];
    newGrid[pickingPosition] = { artworkId: null, image: null };
    onImageChange(newGrid);
    setImagePickerOpen(false);
    setPickingPosition(null);
  };

  const getArtworksForPosition = (position: number): Artwork[] => {
    if (getFilteredArtworks) {
      return getFilteredArtworks(position);
    }
    return artworks;
  };

  const getTitleForPosition = (position: number): string => {
    if (getPickerTitle) {
      return getPickerTitle(position);
    }
    return "选择图片";
  };

  const filteredArtworks = pickingPosition !== null ? getArtworksForPosition(pickingPosition) : [];
  const pickerTitle = pickingPosition !== null ? getTitleForPosition(pickingPosition) : "选择图片";

  return (
    <>
      <div className="image-grid-selector">
        <div className="image-grid-selector__header">
          <h3>图片选择</h3>
          <p>点击格子选择图片{placeholderPositions.length > 0 ? "，部分位置为占位符" : ""}</p>
        </div>
        {showWeekSelector && weekStartDate && onWeekStartDateChange && (
          <WeekSelector weekStartDate={weekStartDate} onWeekStartDateChange={onWeekStartDateChange} />
        )}
        <div className="image-grid-selector__grid" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
          {gridImages.map((gridImage, index) => {
            const isPlaceholder = placeholderPositions.includes(index);
            
            if (isPlaceholder) {
              return (
                <div
                  key={index}
                  className="image-grid-selector__cell image-grid-selector__cell--placeholder"
                >
                  {placeholderLabels[index] || "占位"}
                </div>
              );
            }
            
            return (
              <button
                key={index}
                type="button"
                className="image-grid-selector__cell"
                onClick={() => handleCellClick(index)}
              >
                {gridImage?.image ? (
                  <img
                    src={gridImage.image.src}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <span>填入</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {imagePickerOpen && pickingPosition !== null && (
        <div className="image-grid-selector__picker" role="dialog" aria-modal="true">
          <div
            className="image-grid-selector__picker-backdrop"
            onClick={() => {
              setImagePickerOpen(false);
              setPickingPosition(null);
            }}
          />
          <div className="image-grid-selector__picker-panel">
            <div className="image-grid-selector__picker-header">
              <h3>{pickerTitle}</h3>
              <button
                type="button"
                className="image-grid-selector__picker-close"
                aria-label="关闭图片选择"
                onClick={() => {
                  setImagePickerOpen(false);
                  setPickingPosition(null);
                }}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="image-grid-selector__artwork-grid" role="listbox" aria-label="可选择的图片">
              {filteredArtworks.length === 0 ? (
                <div className="image-grid-selector__empty">
                  <p>该位置没有可用的图片</p>
                </div>
              ) : (
                <>
                  {filteredArtworks.map((artwork) => {
                    const isActive = gridImages[pickingPosition]?.artworkId === artwork.id;
                    return (
                      <button
                        key={artwork.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`image-grid-selector__artwork-button${isActive ? " image-grid-selector__artwork-button--active" : ""}`}
                        onClick={() => handleImageSelect(artwork)}
                      >
                        <img src={artwork.imageSrc} alt={artwork.alt} loading="lazy" />
                        <span>{artwork.title || "未命名"}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="image-grid-selector__artwork-button image-grid-selector__artwork-button--clear"
                    onClick={handleClearImage}
                  >
                    <div className="image-grid-selector__clear-icon">
                      <MaterialIcon name="close" />
                    </div>
                    <span>清空</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {cropperOpen && croppingArtwork && (
        <ImageCropper
          open={cropperOpen}
          imageSrc={croppingArtwork.imageSrc}
          targetWidth={targetWidth}
          targetHeight={targetHeight}
          initialCrop={gridImages[croppingPosition ?? -1]?.cropData}
          onClose={handleCropClose}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  );
}

