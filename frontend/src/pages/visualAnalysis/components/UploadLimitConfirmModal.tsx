// 上传限制确认对话框组件
import "../../ArtworkDetails.css";

type UploadLimitConfirmModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onJoinMembership?: () => void;
};

/**
 * 上传限制确认对话框组件
 * 用于提示非会员用户上传限制
 */
export function UploadLimitConfirmModal({
  open,
  onConfirm,
  onCancel,
  onJoinMembership,
}: UploadLimitConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="artwork-delete-confirm-overlay"
      onClick={onCancel}
    >
      <div
        className="artwork-delete-confirm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="artwork-delete-confirm-title">
          已达到上传限制
        </h2>
        <div className="artwork-delete-confirm-content">
          <p className="artwork-delete-confirm-text">
            EchoDraw 允许每位用户上传一张图片进行体验。
          </p>
          <p className="artwork-delete-confirm-text">
            若您愿意在这里留下创作的轨迹，<span style={{ color: "#98dbc6" }}>欢迎加入 EchoDraw。</span>
          </p>
        </div>
        <div className="artwork-delete-confirm-actions">
          <button
            type="button"
            className="artwork-delete-confirm-button artwork-delete-confirm-button--cancel"
            onClick={onConfirm}
          >
            确认
          </button>
          {onJoinMembership && (
            <button
              type="button"
              className="artwork-delete-confirm-button artwork-delete-confirm-button--confirm"
              onClick={onJoinMembership}
            >
              前往加入
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

