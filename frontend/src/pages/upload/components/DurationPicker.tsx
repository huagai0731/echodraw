// useMemo 未使用，移除导入
import MaterialIcon from "@/components/MaterialIcon";

type DurationPickerProps = {
  hours: number;
  minutes: number;
  totalMinutes: number;
  formattedDuration: string;
  onChange: (hours: number, minutes: number) => void;
};

function formatTwoDigits(value: number) {
  return value.toString().padStart(2, "0");
}

const HOURS = Array.from({ length: 21 }, (_, index) => index); // 0-20小时
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

type DurationCardProps = {
  value: number;
  options: number[];
  onChange: (next: number) => void;
  unit: string;
  formatValue: (value: number) => string;
  ariaLabel: string;
  onStep?: (delta: number) => void;
};

function DurationCard({
  value,
  options,
  onChange,
  unit,
  formatValue,
  ariaLabel,
  onStep,
}: DurationCardProps) {
  const index = options.indexOf(value);
  const hasPrev = index > 0;
  const hasNext = index < options.length - 1;

  const changeBy = (delta: number) => {
    const nextIndex = Math.min(Math.max(index + delta, 0), options.length - 1);
    onChange(options[nextIndex]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      if (onStep) {
        onStep(1);
      } else {
        changeBy(1);
      }
    }
    if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (onStep) {
        onStep(-1);
      } else {
        changeBy(-1);
      }
    }
  };

  // 即使提供了onStep，也应该检查边界条件，确保按钮在边界时被禁用
  const canDecrease = hasPrev;
  const canIncrease = hasNext;

  return (
    <div className="upload-duration__column">
      <div
        className="upload-duration__pill"
        tabIndex={0}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={options[0]}
        aria-valuemax={options[options.length - 1]}
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {formatValue(value)}
      </div>

      <div className="upload-duration__controls">
        <button
          type="button"
          className="upload-duration__control"
          onClick={() => (onStep ? onStep(-1) : changeBy(-1))}
          disabled={!canDecrease}
          aria-label={`减少${unit}`}
        >
          <MaterialIcon name="remove" />
        </button>
        <button
          type="button"
          className="upload-duration__control"
          onClick={() => (onStep ? onStep(1) : changeBy(1))}
          disabled={!canIncrease}
          aria-label={`增加${unit}`}
        >
          <MaterialIcon name="add" />
        </button>
      </div>

      <span className="upload-duration__unit">{unit}</span>
    </div>
  );
}

export function DurationPicker({
  hours,
  minutes,
  totalMinutes: _totalMinutes,
  formattedDuration,
  onChange,
}: DurationPickerProps) {
  const handleHourChange = (next: number) => {
    onChange(next, minutes);
  };

  const handleMinuteChange = (next: number) => {
    onChange(hours, next);
  };

  const stepMinute = (delta: number) => {
    const currentIndex = MINUTES.indexOf(minutes);
    if (currentIndex === -1) {
      handleMinuteChange(0);
      return;
    }
    let nextIndex = currentIndex + delta;
    let nextHours = hours;

    if (nextIndex >= MINUTES.length) {
      nextIndex = 0;
      nextHours = Math.min(hours + 1, HOURS[HOURS.length - 1]);
    } else if (nextIndex < 0) {
      nextIndex = MINUTES.length - 1;
      nextHours = Math.max(hours - 1, HOURS[0]);
    }

    handleHourChange(nextHours);
    handleMinuteChange(MINUTES[nextIndex]);
  };

  return (
    <section className="upload-section">
      <div className="upload-duration__header">
        <h2>
          <span style={{ color: "#98dbc6", marginRight: "0.25rem" }}>*</span>
          绘画时长
        </h2>
        <span className="upload-duration__total">{formattedDuration}</span>
      </div>
      <div className="upload-duration">
        <DurationCard
          value={hours}
          options={HOURS}
          unit="小时"
          formatValue={formatTwoDigits}
          ariaLabel="选择创作时长的小时数"
          onChange={handleHourChange}
          onStep={(delta) => {
            const currentIndex = HOURS.indexOf(hours);
            // 如果当前值不在数组中，使用最接近的值
            const safeIndex = currentIndex >= 0 ? currentIndex : 0;
            const nextIndex = Math.max(0, Math.min(safeIndex + delta, HOURS.length - 1));
            // 即使索引相同，也允许更新（确保状态同步）
            handleHourChange(HOURS[nextIndex]);
          }}
        />
        <span className="upload-duration__separator">:</span>
        <DurationCard
          value={minutes}
          options={MINUTES}
          unit="分钟"
          formatValue={formatTwoDigits}
          ariaLabel="选择创作时长的分钟数"
          onChange={handleMinuteChange}
          onStep={stepMinute}
        />
      </div>
      <p className="upload-duration__hint">
        支持 5 分钟刻度
      </p>
    </section>
  );
}

