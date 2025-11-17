import { useCallback, useEffect, useMemo, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import type { ShortTermGoal, ShortTermGoalTask, UserUploadRecord } from "@/services/api";
import { deleteShortTermGoal, fetchUserUploads, submitCheckIn } from "@/services/api";
import { formatDateKey } from "@/services/artworkStorage";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";

import "./ShortTermGoalDetails.css";

type ShortTermGoalDetailsProps = {
  goal: ShortTermGoal;
  onClose: () => void;
  uploadDates?: Set<string>;
  onReviewHistory?: () => void;
  onComplete?: (dateKey: string) => void;
  onDeleted?: (goalId: number) => void;
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

type TaskImageMap = Record<string, UserUploadRecord | null>;

function ShortTermGoalDetails({
  goal,
  onClose,
  uploadDates,
  onReviewHistory,
  onComplete,
  onDeleted,
}: ShortTermGoalDetailsProps) {
  // 本地维护 uploadDates 状态，允许内部更新
  // 初始化时，如果目标是今天创建的，过滤掉第一天的打卡记录（可能是之前demo数据）
  // 同时监听 uploadDates prop 的变化，确保从父组件传递的最新状态能同步过来
  const [localUploadDates, setLocalUploadDates] = useState<Set<string>>(() => {
    const initialDates = new Set(uploadDates || []);
    
    // 如果目标是今天创建的，且uploadDates中有今天的记录，这可能是之前demo数据
    // 需要在初始化时移除，但在用户完成今日目标后可以重新添加
    if (goal.createdAt) {
      const startDate = new Date(goal.createdAt);
      startDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 如果目标创建日期是今天，移除第一天的打卡记录（如果存在）
      if (startDate.getTime() === today.getTime()) {
        const firstDayKey = formatDateKey(startDate);
        if (initialDates.has(firstDayKey)) {
          // 移除第一天的记录，避免demo数据影响
          initialDates.delete(firstDayKey);
        }
      }
    }
    
    return initialDates;
  });

  // 当 uploadDates prop 更新时，同步到本地状态
  // 这样可以确保从父组件传递的最新状态能正确显示
  useEffect(() => {
    if (uploadDates) {
      setLocalUploadDates((prev) => {
        // 合并父组件传递的最新状态和本地状态
        const merged = new Set(uploadDates);
        // 保留本地可能新增的日期（比如刚刚完成的）
        prev.forEach((date) => merged.add(date));
        console.log("[ShortTermGoalDetails] Synced uploadDates from prop", {
          propDates: Array.from(uploadDates),
          prevDates: Array.from(prev),
          mergedDates: Array.from(merged)
        });
        return merged;
      });
    }
  }, [uploadDates]);

  // 将 Set 转换为排序后的数组字符串，用于 useMemo 依赖比较
  const localUploadDatesKey = useMemo(
    () => Array.from(localUploadDates).sort().join(','),
    [localUploadDates]
  );

  const snapshot = useMemo(
    () => buildGoalSnapshot(goal, localUploadDates),
    [goal, localUploadDatesKey],
  );

  const STORAGE_KEY = `short-term-goal-${goal.id}-task-images`;

  // 从 localStorage 加载任务图片关联（只保存图片ID）
  // key格式：dateKey-taskId，确保不同天的相同任务ID不会冲突
  const loadTaskImages = useCallback((): TaskImageMap => {
    try {
      const storageKey = `short-term-goal-${goal.id}-task-images`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const imageIds = JSON.parse(stored) as Record<string, number | null>;
        console.log("[ShortTermGoalDetails] loadTaskImages found stored data", {
          keys: Object.keys(imageIds),
          imageIds
        });
        // 初始化时返回空的map，等待上传列表加载后再关联
        // 这里返回一个占位符 map，键存在但值为 null，后续会在 useEffect 中恢复
        return Object.fromEntries(
          Object.entries(imageIds).map(([key]) => [key, null])
        ) as TaskImageMap;
      } else {
        console.log("[ShortTermGoalDetails] loadTaskImages no stored data", { storageKey });
      }
    } catch (error) {
      console.warn("[ShortTermGoalDetails] Failed to load task images", error);
    }
    return {};
  }, [goal.id]);

  const saveTaskImages = useCallback((images: TaskImageMap) => {
    try {
      // 只保存图片ID，而不是整个对象
      // key格式：dateKey-taskId
      const imageIds = Object.fromEntries(
        Object.entries(images)
          .filter(([, upload]) => upload !== null) // 只保存非null的项
          .map(([key, upload]) => [key, upload!.id])
      );
      console.log("[ShortTermGoalDetails] Saving task images", { 
        keys: Object.keys(imageIds), 
        imageIds,
        totalImages: Object.keys(images).length,
        nonNullImages: Object.values(images).filter(Boolean).length
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imageIds));
      console.log("[ShortTermGoalDetails] Saved to localStorage successfully", {
        storageKey: STORAGE_KEY,
        savedCount: Object.keys(imageIds).length
      });
      
      // 立即验证保存
      const verified = localStorage.getItem(STORAGE_KEY);
      if (verified) {
        const parsed = JSON.parse(verified) as Record<string, number>;
        console.log("[ShortTermGoalDetails] Verified saved data", {
          savedKeys: Object.keys(parsed),
          matches: Object.keys(imageIds).every(key => parsed[key] === imageIds[key])
        });
      }
    } catch (error) {
      console.error("[ShortTermGoalDetails] Failed to save task images", error);
    }
  }, [STORAGE_KEY]);

  const [taskImages, setTaskImages] = useState<TaskImageMap>(() => {
    try {
      const storageKey = `short-term-goal-${goal.id}-task-images`;
      const stored = localStorage.getItem(storageKey);
      console.log("[ShortTermGoalDetails] Initial taskImages from localStorage", {
        storageKey,
        hasStored: !!stored,
        stored
      });
      const loaded = loadTaskImages();
      console.log("[ShortTermGoalDetails] Initial taskImages loaded", {
        keys: Object.keys(loaded)
      });
      return loaded;
    } catch (error) {
      console.error("[ShortTermGoalDetails] Failed to load initial taskImages", error);
      return {};
    }
  });
  const [recentUploads, setRecentUploads] = useState<UserUploadRecord[]>([]);
  const [allUploads, setAllUploads] = useState<UserUploadRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<UserUploadRecord | null>(null);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [completingDay, setCompletingDay] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [pendingCompleteDay, setPendingCompleteDay] = useState<DayEntry | null>(null);
  const [animatingDay, setAnimatingDay] = useState<string | null>(null);
  
  // 在组件挂载时验证 localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log("[ShortTermGoalDetails] Component mounted, checking localStorage", {
      storageKey: STORAGE_KEY,
      hasStored: !!stored,
      stored,
      currentTaskImagesKeys: Object.keys(taskImages)
    });
  }, [STORAGE_KEY, taskImages]);

  useEffect(() => {
    let cancelled = false;
    setLoadingUploads(true);
    fetchUserUploads()
      .then((uploads) => {
        if (!cancelled) {
          const sorted = uploads
            .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
          const recent = sorted.slice(0, 16);
          setRecentUploads(recent);
          setAllUploads(sorted);

          // 从 localStorage 恢复任务图片关联
          // key格式：dateKey-taskId
          try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
              const imageIds = JSON.parse(stored) as Record<string, number | null>;
              console.log("[ShortTermGoalDetails] Restoring task images from localStorage", { 
                keys: Object.keys(imageIds), 
                imageIds,
                uploadsCount: uploads.length 
              });
              const restored: TaskImageMap = {};
              let foundCount = 0;
              let missingCount = 0;
              
              Object.entries(imageIds).forEach(([key, uploadId]) => {
                if (uploadId) {
                  const upload = uploads.find((u) => u.id === uploadId);
                  if (upload) {
                    restored[key] = upload;
                    foundCount++;
                    console.log("[ShortTermGoalDetails] Restored", { key, uploadId, uploadTitle: upload.title });
                  } else {
                    missingCount++;
                    console.warn("[ShortTermGoalDetails] Upload not found for ID", { key, uploadId, availableIds: uploads.map(u => u.id) });
                  }
                }
              });
              
              console.log("[ShortTermGoalDetails] Restored taskImages", { 
                keys: Object.keys(restored),
                foundCount,
                missingCount,
                total: Object.keys(imageIds).length
              });
              
              // 使用函数式更新，确保合并而不是替换
              // 如果 prev 中有占位符（值为 null），用 restored 中的实际值替换
              setTaskImages((prev) => {
                const merged = { ...prev };
                // 先合并 restored 中的值
                Object.entries(restored).forEach(([key, upload]) => {
                  merged[key] = upload;
                });
                // 确保所有 localStorage 中的 key 都有对应的值（如果找不到上传，保持 null）
                Object.keys(imageIds).forEach((key) => {
                  if (!(key in merged)) {
                    merged[key] = null;
                  }
                });
                console.log("[ShortTermGoalDetails] Merged taskImages", {
                  prevKeys: Object.keys(prev),
                  restoredKeys: Object.keys(restored),
                  mergedKeys: Object.keys(merged),
                  mergedValues: Object.entries(merged).map(([k, v]) => ({ key: k, hasValue: v !== null }))
                });
                return merged;
              });
            } else {
              console.log("[ShortTermGoalDetails] No stored task images found in localStorage");
            }
          } catch (error) {
            console.error("[ShortTermGoalDetails] Failed to restore task images", error);
          }

          setLoadingUploads(false);
        }
      })
      .catch((error) => {
        console.warn("[ShortTermGoalDetails] Failed to fetch uploads", error);
        if (!cancelled) {
          setLoadingUploads(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [STORAGE_KEY]);

  const handleTaskUploadClick = useCallback((dateKey: string, taskId: string) => {
    // key格式：dateKey-taskId
    setSelectedTaskId(`${dateKey}-${taskId}`);
  }, []);

  const handleImageSelect = useCallback((upload: UserUploadRecord) => {
    if (selectedTaskId) {
      console.log("[ShortTermGoalDetails] Selecting image", { selectedTaskId, uploadId: upload.id, uploadTitle: upload.title });
      
      setTaskImages((prev) => {
        const next = {
          ...prev,
          [selectedTaskId]: upload,
        };
        console.log("[ShortTermGoalDetails] Updated taskImages", { 
          prevKeys: Object.keys(prev), 
          nextKeys: Object.keys(next),
          selectedTaskId,
          uploadId: upload.id
        });
        
        // 保存到 localStorage
        saveTaskImages(next);
        
        // 验证保存（使用 setTimeout 确保保存完成）
        setTimeout(() => {
          try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
              const saved = JSON.parse(stored) as Record<string, number | null>;
              console.log("[ShortTermGoalDetails] Verified save to localStorage", { 
                savedKeys: Object.keys(saved),
                saved,
                expectedKey: selectedTaskId,
                expectedValue: upload.id 
              });
              
              // 验证保存的key和value是否正确
              if (saved[selectedTaskId] !== upload.id) {
                console.error("[ShortTermGoalDetails] Save verification failed!", {
                  expected: { key: selectedTaskId, value: upload.id },
                  actual: { key: selectedTaskId, value: saved[selectedTaskId] }
                });
              } else {
                console.log("[ShortTermGoalDetails] Save verification passed!");
              }
            } else {
              console.error("[ShortTermGoalDetails] localStorage is empty after save!");
            }
          } catch (error) {
            console.error("[ShortTermGoalDetails] Failed to verify save", error);
          }
        }, 100);
        
        return next;
      });
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, saveTaskImages, STORAGE_KEY]);

  const handleImageView = useCallback((upload: UserUploadRecord) => {
    setViewingImage(upload);
  }, []);

  const handleCompleteTodayClick = useCallback((day: DayEntry) => {
    // 先显示评价弹窗
    setPendingCompleteDay(day);
    setReviewText("");
    setShowReviewModal(true);
  }, []);

  const handleReviewSave = useCallback(async () => {
    if (!pendingCompleteDay) {
      return;
    }

    const day = pendingCompleteDay;
    setShowReviewModal(false);
    setCompletingDay(day.dateKey);
    
    try {
      // 确保日期格式正确（YYYY-MM-DD）
      const dateKey = day.dateKey;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        console.error("[ShortTermGoalDetails] Invalid date format:", dateKey);
        setCompletingDay(null);
        setPendingCompleteDay(null);
        return;
      }

      // 在完成今日目标前，确保当天的图片关联已保存到 localStorage
      // 获取当天的所有任务图片关联
      const dayTaskImages: TaskImageMap = {};
      day.tasks.forEach((task) => {
        const taskImageKey = `${dateKey}-${task.taskId}`;
        const taskImage = taskImages[taskImageKey];
        if (taskImage) {
          dayTaskImages[taskImageKey] = taskImage;
        }
      });
      
      // 如果有图片关联，确保保存到 localStorage
      if (Object.keys(dayTaskImages).length > 0) {
        setTaskImages((prev) => {
          const next = { ...prev, ...dayTaskImages };
          // 确保保存到 localStorage
          saveTaskImages(next);
          return next;
        });
        console.log("[ShortTermGoalDetails] Ensured task images are saved before completing", {
          dateKey,
          taskImageKeys: Object.keys(dayTaskImages)
        });
      }

      // 保存评价到 localStorage（如果后端不支持，先保存在本地）
      if (reviewText.trim()) {
        try {
          const reviewKey = `short-term-goal-${goal.id}-review-${dateKey}`;
          localStorage.setItem(reviewKey, reviewText.trim());
          console.log("[ShortTermGoalDetails] Saved review", { dateKey, review: reviewText.trim() });
        } catch (error) {
          console.warn("[ShortTermGoalDetails] Failed to save review", error);
        }
      }

      console.log("[ShortTermGoalDetails] Submitting check-in", { date: dateKey, source: "short-term-goal" });
      const result = await submitCheckIn({ date: dateKey, source: "short-term-goal" });
      console.log("[ShortTermGoalDetails] Check-in successful", result);
      
      // 更新本地 uploadDates 状态，标记该日期为已完成
      setLocalUploadDates((prev) => {
        const next = new Set(prev);
        next.add(day.dateKey);
        console.log("[ShortTermGoalDetails] Updated localUploadDates", Array.from(next));
        return next;
      });
      
      // 触发动画
      setAnimatingDay(day.dateKey);
      
      // 通知父组件刷新打卡记录
      if (onComplete) {
        onComplete(day.dateKey);
      }
      
      // 动画结束后清理状态
      setTimeout(() => {
        setAnimatingDay(null);
        setCompletingDay(null);
        setPendingCompleteDay(null);
        setReviewText("");
        console.log("[ShortTermGoalDetails] Completed successfully");
      }, 2000); // 动画持续2秒
    } catch (error) {
      console.error("[ShortTermGoalDetails] Failed to complete today", error);
      // 如果是AxiosError，尝试获取详细的错误信息
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as { response?: { data?: { detail?: string } } };
        const detail = axiosError.response?.data?.detail;
        if (detail) {
          console.error("[ShortTermGoalDetails] Error detail:", detail);
        }
      }
      setCompletingDay(null);
      setPendingCompleteDay(null);
      setAnimatingDay(null);
    }
  }, [pendingCompleteDay, reviewText, taskImages, saveTaskImages, onComplete, goal.id]);

  const handleReviewCancel = useCallback(() => {
    setShowReviewModal(false);
    setPendingCompleteDay(null);
    setReviewText("");
  }, []);

  const handleCloseImageModal = useCallback(() => {
    setViewingImage(null);
  }, []);

  const handleCloseSelectModal = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleMoreOptionsClick = useCallback(() => {
    setShowMoreOptions(true);
  }, []);

  const handleCloseMoreOptions = useCallback(() => {
    setShowMoreOptions(false);
  }, []);

  const handleDeleteClick = useCallback(() => {
    setShowMoreOptions(false);
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleting) {
      return;
    }

    setDeleting(true);
    try {
      await deleteShortTermGoal(goal.id);
      console.log("[ShortTermGoalDetails] Goal deleted successfully", goal.id);
      
      // 清理该目标相关的 localStorage 数据
      try {
        const storageKey = `short-term-goal-${goal.id}-task-images`;
        localStorage.removeItem(storageKey);
        console.log("[ShortTermGoalDetails] Cleared localStorage for deleted goal", storageKey);
      } catch (error) {
        console.warn("[ShortTermGoalDetails] Failed to clear localStorage", error);
      }
      
      // 通知父组件目标已删除
      if (onDeleted) {
        onDeleted(goal.id);
      }
      
      // 删除成功后关闭页面
      onClose();
    } catch (error) {
      console.error("[ShortTermGoalDetails] Failed to delete goal", error);
      setDeleting(false);
      // 可以在这里显示错误提示
    }
  }, [deleting, goal.id, onClose, onDeleted]);

  // 获取完成时间
  const getCompletionTime = useCallback((dateKey: string): string | null => {
    // 从 allUploads 中找到对应日期的上传记录（使用最早的那条，因为可能有多条）
    const uploadsForDate = allUploads.filter((u) => {
      if (!u.uploaded_at) return false;
      const uploadDate = new Date(u.uploaded_at);
      const uploadDateKey = formatDateKey(uploadDate);
      return uploadDateKey === dateKey;
    });
    
    if (uploadsForDate.length === 0) return null;
    
    // 使用最早的上传记录作为完成时间
    const upload = uploadsForDate.sort((a, b) => 
      new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime()
    )[0];
    
    if (!upload?.uploaded_at) return null;
    
    try {
      const date = new Date(upload.uploaded_at);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch {
      return null;
    }
  }, [allUploads]);

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
          <button
            type="button"
            className="short-term-details__icon-button"
            onClick={handleMoreOptionsClick}
            aria-label="更多选项"
          >
            <MaterialIcon name="more_vert" />
          </button>
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
          {snapshot.days.map((day, dayIndex) => {
            const isActive = day.status === "active";
            const isCompleted = day.status === "completed";
            const isUpcoming = day.status === "upcoming";
            // 检查前一天是否已完成
            const prevDay = dayIndex > 0 ? snapshot.days[dayIndex - 1] : null;
            const prevDayCompleted = prevDay?.hasUpload ?? false;
            // 判断是否应该显示"明日启动！"
            const shouldShowTomorrow = isUpcoming && prevDayCompleted;
            // 获取完成时间
            const completionTime = isCompleted ? getCompletionTime(day.dateKey) : null;
            
            return (
              <details
                key={day.dayNumber}
                className={`short-term-details__day short-term-details__day--${day.status} ${
                  animatingDay === day.dateKey ? "short-term-details__day--animating" : ""
                }`}
                open={isActive}
              >
                <summary>
                  <div className="short-term-details__day-heading">
                    <p>
                      <span className="short-term-details__day-number">
                        第 {day.dayNumber} 天
                      </span>
                      <span className="short-term-details__day-title">{day.summary}</span>
                      {completionTime ? (
                        <span className="short-term-details__day-completion-time">{completionTime}</span>
                      ) : null}
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
                    {day.tasks.map((task) => {
                      // key格式：dateKey-taskId，确保不同天的相同任务ID不会冲突
                      const taskImageKey = `${day.dateKey}-${task.taskId}`;
                      const taskImage = taskImages[taskImageKey];
                      const hasImage = Boolean(taskImage);
                      return (
                        <div className="short-term-details__task" key={task.taskId}>
                          <div className="short-term-details__task-meta">
                            <div className="short-term-details__task-text">
                              <p className="short-term-details__task-title">{task.title}</p>
                              {task.subtitle ? (
                                <p className="short-term-details__task-subtitle">{task.subtitle}</p>
                              ) : null}
                            </div>
                          </div>
                          {isActive || isCompleted ? (
                            <div className="short-term-details__task-extra">
                              {hasImage ? (
                                <button
                                  type="button"
                                  className="short-term-details__task-image"
                                  onClick={() => handleImageView(taskImage!)}
                                  aria-label={`查看任务「${task.title}」作品`}
                                >
                                  <img src={taskImage!.image || ""} alt={task.title} />
                                </button>
                              ) : isActive ? (
                                <button
                                  type="button"
                                  className="short-term-details__ghost-button"
                                  onClick={() => handleTaskUploadClick(day.dateKey, task.taskId)}
                                  aria-label={`上传任务「${task.title}」作品`}
                                >
                                  上传
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {(isActive || shouldShowTomorrow) ? (
                  <button
                    type="button"
                    className={`short-term-details__complete-button ${
                      !shouldShowTomorrow &&
                      day.tasks.length > 0 &&
                      day.tasks.every((task) => taskImages[`${day.dateKey}-${task.taskId}`])
                        ? "short-term-details__complete-button--enabled"
                        : ""
                    }`}
                    disabled={
                      shouldShowTomorrow ||
                      !day.tasks.every((task) => taskImages[`${day.dateKey}-${task.taskId}`]) ||
                      day.tasks.length === 0 ||
                      completingDay === day.dateKey ||
                      day.hasUpload
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      
                      // 如果是"明日启动！"状态，不应该执行
                      if (shouldShowTomorrow) {
                        return;
                      }
                      
                      console.log("[ShortTermGoalDetails] Button clicked", {
                        day: day.dateKey,
                        allTasksHaveImages: day.tasks.every((task) => taskImages[`${day.dateKey}-${task.taskId}`]),
                        tasksLength: day.tasks.length,
                        completingDay: completingDay === day.dateKey,
                        hasUpload: day.hasUpload,
                        isDisabled: !day.tasks.every((task) => taskImages[`${day.dateKey}-${task.taskId}`]) ||
                          day.tasks.length === 0 ||
                          completingDay === day.dateKey ||
                          day.hasUpload,
                        taskImages,
                        tasks: day.tasks.map((t) => ({ id: t.taskId, hasImage: !!taskImages[`${day.dateKey}-${t.taskId}`] }))
                      });
                      
                      // 如果按钮被禁用，不应该执行
                      if (!day.tasks.every((task) => taskImages[`${day.dateKey}-${task.taskId}`]) ||
                          day.tasks.length === 0 ||
                          completingDay === day.dateKey ||
                          day.hasUpload) {
                        console.log("[ShortTermGoalDetails] Button condition failed, not calling handleCompleteToday");
                        return;
                      }
                      
                      console.log("[ShortTermGoalDetails] Calling handleCompleteTodayClick");
                      handleCompleteTodayClick(day);
                    }}
                    onMouseDown={(e) => {
                      // 防止 mousedown 事件触发 details 的切换
                      e.stopPropagation();
                    }}
                  >
                    {shouldShowTomorrow
                      ? "明日启动！"
                      : completingDay === day.dateKey
                        ? "标记中..."
                        : day.hasUpload
                          ? "今日已完成"
                          : "完成今日目标"}
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

      {selectedTaskId ? (
        <div className="short-term-details__modal-overlay" onClick={handleCloseSelectModal}>
          <div className="short-term-details__image-select-modal" onClick={(e) => e.stopPropagation()}>
            <div className="short-term-details__modal-header">
              <h2>选择图片</h2>
              <button
                type="button"
                className="short-term-details__modal-close"
                onClick={handleCloseSelectModal}
                aria-label="关闭"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            {loadingUploads ? (
              <div className="short-term-details__modal-loading">加载中...</div>
            ) : recentUploads.length === 0 ? (
              <div className="short-term-details__modal-empty">暂无图片</div>
            ) : (
              <div className="short-term-details__image-grid">
                {recentUploads.map((upload) => (
                  <button
                    key={upload.id}
                    type="button"
                    className="short-term-details__image-grid-item"
                    onClick={() => handleImageSelect(upload)}
                  >
                    {upload.image ? (
                      <img src={replaceLocalhostInUrl(upload.image)} alt={upload.title || "作品"} />
                    ) : (
                      <div className="short-term-details__image-placeholder">无图片</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {viewingImage ? (
        <div className="short-term-details__modal-overlay" onClick={handleCloseImageModal}>
          <div className="short-term-details__image-view-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="short-term-details__modal-close"
              onClick={handleCloseImageModal}
              aria-label="关闭"
            >
              <MaterialIcon name="close" />
            </button>
            {viewingImage.image ? (
              <img src={replaceLocalhostInUrl(viewingImage.image)} alt={viewingImage.title || "作品"} />
            ) : (
              <div className="short-term-details__image-empty">无图片</div>
            )}
            {viewingImage.title ? (
              <div className="short-term-details__image-view-title">{viewingImage.title}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 更多选项页面 */}
      {showMoreOptions ? (
        <div className="short-term-details__modal-overlay" onClick={handleCloseMoreOptions}>
          <div className="short-term-details__more-options-modal" onClick={(e) => e.stopPropagation()}>
            <div className="short-term-details__modal-header">
              <h2>更多选项</h2>
              <button
                type="button"
                className="short-term-details__modal-close"
                onClick={handleCloseMoreOptions}
                aria-label="关闭"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="short-term-details__more-options-content">
              <button
                type="button"
                className="short-term-details__delete-goal-button"
                onClick={handleDeleteClick}
              >
                <MaterialIcon name="delete_outline" />
                放弃本次目标
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm ? (
        <div className="short-term-details__modal-overlay" onClick={handleDeleteCancel}>
          <div className="short-term-details__confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="short-term-details__confirm-header">
              <h2>确认放弃目标</h2>
            </div>
            <div className="short-term-details__confirm-content">
              <p>确定要放弃「{goal.title}」吗？此操作不可撤销。</p>
            </div>
            <div className="short-term-details__confirm-actions">
              <button
                type="button"
                className="short-term-details__confirm-button short-term-details__confirm-button--cancel"
                onClick={handleDeleteCancel}
                disabled={deleting}
              >
                取消
              </button>
              <button
                type="button"
                className="short-term-details__confirm-button short-term-details__confirm-button--confirm"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? "删除中..." : "确认"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 评价弹窗 */}
      {showReviewModal ? (
        <div className="short-term-details__modal-overlay" onClick={handleReviewCancel}>
          <div className="short-term-details__review-modal" onClick={(e) => e.stopPropagation()}>
            <div className="short-term-details__modal-header">
              <h2>完成今日目标</h2>
              <button
                type="button"
                className="short-term-details__modal-close"
                onClick={handleReviewCancel}
                aria-label="关闭"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="short-term-details__review-content">
              <p className="short-term-details__review-prompt">
                为今天的练习留一句话或评价吧（可选）
              </p>
              <textarea
                className="short-term-details__review-textarea"
                placeholder="今天有什么想说的吗？"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={4}
                maxLength={200}
              />
              <div className="short-term-details__review-actions">
                <button
                  type="button"
                  className="short-term-details__review-button short-term-details__review-button--cancel"
                  onClick={handleReviewCancel}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="short-term-details__review-button short-term-details__review-button--save"
                  onClick={handleReviewSave}
                  disabled={completingDay === pendingCompleteDay?.dateKey}
                >
                  {completingDay === pendingCompleteDay?.dateKey ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
  today.setHours(0, 0, 0, 0); // 重置时间为0点，只比较日期
  const startDate = goal.createdAt ? new Date(goal.createdAt) : today;
  startDate.setHours(0, 0, 0, 0); // 重置时间为0点
  
  // 计算目标日期范围（只检查目标范围内的打卡记录，排除demo数据）
  const endDate = addDays(startDate, goal.durationDays - 1);
  endDate.setHours(0, 0, 0, 0);
  
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
    dayDate.setHours(0, 0, 0, 0); // 重置时间为0点
    const dateKey = formatDateKey(dayDate);
    
    // 只考虑目标日期范围内的打卡记录（排除目标创建日期之前的demo数据）
    // 逻辑：
    // 1. 初始化时已经过滤掉新建目标（今天创建）第一天的demo数据
    // 2. 只要打卡日期在目标开始日期之后或等于开始日期，且uploadDates中有记录，就计入
    const dayDateTimestamp = dayDate.getTime();
    const startDateTimestamp = startDate.getTime();
    const isOnOrAfterStartDate = dayDateTimestamp >= startDateTimestamp;
    
    // 只要打卡日期在目标开始日期之后或等于开始日期，且uploadDates中有记录，就计入
    // 注意：对于第一天，初始化时已经过滤掉可能的demo数据，所以如果uploadDates中有记录，说明是目标创建后完成的
    const hasUpload = isOnOrAfterStartDate && Boolean(uploadDates?.has(dateKey));

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
    // 只有今天或过去的日期才能被标记为active
    const dayDate = addDays(startDate, index);
    dayDate.setHours(0, 0, 0, 0);
    const isTodayOrPast = dayDate.getTime() <= today.getTime();
    
    if (index < unlockedDays && activeIndex === null && isTodayOrPast) {
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

// Removed unused function getTaskInitial

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


