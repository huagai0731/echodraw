import MaterialIcon from "@/components/MaterialIcon";
import "./RoundCompleteModal.css";

type RoundCompleteModalProps = {
  planImage: string | null | undefined;
  doImageUrl: string | null;
  checkText: string | null | undefined;
  actionText: string | null | undefined;
  onConfirm: () => void;
  onCancel: () => void;
};

function RoundCompleteModal({
  planImage,
  doImageUrl,
  checkText,
  actionText,
  onConfirm,
  onCancel,
}: RoundCompleteModalProps) {
  return (
    <div className="round-complete-modal-overlay" onClick={onCancel}>
      <div className="round-complete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="round-complete-modal-header">
          <h2 className="round-complete-modal-title">完成本轮练习</h2>
          <button
            type="button"
            className="round-complete-modal-close"
            onClick={onCancel}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="round-complete-modal-body">
          <p className="round-complete-modal-description">
            确认完成本轮练习后，将自动开启下一轮。请确认以下内容：
          </p>

          <div className="round-complete-modal-preview">
            <div className="round-complete-modal-grid">
              {/* PLAN */}
              <div className="round-complete-modal-cell">
                <div className="round-complete-modal-cell-label">PLAN</div>
                {planImage ? (
                  <div className="round-complete-modal-image">
                    <img src={planImage} alt="PLAN" />
                  </div>
                ) : (
                  <div className="round-complete-modal-placeholder">无图片</div>
                )}
              </div>

              {/* DO */}
              <div className="round-complete-modal-cell">
                <div className="round-complete-modal-cell-label">DO</div>
                {doImageUrl ? (
                  <div className="round-complete-modal-image">
                    <img src={doImageUrl} alt="DO" />
                  </div>
                ) : (
                  <div className="round-complete-modal-placeholder">无图片</div>
                )}
              </div>

              {/* CHECK */}
              <div className="round-complete-modal-cell">
                <div className="round-complete-modal-cell-label">CHECK</div>
                <div className="round-complete-modal-text">
                  {checkText || "无内容"}
                </div>
              </div>

              {/* ACTION */}
              <div className="round-complete-modal-cell">
                <div className="round-complete-modal-cell-label">ACTION</div>
                <div className="round-complete-modal-text">
                  {actionText || "无内容"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="round-complete-modal-actions">
          <button
            type="button"
            className="round-complete-modal-button round-complete-modal-button--cancel"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="round-complete-modal-button round-complete-modal-button--confirm"
            onClick={onConfirm}
          >
            下一轮
          </button>
        </div>
      </div>
    </div>
  );
}

export default RoundCompleteModal;

