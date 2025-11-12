import { useMemo } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import type { ShortTermGoal, ShortTermGoalTask } from "@/services/api";
import { formatDateKey } from "@/services/artworkStorage";

import "./ShortTermGoalDetails.css";

type ShortTermGoalDetailsProps = {
  goal: ShortTermGoal;
  onClose: () => void;
  uploadDates?: Set<string>;
  onReviewHistory?: () => void;
};

type DayStatus = "completed" | "active" | "upcoming";

type DayEntry = {
  dayNumber: number;
  tasks: ShortTermGoalTask[];
  status: DayStatus;
  summary: string;
  subtitle: string;
  dateKey: string;
  hasUpload: boolean;
};

function ShortTermGoalDetails({
  goal,
  onClose,
  uploadDates,
  onReviewHistory,
}: ShortTermGoalDetailsProps) {
  const snapshot = useMemo(
    () => buildGoalSnapshot(goal, uploadDates),
    [goal, uploadDates],
  );

  return (
    <div className="short-term-details">
      <div className="short-term-details__background">
        <div className="short-term-details__glow short-term-details__glow--mint" />
        <div className="short-term-details__glow short-term-details__glow--brown" />
      </div>

      <div className="short-term-details__shell">
        <header className="short-term-details__header">
          <button
            type="button"
            className="short-term-details__icon-button"
            onClick={onClose}
            aria-label="返回短期目标列表"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="short-term-details__title">{goal.title}</h1>
          <span className="short-term-details__header-placeholder" />
        </header>

        <p className="short-term-details__meta">
          挑战时长：{goal.durationDays} 天 | 剩余 {snapshot.daysRemaining} 天
        </p>

        <section className="short-term-details__progress">
          <div className="short-term-details__progress-header">
            <span>总体进度</span>
            <strong>{snapshot.progressPercent}%</strong>
          </div>
          <div className="short-term-details__progress-track" aria-hidden="true">
            <div
              className="short-term-details__progress-fill"
              style={{ width: `${snapshot.progressPercent}%` }}
            />
          </div>
        </section>

        <section className="short-term-details__days">
          {snapshot.days.map((day) => {
            const isActive = day.status === "active";
            const isCompleted = day.status === "completed";
            const canCompleteToday = isActive && (day.hasUpload || day.tasks.length === 0);
            return (
              <details
                key={day.dayNumber}
                className={`short-term-details__day short-term-details__day--${day.status}`}
                open={isActive}
              >
                <summary>
                  <div className="short-term-details__day-heading">
                    <p>
                      <span className="short-term-details__day-number">
                        第 {day.dayNumber} 天
                      </span>
                      <span className="short-term-details__day-title">{day.summary}</span>
                    </p>
                    <div className="short-term-details__day-actions">
                      {isCompleted ? (
                        <MaterialIcon name="check_circle" className="filled" />
                      ) : null}
                      <MaterialIcon name="expand_more" />
                    </div>
                  </div>
                  {day.subtitle ? (
                    <p className="short-term-details__day-subtitle">{day.subtitle}</p>
                  ) : null}
                </summary>

                {day.tasks.length === 0 ? (
                  <div className="short-term-details__day-empty">
                    {day.status === "upcoming" ? "展开后可查看今日任务" : "今日无任务安排"}
                  </div>
                ) : (
                  <div className="short-term-details__task-list">
                    {day.tasks.map((task) => (
                      <div className="short-term-details__task" key={task.taskId}>
                        <div className="short-term-details__task-meta">
                          <div className="short-term-details__task-cover">
                            {getTaskInitial(task.title)}
                          </div>
                          <div className="short-term-details__task-text">
                            <p className="short-term-details__task-title">{task.title}</p>
                            {task.subtitle ? (
                              <p className="short-term-details__task-subtitle">{task.subtitle}</p>
                            ) : null}
                          </div>
                        </div>
                        {isActive ? (
                          <div className="short-term-details__task-extra">
                            {day.hasUpload ? (
                              <span className="short-term-details__tag short-term-details__tag--success">
                                已上传
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="short-term-details__ghost-button"
                                aria-label={`上传任务「${task.title}」作品`}
                                disabled={false}
                              >
                                上传
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {isActive ? (
                  <button
                    type="button"
                    className="short-term-details__complete-button"
                    disabled={!canCompleteToday}
                  >
                    完成今日目标
                  </button>
                ) : null}
              </details>
            );
          })}
        </section>
      </div>

      <footer className="short-term-details__footer">
        <button
          type="button"
          className="short-term-details__footer-button"
          onClick={onReviewHistory}
        >
          查看历史记录
        </button>
      </footer>
    </div>
  );
}

function buildGoalSnapshot(goal: ShortTermGoal, uploadDates?: Set<string>) {
  const sortedSchedule = [...goal.schedule].sort((a, b) => a.dayIndex - b.dayIndex);
  const scheduleMap = new Map(sortedSchedule.map((day) => [day.dayIndex, day.tasks]));
  const baseTasks =
    goal.planType === "same" && sortedSchedule.length > 0
      ? sortedSchedule[0]?.tasks ?? []
      : [];

  const today = new Date();
  const startDate = goal.createdAt ? new Date(goal.createdAt) : today;
  const elapsedDaysRaw = Math.max(differenceInCalendarDays(startDate, today), 0) + 1;
  const unlockedDays = clamp(elapsedDaysRaw, 1, goal.durationDays);

  const days: DayEntry[] = Array.from({ length: goal.durationDays }, (_, index) => {
    const dayNumber = index + 1;
    const currentTasks =
      goal.planType === "same"
        ? baseTasks
        : scheduleMap.get(index) ??
          findFallbackTasks(sortedSchedule, index);

    const summary = currentTasks.length > 0 ? currentTasks[0].title : "未安排任务";
    const subtitle = currentTasks.length > 0 ? currentTasks[0].subtitle : "";
    const dayDate = addDays(startDate, index);
    const dateKey = formatDateKey(dayDate);
    const hasUpload = Boolean(uploadDates?.has(dateKey));

    let status: DayStatus = "upcoming";

    return {
      dayNumber,
      tasks: currentTasks ?? [],
      status,
      summary,
      subtitle,
      dateKey,
      hasUpload,
    };
  });

  let completedCount = 0;
  let activeIndex: number | null = null;

  days.forEach((day, index) => {
    if (day.hasUpload) {
      day.status = "completed";
      completedCount += 1;
      return;
    }
    if (index < unlockedDays && activeIndex === null) {
      day.status = "active";
      activeIndex = index;
      return;
    }
    day.status = "upcoming";
  });

  if (activeIndex === null && completedCount < goal.durationDays) {
    const nextIndex = Math.min(unlockedDays, goal.durationDays - 1);
    const candidate = days[nextIndex];
    if (candidate && candidate.status !== "completed") {
      candidate.status = "active";
      activeIndex = nextIndex;
    }
  }

  const hasActive = activeIndex !== null;
  const daysRemaining = Math.max(goal.durationDays - completedCount - (hasActive ? 1 : 0), 0);
  const progressFraction =
    goal.durationDays > 0 ? Math.min(completedCount / goal.durationDays, 1) : 0;
  const progressPercent = Math.round(progressFraction * 100);

  return {
    days,
    daysRemaining,
    progressPercent,
  };
}

function findFallbackTasks(schedule: ShortTermGoal["schedule"], dayIndex: number) {
  for (let index = schedule.length - 1; index >= 0; index -= 1) {
    const day = schedule[index];
    if (day.dayIndex <= dayIndex) {
      return day.tasks;
    }
  }
  if (schedule.length > 0) {
    return schedule[0].tasks;
  }
  return [];
}

function getTaskInitial(title: string): string {
  if (!title) {
    return "•";
  }
  const trimmed = title.trim();
  if (!trimmed) {
    return "•";
  }
  const first = trimmed[0];
  if (/[\p{Letter}\p{Number}]/u.test(first)) {
    return first.toUpperCase();
  }
  return "•";
}

function differenceInCalendarDays(start: Date, end: Date) {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = endUtc - startUtc;
  return Math.floor(diff / 86400000);
}

function addDays(source: Date, amount: number) {
  return new Date(source.getFullYear(), source.getMonth(), source.getDate() + amount);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default ShortTermGoalDetails;


