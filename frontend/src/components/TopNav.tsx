import clsx from "clsx";
import type { ReactNode } from "react";

import MaterialIcon from "@/components/MaterialIcon";

import "./TopNav.css";

type TopNavAction = {
  icon: string;
  label: string;
  onClick?: () => void;
  filled?: boolean;
  active?: boolean;
  className?: string;
};

type TopNavProps = {
  title?: string;
  subtitle?: string;
  leadingAction?: TopNavAction | null;
  trailingActions?: TopNavAction[];
  children?: ReactNode;
  className?: string;
  leadingSlot?: ReactNode;
  trailingSlot?: ReactNode;
};

function TopNav({
  title,
  subtitle,
  leadingAction = null,
  trailingActions = [],
  children,
  className,
  leadingSlot,
  trailingSlot,
}: TopNavProps) {
  return (
    <header className={clsx("top-nav", className)}>
      <div className="top-nav__leading">
        {leadingSlot ? (
          leadingSlot
        ) : leadingAction ? (
          <button
            type="button"
            className={clsx(
              "top-nav__action-button",
              leadingAction.active && "top-nav__action-button--active",
            )}
            aria-label={leadingAction.label}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (leadingAction.onClick) {
                leadingAction.onClick();
              }
            }}
          >
            <MaterialIcon
              name={leadingAction.icon}
              filled={leadingAction.filled}
              className="top-nav__icon"
            />
          </button>
        ) : (
          <span className="top-nav__placeholder" aria-hidden="true" />
        )}
      </div>

      <div className="top-nav__center">
        {children ?? (
          <>
            {subtitle ? <span className="top-nav__subtitle">{subtitle}</span> : null}
            {title ? <h1 className="top-nav__title">{title}</h1> : null}
          </>
        )}
      </div>

      <div className="top-nav__actions">
        {trailingSlot ? (
          trailingSlot
        ) : trailingActions.length > 0 ? (
          trailingActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={clsx(
                "top-nav__action-button",
                action.active && "top-nav__action-button--active",
                action.className,
              )}
              aria-label={action.label}
              onClick={action.onClick}
            >
              <MaterialIcon
                name={action.icon}
                filled={action.filled}
                className="top-nav__icon"
              />
            </button>
          ))
        ) : (
          <span className="top-nav__placeholder" aria-hidden="true" />
        )}
      </div>
    </header>
  );
}

export type { TopNavAction };
export default TopNav;




