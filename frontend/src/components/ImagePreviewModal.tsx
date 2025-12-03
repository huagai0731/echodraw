import MaterialIcon from "@/components/MaterialIcon";

import "./ImagePreviewModal.css";

type ImagePreviewModalProps = {
  open: boolean;
  imageUrl: string | null;
  onClose: () => void;
  title?: string;
};

function ImagePreviewModal({ open, imageUrl, onClose, title = "图片预览" }: ImagePreviewModalProps) {
  if (!open || !imageUrl) {
    return null;
  }

  return (
    <div className="image-preview-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="image-preview-modal__backdrop" onClick={onClose} />
      <div className="image-preview-modal__content">
        <div className="image-preview-modal__header">
          <h3>{title}</h3>
          <button
            type="button"
            className="image-preview-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <div className="image-preview-modal__body">
          <img
            src={imageUrl}
            alt="预览图片"
            className="image-preview-modal__image"
          />
          <p className="image-preview-modal__hint">
            长按图片即可保存到相册
          </p>
        </div>
      </div>
    </div>
  );
}

export default ImagePreviewModal;

