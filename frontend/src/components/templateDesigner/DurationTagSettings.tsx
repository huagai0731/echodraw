import { useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "./ShadowSettings.css";
import "./ContentEditor.css";

export type DurationTagSettingsState = {
  show: boolean;
  opacity: number;
};

type DurationTagSettingsProps = {
  state: DurationTagSettingsState;
  onChange: (state: DurationTagSettingsState) => void;
};

export function DurationTagSettings({ state, onChange }: DurationTagSettingsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleChange = (key: keyof DurationTagSettingsState, value: boolean | number) => {
    onChange({ ...state, [key]: value });
  };

  const renderToggle = (active: boolean, onToggle: () => void, label: string) => (
    <button
      type="button"
      className={`content-editor__toggle${active ? " is-active" : ""}`}
      aria-pressed={active}
      aria-label={`切换${label}`}
      onClick={onToggle}
    >
      <MaterialIcon name={active ? "toggle_on" : "toggle_off"} filled />
    </button>
  );

  return (
    <div className="shadow-settings">
      <div
        className="shadow-settings__header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3>时长标签</h3>
        <MaterialIcon name={collapsed ? "expand_more" : "expand_less"} />
      </div>
      {!collapsed && (
        <>
          <div className="shadow-settings__tuning">
            <div>
              <p>显示时长标签</p>
            </div>
            {renderToggle(state.show, () => handleChange("show", !state.show), "显示时长标签")}
          </div>
          {state.show && (
            <div className="shadow-settings__tuning">
              <div>
                <p>标签透明度</p>
              </div>
              <div className="shadow-settings__slider">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.opacity}
                  onChange={(e) => handleChange("opacity", Number(e.target.value))}
                  style={{
                    backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,1))`,
                  }}
                />
                <span className="shadow-settings__slider-dot" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

