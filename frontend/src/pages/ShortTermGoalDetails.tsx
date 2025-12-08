import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import LazyImage from "@/components/LazyImage";
import type { ShortTermGoal, ShortTermGoalTask, UserUploadRecord } from "@/services/api";
import { fetchUserUploads, submitCheckIn, fetchShortTermGoalTaskCompletions, deleteShortTermGoal } from "@/services/api";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";
import { parseISODateInShanghai, getTodayInShanghai, formatISODateInShanghai } from "@/utils/dateUtils";
import { USER_ARTWORKS_CHANGED_EVENT } from "@/services/artworkStorage";
import ShortTermGoalSummaryTemplate from "./ShortTermGoalSummaryTemplate";

import "./ShortTermGoalDetails.css";

type ShortTermGoalDetailsProps = {
  goal: ShortTermGoal;
  onClose: () => void;
  uploadDates?: Set<string>;
  onComplete?: (dateKey: string) => void;
  onDeleted?: (goalId: number) => void;
};

// 卡片状态
type CardStatus = "locked" | "available" | "completed";

// 周期状态
type CycleStatus = "active" | "finished" | "expired";

// 卡片数据
export type DayCard = {
  dayNumber: number;
  tasks: ShortTermGoalTask[];
  status: CardStatus;
  summary: string;
  subtitle: string;
  dateKey: string;
  hasUpload: boolean;
  isTomorrow: boolean; // 是否是明日继续（今天已完成，但明天因日期未到而锁定）
  note?: string; // 用户备注
  completedAt?: string; // 完成时间（ISO格式）
};

// 周期状态数据
type CycleState = {
  status: CycleStatus;
  days: DayCard[];
  progressPercent: number;
  daysRemaining: number;
  completedCount: number;
};

// 计算容错天数（周期天数 + 2）
function getToleranceDays(cycleDays: number): number {
  return cycleDays + 2;
}

// 获取目标的启动日期（优先使用 startedAt，如果没有则使用 createdAt）
// 保留精确的小时分钟秒
function getGoalStartDate(goal: ShortTermGoal): Date | null {
  // 优先使用 startedAt
  const startDateStr = goal.startedAt || goal.createdAt;
  if (!startDateStr) {
    return null;
  }
  
  // 尝试直接解析 ISO 日期时间字符串（保留精确时间）
  try {
    const parsed = new Date(startDateStr);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    // 继续尝试其他方法
  }
  
  // 如果是 YYYY-MM-DD 格式，使用 parseISODateInShanghai（会重置为 00:00:00）
  let startDate = parseISODateInShanghai(startDateStr);
  
  // 如果失败，尝试从 ISO 日期时间字符串提取日期部分
  if (!startDate) {
    const datePart = startDateStr.split('T')[0];
    startDate = parseISODateInShanghai(datePart);
  }
  
  // 如果还是失败，尝试使用 formatISODateInShanghai 从原始字符串转换
  if (!startDate) {
    const dateStr = formatISODateInShanghai(startDateStr);
    if (dateStr) {
      startDate = parseISODateInShanghai(dateStr);
    }
  }
  
  // 如果仍然失败，使用当前日期作为fallback
  if (!startDate) {
    startDate = parseISODateInShanghai(getTodayInShanghai()) || new Date();
  }
  
  return startDate;
}

// 根据启动日期计算第几天的日期（保留精确时间）
function getDayDate(goal: ShortTermGoal, dayIndex: number): Date | null {
  const startDate = getGoalStartDate(goal);
  if (!startDate) {
    return null;
  }
  
  // 保留原始时间的精确值，只增加天数
  const dayDate = new Date(startDate);
  dayDate.setDate(dayDate.getDate() + dayIndex);
  // 注意：不调用 setHours，保留精确的小时分钟秒
  return dayDate;
}

