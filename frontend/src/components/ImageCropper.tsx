import { useEffect, useRef, useState } from "react";
import MaterialIcon from "./MaterialIcon";
import { getOrLoadImage } from "@/utils/imageCache";
import "./ImageCropper.css";

export type CropData = {
  x: number; // 裁剪区域在原图中的 x 坐标（0-1 范围）
  y: number; // 裁剪区域在原图中的 y 坐标（0-1 范围）
  width: number; // 裁剪区域宽度（0-1 范围）
  height: number; // 裁剪区域高度（0-1 范围）
};

type ImageCropperProps = {
  open: boolean;
  imageSrc: string;
  targetWidth: number;
  targetHeight: number;
  initialCrop?: CropData;
  onClose: () => void;
  onConfirm: (crop: CropData) => void;
};

function ImageCropper({
  open,
  imageSrc,
  targetWidth,
  targetHeight,
  initialCrop,
  onClose,
  onConfirm,
}: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [imageSrcForDisplay, setImageSrcForDisplay] = useState<string>(imageSrc);
  const [crop, setCrop] = useState<CropData>(
    initialCrop ?? {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
  );
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cropStart, setCropStart] = useState<CropData | null>(null);
  const [imageScale, setImageScale] = useState(1);

  // 加载图片
  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setImageLoaded(false);
    setImageNaturalSize({ width: 0, height: 0 });

    getOrLoadImage(imageSrc)
      .then((img) => {
        if (!cancelled) {
          setImageSrcForDisplay(img.src);
          // 如果图片已经加载完成，直接触发加载处理
          if (img.complete && img.naturalWidth > 0) {
            setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
            setImageLoaded(true);
            // 初始化裁剪区域
            const targetAspect = targetWidth / targetHeight;
            const imageAspect = img.naturalWidth / img.naturalHeight;
            let initialWidth = 1;
            let initialHeight = 1;

            if (targetAspect > imageAspect) {
              initialHeight = 1;
              initialWidth = targetAspect / imageAspect;
              if (initialWidth > 1) {
                initialWidth = 1;
                initialHeight = imageAspect / targetAspect;
              }
            } else {
              initialWidth = 1;
              initialHeight = imageAspect / targetAspect;
              if (initialHeight > 1) {
                initialHeight = 1;
                initialWidth = targetAspect / imageAspect;
              }
            }

            if (!initialCrop) {
              setCrop({
                x: (1 - initialWidth) / 2,
                y: (1 - initialHeight) / 2,
                width: initialWidth,
                height: initialHeight,
              });
            }
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("加载图片失败:", error);
          setImageLoaded(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, imageSrc, targetWidth, targetHeight, initialCrop]);

  useEffect(() => {
    if (!open) {
      setImageLoaded(false);
      setImageNaturalSize({ width: 0, height: 0 });
      setImageScale(1);
      setImageSrcForDisplay(imageSrc);
      if (initialCrop) {
        setCrop(initialCrop);
      } else {
        setCrop({ x: 0, y: 0, width: 1, height: 1 });
      }
      // 恢复 body 滚动
      document.body.style.overflow = "";
    } else {
      // 阻止 body 滚动
      document.body.style.overflow = "hidden";
    }
    
    return () => {
      // 清理时恢复 body 滚动
      document.body.style.overflow = "";
    };
  }, [open, initialCrop, imageSrc]);

  const handleImageLoad = () => {
    if (imageRef.current) {
      const naturalWidth = imageRef.current.naturalWidth;
      const naturalHeight = imageRef.current.naturalHeight;
      setImageNaturalSize({ width: naturalWidth, height: naturalHeight });
      setImageLoaded(true);

      // 初始化裁剪区域，确保符合目标宽高比
      const targetAspect = targetWidth / targetHeight;
      const imageAspect = naturalWidth / naturalHeight;

      let initialWidth = 1;
      let initialHeight = 1;

      if (targetAspect > imageAspect) {
        // 目标更宽，以高度为准
        initialHeight = 1;
        initialWidth = targetAspect / imageAspect;
        if (initialWidth > 1) {
          initialWidth = 1;
          initialHeight = imageAspect / targetAspect;
        }
      } else {
        // 目标更高，以宽度为准
        initialWidth = 1;
        initialHeight = imageAspect / targetAspect;
        if (initialHeight > 1) {
          initialHeight = 1;
          initialWidth = targetAspect / imageAspect;
        }
      }

      if (!initialCrop) {
        setCrop({
          x: (1 - initialWidth) / 2,
          y: (1 - initialHeight) / 2,
          width: initialWidth,
          height: initialHeight,
        });
      }
    }
  };

  // 计算裁剪框和图片的显示尺寸
  const getDisplayInfo = () => {
    if (!containerRef.current || !imageLoaded) {
      return null;
    }

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width - 40;
    const availableHeight = containerRect.height - 140; // 留出按钮和提示空间

    // 计算裁剪框显示尺寸（根据目标宽高比）
    const targetAspect = targetWidth / targetHeight;
    let cropBoxWidth: number;
    let cropBoxHeight: number;

    if (targetAspect > availableWidth / availableHeight) {
      cropBoxWidth = availableWidth;
      cropBoxHeight = availableWidth / targetAspect;
    } else {
      cropBoxHeight = availableHeight;
      cropBoxWidth = availableHeight * targetAspect;
    }

    // 裁剪框位置（居中）
    const cropBoxX = (containerRect.width - cropBoxWidth) / 2;
    const cropBoxY = (containerRect.height - 140 - cropBoxHeight) / 2 + 20;

    // 计算图片显示尺寸（需要足够大以覆盖裁剪框）
    const cropWidthInImage = crop.width * imageNaturalSize.width;
    const cropHeightInImage = crop.height * imageNaturalSize.height;
    const scaleToFitCropBox = Math.max(
      cropBoxWidth / cropWidthInImage,
      cropBoxHeight / cropHeightInImage,
    ) * imageScale;

    const imageDisplayWidth = imageNaturalSize.width * scaleToFitCropBox;
    const imageDisplayHeight = imageNaturalSize.height * scaleToFitCropBox;

    // 图片位置（使裁剪区域对齐裁剪框）
    const cropXInImage = crop.x * imageNaturalSize.width;
    const cropYInImage = crop.y * imageNaturalSize.height;
    const imageDisplayX = cropBoxX - cropXInImage * scaleToFitCropBox;
    const imageDisplayY = cropBoxY - cropYInImage * scaleToFitCropBox;

    return {
      cropBoxX,
      cropBoxY,
      cropBoxWidth,
      cropBoxHeight,
      imageDisplayX,
      imageDisplayY,
      imageDisplayWidth,
      imageDisplayHeight,
      scaleToFitCropBox,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imageLoaded) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    // 使用 clientX/clientY，在移动设备上更可靠
    setDragStart({ x: e.clientX, y: e.clientY });
    setCropStart({ ...crop });
    // 设置指针捕获，确保移动事件能被捕获
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !cropStart || !imageLoaded || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const display = getDisplayInfo();
    if (!display) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    // 将像素移动转换为相对于原图的比例
    // 注意：这里使用负号是因为图片移动方向与鼠标移动方向相反
    const scale = display.scaleToFitCropBox;
    const deltaXRatio = -deltaX / (imageNaturalSize.width * scale);
    const deltaYRatio = -deltaY / (imageNaturalSize.height * scale);

    // 计算新的裁剪位置
    let newX = cropStart.x + deltaXRatio;
    let newY = cropStart.y + deltaYRatio;

    // 限制在图片范围内（允许裁剪区域完全在图片内）
    // 计算最大可移动范围：x 的最大值应该是 1 - width，这样 x + width = 1（正好是图片的右边缘）
    // 同样，y 的最大值应该是 1 - height，这样 y + height = 1（正好是图片的下边缘）
    const maxX = 1 - cropStart.width;
    const maxY = 1 - cropStart.height;
    
    // 应用边界限制，确保裁剪区域完全在图片内
    // 注意：maxX 和 maxY 可能小于 0，如果裁剪区域比图片大，但我们仍然限制在 0-1 范围内
    newX = Math.max(0, Math.min(Math.max(0, maxX), newX));
    newY = Math.max(0, Math.min(Math.max(0, maxY), newY));

    // 确保裁剪区域不会超出图片边界（双重检查）
    if (newX + cropStart.width > 1) {
      newX = 1 - cropStart.width;
    }
    if (newY + cropStart.height > 1) {
      newY = 1 - cropStart.height;
    }
    
    // 确保值在有效范围内
    newX = Math.max(0, Math.min(1, newX));
    newY = Math.max(0, Math.min(1, newY));

    // 只有当位置真正改变时才更新状态
    if (Math.abs(newX - crop.x) > 0.0001 || Math.abs(newY - crop.y) > 0.0001) {
      setCrop({ ...cropStart, x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setCropStart(null);
    // 释放指针捕获
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // 兼容旧的鼠标事件（用于桌面端）
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageLoaded) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setCropStart({ ...crop });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !cropStart || !imageLoaded || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const display = getDisplayInfo();
    if (!display) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    // 将像素移动转换为相对于原图的比例
    const deltaXRatio = -deltaX / (imageNaturalSize.width * display.scaleToFitCropBox);
    const deltaYRatio = -deltaY / (imageNaturalSize.height * display.scaleToFitCropBox);

    // 计算新的裁剪位置
    let newX = cropStart.x + deltaXRatio;
    let newY = cropStart.y + deltaYRatio;

    // 限制在图片范围内（允许裁剪区域完全在图片内）
    // 计算最大可移动范围：x 的最大值应该是 1 - width，这样 x + width = 1（正好是图片的右边缘）
    // 同样，y 的最大值应该是 1 - height，这样 y + height = 1（正好是图片的下边缘）
    const maxX = 1 - cropStart.width;
    const maxY = 1 - cropStart.height;
    
    // 应用边界限制，确保裁剪区域完全在图片内
    // 注意：maxX 和 maxY 可能小于 0，如果裁剪区域比图片大，但我们仍然限制在 0-1 范围内
    newX = Math.max(0, Math.min(Math.max(0, maxX), newX));
    newY = Math.max(0, Math.min(Math.max(0, maxY), newY));

    // 确保裁剪区域不会超出图片边界（双重检查）
    if (newX + cropStart.width > 1) {
      newX = 1 - cropStart.width;
    }
    if (newY + cropStart.height > 1) {
      newY = 1 - cropStart.height;
    }
    
    // 确保值在有效范围内
    newX = Math.max(0, Math.min(1, newX));
    newY = Math.max(0, Math.min(1, newY));

    // 只有当位置真正改变时才更新状态
    if (Math.abs(newX - crop.x) > 0.0001 || Math.abs(newY - crop.y) > 0.0001) {
      setCrop({ ...cropStart, x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setCropStart(null);
  };

  // 计算缩放
  const handleZoom = (delta: number) => {
    if (!imageLoaded) return;

    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.5, Math.min(3, imageScale * zoomFactor));
    setImageScale(newScale);

    // 调整裁剪区域大小以保持目标宽高比
    const targetAspect = targetWidth / targetHeight;
    const imageAspect = imageNaturalSize.width / imageNaturalSize.height;

    let newWidth = crop.width;
    let newHeight = crop.height;

    if (targetAspect > imageAspect) {
      // 目标更宽，调整宽度
      newWidth = crop.height * (targetAspect / imageAspect);
      if (newWidth > 1) {
        newWidth = 1;
        newHeight = imageAspect / targetAspect;
      }
    } else {
      // 目标更高，调整高度
      newHeight = crop.width * (imageAspect / targetAspect);
      if (newHeight > 1) {
        newHeight = 1;
        newWidth = targetAspect / imageAspect;
      }
    }

    // 缩放裁剪区域
    const scaleFactor = delta > 0 ? 0.95 : 1.05;
    newWidth = Math.max(0.1, Math.min(1, crop.width * scaleFactor));
    newHeight = Math.max(0.1, Math.min(1, crop.height * scaleFactor));

    // 保持宽高比
    if (targetAspect > imageAspect) {
      newHeight = newWidth * (imageAspect / targetAspect);
      if (newHeight > 1) {
        newHeight = 1;
        newWidth = targetAspect / imageAspect;
      }
    } else {
      newWidth = newHeight * (targetAspect / imageAspect);
      if (newWidth > 1) {
        newWidth = 1;
        newHeight = imageAspect / targetAspect;
      }
    }

    // 调整位置，确保不超出边界
    let newX = crop.x;
    let newY = crop.y;

    if (newX + newWidth > 1) {
      newX = 1 - newWidth;
    }
    if (newY + newHeight > 1) {
      newY = 1 - newHeight;
    }

    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    setCrop({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    handleZoom(-e.deltaY);
  };

  const display = getDisplayInfo();

  if (!open) {
    return null;
  }

  return (
    <div className="image-cropper" role="dialog" aria-modal="true">
      <div className="image-cropper__backdrop" onClick={onClose} />
      <div className="image-cropper__panel">
        <div className="image-cropper__header">
          <h3>裁剪图片</h3>
          <p className="image-cropper__size-hint">
            目标尺寸: {targetWidth} × {targetHeight}
          </p>
          <button
            type="button"
            className="image-cropper__close"
            aria-label="关闭裁剪"
            onClick={onClose}
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div
          ref={containerRef}
          className="image-cropper__container"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ touchAction: "none" }}
        >
          {!imageLoaded && (
            <div className="image-cropper__loading">正在加载图片...</div>
          )}

          {imageLoaded && display && (
            <>
              {/* 背景图片 */}
              <div
                style={{
                  position: "absolute",
                  left: `${display.imageDisplayX}px`,
                  top: `${display.imageDisplayY}px`,
                  width: `${display.imageDisplayWidth}px`,
                  height: `${display.imageDisplayHeight}px`,
                  cursor: isDragging ? "grabbing" : "grab",
                  userSelect: "none",
                  touchAction: "none",
                }}
                onPointerDown={handlePointerDown}
                onMouseDown={handleMouseDown}
              >
                <img
                  ref={imageRef}
                  src={imageSrcForDisplay}
                  alt="裁剪源图"
                  className="image-cropper__source-image"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                  draggable={false}
                  onLoad={handleImageLoad}
                  onError={() => {
                    console.error("ImageCropper: 图片加载失败", imageSrcForDisplay);
                    setImageLoaded(false);
                  }}
                />
              </div>

              {/* 裁剪框 */}
              <div
                className="image-cropper__crop-box"
                style={{
                  position: "absolute",
                  left: `${display.cropBoxX}px`,
                  top: `${display.cropBoxY}px`,
                  width: `${display.cropBoxWidth}px`,
                  height: `${display.cropBoxHeight}px`,
                  pointerEvents: "none",
                }}
              >
                <div className="image-cropper__crop-box-border" />
                {/* 遮罩层 */}
                <div
                  className="image-cropper__crop-mask"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.5)",
                    clipPath: `inset(0 0 0 0)`,
                  }}
                />
              </div>

              {/* 外部遮罩 */}
              <div
                className="image-cropper__outer-mask"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.6)",
                  clipPath: `polygon(
                    0% 0%,
                    0% 100%,
                    ${display.cropBoxX}px 100%,
                    ${display.cropBoxX}px ${display.cropBoxY}px,
                    ${display.cropBoxX + display.cropBoxWidth}px ${display.cropBoxY}px,
                    ${display.cropBoxX + display.cropBoxWidth}px ${display.cropBoxY + display.cropBoxHeight}px,
                    ${display.cropBoxX}px ${display.cropBoxY + display.cropBoxHeight}px,
                    ${display.cropBoxX}px 100%,
                    100% 100%,
                    100% 0%
                  )`,
                  pointerEvents: "none",
                }}
              />

              {/* 网格辅助线 */}
              <div
                className="image-cropper__grid"
                style={{
                  position: "absolute",
                  left: `${display.cropBoxX}px`,
                  top: `${display.cropBoxY}px`,
                  width: `${display.cropBoxWidth}px`,
                  height: `${display.cropBoxHeight}px`,
                  pointerEvents: "none",
                }}
              >
                <div className="image-cropper__grid-line image-cropper__grid-line--vertical" style={{ left: "33.33%" }} />
                <div className="image-cropper__grid-line image-cropper__grid-line--vertical" style={{ left: "66.66%" }} />
                <div className="image-cropper__grid-line image-cropper__grid-line--horizontal" style={{ top: "33.33%" }} />
                <div className="image-cropper__grid-line image-cropper__grid-line--horizontal" style={{ top: "66.66%" }} />
              </div>
            </>
          )}
        </div>

        <div className="image-cropper__controls">
          <div className="image-cropper__zoom-controls">
            <button
              type="button"
              className="image-cropper__zoom-button"
              onClick={() => handleZoom(-1)}
              disabled={!imageLoaded}
              aria-label="缩小"
            >
              <MaterialIcon name="remove" />
            </button>
            <button
              type="button"
              className="image-cropper__zoom-button"
              onClick={() => handleZoom(1)}
              disabled={!imageLoaded}
              aria-label="放大"
            >
              <MaterialIcon name="add" />
            </button>
          </div>

          <div className="image-cropper__actions">
            <button
              type="button"
              className="image-cropper__cancel"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="image-cropper__confirm"
              onClick={() => {
                onConfirm(crop);
                onClose();
              }}
              disabled={!imageLoaded}
            >
              确认
            </button>
          </div>
        </div>

        <div className="image-cropper__hint">
          <p>提示：拖动图片调整位置，滚轮或按钮缩放</p>
        </div>
      </div>
    </div>
  );
}

export default ImageCropper;
