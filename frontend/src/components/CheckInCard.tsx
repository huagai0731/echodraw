import clsx from "clsx";
import { useMemo } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import type { CheckInStatus } from "@/services/api";
import "./CheckInCard.css";

type CheckInCardProps = {
  checkedIn: boolean;
  checkInStatus: CheckInStatus | null;
  loading: boolean;
  error: string | null;
  onCheckIn: () => void;
  onRetry?: () => void;
};

export default function CheckInCard({
  checkedIn,
  checkInStatus,
  loading,
  error,
  onCheckIn,
  onRetry,
}: CheckInCardProps) {
  const totalCheckins = checkInStatus?.total_checkins ?? 0;
  const currentStreak = checkInStatus?.current_streak ?? 0;

  const statusText = useMemo(() => {
    if (checkedIn) {
      return `累计打卡 ${totalCheckins} 天${
        currentStreak > 0 ? ` · 连续 ${currentStreak} 天` : ""
      }`;
    }
    return "记录今日情绪与时长";
  }, [checkedIn, totalCheckins, currentStreak]);

  return (
    <div className="check-in-card">
      <button
        type="button"
        className={clsx(
          "check-in-card__button",
          checkedIn && "check-in-card__button--checked",
          loading && "check-in-card__button--loading",
        )}
        onClick={onCheckIn}
        disabled={loading || checkedIn}
        aria-busy={loading ? "true" : undefined}
        aria-label={checkedIn ? "今日已打卡" : "每日打卡"}
        aria-describedby="check-in-description"
      >
        <MaterialIcon
          name={checkedIn ? "check_circle" : "sentiment_satisfied"}
          className="check-in-card__icon"
          filled={checkedIn}
        />
        {loading && (
          <span className="check-in-card__spinner" aria-hidden="true">
            <MaterialIcon name="hourglass_empty" className="check-in-card__spinner-icon" />
          </span>
        )}
        <div className="check-in-card__text">
          <h2 className="check-in-card__title">
            {checkedIn ? "今日已打卡！" : "每日打卡"}
          </h2>
          <p className="check-in-card__description" id="check-in-description">
            {statusText}
          </p>
        </div>
      </button>
      {error && (
        <div className="check-in-card__error" role="alert">
          <p className="check-in-card__error-text">{error}</p>
          {onRetry && !checkedIn && (
            <button
              type="button"
              className="check-in-card__retry-button"
              onClick={onRetry}
              aria-label="重试打卡"
            >
              重试
            </button>
          )}
        </div>
      )}
    </div>
  );
}