// 状态推导函数
function deriveCycleState(
  goal: ShortTermGoal,
  uploadDates: Set<string>
): CycleState {
  // 获取当前时间（使用测试日期，保留精确时间）
  const todayStr = getTodayInShanghai();
  const todayDate = parseISODateInShanghai(todayStr);
  const now = todayDate || new Date();

  // 获取启动日期（优先使用 startedAt，保留精确时间）
  const startDate = getGoalStartDate(goal);
  if (!startDate) {
    // 如果无法获取启动日期，返回空状态
    return {
      status: "expired",
      days: [],
      progressPercent: 0,
      daysRemaining: 0,
      completedCount: 0,
    };
  }

  // 计算容错天数
  const toleranceDays = getToleranceDays(goal.durationDays);
  
  // 计算截止时间（启动时间 + 容错天数，保留精确时间）
  const deadline = new Date(startDate);
  deadline.setDate(deadline.getDate() + toleranceDays);
  
  // 判断周期状态（使用精确时间比较）
  let cycleStatus: CycleStatus;
  if (now.getTime() > deadline.getTime()) {
    cycleStatus = "expired";
  } else {
    // 检查是否全部完成
    const completedCount = Array.from({ length: goal.durationDays }, (_, index) => {
      const dayDate = getDayDate(goal, index);
      if (!dayDate) return false;
      const dateKey = formatISODateInShanghai(dayDate);
      return dateKey ? uploadDates.has(dateKey) : false;
    }).filter(Boolean).length;

    if (completedCount === goal.durationDays) {
      cycleStatus = "finished";
    } else {
      cycleStatus = "active";
    }
  }

  // 生成所有卡片
  const sortedSchedule = [...goal.schedule].sort((a, b) => a.dayIndex - b.dayIndex);
  const scheduleMap = new Map(sortedSchedule.map((day) => [day.dayIndex, day.tasks]));
  const baseTasks =
    goal.planType === "same" && sortedSchedule.length > 0
      ? sortedSchedule[0]?.tasks ?? []
      : [];

  const days: DayCard[] = Array.from({ length: goal.durationDays }, (_, index) => {
    const dayNumber = index + 1;
    const dayDate = getDayDate(goal, index);
    const dateKey = dayDate ? formatISODateInShanghai(dayDate) : null;

    // 获取任务列表
    const currentTasks =
      goal.planType === "same"
        ? baseTasks
        : scheduleMap.get(index) ??
          (index > 0 && sortedSchedule.length > 0
            ? sortedSchedule.find((d) => d.dayIndex <= index)?.tasks ?? baseTasks
            : baseTasks);

    const summary = currentTasks.length > 0 ? currentTasks[0].title : "未安排任务";
    const subtitle = currentTasks.length > 0 ? currentTasks[0].subtitle ?? "" : "";

    // 判断是否有打卡记录
    const hasUpload = dateKey ? uploadDates.has(dateKey) : false;

    // 判断卡片状态
    let cardStatus: CardStatus;
    let isTomorrow = false;
    
    if (hasUpload) {
      cardStatus = "completed";
    } else if (cycleStatus === "expired") {
      // 周期过期，所有未完成的卡片锁定
      cardStatus = "locked";
    } else {
      // 判断是否解锁
      // Day 1 总是解锁
      if (index === 0) {
        cardStatus = "available";
      } else {
        // Day 2 及以后：需要满足"当前时间 >= 该天的开始时间"
        // 使用精确时间比较
        if (dayDate && now.getTime() >= dayDate.getTime()) {
          cardStatus = "available";
        } else {
          cardStatus = "locked";
          // 判断是否是"明日继续"的情况：今天的卡片已完成，但明天因日期未到而锁定
          if (index > 0) {
            const previousDayIndex = index - 1;
            const previousDayDate = getDayDate(goal, previousDayIndex);
            if (previousDayDate) {
              const previousDateKey = formatISODateInShanghai(previousDayDate);
              if (previousDateKey && uploadDates.has(previousDateKey)) {
                // 前一天已完成，今天是明天（日期未到），显示"明日继续"
                isTomorrow = true;
              }
            }
          }
        }
      }
    }

    return {
      dayNumber,
      tasks: currentTasks,
      status: cardStatus,
      summary,
      subtitle,
      dateKey: dateKey || "",
      hasUpload,
      isTomorrow,
    };
  });

  // 计算进度
  const completedCount = days.filter((d) => d.hasUpload).length;
  const progressPercent =
    goal.durationDays > 0
      ? Math.round((completedCount / goal.durationDays) * 100)
      : 0;
  const daysRemaining = Math.max(goal.durationDays - completedCount, 0);

  return {
    status: cycleStatus,
    days,
    progressPercent,
    daysRemaining,
    completedCount,
  };
}

