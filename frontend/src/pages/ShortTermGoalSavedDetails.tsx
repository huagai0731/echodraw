import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { isAxiosError } from "axios";
import MaterialIcon from "@/components/MaterialIcon";
import type { ShortTermGoal } from "@/services/api";
import { startShortTermGoal, deleteShortTermGoal } from "@/services/api";

import "./ShortTermGoalSavedDetails.css";

type ShortTermGoalSavedDetailsProps = {
  goal: ShortTermGoal;
  onClose: () => void;
  onStart?: (goal: ShortTermGoal) => void;
  onEdit?: (goal: ShortTermGoal) => void;
  onUpdated?: (goal: ShortTermGoal) => void;
  onDeleted?: (goalId: number) => void;
};

function ShortTermGoalSavedDetails({
  goal,
  onClose,
  onStart,
  onEdit,
  onUpdated,
  onDeleted,
}: ShortTermGoalSavedDetailsProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const handleDelete = useCallback(async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteShortTermGoal(goal.id);
      if (onDeleted) {
        onDeleted(goal.id);
      }
      onClose();
    } catch (error) {
      console.error("Failed to delete goal", error);
      alert("删除失败，请稍后重试");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [goal.id, isDeleting, onDeleted, onClose]);

  const handleBackgroundClick = useCallback(
    (_event: ReactMouseEvent<HTMLDivElement>) => {
      // 由于卡片 shell 已经阻止了事件冒泡，所以能到达这里的事件
      // 说明点击的是背景区域（不是卡片本身），直接关闭
      onClose();
    },
    [onClose]
  );

  const handleShellClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    // 阻止事件冒泡，确保点击卡片内部不会触发关闭
    event.stopPropagation();
  }, []);

  const handleToggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  // 点击菜单外部关闭菜单
  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        target.closest(".short-term-saved-details-menu") ||
        target.closest(".short-term-saved-details-menu__trigger")
      ) {
        return;
      }
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  return (
    <div className="short-term-saved-details" onClick={handleBackgroundClick}>
      <div className="short-term-saved-details__background">
        <div className="short-term-saved-details__glow short-term-saved-details__glow--mint" />
        <div className="short-term-saved-details__glow short-term-saved-details__glow--brown" />
      </div>

      <div className="short-term-saved-details__shell" onClick={handleShellClick}>
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
            <p>
              已保存 · 未启动
            </p>
          </div>
          <div className="short-term-saved-details__header-actions">
            <button
              type="button"
              className="short-term-saved-details__icon-button short-term-saved-details-menu__trigger"
              onClick={handleToggleMenu}
              aria-label="更多操作"
            >
              <MaterialIcon name="more_vert" />
            </button>
            {menuOpen ? (
              <div className="short-term-saved-details-menu" role="menu">
                <button
                  type="button"
                  className="short-term-saved-details-menu__item"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowDeleteConfirm(true);
                  }}
                >
                  <MaterialIcon name="delete" className="short-term-saved-details-menu__icon short-term-saved-details-menu__icon--danger" />
                  删除
                </button>
              </div>
            ) : null}
          </div>
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

      {/* 删除确认弹窗 */}
      {showDeleteConfirm ? (
        <div className="short-term-saved-details__delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="short-term-saved-details__delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="short-term-saved-details__delete-confirm-title">要删除这个短期目标吗？</h2>
            <div className="short-term-saved-details__delete-confirm-content">
              <p className="short-term-saved-details__delete-confirm-text">
                删除后，这个目标将无法恢复。
              </p>
              <p className="short-term-saved-details__delete-confirm-text short-term-saved-details__delete-confirm-text--highlight">
                确定要删除吗？
              </p>
            </div>
            <div className="short-term-saved-details__delete-confirm-actions">
              <button
                type="button"
                className="short-term-saved-details__delete-confirm-button short-term-saved-details__delete-confirm-button--cancel"
                onClick={() => setShowDeleteConfirm(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="short-term-saved-details__delete-confirm-button short-term-saved-details__delete-confirm-button--confirm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ShortTermGoalSavedDetails;

