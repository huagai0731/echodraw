// 删除确认对话框组件
import MaterialIcon from "@/components/MaterialIcon";
import "./DeleteConfirmModal.css";

type DeleteConfirmModalProps = {
  open: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * 删除确认对话框组件
 * 用于确认删除视觉分析结果
 */
export function DeleteConfirmModal({
  open,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="artwork-delete-confirm-overlay"
      onClick={() => {
        if (!isDeleting) {
          onCancel();
        }
      }}
    >
      <div
        className="artwork-delete-confirm-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="artwork-delete-confirm-title">
          {isDeleting ? "正在删除报告" : "要删除这份报告吗？"}
        </h2>
        <div className="artwork-delete-confirm-content">
          {isDeleting ? (
            <>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "1rem",
                  padding: "1rem 0",
                }}
              >
                <MaterialIcon
                  name="hourglass_empty"
                  className="visual-analysis__loading-icon"
                  style={{ fontSize: "2rem" }}
                />
                <p
                  className="artwork-delete-confirm-text"
                  style={{ textAlign: "center", margin: 0 }}
                >
                  正在删除报告，请稍候...
                </p>
                <div
                  style={{
                    width: "100%",
                    maxWidth: "300px",
                    marginTop: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "6px",
                      backgroundColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "3px",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: "100%",
                        width: "30%",
                        backgroundColor: "#98dbc6",
                        borderRadius: "3px",
                        animation: "deleteProgress 1.5s ease-in-out infinite",
                      }}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="artwork-delete-confirm-text">
                删除后，这份视觉分析结果将无法恢复。
              </p>
              <p className="artwork-delete-confirm-text">
                请确认已经保存了需要的图片。
              </p>
              <p className="artwork-delete-confirm-text artwork-delete-confirm-text--highlight">
                确认要删除吗？
              </p>
            </>
          )}
        </div>
        {!isDeleting && (
          <div className="artwork-delete-confirm-actions">
            <button
              type="button"
              className="artwork-delete-confirm-button artwork-delete-confirm-button--cancel"
              onClick={onCancel}
              disabled={isDeleting}
            >
              取消
            </button>
            <button
              type="button"
              className="artwork-delete-confirm-button artwork-delete-confirm-button--confirm"
              onClick={onConfirm}
              disabled={isDeleting}
            >
              确认删除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

