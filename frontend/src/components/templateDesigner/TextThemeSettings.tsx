import { useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "./TextThemeSettings.css";

export type TextThemeSettingsState = {
  accentColor: string;
  textOpacity: number;
};

type TextThemeSettingsProps = {
  state: TextThemeSettingsState;
  onChange: (state: TextThemeSettingsState) => void;
};

export function TextThemeSettings({ state, onChange }: TextThemeSettingsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleChange = (key: keyof TextThemeSettingsState, value: string | number) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <div className="text-theme-settings">
      <div
        className="text-theme-settings__header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3>文字主题设置</h3>
        <MaterialIcon name={collapsed ? "expand_more" : "expand_less"} />
      </div>
      {!collapsed && (
        <>
          <div className="text-theme-settings__tuning">
            <div>
              <p>主题色彩</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={state.accentColor}
                onChange={(e) => handleChange("accentColor", e.target.value)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.25)",
                  cursor: "pointer",
                }}
              />
              <input
                type="text"
                value={state.accentColor}
                onChange={(e) => {
                  const value = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(value)) {
                    handleChange("accentColor", value);
                  }
                }}
                style={{
                  width: 100,
                  padding: "0.4rem 0.6rem",
                  borderRadius: "4px",
                  border: "1px solid rgba(255,255,255,0.25)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  fontSize: "0.85rem",
                }}
                placeholder="#98dbc6"
              />
            </div>
          </div>
          <div className="text-theme-settings__tuning">
            <div>
              <p>文字透明度</p>
            </div>
            <div className="text-theme-settings__slider">
              <input
                type="range"
                min={0}
                max={100}
                value={state.textOpacity}
                onChange={(e) => handleChange("textOpacity", Number(e.target.value))}
                style={{
                  backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,1))`,
                }}
              />
              <span className="text-theme-settings__slider-dot" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