function ShortTermGoalDetails({
  goal,
  onClose,
  uploadDates = new Set(),
  onComplete,
  onDeleted,
}: ShortTermGoalDetailsProps) {
  const [localUploadDates, setLocalUploadDates] = useState<Set<string>>(uploadDates);
  const [taskImages, setTaskImages] = useState<Record<string, UserUploadRecord | null>>({});
  const [recentUploads, setRecentUploads] = useState<UserUploadRecord[]>([]);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<UserUploadRecord | null>(null);
  const [completingDay, setCompletingDay] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [pendingDay, setPendingDay] = useState<DayCard | null>(null);
  const [dayNote, setDayNote] = useState("");
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({}); // dateKey -> note
  const [checkInTimes, setCheckInTimes] = useState<Record<string, string>>({}); // dateKey -> completedAt (ISO)
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSummaryTemplate, setShowSummaryTemplate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 同步 uploadDates prop 到本地状态（合并而不是覆盖）
  useEffect(() => {
    setLocalUploadDates((prev) => {
      const merged = new Set(prev);
      uploadDates.forEach((date) => merged.add(date));
      return merged;
    });
  }, [uploadDates]);

  // 加载上传记录
  const loadRecentUploads = useCallback((forceRefresh: boolean = false) => {
    // 打开弹窗时强制刷新，确保获取最新数据
    fetchUserUploads(true, forceRefresh)
      .then((uploads) => {
        const sorted = uploads.sort(
          (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
        );
        setRecentUploads(sorted.slice(0, 16));
      })
      .catch((error) => {
        console.warn("Failed to fetch uploads", error);
      });
  }, []);

  // 初始加载
  useEffect(() => {
    loadRecentUploads(false);
  }, [loadRecentUploads]);

  // 当打开上传弹窗时，强制刷新数据，确保获取最新画作列表
  useEffect(() => {
    if (selectedTaskKey) {
      // 打开弹窗时强制刷新，不使用缓存
      loadRecentUploads(true);
    }
  }, [selectedTaskKey, loadRecentUploads]);

  // 监听画作数据变化事件，当画集页面删除或上传作品时自动刷新
  useEffect(() => {
    const handleArtworksChanged = () => {
      // 如果弹窗已打开，立即刷新数据
      if (selectedTaskKey) {
        loadRecentUploads(true);
      }
      // 即使弹窗未打开，也刷新数据（为下次打开做准备）
      // 但使用缓存，避免不必要的请求
      loadRecentUploads(false);
    };

    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    return () => {
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    };
  }, [selectedTaskKey, loadRecentUploads]);

  // 加载已保存的任务图片关联
  const loadTaskCompletions = useCallback(() => {
    let cancelled = false;
    fetchShortTermGoalTaskCompletions(goal.id)
      .then((data) => {
        if (!cancelled) {
          const completions = data.completions || {};
          const checkinTimes = data.checkin_times || {};
          
          // 将完成记录转换为taskImages格式
          const loadedTaskImages: Record<string, UserUploadRecord | null> = {};
          // 收集所有有任务完成记录的日期
          const completedDates = new Set<string>();
          
          // 保存完成时间（确保类型正确）
          setCheckInTimes((prev) => {
            const next: Record<string, string> = { ...prev };
            Object.entries(checkinTimes).forEach(([key, value]) => {
              if (typeof value === 'string') {
                next[key] = value;
              }
            });
            return next;
          });
          
          Object.entries(completions).forEach(([dateKey, tasks]) => {
            // 后端返回的日期键是ISO格式（YYYY-MM-DD），前端生成的dateKey也是相同格式
            // 直接使用后端返回的日期键，确保完全匹配
            // 同时也要尝试标准化格式，以防万一
            const normalizedDateKey = formatISODateInShanghai(dateKey) || dateKey;
            
            // 如果有任务完成记录，说明这一天已经完成了，添加到已完成日期集合
            if (Object.keys(tasks).length > 0) {
              completedDates.add(normalizedDateKey);
              // 如果标准化后的日期键与原始不同，也添加原始格式
              if (normalizedDateKey !== dateKey) {
                completedDates.add(dateKey);
              }
            }
            
            Object.entries(tasks).forEach(([taskId, completion]) => {
              // 确保 completion 是 TaskCompletionRecord 类型
              if (!completion || typeof completion !== 'object' || !('id' in completion)) {
                return;
              }
              
              // 类型断言，确保 completion 是 TaskCompletionRecord
              const taskCompletion = completion as import('@/services/api').TaskCompletionRecord;
              
              // 使用标准化后的日期键（如果与原始不同，也保存原始格式的键）
              const taskKey = normalizedDateKey !== dateKey ? `${normalizedDateKey}-${taskId}` : `${dateKey}-${taskId}`;
              // 构建UserUploadRecord对象
              const uploadRecord: UserUploadRecord = {
                id: taskCompletion.id,
                title: taskCompletion.title,
                description: "",
                uploaded_at: taskCompletion.uploaded_at,
                self_rating: null,
                mood_id: null,
                mood_label: "",
                tags: [],
                duration_minutes: null,
                image: taskCompletion.image,
                created_at: taskCompletion.uploaded_at,
                updated_at: taskCompletion.uploaded_at,
              };
              // 保存到标准化日期键
              loadedTaskImages[taskKey] = uploadRecord;
              // 如果标准化后的日期键与原始不同，也保存原始格式的键
              if (normalizedDateKey !== dateKey) {
                loadedTaskImages[`${dateKey}-${taskId}`] = uploadRecord;
              }
            });
          });
          
          // 更新任务图片
          setTaskImages((prev) => ({
            ...prev,
            ...loadedTaskImages,
          }));
          
          // 更新已完成日期，确保有任务完成记录的日期也显示为已完成
          setLocalUploadDates((prev) => {
            const next = new Set(prev);
            completedDates.forEach((date) => next.add(date));
            return next;
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Failed to fetch task completions", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [goal.id]);

  useEffect(() => {
    const cleanup = loadTaskCompletions();
    return cleanup;
  }, [loadTaskCompletions]);

  // 计算周期状态
  const cycleState = useMemo(
    () => deriveCycleState(goal, localUploadDates),
    [goal, localUploadDates]
  );

  // 处理任务图片上传
  const handleTaskUploadClick = useCallback((dayDateKey: string, taskId: string) => {
    const taskKey = `${dayDateKey}-${taskId}`;
    setSelectedTaskKey(taskKey);
  }, []);

  // 选择图片
  const handleImageSelect = useCallback(
    (upload: UserUploadRecord) => {
      if (selectedTaskKey) {
        setTaskImages((prev) => ({
          ...prev,
          [selectedTaskKey]: upload,
        }));
        setSelectedTaskKey(null);
      }
    },
    [selectedTaskKey]
  );

  // 查看图片
  const handleImageView = useCallback((upload: UserUploadRecord) => {
    setViewingImage(upload);
  }, []);

  // 完成某一天的打卡
  const handleCompleteDay = useCallback(
    async (day: DayCard) => {
      // 防止重复提交
      if (isSubmitting || completingDay === day.dateKey || day.hasUpload) {
        return;
      }

      // 检查是否所有任务都有图片
      const allTasksHaveImages = day.tasks.every((task) => {
        const taskKey = `${day.dateKey}-${task.taskId}`;
        return taskImages[taskKey] !== undefined && taskImages[taskKey] !== null;
      });

      if (!allTasksHaveImages && day.tasks.length > 0) {
        alert("请先为所有任务上传作品");
        return;
      }

      // 弹出备注输入框
      setPendingDay(day);
      setDayNote(dayNotes[day.dateKey] || "");
      setShowNoteModal(true);
    },
    [isSubmitting, completingDay, taskImages, dayNotes]
  );

  // 确认保存（包含备注）
  const handleConfirmComplete = useCallback(
    async () => {
      if (!pendingDay) return;

      const day = pendingDay;
      setShowNoteModal(false);
      setCompletingDay(day.dateKey);
      setIsSubmitting(true);

      try {
        // 构建任务图片关联信息
        const taskImagesMap: Record<string, number> = {};
        day.tasks.forEach((task) => {
          const taskKey = `${day.dateKey}-${task.taskId}`;
          const upload = taskImages[taskKey];
          if (upload && upload.id) {
            taskImagesMap[task.taskId] = upload.id;
          }
        });

        const result = await submitCheckIn({
          date: day.dateKey,
          source: "short-term-goal",
          goal_id: goal.id,
          task_images: Object.keys(taskImagesMap).length > 0 ? taskImagesMap : undefined,
          notes: dayNote.trim() || undefined,
        });

        // 使用服务器返回的 checked_date（可能因时区等原因与请求的日期不同）
        const checkedDate = result.checked_date 
          ? formatISODateInShanghai(result.checked_date) || day.dateKey
          : day.dateKey;

        // 更新本地状态（使用函数式更新确保不丢失已有状态）
        setLocalUploadDates((prev) => {
          const next = new Set(prev);
          next.add(checkedDate);
          return next;
        });

        // 保存备注
        if (dayNote.trim()) {
          setDayNotes((prev) => ({
            ...prev,
            [checkedDate]: dayNote.trim(),
          }));
        }

        // 保存完成时间（从服务器返回的时间，如果没有则使用测试日期）
        const todayStr = getTodayInShanghai();
        const todayDate = parseISODateInShanghai(todayStr);
        const now = todayDate || new Date();
        const completionTime = result.checked_at || result.checked_date || now.toISOString();
        setCheckInTimes((prev) => ({
          ...prev,
          [checkedDate]: completionTime,
        }));

        // 重新加载任务完成记录，确保图片关联已保存
        // 延迟一点时间，确保后端已保存完成
        setTimeout(() => {
          loadTaskCompletions();
          loadCheckInNotes();
        }, 100);

        // 通知父组件刷新数据
        if (onComplete) {
          onComplete(checkedDate);
        }
      } catch (error) {
        console.error("Failed to complete day", error);
        let errorMessage = "打卡失败，请稍后重试";
        if (
          error &&
          typeof error === "object" &&
          "response" in error
        ) {
          const axiosError = error as {
            response?: { data?: { detail?: string }; status?: number };
          };
          const detail = axiosError.response?.data?.detail;
          if (detail && typeof detail === "string") {
            errorMessage = detail;
          } else if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
            errorMessage = "登录已过期，请重新登录";
          }
        }
        alert(errorMessage);
      } finally {
        setCompletingDay(null);
        setIsSubmitting(false);
        setPendingDay(null);
        setDayNote("");
      }
    },
    [pendingDay, taskImages, onComplete, goal.id, loadTaskCompletions, dayNote]
  );

  // 取消备注输入
  const handleCancelNote = useCallback(() => {
    setShowNoteModal(false);
    setPendingDay(null);
    setDayNote("");
  }, []);

  // 处理删除目标
  const handleDeleteGoal = useCallback(async () => {
    if (isDeleting) return;
    
    setIsDeleting(true);
    setShowDeleteConfirm(false);
    setShowMenu(false);
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
    }
  }, [goal.id, isDeleting, onDeleted, onClose]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest('.short-term-details__icon-button')) {
          setShowMenu(false);
        }
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showMenu]);

  // 加载打卡备注
  const loadCheckInNotes = useCallback(() => {
    // 从打卡记录中获取备注（需要后端API支持）
    // 暂时先不实现，等后端API准备好
  }, []);

  // 关闭选择图片弹窗
  const handleCloseSelectModal = useCallback(() => {
    setSelectedTaskKey(null);
  }, []);

  // 关闭查看图片弹窗
  const handleCloseImageModal = useCallback(() => {
    setViewingImage(null);
  }, []);

  // 格式化日期为中文格式（如：2024年1月15日）
  const formatDateChinese = useCallback((date: Date): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  }, []);

  // 格式化完成时间（如：完成时间：2024-01-15 14时30分）
  const formatCompletionTime = useCallback((isoTime: string): string => {
    try {
      const date = new Date(isoTime);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `完成时间：${year}-${month}-${day} ${hours}时${minutes}分`;
    } catch {
      return "";
    }
  }, []);

  // 计算截止日期（启动时间 + 容错天数，保留精确时间）
  const deadlineDate = useMemo(() => {
    const toleranceDays = getToleranceDays(goal.durationDays);
    const startDate = getGoalStartDate(goal);
    if (!startDate) {
      // 如果无法获取启动日期，使用测试日期作为fallback
      const todayStr = getTodayInShanghai();
      const todayDate = parseISODateInShanghai(todayStr);
      return todayDate || new Date();
    }
    
    // 保留启动时间的精确值，只增加天数
    const deadline = new Date(startDate);
    deadline.setDate(deadline.getDate() + toleranceDays);
    // 注意：不调用 setHours，保留精确的小时分钟秒
    return deadline;
  }, [goal.startedAt, goal.createdAt, goal.durationDays]);

  // 获取状态提示文案
  const getStatusHint = useCallback(() => {
    if (cycleState.status === "expired") {
      return "周期已结束，所有卡片已锁定";
    }
    if (cycleState.status === "finished") {
      return "恭喜！已完成所有任务";
    }
    const toleranceDays = getToleranceDays(goal.durationDays);
    // 获取当前时间（使用测试日期）
    const todayStr = getTodayInShanghai();
    const todayDate = parseISODateInShanghai(todayStr);
    const now = todayDate || new Date();
    const startDate = getGoalStartDate(goal);
    if (!startDate) {
      return "";
    }
    
    // 计算截止时间（启动时间 + 容错天数，保留精确时间）
    const deadline = new Date(startDate);
    deadline.setDate(deadline.getDate() + toleranceDays);
    
    // 计算剩余时间（使用精确时间，转换为天数）
    const remainingMs = deadline.getTime() - now.getTime();
    const daysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    
    if (daysRemaining <= 0) {
      return "周期即将结束";
    }
    return `剩余 ${daysRemaining} 天可完成`;
  }, [cycleState.status, goal]);

  // 映射状态到 UI 样式类名（使用 useMemo 缓存）
  const getStatusClass = useCallback((status: CardStatus): string => {
    switch (status) {
      case "completed":
        return "completed";
      case "available":
        return "active";
      case "locked":
        return "upcoming";
      default:
        return "upcoming";
    }
  }, []);

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
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="short-term-details__icon-button"
              onClick={() => setShowMenu(!showMenu)}
              aria-label="更多选项"
            >
              <MaterialIcon name="more_vert" />
            </button>
            {showMenu && (
              <div
                ref={menuRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "0.5rem",
                  background: "white",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  minWidth: "120px",
                  zIndex: 1000,
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                  disabled={isDeleting}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    border: "none",
                    background: "transparent",
                    textAlign: "left",
                    cursor: isDeleting ? "not-allowed" : "pointer",
                    color: isDeleting ? "#999" : "#d32f2f",
                    fontSize: "0.875rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                  onMouseEnter={(e) => {
                    if (!isDeleting) {
                      e.currentTarget.style.background = "#f5f5f5";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <MaterialIcon name="delete" />
                  <span>删除目标</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <p className="short-term-details__meta">
          目标时长：{goal.durationDays} 天 | 截止日期：{formatDateChinese(deadlineDate)} | {getStatusHint()}
        </p>

        <section className="short-term-details__progress">
          <div className="short-term-details__progress-header">
            <span>总体进度</span>
            <strong>{cycleState.progressPercent}%</strong>
          </div>
          <div className="short-term-details__progress-track" aria-hidden="true">
            <div
              className="short-term-details__progress-fill"
              style={{ width: `${cycleState.progressPercent}%` }}
            />
          </div>
        </section>

        <section className="short-term-details__days">
          {cycleState.days.map((day) => {
            const statusClass = getStatusClass(day.status);
            const isAvailable = day.status === "available";
            const isCompleted = day.status === "completed";
            const isLocked = day.status === "locked";

            return (
              <details
                key={day.dayNumber}
                className={`short-term-details__day short-term-details__day--${statusClass}`}
                open={isAvailable && !isCompleted}
              >
                <summary>
                  <div className="short-term-details__day-heading">
                    <p>
                      <span className="short-term-details__day-number">
                        第 {day.dayNumber} 天
                      </span>
                    </p>
                    <div className="short-term-details__day-actions">
                      {isCompleted ? (
                        <MaterialIcon name="check_circle" className="filled" />
                      ) : null}
                      <MaterialIcon name="expand_more" />
                    </div>
                  </div>
                  {/* 状态显示：完成时间或待完成 */}
                  <div className="short-term-details__day-status-collapsed">
                    {isCompleted && checkInTimes[day.dateKey] ? (
                      <span className="short-term-details__day-status-text" style={{ color: "#98dbc6" }}>
                        {formatCompletionTime(checkInTimes[day.dateKey])}
                      </span>
                    ) : !isLocked ? (
                      <span className="short-term-details__day-status-text">待完成</span>
                    ) : null}
                  </div>
                </summary>

                {isLocked ? (
                  <div className="short-term-details__day-empty">
                    {day.isTomorrow ? "明日继续！" : "尚未解锁，请先完成之前的任务"}
                  </div>
                ) : day.tasks.length === 0 ? (
                  <div className="short-term-details__day-empty">
                    今日无任务安排
                  </div>
                ) : (
                  <>
                    {/* 备注显示在展开内容区域 */}
                    {dayNotes[day.dateKey] ? (
                      <div className="short-term-details__day-notes">
                        <p className="short-term-details__day-subtitle">{dayNotes[day.dateKey]}</p>
                      </div>
                    ) : null}
                    <div className="short-term-details__task-list">
                      {day.tasks.map((task) => {
                        const taskKey = `${day.dateKey}-${task.taskId}`;
                        const taskImage = taskImages[taskKey];
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
                            {(isAvailable || isCompleted) && !isLocked ? (
                              <div className="short-term-details__task-extra">
                                {hasImage ? (
                                  <button
                                    type="button"
                                    className="short-term-details__task-image"
                                    onClick={() => handleImageView(taskImage!)}
                                    aria-label={`查看任务「${task.title}」作品`}
                                  >
                                    <LazyImage
                                      src={taskImage!.image ? replaceLocalhostInUrl(taskImage!.image) : ""}
                                      alt={task.title}
                                    />
                                  </button>
                                ) : isAvailable && !isCompleted ? (
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
                  </>
                )}

                {isAvailable && !isCompleted && !isLocked ? (
                  <button
                    type="button"
                    className={`short-term-details__complete-button ${
                      day.tasks.length > 0 &&
                      day.tasks.every(
                        (task) => taskImages[`${day.dateKey}-${task.taskId}`]
                      )
                        ? "short-term-details__complete-button--enabled"
                        : ""
                    }`}
                    disabled={
                      completingDay === day.dateKey ||
                      isSubmitting ||
                      day.hasUpload ||
                      (day.tasks.length > 0 &&
                        !day.tasks.every(
                          (task) => taskImages[`${day.dateKey}-${task.taskId}`]
                        ))
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCompleteDay(day);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {completingDay === day.dateKey
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
        >
          查看历史记录
        </button>
        {cycleState.status === "finished" && (
          <button
            type="button"
            className="short-term-details__footer-button short-term-details__footer-button--primary"
            onClick={() => setShowSummaryTemplate(true)}
          >
            总结本次短期目标
          </button>
        )}
      </footer>

      {/* 选择图片弹窗 */}
      {selectedTaskKey ? (
        <div className="short-term-details__modal-overlay" onClick={handleCloseSelectModal}>
          <div
            className="short-term-details__image-select-modal"
            onClick={(e) => e.stopPropagation()}
          >
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
            {recentUploads.length === 0 ? (
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
                      <LazyImage
                        src={replaceLocalhostInUrl(upload.image)}
                        alt={upload.title || "作品"}
                      />
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

      {/* 备注输入弹窗 */}
      {showNoteModal && pendingDay ? (
        <div 
          className="short-term-details__modal-overlay" 
          onClick={handleCancelNote}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#2a2a2a",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "400px",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, color: "#ffffff", fontSize: "1.125rem", fontWeight: 600 }}>
                完成今日目标
              </h2>
              <button
                type="button"
                onClick={handleCancelNote}
                aria-label="关闭"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  cursor: "pointer",
                  padding: "0.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <p style={{ margin: 0, color: "rgba(255, 255, 255, 0.7)", fontSize: "0.875rem" }}>
              为今天的练习留一句话或评价吧 (可选)
            </p>
            <textarea
              value={dayNote}
              onChange={(e) => {
                // 限制备注长度，防止过长文本
                const maxLength = 500;
                const value = e.target.value;
                if (value.length <= maxLength) {
                  setDayNote(value);
                }
              }}
              placeholder="今天有什么想说的吗? (最多500字)"
              maxLength={500}
              style={{
                width: "100%",
                minHeight: "120px",
                padding: "0.75rem",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontFamily: "inherit",
                resize: "vertical",
                background: "rgba(255, 255, 255, 0.1)",
                color: "#ffffff",
                outline: "none",
              }}
            />
            {dayNote.length > 0 && (
              <p style={{ 
                margin: 0, 
                color: dayNote.length > 450 ? "rgba(255, 200, 200, 0.8)" : "rgba(255, 255, 255, 0.5)", 
                fontSize: "0.75rem",
                textAlign: "right"
              }}>
                {dayNote.length}/500
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                marginTop: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={handleCancelNote}
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  border: "none",
                  borderRadius: "8px",
                  background: "#4a4a4a",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  border: "none",
                  borderRadius: "8px",
                  background: isSubmitting ? "#6a9a8a" : "#98dbc6",
                  color: "#ffffff",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                }}
              >
                {isSubmitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 查看图片弹窗 */}
      {viewingImage ? (
        <div className="short-term-details__modal-overlay" onClick={handleCloseImageModal}>
          <div
            className="short-term-details__image-view-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="short-term-details__modal-close"
              onClick={handleCloseImageModal}
              aria-label="关闭"
            >
              <MaterialIcon name="close" />
            </button>
            {viewingImage.image ? (
              <LazyImage
                src={replaceLocalhostInUrl(viewingImage.image)}
                alt={viewingImage.title || "作品"}
              />
            ) : (
              <div className="short-term-details__image-empty">无图片</div>
            )}
            {viewingImage.title ? (
              <div className="short-term-details__image-view-title">{viewingImage.title}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm ? (
        <div className="short-term-goal-delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="short-term-goal-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="short-term-goal-delete-confirm-title">要删除这个短期目标吗？</h2>
            <div className="short-term-goal-delete-confirm-content">
              <p className="short-term-goal-delete-confirm-text">
                删除后，所有相关的打卡记录和进度数据都会被清除。
              </p>
              <p className="short-term-goal-delete-confirm-text">
                很多目标在当下觉得困难，可它们都是你一路积累下来的痕迹。
              </p>
              <p className="short-term-goal-delete-confirm-text short-term-goal-delete-confirm-text--highlight">
                如果不是误操作，再考虑一下吗
              </p>
            </div>
            <div className="short-term-goal-delete-confirm-actions">
              <button
                type="button"
                className="short-term-goal-delete-confirm-button short-term-goal-delete-confirm-button--cancel"
                onClick={() => setShowDeleteConfirm(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="short-term-goal-delete-confirm-button short-term-goal-delete-confirm-button--confirm"
                onClick={handleDeleteGoal}
                disabled={isDeleting}
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 总结模版弹窗 */}
      <ShortTermGoalSummaryTemplate
        open={showSummaryTemplate}
        goal={goal}
        cycleState={cycleState}
        taskImages={taskImages}
        onClose={() => setShowSummaryTemplate(false)}
      />
    </div>
  );
}

export default ShortTermGoalDetails;
