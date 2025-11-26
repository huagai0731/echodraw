import { useMemo } from "react";
import MaterialIcon from "@/components/MaterialIcon";

type ScoreSliderProps = {
  rating: number;
  showRating: boolean;
  onRatingChange: (rating: number) => void;
  onToggleVisibility: () => void;
};

export function ScoreSlider({
  rating,
  showRating,
  onRatingChange,
  onToggleVisibility,
}: ScoreSliderProps) {
  const sliderBackground = useMemo(() => {
    const percentage = `${rating}%`;
    return `linear-gradient(90deg, rgba(152, 219, 198, 1) ${percentage}, rgba(239, 234, 231, 0.3) ${percentage})`;
  }, [rating]);

  return (
    <section className="upload-section">
      <div className="upload-slider__header">
        <h2>自我评分</h2>
        <div className="upload-slider__value">
          <span>{showRating ? rating : "--"}</span>
          <button type="button" onClick={onToggleVisibility}>
            <MaterialIcon name={showRating ? "visibility" : "visibility_off"} />
          </button>
        </div>
      </div>
      <input
        className="upload-slider"
        type="range"
        min={0}
        max={100}
        value={rating}
        onChange={(event) => onRatingChange(Number(event.target.value))}
        style={{ background: sliderBackground }}
      />
    </section>
  );
}

