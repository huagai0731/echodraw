import { useCallback, useMemo, useState } from "react";
import { isAxiosError } from "axios";
import MaterialIcon from "@/components/MaterialIcon";
import type { ShortTermGoal } from "@/services/api";
import { startShortTermGoal } from "@/services/api";

import "./ShortTermGoalSavedDetails.css";

type ShortTermGoalSavedDetailsProps = {
  goal: ShortTermGoal;
  onClose: () => void;
  onStart?: (goal: ShortTermGoal) => void;
  onEdit?: (goal: ShortTermGoal) => void;
  onUpdated?: (goal: ShortTermGoal) => void;
};

function ShortTermGoalSavedDetails({
  goal,
  onClose,
  onStart,
  onEdit,
  onUpdated,
}: ShortTermGoalSavedDetailsProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const summaryList = useMemo(() => {
    if (goal.planType === "same") {
      const dayTasks = goal.schedule[0]?.tasks ?? [];
      return [
        {
          label: "每日任务",
          tasks: dayTasks,
        },
      ];
    }
    return goal.schedule.map((day) => {
      const dayNumber = day.dayIndex + 1;
      return {
        label: `Day${dayNumber}`,
        tasks: day.tasks,
      };
    });
  }, [goal]);

  const handleStart = useCallback(async () => {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setStartError(null);

    try {
      const updatedGoal = await startShortTermGoal(goal.id);
      onStart?.(updatedGoal);
      onUpdated?.(updatedGoal);
      // 启动成功后关闭页面
      onClose();
    } catch (error) {
      let message = "启动失败，请稍后再试。";
      if (isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === "string" && detail.trim()) {
          message = detail;
        }
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }
      setStartError(message);
    } finally {
      setIsStarting(false);
    }
  }, [goal, isStarting, onStart, onUpdated, onClose]);

  const handleEdit = useCallback(() => {
    onEdit?.(goal);
  }, [goal, onEdit]);

  return (
    <div className="short-term-saved-details">
      <div className="short-term-saved-details__background">
        <div className="short-term-saved-details__glow short-term-saved-details__glow--mint" />
        <div className="short-term-saved-details__glow short-term-saved-details__glow--brown" />
      </div>

      <div className="short-term-saved-details__shell">
        <header className="short-term-saved-details__header">
          <button
            type="button"
            className="short-term-saved-details__icon-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <div className="short-term-saved-details__title">
            <h1>{goal.title}</h1>
            <p>已保存 · 未启动</p>
          </div>
          <div className="short-term-saved-details__header-placeholder" />
        </header>

        <div className="short-term-saved-details__content">
          <div className="short-term-saved-details__meta">
            <p>
              {goal.durationDays} 天 ·{" "}
              {goal.planType === "same" ? "每日重复任务" : "每日不同安排"}
            </p>
          </div>

          <div className="short-term-saved-details__list">
            {summaryList.map((item, index) => (
              <div key={item.label} className="short-term-saved-details__item">
                {goal.planType === "different" && (
                  <div className="short-term-saved-details__badge">{item.label}</div>
                )}
                <div className="short-term-saved-details__item-content">
                  {goal.planType === "same" ? (
                    <>
                      <h3>{item.label}</h3>
                      {item.tasks.length > 0 ? (
                        <ul>
                          {item.tasks.map((task, taskIndex) => (
                            <li key={taskIndex}>{task.title}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="short-term-saved-details__placeholder">尚未安排任务</p>
                      )}
                    </>
                  ) : (
                    <>
                      {item.tasks.length > 0 ? (
                        <ul>
                          {item.tasks.map((task, taskIndex) => (
                            <li key={taskIndex}>{task.title}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="short-term-saved-details__placeholder">尚未安排任务</p>
                      )}
                    </>
                  )}
                </div>
                {index < summaryList.length - 1 && <hr />}
              </div>
            ))}
          </div>

          <p className="short-term-saved-details__hint">
            - 功不唐捐。{goal.durationDays}天后回头看，你会是不同的自己 -
          </p>

          {startError && (
            <p className="short-term-saved-details__error">{startError}</p>
          )}
        </div>

        <footer className="short-term-saved-details__footer">
          <button
            type="button"
            className="short-term-saved-details__button short-term-saved-details__button--secondary"
            onClick={handleEdit}
          >
            编辑
          </button>
          <button
            type="button"
            className="short-term-saved-details__button short-term-saved-details__button--primary"
            onClick={handleStart}
            disabled={isStarting}
          >
            {isStarting ? "启动中..." : "启动"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ShortTermGoalSavedDetails;

