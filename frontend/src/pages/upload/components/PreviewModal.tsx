import MaterialIcon from "@/components/MaterialIcon";

type PreviewModalProps = {
  imageUrl: string | null;
  onClose: () => void;
};

export function PreviewModal({ imageUrl, onClose }: PreviewModalProps) {
  if (!imageUrl) {
    return null;
  }

  return (
    <div
      className="upload-modal-overlay"
      onClick={onClose}
      style={{ zIndex: 101 }}
    >
      <div className="upload-large-image-preview" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="upload-large-image-preview__close"
          onClick={onClose}
        >
          <MaterialIcon name="close" />
        </button>
        <img
          src={imageUrl}
          alt="预览"
          className="upload-large-image-preview__image"
        />
      </div>
    </div>
  );
}

