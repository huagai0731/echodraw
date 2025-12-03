import { useState, useRef, useEffect } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import type { Artwork } from "@/types/artwork";
import "./ContentEditor.css";

export type ContentEditorState = {
  title: string;
  subtitle: string;
  username: string;
  addSuffix: boolean;
  showTitle: boolean;
  showSubtitle: boolean;
  showUsername: boolean;
  showDate: boolean;
  showDuration: boolean;
  selectedTags: string[];
};

type ContentEditorProps = {
  state: ContentEditorState;
  availableTags: string[];
  maxTagCount?: number;
  selectedArtwork: Artwork | null;
  onStateChange: (state: ContentEditorState) => void;
  getDateLabel?: (artwork: Artwork) => string;
  getDurationLabel?: (artwork: Artwork) => string;
};

export function ContentEditor({
  state,
  availableTags,
  maxTagCount = 6,
  selectedArtwork,
  onStateChange,
  getDateLabel,
  getDurationLabel,
}: ContentEditorProps) {
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

  const handleChange = (key: keyof ContentEditorState, value: any) => {
    onStateChange({ ...state, [key]: value });
  };

  const [showSuffixTooltip, setShowSuffixTooltip] = useState(false);
  const suffixTooltipRef = useRef<HTMLDivElement>(null);
  const suffixIconRef = useRef<HTMLButtonElement>(null);

  // 点击外部关闭弹窗
  useEffect(() => {
    if (!showSuffixTooltip) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        suffixTooltipRef.current &&
        suffixIconRef.current &&
        !suffixTooltipRef.current.contains(event.target as Node) &&
        !suffixIconRef.current.contains(event.target as Node)
      ) {
        setShowSuffixTooltip(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSuffixTooltip]);

  return (
    <div className="content-editor__group">
      <div className="content-editor__field-row content-editor__field-row--inline">
        <label htmlFor="content-editor-username">
          <span>署名</span>
          <input
            id="content-editor-username"
            type="text"
            value={state.username}
            maxLength={32}
            onChange={(e) => handleChange("username", e.target.value)}
            placeholder="将呈现在右下角"
          />
        </label>
        {renderToggle(state.showUsername, () => handleChange("showUsername", !state.showUsername), "署名")}
      </div>
      <div className="content-editor__field-row content-editor__field-row--inline" style={{ marginTop: 8, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>增加后缀</span>
          <button
            ref={suffixIconRef}
            type="button"
            className="content-editor__help-icon"
            onClick={() => setShowSuffixTooltip(!showSuffixTooltip)}
            aria-label="关于增加后缀"
          >
            <MaterialIcon name="help" />
          </button>
          {showSuffixTooltip && (
            <div
              ref={suffixTooltipRef}
              className="content-editor__tooltip"
            >
              <p>如果愿意通过此方法让更多人了解到EchoDraw的话，可以开启，非常感谢&gt;&lt;</p>
            </div>
          )}
        </div>
        {renderToggle(state.addSuffix, () => handleChange("addSuffix", !state.addSuffix), "增加后缀")}
      </div>
    </div>
  );
}

