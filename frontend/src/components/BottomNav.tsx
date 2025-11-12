import clsx from "clsx";

import MaterialIcon from "@/components/MaterialIcon";

import "./BottomNav.css";

type NavId = "home" | "gallery" | "goals" | "reports" | "profile";

type NavItem = {
  id: NavId;
  icon: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { id: "home", icon: "home", label: "首页" },
  { id: "gallery", icon: "palette", label: "画集" },
  { id: "goals", icon: "track_changes", label: "目标" },
  { id: "reports", icon: "bar_chart", label: "报告" },
  { id: "profile", icon: "person", label: "个人" },
];

type BottomNavProps = {
  activeId: NavId;
  onChange?: (id: NavId) => void;
};

function BottomNav({ activeId, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      <div className="bottom-nav__container">
        {NAV_ITEMS.map((item) => {
          const isActive = activeId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={clsx("bottom-nav__item", isActive && "bottom-nav__item--active")}
              onClick={() => onChange?.(item.id)}
            >
              <MaterialIcon name={item.icon} className="bottom-nav__icon" filled={isActive} />
              <span className="bottom-nav__label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export type { NavId };
export default BottomNav;



