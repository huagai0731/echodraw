import { useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import "./ShadowSettings.css";
import "./ContentEditor.css";
import "./ImageInfoSettings.css";

export type ImageInfoSettingsState = {
  imageSizePreset: "square" | "rectangle";
  showDurationTag: boolean;
};

type ImageInfoSettingsProps = {
  state: ImageInfoSettingsState;
  onChange: (state: ImageInfoSettingsState) => void;
};

export function ImageInfoSettings({ state, onChange }: ImageInfoSettingsProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleChange = (key: keyof ImageInfoSettingsState, value: "square" | "rectangle" | boolean) => {
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
        <h3>图片信息</h3>
        <MaterialIcon name={collapsed ? "expand_more" : "expand_less"} />
      </div>
      {!collapsed && (
        <>
          <div className="shadow-settings__tuning">
            <div>
              <p>图片尺寸</p>
            </div>
            <div className="image-info-settings__size-options">
              <button
                type="button"
                className={`image-info-settings__size-option ${state.imageSizePreset === "square" ? "image-info-settings__size-option--active" : ""}`}
                onClick={() => handleChange("imageSizePreset", "square")}
              >
                1080×1080
              </button>
              <button
                type="button"
                className={`image-info-settings__size-option ${state.imageSizePreset === "rectangle" ? "image-info-settings__size-option--active" : ""}`}
                onClick={() => handleChange("imageSizePreset", "rectangle")}
              >
                1080×1350
              </button>
            </div>
          </div>
          <div className="shadow-settings__tuning">
            <div>
              <p>显示时长标签</p>
            </div>
            {renderToggle(state.showDurationTag, () => handleChange("showDurationTag", !state.showDurationTag), "显示时长标签")}
          </div>
        </>
      )}
    </div>
  );
}

