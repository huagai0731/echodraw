import { useMemo } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import type { Collection } from "../hooks/useGroupManager";

type UploadActionsProps = {
  collectionId: string | null;
  collectionName: string | null;
  collections: Collection[];
  isUploading: boolean;
  uploadProgress: number | null;
  canSave: boolean;
  onCreateCollection: () => void;
  onSelectCollection: () => void;
  onClearCollection: () => void;
  onSave: () => void;
  onCancel?: () => void;
};

export function UploadActions({
  collectionId,
  collectionName,
  collections,
  isUploading,
  uploadProgress,
  canSave,
  onCreateCollection,
  onSelectCollection,
  onClearCollection,
  onSave,
  onCancel,
}: UploadActionsProps) {
  const selectedCollection = useMemo(() => {
    if (!collectionId) return null;
    return collections.find((c) => c.id === collectionId) || null;
  }, [collectionId, collections]);

  const displayCollectionName = collectionName || selectedCollection?.name || "套图";

  return (
    <section className="upload-section">
      <div className="upload-collection-actions">
        <button
          type="button"
          className="upload-collection-button"
          onClick={onCreateCollection}
          disabled={isUploading}
        >
          <MaterialIcon name="add" />
          <span>建立套图</span>
        </button>
        <button
          type="button"
          className="upload-collection-button"
          onClick={onSelectCollection}
          disabled={isUploading}
        >
          <MaterialIcon name="collections" />
          <span>增加到已有套图</span>
        </button>
      </div>
      {(collectionId || collectionName) && (
        <div
          className="upload-collection-info"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <MaterialIcon name="collections" />
          <span>{displayCollectionName}</span>
          <button
            type="button"
            onClick={onClearCollection}
            disabled={isUploading}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(239, 234, 231, 0.6)",
              cursor: "pointer",
              padding: "0.25rem",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="取消选择套图"
          >
            <span style={{ fontSize: "1rem" }}>
              <MaterialIcon name="close" />
            </span>
          </button>
        </div>
      )}
      {isUploading && onCancel && (
        <button
          type="button"
          className="upload-save"
          onClick={onCancel}
          style={{
            background: "rgba(239, 234, 231, 0.1)",
            color: "rgba(239, 234, 231, 0.85)",
            marginTop: "0.5rem",
          }}
        >
          <MaterialIcon name="cancel" />
          取消上传
        </button>
      )}
      <button
        type="button"
        className="upload-save"
        onClick={onSave}
        disabled={!canSave || isUploading}
      >
        {isUploading ? (
          <>
            <MaterialIcon name="sync" />
            {uploadProgress !== null
              ? `上传中... ${uploadProgress}%`
              : "上传中..."}
          </>
        ) : (
          "保存"
        )}
      </button>
    </section>
  );
}

