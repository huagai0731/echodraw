import { useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "./ShadowSettings.css";

export type ShadowSettingsState = {
  hue: number;
  lightness: number;
  saturation: number;
  opacity: number;
};

type ShadowSettingsProps = {
  state: ShadowSettingsState;
  onChange: (state: ShadowSettingsState) => void;
};

export function ShadowSettings({ state, onChange }: ShadowSettingsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleChange = (key: keyof ShadowSettingsState, value: number) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <div className="shadow-settings">
      <div
        className="shadow-settings__header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3>阴影区设置</h3>
        <MaterialIcon name={collapsed ? "expand_more" : "expand_less"} />
      </div>
      {!collapsed && (
        <>
          <div className="shadow-settings__tuning">
            <div>
              <p>色相</p>
            </div>
            <div className="shadow-settings__slider">
              <input
                type="range"
                min={0}
                max={360}
                value={state.hue}
                onChange={(e) => handleChange("hue", Number(e.target.value))}
                style={{
                  backgroundImage: `linear-gradient(90deg, 
                    hsl(0, ${state.saturation}%, ${state.lightness}%),
                    hsl(60, ${state.saturation}%, ${state.lightness}%),
                    hsl(120, ${state.saturation}%, ${state.lightness}%),
                    hsl(180, ${state.saturation}%, ${state.lightness}%),
                    hsl(240, ${state.saturation}%, ${state.lightness}%),
                    hsl(300, ${state.saturation}%, ${state.lightness}%),
                    hsl(360, ${state.saturation}%, ${state.lightness}%)
                  )`,
                }}
              />
              <span className="shadow-settings__slider-dot" />
            </div>
          </div>
          <div className="shadow-settings__tuning">
            <div>
              <p>亮度</p>
            </div>
            <div className="shadow-settings__slider">
              <input
                type="range"
                min={0}
                max={100}
                value={state.lightness}
                onChange={(e) => handleChange("lightness", Number(e.target.value))}
                style={{
                  backgroundImage: `linear-gradient(90deg, 
                    hsl(${state.hue}, ${state.saturation}%, 0%),
                    hsl(${state.hue}, ${state.saturation}%, 50%),
                    hsl(${state.hue}, ${state.saturation}%, 100%)
                  )`,
                }}
              />
              <span className="shadow-settings__slider-dot" />
            </div>
          </div>
          <div className="shadow-settings__tuning">
            <div>
              <p>饱和度</p>
            </div>
            <div className="shadow-settings__slider">
              <input
                type="range"
                min={0}
                max={100}
                value={state.saturation}
                onChange={(e) => handleChange("saturation", Number(e.target.value))}
                style={{
                  backgroundImage: `linear-gradient(90deg, 
                    hsl(${state.hue}, 0%, ${state.lightness}%),
                    hsl(${state.hue}, 100%, ${state.lightness}%)
                  )`,
                }}
              />
              <span className="shadow-settings__slider-dot" />
            </div>
          </div>
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
                onChange={(e) => handleChange("opacity", Number(e.target.value))}
                style={{
                  backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.05), rgba(0,0,0,0.9))`,
                }}
              />
              <span className="shadow-settings__slider-dot" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

