import clsx from "clsx";
import { useMemo } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { ArtisticLoader } from "@/components/ArtisticLoader";
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

  const statusText = useMemo(() => {
    return `累计打卡 ${totalCheckins} 天`;
  }, [totalCheckins]);

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
            <ArtisticLoader size="small" text="" />
          </span>
        )}
        <div className="check-in-card__text">
          <h2 className="check-in-card__title">
            {checkedIn ? "今天也想起来画画这件事了" : "签到"}
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

