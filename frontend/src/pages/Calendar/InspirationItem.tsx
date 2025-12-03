import { useState, useRef } from "react";
import type { InspirationNoteRecord } from "@/services/api";
import "./InspirationItem.css";

type InspirationItemProps = {
  record: InspirationNoteRecord;
  index?: number;
};

export function InspirationItem({ record, index = 0 }: InspirationItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const hasImage = record.image && !imageError;
  const hasText = record.text && record.text.trim().length > 0;

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  // 判断是否应该立即加载图片（前20个）
  const shouldLoadEagerly = typeof index === "number" && index < 20;

  return (
    <div className="inspiration-item">
      {hasImage && (
        <div className="inspiration-item__image-wrapper">
          {!imageLoaded && (
            <div className="inspiration-item__skeleton" />
          )}
          <img
            ref={imgRef}
            src={record.image ?? undefined}
            alt="灵感图片"
            className={`inspiration-item__image ${imageLoaded ? "inspiration-item__image--loaded" : "inspiration-item__image--loading"}`}
            loading={shouldLoadEagerly ? "eager" : "lazy"}
            decoding="async"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ display: imageLoaded ? "block" : "none" }}
          />
        </div>
      )}
      {hasText && (
        <div className="inspiration-item__text">
          <p className="inspiration-item__description">{record.text}</p>
        </div>
      )}
    </div>
  );
}

