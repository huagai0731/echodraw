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
          <button
            key={item.id}
            type="button"
            className={`bottom-nav__item ${activeId === item.id ? "bottom-nav__item--active" : ""}`}
            onClick={() => onChange(item.id)}
            aria-label={item.label}
            aria-current={activeId === item.id ? "page" : undefined}
          >
            <MaterialIcon name={item.icon} className="bottom-nav__icon" />
            <span className="bottom-nav__label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export default BottomNav;
