// 视觉分析菜单组件
import MaterialIcon from "@/components/MaterialIcon";
import "../../ArtworkDetails.css";

type VisualAnalysisMenuProps = {
  open: boolean;
  onDelete: () => void;
};

/**
 * 视觉分析更多操作菜单
 */
export function VisualAnalysisMenu({ open, onDelete }: VisualAnalysisMenuProps) {
  if (!open) return null;

  return (
    <div className="visual-analysis-menu artwork-details-menu" role="menu">
      <button
        type="button"
        className="artwork-details-menu__item"
        onClick={onDelete}
      >
        <MaterialIcon
          name="delete"
          className="artwork-details-menu__icon artwork-details-menu__icon--danger"
        />
        删除报告
      </button>
      <div
        style={{
          padding: "0.75rem 1rem",
          fontSize: "0.85rem",
          color: "#98dbc6",
          textAlign: "center",
          borderTop: "1px solid rgba(152, 219, 198, 0.2)",
        }}
      >
        报告仅保存三天，请及时保存需要的图片
      </div>
    </div>
  );
}

