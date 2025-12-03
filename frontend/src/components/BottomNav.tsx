import { memo, useCallback } from "react";
import MaterialIcon from "./MaterialIcon";
import "./BottomNav.css";

export type NavId = "home" | "gallery" | "goals" | "reports" | "profile";

type BottomNavProps = {
  activeId: NavId;
  onChange: (id: NavId) => void;
};

const NAV_ITEMS: Array<{ id: NavId; label: string; icon: string }> = [
  { id: "home", label: "首页", icon: "home" },
  { id: "gallery", label: "作品", icon: "collections" },
  { id: "goals", label: "目标", icon: "flag" },
  { id: "reports", label: "报告", icon: "assessment" },
  { id: "profile", label: "我的", icon: "person" },
];

function BottomNav({ activeId, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" role="navigation" aria-label="底部导航">
      <div className="bottom-nav__container">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            isActive={activeId === item.id}
            onClick={onChange}
          />
        ))}
      </div>
    </nav>
  );
}

// 优化：将每个导航项提取为单独的 memo 组件
const NavItem = memo(({
  item,
  isActive,
  onClick,
}: {
  item: { id: NavId; label: string; icon: string };
  isActive: boolean;
  onClick: (id: NavId) => void;
}) => {
  const handleClick = useCallback(() => {
    onClick(item.id);
  }, [item.id, onClick]);

  return (
    <button
      type="button"
      className={`bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`}
      onClick={handleClick}
      aria-label={item.label}
      aria-current={isActive ? "page" : undefined}
    >
      <MaterialIcon name={item.icon} className="bottom-nav__icon" />
      <span className="bottom-nav__label">{item.label}</span>
    </button>
  );
});

NavItem.displayName = "NavItem";

// 使用 React.memo 优化，只在 activeId 或 onChange 变化时重新渲染
export default memo(BottomNav);
