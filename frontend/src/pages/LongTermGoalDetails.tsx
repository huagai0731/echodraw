import { useMemo, type CSSProperties } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import type { LongTermGoal, LongTermGoalCheckpoint } from "@/services/api";

import "./LongTermGoalDetails.css";

type LongTermGoalDetailsProps = {
  goal: LongTermGoal;
  onClose: () => void;
  onEdit?: () => void;
  onExport?: () => void;
  onSelectShowcase?: (checkpoint: LongTermGoalCheckpoint) => void;
  onEditCompletionNote?: (checkpoint: LongTermGoalCheckpoint) => void;
};

function LongTermGoalDetails({
  goal,
  onClose,
  onEdit,
  onExport,
  onSelectShowcase,
  onEditCompletionNote,
}: LongTermGoalDetailsProps) {
  const progressPercent = clampPercent(goal.progress.progressRatio * 100);
  const timelineStyle = useMemo(() => {
    return {
      "--timeline-progress": `${progressPercent}%`,
    } as CSSProperties;
  }, [progressPercent]);

  const checkpointHours =
    goal.checkpointCount > 0 ? goal.targetHours / goal.checkpointCount : goal.targetHours;
  const checkpoints = goal.checkpoints ?? [];
  const fallbackDescription = `累计投入 ${formatHours(goal.progress.spentHours)} 小时，目标为 ${
    goal.targetHours
  } 小时，共 ${goal.checkpointCount} 个检查点。`;

  return (
    <div className="long-term-details">
      <div className="long-term-details__background">
        <div className="long-term-details__glow long-term-details__glow--mint" />
        <div className="long-term-details__glow long-term-details__glow--brown" />
        <div className="long-term-details__glow long-term-details__glow--highlight" />
      </div>

      <div className="long-term-details__shell">
        <header className="long-term-details__header">
          <button
            type="button"
            className="long-term-details__nav-button"
            onClick={onClose}
            aria-label="返回目标页面"
          >
            <MaterialIcon name="arrow_back" />
          </button>

          <div className="long-term-details__action-group">
            <button
              type="button"
              className="long-term-details__action long-term-details__action--primary"
              onClick={() => onExport?.()}
            >
              <MaterialIcon name="ios_share" />
              导出
            </button>
            <button
              type="button"
              className="long-term-details__action"
              onClick={onEdit}
              disabled={!onEdit}
            >
              <MaterialIcon name="tune" />
              调整
            </button>
          </div>
        </header>

        <section className="long-term-details__intro">
          <h1 className="long-term-details__title">{goal.title}</h1>
          <p className="long-term-details__description">
            {goal.description?.trim() || fallbackDescription}
          </p>
        </section>

        <main className="long-term-details__main">
          <div className="timeline" style={timelineStyle}>
            <div className="timeline-line" aria-hidden="true" />
            {checkpoints.map((checkpoint, index) => {
              const previousCheckpoint = index > 0 ? checkpoints[index - 1] : null;
              const stageStartedAt = previousCheckpoint?.reachedAt ?? goal.startedAt;
              return (
                <div className="timeline-item" key={checkpoint.index}>
                  <div className="timeline-item__header">
                    <span className={`timeline-dot timeline-dot--${checkpoint.status}`}>
                      <TimelineDotContent status={checkpoint.status} />
                    </span>
                    <p className="timeline-status">
                      {checkpoint.status === "completed"
                        ? formatDateLabel(checkpoint.reachedAt)
                        : checkpoint.status === "current"
                        ? "进行中"
                        : "即将开始"}
                    </p>
                  </div>

                  <CheckpointCard
                    checkpoint={checkpoint}
                    checkpointHours={checkpointHours}
                    spentMinutes={goal.progress.spentMinutes}
                    stageStartedAt={stageStartedAt}
                    onSelectShowcase={onSelectShowcase}
                    onEditCompletionNote={onEditCompletionNote}
                  />
                </div>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

type TimelineDotContentProps = {
  status: LongTermGoalCheckpoint["status"];
};

function TimelineDotContent({ status }: TimelineDotContentProps) {
  if (status === "completed") {
    return <MaterialIcon name="check" />;
  }
  if (status === "current") {
    return (
      <>
        <span className="timeline-dot__ring" />
        <span className="timeline-dot__core" />
      </>
    );
  }
  return <span className="timeline-dot__placeholder" />;
}

type CheckpointCardProps = {
  checkpoint: LongTermGoalCheckpoint;
  checkpointHours: number;
  spentMinutes: number;
  stageStartedAt: string | null | undefined;
  onSelectShowcase?: (checkpoint: LongTermGoalCheckpoint) => void;
  onEditCompletionNote?: (checkpoint: LongTermGoalCheckpoint) => void;
};

function CheckpointCard({
  checkpoint,
  checkpointHours,
  spentMinutes,
  stageStartedAt,
  onSelectShowcase,
  onEditCompletionNote,
}: CheckpointCardProps) {
  const thresholdHours = checkpoint.thresholdMinutes / 60;
  const progressPercent =
    checkpoint.status === "current" && checkpoint.thresholdMinutes > 0
      ? clampPercent((spentMinutes / checkpoint.thresholdMinutes) * 100)
      : 0;
  const stageDurationDays =
    checkpoint.status === "completed"
      ? calculateDurationDays(stageStartedAt, checkpoint.reachedAt)
      : null;
  const completionNote = checkpoint.completionNote?.trim();

  if (checkpoint.status === "completed") {
    return (
      <div className="ticket-card timeline-card timeline-card--completed">
        <div className="timeline-card__header">
          <p className="timeline-card__title">{checkpoint.label}</p>
          <span className="timeline-card__meta">
            历经 {formatDays(stageDurationDays)} 天完成
          </span>
        </div>
        <button
          type="button"
          className="timeline-card__note-button"
          onClick={() => onEditCompletionNote?.(checkpoint)}
          disabled={!onEditCompletionNote}
        >
          <span className="timeline-card__note-text">
            {completionNote || formatCompletionFallback(checkpoint.reachedAt, thresholdHours)}
          </span>
          {onEditCompletionNote ? <MaterialIcon name="edit" /> : null}
        </button>
        <div className="timeline-card__showcase">
          <button
            type="button"
            className={`timeline-card__showcase-trigger${
              checkpoint.upload ? "" : " timeline-card__showcase-trigger--empty"
            }`}
            onClick={() => onSelectShowcase?.(checkpoint)}
            disabled={!onSelectShowcase}
            aria-label={checkpoint.upload ? "更换代表作" : "选择代表作"}
          >
            {checkpoint.upload?.image ? (
              <img
                src={checkpoint.upload.image}
                alt={checkpoint.upload.title || "创作记录"}
                className="timeline-card__showcase-image"
              />
            ) : (
              <div className="timeline-card__showcase-placeholder" aria-hidden="true">
                <MaterialIcon name="add_photo_alternate" />
              </div>
            )}
            <div className="timeline-card__showcase-copy">
              <p className="timeline-card__showcase-title">
                {checkpoint.upload
                  ? checkpoint.upload.title || `第 ${checkpoint.index} 次创作`
                  : "选择代表作"}
              </p>
              <span className="timeline-card__showcase-hint">
                {checkpoint.upload
                  ? onSelectShowcase
                    ? "点击更换，展示本阶段代表作"
                    : "代表作"
                  : onSelectShowcase
                  ? "仅显示本阶段已上传的作品"
                  : "暂无可选作品"}
              </span>
            </div>
          </button>
        </div>
        {checkpoint.upload?.description ? (
          <p className="timeline-card__note-description">{checkpoint.upload.description}</p>
        ) : checkpoint.upload?.durationMinutes ? (
          <p className="timeline-card__note-description">
            本次创作用时 {formatMinutes(checkpoint.upload.durationMinutes)}。
          </p>
        ) : (
          <p className="timeline-card__placeholder">尚未填写创作说明。</p>
        )}
      </div>
    );
  }

  if (checkpoint.status === "current") {
    return (
      <div className="timeline-card timeline-card--current">
        <div className="timeline-card__header">
          <p className="timeline-card__title">{checkpoint.label}</p>
          <span className="timeline-card__meta">目标 {formatHours(thresholdHours)} 小时</span>
        </div>
        <p className="timeline-card__subtitle">
          当前累计 {formatHours(spentMinutes / 60)} 小时，还需{" "}
          {formatHours(Math.max(thresholdHours - spentMinutes / 60, 0))} 小时
        </p>
        <div className="timeline-card__progress">
          <span className="timeline-card__progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-card timeline-card--upcoming">
      <p className="timeline-card__title">{checkpoint.label}</p>
      <p className="timeline-card__subtitle">
        目标累计 {formatHours(thresholdHours)} 小时（每阶段约 {formatHours(checkpointHours)} 小时）
      </p>
      <p className="timeline-card__placeholder">保持节奏，完成前一阶段后自动解锁这里的内容。</p>
    </div>
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function formatHours(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) {
    return String(Math.trunc(rounded));
  }
  return rounded.toFixed(1);
}

function formatMinutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "0 分钟";
  }
  return `${value} 分钟`;
}

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) {
    return "未记录";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function calculateDurationDays(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): number | null {
  const end = parseDate(endIso);
  if (!end) {
    return null;
  }
  const start = parseDate(startIso) ?? end;
  const diffMs = end.getTime() - start.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  if (diffMs <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(diffMs / dayMs));
}

function formatDays(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return String(value);
}

function formatCompletionFallback(
  reachedAt: string | null | undefined,
  thresholdHours: number,
): string {
  const dateLabel = formatDateLabel(reachedAt);
  const targetLabel = Number.isFinite(thresholdHours)
    ? `目标 ${formatHours(thresholdHours)} 小时`
    : "";
  if (!reachedAt) {
    return targetLabel ? `完成时间未记录（${targetLabel}）` : "完成时间未记录";
  }
  return targetLabel ? `完成于 ${dateLabel}（${targetLabel}）` : `完成于 ${dateLabel}`;
}

export default LongTermGoalDetails;


