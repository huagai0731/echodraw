import { useEffect, useRef, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import type { Collection } from "../hooks/useGroupManager";

type GroupSelectorModalProps = {
  mode: "create" | "select" | null;
  collections: Collection[];
  onClose: () => void;
  onSelectCollection: (collectionId: string) => void;
  onCreateCollection: (name: string) => void;
  onRefreshCollections: () => void;
};

export function GroupSelectorModal({
  mode,
  collections,
  onClose,
  onSelectCollection,
  onCreateCollection,
  onRefreshCollections,
}: GroupSelectorModalProps) {
  const [collectionName, setCollectionName] = useState("");
  const [previewCollectionImage, setPreviewCollectionImage] = useState<
    string | null
  >(null);
  const [showLargeImagePreview, setShowLargeImagePreview] = useState<
    string | null
  >(null);

  // 当打开选择弹窗时刷新列表（使用 ref 避免重复刷新）
  const hasRefreshedRef = useRef(false);
  useEffect(() => {
    if (mode === "select" && !hasRefreshedRef.current) {
      onRefreshCollections();
      hasRefreshedRef.current = true;
    } else if (mode !== "select") {
      hasRefreshedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleCreateCollection = () => {
    const name = collectionName.trim();
    if (!name) {
      window.alert("请输入套图名称");
      return;
    }
    onCreateCollection(name);
    setCollectionName("");
    onClose();
  };

  const handleSelectCollection = (collectionId: string) => {
    onSelectCollection(collectionId);
    onClose();
  };

  if (!mode) {
    return null;
  }

  return (
    <>
      {/* 建立套图弹窗 */}
      {mode === "create" && (
        <div className="upload-modal-overlay" onClick={onClose}>
          <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
            <div className="upload-modal__header">
              <h2>建立套图</h2>
              <button
                type="button"
                className="upload-modal__close"
                onClick={onClose}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="upload-modal__content">
              <p className="upload-modal__hint">
                该图会作为此套图的第一张图，后续可以增加图片到该套图。套图图片名称会显示为套图名·图片标题。
              </p>
              <label className="upload-field">
                <span>套图名称</span>
                <input
                  type="text"
                  placeholder="例如：角色设计、场景练习"
                  maxLength={20}
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateCollection();
                    }
                  }}
                  autoFocus
                />
              </label>
            </div>
            <div className="upload-modal__actions">
              <button
                type="button"
                className="upload-modal__button upload-modal__button--secondary"
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="button"
                className="upload-modal__button upload-modal__button--primary"
                onClick={handleCreateCollection}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 选择已有套图弹窗 */}
      {mode === "select" && (
        <div className="upload-modal-overlay" onClick={onClose}>
          <div
            className="upload-modal upload-modal--large"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="upload-modal__header">
              <h2>选择套图</h2>
              <button
                type="button"
                className="upload-modal__close"
                onClick={onClose}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="upload-modal__content upload-modal__content--scrollable">
              {collections.length === 0 ? (
                <p className="upload-modal__empty">暂无套图</p>
              ) : (
                <div className="upload-collection-grid">
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      className="upload-collection-item"
                      onClick={(e) => {
                        if (
                          e.target instanceof HTMLImageElement &&
                          collection.coverImage
                        ) {
                          e.stopPropagation();
                          setShowLargeImagePreview(collection.coverImage);
                        } else {
                          handleSelectCollection(collection.id);
                        }
                      }}
                      onMouseEnter={() =>
                        setPreviewCollectionImage(collection.coverImage)
                      }
                      onMouseLeave={() => setPreviewCollectionImage(null)}
                    >
                      {collection.coverImage ? (
                        <img
                          src={collection.coverImage}
                          alt={collection.name}
                          className="upload-collection-item__image"
                        />
                      ) : (
                        <div className="upload-collection-item__placeholder">
                          <MaterialIcon name="image" />
                        </div>
                      )}
                      <div className="upload-collection-item__info">
                        <span className="upload-collection-item__name">
                          {collection.name}
                        </span>
                        <span className="upload-collection-item__count">
                          {collection.count} 张
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {previewCollectionImage && (
              <div className="upload-collection-preview">
                <img
                  src={previewCollectionImage}
                  alt="预览"
                  className="upload-collection-preview__image"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 大图预览弹窗 */}
      {showLargeImagePreview && (
        <div
          className="upload-modal-overlay"
          onClick={() => setShowLargeImagePreview(null)}
          style={{ zIndex: 101 }}
        >
          <div
            className="upload-large-image-preview"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="upload-large-image-preview__close"
              onClick={() => setShowLargeImagePreview(null)}
            >
              <MaterialIcon name="close" />
            </button>
            <img
              src={showLargeImagePreview}
              alt="套图预览"
              className="upload-large-image-preview__image"
            />
          </div>
        </div>
      )}
    </>
  );
}

