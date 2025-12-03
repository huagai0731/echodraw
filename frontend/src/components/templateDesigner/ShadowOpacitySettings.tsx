import { useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "./ShadowSettings.css";

export type ShadowOpacitySettingsState = {
  opacity: number;
};

type ShadowOpacitySettingsProps = {
  state: ShadowOpacitySettingsState;
  onChange: (state: ShadowOpacitySettingsState) => void;
};

export function ShadowOpacitySettings({ state, onChange }: ShadowOpacitySettingsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleChange = (value: number) => {
    onChange({ opacity: value });
  };

  return (
    <div className="shadow-settings">
      <div
        className="shadow-settings__header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3>阴影区透明度</h3>
        <MaterialIcon name={collapsed ? "expand_more" : "expand_less"} />
      </div>
      {!collapsed && (
        <div className="shadow-settings__tuning">
          <div>
            <p>透明度</p>
          </div>
          <div className="shadow-settings__slider">
            <input
              type="range"
              min={0}
              max={100}
              value={state.opacity}
              onChange={(e) => handleChange(Number(e.target.value))}
              style={{
                backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.05), rgba(0,0,0,0.9))`,
              }}
            />
            <span className="shadow-settings__slider-dot" />
          </div>
        </div>
      )}
    </div>
  );
}

