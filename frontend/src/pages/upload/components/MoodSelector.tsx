import { memo } from "react";
import type { Mood } from "@/services/api";

type MoodItemProps = {
  mood: Mood;
  isSelected: boolean;
  onClick: () => void;
};

const MoodItem = memo(function MoodItem({
  mood,
  isSelected,
  onClick,
}: MoodItemProps) {
  return (
    <button
      type="button"
      className={
        isSelected ? "upload-mood upload-mood--active" : "upload-mood"
      }
      onClick={onClick}
    >
      {mood.name}
    </button>
  );
});

type MoodSelectorProps = {
  moodMatrix: Mood[][];
  selectedMood: Mood | null;
  isLoading: boolean;
  onSelect: (mood: Mood) => void;
};

export function MoodSelector({
  moodMatrix,
  selectedMood,
  isLoading,
  onSelect,
}: MoodSelectorProps) {
  if (isLoading) {
    return (
      <section className="upload-section">
        <h2>创作时的状态</h2>
        <div className="upload-mood-grid">
          <span>加载中...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="upload-section">
      <h2>创作时的状态</h2>
      <div className="upload-mood-grid">
        {moodMatrix.map((row, rowIndex) => (
          <div key={rowIndex} className="upload-mood-row">
            {row.map((mood) => (
              <MoodItem
                key={mood.id}
                mood={mood}
                isSelected={selectedMood?.id === mood.id}
                onClick={() => onSelect(mood)}
              />
            ))}
          </div>
        ))}
        <span className="upload-mood__divider upload-mood__divider--horizontal" />
        <span className="upload-mood__divider upload-mood__divider--vertical" />
      </div>
    </section>
  );
}
