import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import NewChallengeWizard from "@/pages/NewChallengeWizard";
import LongTermGoalSetup from "@/pages/LongTermGoalSetup";
import LongTermGoalDetails from "@/pages/LongTermGoalDetails";
import ShortTermGoalDetails from "@/pages/ShortTermGoalDetails";
import ShortTermGoalSavedDetails from "@/pages/ShortTermGoalSavedDetails";
import ErrorBoundary from "@/components/ErrorBoundary";
import TopNav from "@/components/TopNav";
import {
  AUTH_CHANGED_EVENT,
  fetchGoalsCalendar,
  fetchLongTermGoal,
  fetchCompletedLongTermGoals,
  hasAuthToken,
  updateCheckpoint,
  deleteLongTermGoal,
  fetchShortTermGoalTaskCompletions,
  type GoalsCalendarDay,
  type LongTermGoal,
  type LongTermGoalCheckpoint,
  type ShortTermGoal,
} from "@/services/api";
import {
  loadStoredArtworks,
  USER_ARTWORKS_CHANGED_EVENT,
  USER_ARTWORK_STORAGE_KEY,
} from "@/services/artworkStorage";
import type { Artwork } from "@/types/artwork";
import {
  formatISODateInShanghai,
  isValidISODate,
  normalizeUploadedDateInShanghai,
  parseISODateInShanghai,
  // Removed unused: startOfWeekInShanghai
} from "@/utils/dateUtils";
import { useShortTermGoals } from "@/hooks/useShortTermGoals";
import { useCheckInDates } from "@/hooks/useCheckInDates";

import colortestImage from "@/assets/colortest.jpg";

import "./Goals.css";

// Removed unused type: RangeKey

// Removed unused: WEEKDAY_LABELS
const MONTHLY_CHART_WIDTH = 310;
const MONTHLY_CHART_HEIGHT = 192;
const MONTHLY_CHART_TOP_PADDING = 16;
const MONTHLY_CHART_BOTTOM_PADDING = 28;

const LONG_TERM_GOAL_CACHE_KEY = "echo-long-term-goal-cache";
const LONG_TERM_GOAL_CACHE_TIMESTAMP_KEY = "echo-long-term-goal-cache-timestamp";
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5分钟缓存有效期

const CALENDAR_CACHE_KEY_PREFIX = "echo-goals-calendar-cache-";
const CALENDAR_CACHE_TIMESTAMP_KEY_PREFIX = "echo-goals-calendar-timestamp-";
const CALENDAR_CACHE_MAX_AGE = 5 * 60 * 1000; // 5分钟缓存有效期

// Removed unused: FALLBACK_COVER_GRADIENTS

// Removed unused: EXAMPLE_COVER_IMAGES

// Removed unused type: WeeklyStat

type MonthlySeriesPoint = {
  x: number;
  y: number;
  minutes: number;
  day: number;
};

type MonthlySeries = {
  path: string;
  labels: string[];
  hasData: boolean;
  points: MonthlySeriesPoint[];
  defaultHintIndex: number;
  year: number;
  monthIndex: number;
};

// Removed unused function: clamp

function parseDurationFromString(value?: string): number {
  if (!value) {
    return 0;
  }

  const match = value.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  if (!match) {
    return 0;
  }

  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return Math.max(hours * 60 + minutes, 0);
}

function extractDurationMinutes(artwork: Artwork): number {
  if (typeof artwork.durationMinutes === "number" && Number.isFinite(artwork.durationMinutes)) {
    return Math.max(artwork.durationMinutes, 0);
  }
  return parseDurationFromString(artwork.duration);
}

// Removed unused function: startOfWeek

// Removed unused function: computeWeeklyStats

function generateMonthlyLabels(daysInMonth: number): string[] {
  if (daysInMonth <= 1) {
    return ["1"];
  }

  const count = Math.min(7, daysInMonth);
  const step = (daysInMonth - 1) / (count - 1);
  const labels = new Set<number>();

  for (let index = 0; index < count; index += 1) {
    const day = Math.round(index * step) + 1;
    labels.add(Math.min(day, daysInMonth));
  }

  return Array.from(labels).sort((a, b) => a - b).map((day) => day.toString());
}

function buildMonthlySeries(uploads: Artwork[], reference: Date): MonthlySeries {
  // 使用上海时区格式化参考日期，确保时区一致
  const referenceDateStr = formatISODateInShanghai(reference);
  if (!referenceDateStr) {
    // 如果格式化失败，使用本地时区作为fallback
    const year = reference.getFullYear();
    const monthIndex = reference.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return {
      path: `M0 ${MONTHLY_CHART_HEIGHT - MONTHLY_CHART_BOTTOM_PADDING} L ${MONTHLY_CHART_WIDTH} ${MONTHLY_CHART_HEIGHT - MONTHLY_CHART_BOTTOM_PADDING}`,
      labels: generateMonthlyLabels(daysInMonth),
      hasData: false,
      points: [],
      defaultHintIndex: 0,
      year,
      monthIndex,
    };
  }
  
  const referenceParsed = parseISODateInShanghai(referenceDateStr);
  if (!referenceParsed) {
    const year = reference.getFullYear();
    const monthIndex = reference.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return {
      path: `M0 ${MONTHLY_CHART_HEIGHT - MONTHLY_CHART_BOTTOM_PADDING} L ${MONTHLY_CHART_WIDTH} ${MONTHLY_CHART_HEIGHT - MONTHLY_CHART_BOTTOM_PADDING}`,
      labels: generateMonthlyLabels(daysInMonth),
      hasData: false,
      points: [],
      defaultHintIndex: 0,
      year,
      monthIndex,
    };
  }
  
  const year = referenceParsed.getFullYear();
  const monthIndex = referenceParsed.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totals = new Array<number>(daysInMonth).fill(0);

  uploads.forEach((artwork) => {
    const dateKey = normalizeUploadedDate(artwork.uploadedDate ?? null, artwork.uploadedAt ?? null);
    if (!dateKey || !isValidISODate(dateKey)) {
      return;
    }
    // 验证日期格式并解析
    const [y, m, d] = dateKey.split("-").map(Number);
    // 验证日期有效性
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d) || d < 1 || d > daysInMonth) {
      return;
    }
    if (y !== year || m - 1 !== monthIndex || !d) {
      return;
    }
    const minutes = extractDurationMinutes(artwork);
    if (minutes <= 0) {
      return;
    }
    totals[d - 1] += minutes;
  });

  const maxMinutes = totals.length > 0 ? Math.max(...totals) : 0;
  const hasData = maxMinutes > 0;
  const safeMaxMinutes = hasData ? maxMinutes : 60;
  const chartHeight = MONTHLY_CHART_HEIGHT - MONTHLY_CHART_TOP_PADDING - MONTHLY_CHART_BOTTOM_PADDING;

  const points = totals.map((minutes, index) => {
    const x =
      totals.length > 1
        ? (index / (totals.length - 1)) * MONTHLY_CHART_WIDTH
        : MONTHLY_CHART_WIDTH / 2;
    const ratio = minutes / safeMaxMinutes;
    const y =
      MONTHLY_CHART_HEIGHT -
      MONTHLY_CHART_BOTTOM_PADDING -
      ratio * chartHeight;
    return { x, y, minutes, index };
  });

  const path =
    points.length > 0
      ? points
          .map((point, index) => {
            const command = `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
            return index === 0 ? `M ${command}` : `L ${command}`;
          })
          .join(" ")
      : `M0 ${MONTHLY_CHART_HEIGHT - MONTHLY_CHART_BOTTOM_PADDING} L ${MONTHLY_CHART_WIDTH} ${MONTHLY_CHART_HEIGHT - MONTHLY_CHART_BOTTOM_PADDING}`;

  let defaultHintIndex = points.length > 0 ? points.length - 1 : 0;
  if (hasData) {
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (points[index].minutes > 0) {
        defaultHintIndex = index;
        break;
      }
    }
  }

  const labeledPoints: MonthlySeriesPoint[] = points.map((point) => ({
    x: point.x,
    y: point.y,
    minutes: point.minutes,
    day: point.index + 1,
  }));

  return {
    path,
    labels: generateMonthlyLabels(daysInMonth),
    hasData,
    points: labeledPoints,
    defaultHintIndex,
    year,
    monthIndex,
  };
}

// Removed unused function: pickCoverGradient

// Removed unused functions: pickCoverImage, formatShortTermGoalSubtitle

function getShortTermGoalStatusText(goal: ShortTermGoal): string {
  if (goal.status === "active") {
    return "进行中";
  }
  if (goal.status === "saved") {
    return "未启动";
  }
  if (goal.status === "completed") {
    return "已达成";
  }
  return "";
}

function getShortTermGoalTodayTask(goal: ShortTermGoal): string {
  if (goal.status === "saved" || goal.status === "completed") {
    return "";
  }

  // 进行中状态，获取今日任务
  const sortedSchedule = [...goal.schedule].sort((a, b) => a.dayIndex - b.dayIndex);
  const firstWithTasks = sortedSchedule.find((day) => day.tasks.length > 0);

  if (!firstWithTasks || firstWithTasks.tasks.length === 0) {
    return "未安排任务";
  }

  if (goal.planType === "same") {
    const firstTask = firstWithTasks.tasks[0]?.title?.trim() || "未安排任务";
    return firstTask;
  }

  // 每日不同任务，需要找到当前应该执行的任务
  // 这里简化处理，返回第一个任务
  const firstTask = firstWithTasks.tasks[0]?.title?.trim() || "未安排任务";
  return firstTask;
}

// 获取短期目标的已完成打卡天数
function getShortTermGoalCompletedDays(
  goal: ShortTermGoal,
  goalTaskCompletions?: Record<number, Set<string>>
): number {
  if (goal.status === "saved") {
    return 0;
  }
  
  // 优先使用任务完成记录（按目标ID隔离）
  if (goalTaskCompletions && goalTaskCompletions[goal.id]) {
    return goalTaskCompletions[goal.id].size;
  }
  
  return 0;
}

function formatISODate(source: Date) {
  const shanghaiDate = formatISODateInShanghai(source);
  return shanghaiDate || "";
}

function normalizeUploadedDate(uploadedDate?: string | null, uploadedAt?: string | null) {
  return normalizeUploadedDateInShanghai(uploadedDate, uploadedAt);
}

function buildMonthSkeleton(reference: Date): GoalsCalendarDay[] {
  // 使用上海时区格式化参考日期，确保时区一致
  const referenceDateStr = formatISODateInShanghai(reference);
  if (!referenceDateStr) {
    // Fallback to local timezone
    const monthIndex = reference.getMonth();
    const year = reference.getFullYear();
    const firstOfMonth = new Date(year, monthIndex, 1);
    const firstWeekday = firstOfMonth.getDay();
    const displayStart = new Date(year, monthIndex, 1 - firstWeekday);
    const lastOfMonth = new Date(year, monthIndex + 1, 0);
    const lastWeekday = lastOfMonth.getDay();
    const displayEnd = new Date(year, monthIndex, lastOfMonth.getDate() + (6 - lastWeekday));
    const days: GoalsCalendarDay[] = [];
    let cursor = new Date(displayStart);
    while (cursor.getTime() <= displayEnd.getTime()) {
      days.push({
        date: formatISODate(cursor),
        day: cursor.getDate(),
        in_month: cursor.getMonth() === monthIndex,
        status: "none",
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return days;
  }
  
  const referenceParsed = parseISODateInShanghai(referenceDateStr);
  if (!referenceParsed) {
    // Fallback
    const monthIndex = reference.getMonth();
    const year = reference.getFullYear();
    const firstOfMonth = new Date(year, monthIndex, 1);
    const firstWeekday = firstOfMonth.getDay();
    const displayStart = new Date(year, monthIndex, 1 - firstWeekday);
    const lastOfMonth = new Date(year, monthIndex + 1, 0);
    const lastWeekday = lastOfMonth.getDay();
    const displayEnd = new Date(year, monthIndex, lastOfMonth.getDate() + (6 - lastWeekday));
    const days: GoalsCalendarDay[] = [];
    let cursor = new Date(displayStart);
    while (cursor.getTime() <= displayEnd.getTime()) {
      days.push({
        date: formatISODate(cursor),
        day: cursor.getDate(),
        in_month: cursor.getMonth() === monthIndex,
        status: "none",
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    return days;
  }
  
  const monthIndex = referenceParsed.getMonth();
  const year = referenceParsed.getFullYear();

  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstWeekday = firstOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
  const displayStart = new Date(year, monthIndex, 1 - firstWeekday);

  const lastOfMonth = new Date(year, monthIndex + 1, 0);
  const lastWeekday = lastOfMonth.getDay();
  const displayEnd = new Date(year, monthIndex, lastOfMonth.getDate() + (6 - lastWeekday));

  const days: GoalsCalendarDay[] = [];
  let cursor = new Date(displayStart);
  while (cursor.getTime() <= displayEnd.getTime()) {
    const dateStr = formatISODate(cursor);
    if (dateStr) {
      days.push({
        date: dateStr,
        day: cursor.getDate(),
        in_month: cursor.getMonth() === monthIndex,
        status: "none",
      });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return days;
}

function loadCachedLongTermGoal(): LongTermGoal | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const cached = window.sessionStorage.getItem(LONG_TERM_GOAL_CACHE_KEY);
    const timestamp = window.sessionStorage.getItem(LONG_TERM_GOAL_CACHE_TIMESTAMP_KEY);
    if (cached && timestamp) {
      const age = Date.now() - Number.parseInt(timestamp, 10);
      if (age < CACHE_MAX_AGE) {
        return JSON.parse(cached) as LongTermGoal;
      }
    }
  } catch {
    // ignore cache errors
  }
  return null;
}

function saveCachedLongTermGoal(goal: LongTermGoal | null) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (goal) {
      window.sessionStorage.setItem(LONG_TERM_GOAL_CACHE_KEY, JSON.stringify(goal));
      window.sessionStorage.setItem(LONG_TERM_GOAL_CACHE_TIMESTAMP_KEY, String(Date.now()));
    } else {
      window.sessionStorage.removeItem(LONG_TERM_GOAL_CACHE_KEY);
      window.sessionStorage.removeItem(LONG_TERM_GOAL_CACHE_TIMESTAMP_KEY);
    }
    // 注意：sessionStorage的storage事件只能在其他标签页中触发，当前页面不会收到
    // 如果需要跨标签页同步，应该使用BroadcastChannel API或自定义事件
    // 这里使用localStorage作为事件通道来触发跨标签页通知
    try {
      // 使用localStorage作为事件通道（只在同域的其他标签页间同步）
      const eventKey = `${LONG_TERM_GOAL_CACHE_KEY}-updated`;
      window.localStorage.setItem(eventKey, String(Date.now()));
      // 立即删除，避免localStorage堆积
      setTimeout(() => {
        try {
          window.localStorage.removeItem(eventKey);
        } catch {
          // ignore
        }
      }, 100);
    } catch {
      // 如果localStorage不可用，忽略跨标签页同步
    }
  } catch {
    // ignore cache errors
  }
}

function getCalendarCacheKey(year: number, month: number): string {
  return `${CALENDAR_CACHE_KEY_PREFIX}${year}-${month}`;
}

function getCalendarTimestampKey(year: number, month: number): string {
  return `${CALENDAR_CACHE_TIMESTAMP_KEY_PREFIX}${year}-${month}`;
}

function loadCachedCalendar(year: number, month: number): GoalsCalendarDay[] | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const cacheKey = getCalendarCacheKey(year, month);
    const timestampKey = getCalendarTimestampKey(year, month);
    const cached = window.sessionStorage.getItem(cacheKey);
    const timestamp = window.sessionStorage.getItem(timestampKey);
    if (cached && timestamp) {
      const age = Date.now() - Number.parseInt(timestamp, 10);
      if (age < CALENDAR_CACHE_MAX_AGE) {
        return JSON.parse(cached) as GoalsCalendarDay[];
      }
    }
  } catch {
    // ignore cache errors
  }
  return null;
}

function saveCachedCalendar(year: number, month: number, days: GoalsCalendarDay[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const cacheKey = getCalendarCacheKey(year, month);
    const timestampKey = getCalendarTimestampKey(year, month);
    window.sessionStorage.setItem(cacheKey, JSON.stringify(days));
    window.sessionStorage.setItem(timestampKey, String(Date.now()));
  } catch {
    // ignore cache errors
  }
}


// 短期目标相关的缓存和状态管理已移动到 useShortTermGoals hook

function Goals() {
  // Removed unused state: range, setRange
  const [showWizard, setShowWizard] = useState(false);
  const [editingGoal, setEditingGoal] = useState<ShortTermGoal | null>(null);
  const [showLongTermSetup, setShowLongTermSetup] = useState(false);
  const [showLongTermMetaEdit, setShowLongTermMetaEdit] = useState(false);
  // 初始化长期目标：先从缓存加载，避免闪烁
  const [longTermGoal, setLongTermGoal] = useState<LongTermGoal | null>(() => {
    return loadCachedLongTermGoal();
  });
  const [longTermLoading, setLongTermLoading] = useState(false);
  const [longTermError, setLongTermError] = useState<string | null>(null);
  const [longTermRetryable, setLongTermRetryable] = useState(true);
  const [activeLongTermGoal, setActiveLongTermGoal] = useState<LongTermGoal | null>(null);
  const [completedLongTermGoals, setCompletedLongTermGoals] = useState<LongTermGoal[]>([]);
  const [completedLongTermLoading, setCompletedLongTermLoading] = useState(false);
  const [completedLongTermError, setCompletedLongTermError] = useState<string | null>(null);
  
  // 初始化打卡日历：先从缓存加载，避免闪烁
  const [_calendarDays, setCalendarDays] = useState<GoalsCalendarDay[]>(() => {
    const now = new Date();
    const todayStr = formatISODateInShanghai(now);
    if (todayStr) {
      const parsed = parseISODateInShanghai(todayStr);
      if (parsed) {
        const year = parsed.getFullYear();
        const month = parsed.getMonth() + 1;
        const cached = loadCachedCalendar(year, month);
        if (cached) {
          return cached;
        }
      }
    }
    // 如果没有缓存，返回骨架数据
    const month = new Date(now.getFullYear(), now.getMonth(), 1);
    return buildMonthSkeleton(month);
  });
  const [_calendarLoading, setCalendarLoading] = useState(false);
  const [_calendarError, setCalendarError] = useState<string | null>(null);
  const [activeMonth, _setActiveMonth] = useState(() => {
    // 使用上海时区的当前日期
    const todayStr = formatISODateInShanghai(new Date());
    if (todayStr) {
      const parsed = parseISODateInShanghai(todayStr);
      if (parsed) {
        return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
      }
    }
    // Fallback
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [uploads, setUploads] = useState<Artwork[]>([]);
  const [activeGoalDetail, setActiveGoalDetail] = useState<ShortTermGoal | null>(null);
  const [_monthlyHoverIndex, setMonthlyHoverIndex] = useState<number | null>(null);
  const [_monthlySelectedIndex, setMonthlySelectedIndex] = useState<number | null>(null);
  const [_monthlyPointerActive, _setMonthlyPointerActive] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);
  const [showCompletedLongTermGoals, setShowCompletedLongTermGoals] = useState(false);
  const [showCompletedShortTermGoals, setShowCompletedShortTermGoals] = useState(false);
  const [showFinalCheckpointImageModal, setShowFinalCheckpointImageModal] = useState(false);
  const [completingGoal, setCompletingGoal] = useState<LongTermGoal | null>(null);
  const [completedShortTermGoalsPage, setCompletedShortTermGoalsPage] = useState(1);
  // 存储每个目标的任务完成记录（按目标ID索引）
  const [goalTaskCompletions, setGoalTaskCompletions] = useState<Record<number, Set<string>>>({});

  // 使用自定义 hooks 管理短期目标和打卡记录
  const {
    goals: shortTermGoals,
    loading: shortTermLoading,
    error: shortTermError,
    addGoal,
    removeGoal,
    updateGoal,
  } = useShortTermGoals();

  const {
    checkInDates: localUploadDates,
    refreshCheckInDates,
    addCheckInDate,
  } = useCheckInDates();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthChange = () => {
      setAuthVersion((prev) => prev + 1);
    };

    // 处理多标签页缓存同步
    const handleStorageChange = (event: StorageEvent) => {
      // 如果其他标签页更新了缓存，清除当前缓存并重新加载
      if (
        event.key === LONG_TERM_GOAL_CACHE_KEY ||
        event.key === LONG_TERM_GOAL_CACHE_TIMESTAMP_KEY
      ) {
        // 触发重新加载
        setAuthVersion((prev) => prev + 1);
      }
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const hasLongTermGoal = Boolean(longTermGoal);

  // 获取上海时区的当前日期用于统计
  const todayInShanghai = useMemo(() => {
    // 使用formatISODateInShanghai获取今天的日期字符串，然后解析为Date对象
    const todayStr = formatISODateInShanghai(new Date());
    if (todayStr) {
      const parsed = parseISODateInShanghai(todayStr);
      return parsed || new Date();
    }
    return new Date();
  }, []);

  // Removed unused: weeklyStats, monthlyHint
  const monthlySeries = useMemo(() => buildMonthlySeries(uploads, todayInShanghai), [uploads, todayInShanghai]);

  useEffect(() => {
    setMonthlyHoverIndex(null);
    setMonthlySelectedIndex(null);
  }, [monthlySeries.year, monthlySeries.monthIndex, monthlySeries.points.length]);

  // Removed unused: updateMonthlyHoverIndex

  // Removed unused handlers: handleMonthlyPointerDown, handleMonthlyPointerMove, endMonthlyPointerInteraction, handleMonthlyPointerLeave

  const reloadLongTermGoal = useCallback(async () => {
    if (!hasAuthToken()) {
      setLongTermGoal(null);
      setLongTermError("登录后可同步长期目标。");
      setLongTermRetryable(false);
      return;
    }

    setLongTermLoading(true);
    try {
      const goal = await fetchLongTermGoal();
      setLongTermGoal(goal);
      setLongTermError(null);
      setLongTermRetryable(true);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        setLongTermGoal(null);
        setLongTermError("登录后可同步长期目标。");
        setLongTermRetryable(false);
      } else {
        console.warn("Failed to load long-term goal", error);
        setLongTermGoal(null);
        setLongTermError("获取长期目标失败，请稍后重试。");
        setLongTermRetryable(true);
      }
    } finally {
      setLongTermLoading(false);
    }
  }, []);

  const refreshUploadData = useCallback(() => {
    const stored = loadStoredArtworks();
    setUploads(stored);
  }, []);

  // 计算目标的日期范围辅助函数
  const getGoalDateRange = useCallback((goal: ShortTermGoal): { startDate: Date; endDate: Date } | null => {
    if (!goal.createdAt) {
      return null;
    }

    const startDateStr = formatISODateInShanghai(goal.createdAt);
    if (!startDateStr) {
      return null;
    }

    const parsedStart = parseISODateInShanghai(startDateStr);
    if (!parsedStart) {
      return null;
    }

    parsedStart.setHours(0, 0, 0, 0);
    const endDate = new Date(parsedStart);
    endDate.setDate(endDate.getDate() + goal.durationDays - 1);
    endDate.setHours(23, 59, 59, 999);

    return { startDate: parsedStart, endDate };
  }, []);

  // 初始化时刷新上传数据和打卡记录
  useEffect(() => {
    refreshUploadData();
    refreshCheckInDates();
  }, [refreshUploadData, refreshCheckInDates]);

  // 使用目标ID数组作为稳定依赖，避免因数组引用变化导致重复请求
  // 创建稳定的依赖键：使用所有目标的ID和状态组合
  const goalsDependencyKey = useMemo(() => {
    return shortTermGoals
      .map((g) => `${g.id}-${g.status}`)
      .sort()
      .join(',');
  }, [shortTermGoals]);

  const activeGoalIds = useMemo(() => {
    return shortTermGoals
      .filter((goal) => goal.status === "active")
      .map((goal) => goal.id)
      .sort((a, b) => a - b); // 排序确保顺序一致
  }, [goalsDependencyKey]);

  // 使用 ref 跟踪正在进行的请求和请求缓存，避免重复请求
  const loadingRequestsRef = useRef<Set<number>>(new Set());
  const requestCacheRef = useRef<Map<number, { timestamp: number; promise: Promise<any> }>>(new Map());
  const CACHE_DURATION = 3000; // 3秒内的重复请求使用缓存

  // 当短期目标列表变化时，为每个目标加载任务完成记录
  useEffect(() => {
    if (activeGoalIds.length === 0) {
      // 清除已完成目标的任务完成记录
      setGoalTaskCompletions({});
      return;
    }

    let cancelled = false;

    // 并行加载所有目标的任务完成记录
    const loadPromises = activeGoalIds.map(async (goalId) => {
      if (cancelled) return;
      
      // 检查是否正在加载中
      if (loadingRequestsRef.current.has(goalId)) {
        return;
      }

      // 检查缓存
      const cached = requestCacheRef.current.get(goalId);
      const now = Date.now();
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        // 使用缓存的请求
        try {
          await cached.promise;
        } catch {
          // 忽略缓存请求的错误，因为可能已经在处理新的请求
        }
        return;
      }

      // 标记为正在加载
      loadingRequestsRef.current.add(goalId);
      
      try {
        const requestPromise = fetchShortTermGoalTaskCompletions(goalId);
        // 缓存请求
        requestCacheRef.current.set(goalId, {
          timestamp: now,
          promise: requestPromise,
        });

        const data = await requestPromise;
        if (cancelled) return;
        
        // 提取完成日期
        const completions = data.completions || {};
        const completedDates = new Set<string>();
        
        Object.keys(completions).forEach((dateKey) => {
          const tasks = completions[dateKey];
          // 如果有任务完成记录，说明这一天已经完成了
          if (tasks && Object.keys(tasks).length > 0) {
            const normalizedDateKey = formatISODateInShanghai(dateKey) || dateKey;
            completedDates.add(normalizedDateKey);
            // 如果标准化后的日期键与原始不同，也添加原始格式
            if (normalizedDateKey !== dateKey) {
              completedDates.add(dateKey);
            }
          }
        });
        
        if (!cancelled) {
          setGoalTaskCompletions((prev) => ({
            ...prev,
            [goalId]: completedDates,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(`[Goals] Failed to load task completions for goal ${goalId}`, error);
          // 如果加载失败，设置为空集合
          setGoalTaskCompletions((prev) => ({
            ...prev,
            [goalId]: new Set<string>(),
          }));
        }
      } finally {
        // 移除加载标记
        loadingRequestsRef.current.delete(goalId);
      }
    });

    Promise.all(loadPromises).catch((error) => {
      if (!cancelled) {
        console.warn("[Goals] Failed to load some task completions", error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeGoalIds.join(',')]); // 使用字符串化的ID数组作为依赖，更稳定

  // 监听跨标签页的缓存更新（用于同步数据）
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorageChange = (event: StorageEvent) => {
      // 监听localStorage的变化（用于跨标签页同步）
      if (event.key === `${LONG_TERM_GOAL_CACHE_KEY}-updated`) {
        // 长期目标缓存已更新，清除本地缓存并重新加载
        try {
          window.sessionStorage.removeItem(LONG_TERM_GOAL_CACHE_KEY);
          window.sessionStorage.removeItem(LONG_TERM_GOAL_CACHE_TIMESTAMP_KEY);
        } catch {
          // ignore
        }
        // 重新加载长期目标
        reloadLongTermGoal();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [reloadLongTermGoal]);

  useEffect(() => {
    let active = true;

    async function loadInitialLongTermGoal() {
      // 初始化时已经从缓存加载了，这里只需要在后台更新
      // 如果缓存存在，不显示加载状态
      const cached = loadCachedLongTermGoal();
      
      // 验证缓存数据的有效性
      if (cached) {
        const targetHours = cached.targetHours ?? 0;
        const checkpointCount = cached.checkpointCount ?? 0;
        // 如果缓存数据不完整（targetHours或checkpointCount为0），清除缓存
        if (targetHours <= 0 || checkpointCount <= 0) {
          saveCachedLongTermGoal(null);
          setLongTermGoal(null);
          setLongTermLoading(true);
        } else {
          // 缓存数据有效，不显示加载状态
        }
      } else {
        setLongTermLoading(true);
      }

      try {
        if (!hasAuthToken()) {
          setLongTermGoal(null);
          setLongTermError("登录后可同步长期目标。");
          setLongTermRetryable(false);
          saveCachedLongTermGoal(null);
          return;
        }

        const goal = await fetchLongTermGoal();
        if (!active) {
          return;
        }
        
        // 验证从服务器获取的数据有效性
        if (goal) {
          const targetHours = goal.targetHours ?? 0;
          const checkpointCount = goal.checkpointCount ?? 0;
          // 如果数据不完整，不保存到状态和缓存
          if (targetHours <= 0 || checkpointCount <= 0) {
            setLongTermGoal(null);
            setLongTermError(null);
            setLongTermRetryable(true);
            saveCachedLongTermGoal(null);
          } else {
            setLongTermGoal(goal);
            setLongTermError(null);
            setLongTermRetryable(true);
            saveCachedLongTermGoal(goal);
          }
        } else {
          setLongTermGoal(null);
          setLongTermError(null);
          setLongTermRetryable(true);
          saveCachedLongTermGoal(null);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          setLongTermGoal(null);
          setLongTermError("登录后可同步长期目标。");
          setLongTermRetryable(false);
          saveCachedLongTermGoal(null);
        } else {
          console.warn("Failed to load long-term goal", error);
          // 如果出错但有缓存，验证缓存有效性
          const validCached = cached && (cached.targetHours ?? 0) > 0 && (cached.checkpointCount ?? 0) > 0;
          if (!validCached) {
            setLongTermGoal(null);
            setLongTermError("获取长期目标失败，请稍后重试。");
            saveCachedLongTermGoal(null);
          } else {
            setLongTermError(null);
          }
          setLongTermRetryable(true);
        }
      } finally {
        if (active) {
          setLongTermLoading(false);
        }
      }
    }

    loadInitialLongTermGoal();

    return () => {
      active = false;
    };
  }, [authVersion]);

  // 短期目标加载已由 useShortTermGoals hook 管理

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== USER_ARTWORK_STORAGE_KEY) {
        return;
      }
      refreshUploadData();
      // 清除当前月的日历缓存，确保下次加载时获取最新数据
      const now = new Date();
      const todayStr = formatISODateInShanghai(now);
      if (todayStr) {
        const parsed = parseISODateInShanghai(todayStr);
        if (parsed) {
          const year = parsed.getFullYear();
          const month = parsed.getMonth() + 1;
          const cacheKey = getCalendarCacheKey(year, month);
          const timestampKey = getCalendarTimestampKey(year, month);
          try {
            window.sessionStorage.removeItem(cacheKey);
            window.sessionStorage.removeItem(timestampKey);
          } catch {
            // ignore
          }
          // 如果当前显示的就是当前月，立即刷新
          if (activeMonth.getFullYear() === year && activeMonth.getMonth() + 1 === month) {
            setAuthVersion((prev) => prev + 1);
          }
        }
      }
    };

    const handleArtworksChanged = () => {
      refreshUploadData();
      // 清除当前月的日历缓存，确保下次加载时获取最新数据
      const now = new Date();
      const todayStr = formatISODateInShanghai(now);
      if (todayStr) {
        const parsed = parseISODateInShanghai(todayStr);
        if (parsed) {
          const year = parsed.getFullYear();
          const month = parsed.getMonth() + 1;
          const cacheKey = getCalendarCacheKey(year, month);
          const timestampKey = getCalendarTimestampKey(year, month);
          try {
            window.sessionStorage.removeItem(cacheKey);
            window.sessionStorage.removeItem(timestampKey);
          } catch {
            // ignore
          }
          // 如果当前显示的就是当前月，立即刷新
          if (activeMonth.getFullYear() === year && activeMonth.getMonth() + 1 === month) {
            setAuthVersion((prev) => prev + 1);
          }
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    };
  }, [refreshUploadData, activeMonth]);

  // 加载已完成的长期目标列表（进入已完成页面时触发）
  useEffect(() => {
    if (!showCompletedLongTermGoals) {
      return;
    }
    let active = true;
    setCompletedLongTermLoading(true);
    setCompletedLongTermError(null);
    fetchCompletedLongTermGoals()
      .then((goals) => {
        if (!active) return;
        setCompletedLongTermGoals(goals);
      })
      .catch((error) => {
        if (!active) return;
        console.error("[Goals] Failed to load completed long-term goals", error);
        setCompletedLongTermError("获取已完成的长期目标失败，请稍后重试。");
        setCompletedLongTermGoals([]);
      })
      .finally(() => {
        if (active) {
          setCompletedLongTermLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [showCompletedLongTermGoals]);

  useEffect(() => {
    let isMounted = true;

    async function loadCalendar(year: number, month: number) {
      if (!hasAuthToken()) {
        setCalendarDays([]);
        setCalendarError("登录后可查看打卡记录。");
        return;
      }

      // 先尝试从缓存加载，避免闪烁
      const cached = loadCachedCalendar(year, month);
      if (cached && isMounted) {
        setCalendarDays(cached);
        setCalendarError(null);
        setCalendarLoading(false);
      } else {
        setCalendarLoading(true);
      }

      try {
        const data = await fetchGoalsCalendar({ year, month });
        if (!isMounted) {
          return;
        }
        setCalendarDays(data.days);
        setCalendarError(null);
        // 保存到缓存
        saveCachedCalendar(year, month, data.days);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          setCalendarDays([]);
          setCalendarError("登录后可查看打卡记录。");
        } else {
          console.warn("Failed to load goals calendar", error);
          // 如果加载失败但有缓存，保持使用缓存
          if (!cached) {
            setCalendarDays([]);
            setCalendarError("获取打卡记录失败，请稍后重试。");
          } else {
            setCalendarError(null);
          }
        }
      } finally {
        if (isMounted) {
          setCalendarLoading(false);
        }
      }
    }

    loadCalendar(activeMonth.getFullYear(), activeMonth.getMonth() + 1);

    return () => {
      isMounted = false;
    };
  }, [activeMonth, authVersion]);

  // Removed unused: mergedCalendarDays

  const handleWizardClose = useCallback(() => {
    setShowWizard(false);
    setEditingGoal(null);
  }, []);

  const handleGoalSaved = useCallback(
    (goal: ShortTermGoal) => {
      // 如果是编辑模式，更新目标；否则添加新目标
      if (editingGoal && goal.id === editingGoal.id) {
        updateGoal(goal);
        setEditingGoal(null);
      } else {
        addGoal(goal);
      }
    },
    [addGoal, updateGoal, editingGoal]
  );

  const handleLongTermSaved = useCallback(
    (goal: LongTermGoal) => {
      setLongTermGoal(goal);
      setLongTermError(null);
      setShowLongTermSetup(false);
      setActiveLongTermGoal(goal);
      saveCachedLongTermGoal(goal);
    },
    [],
  );

  const handleLongTermMetaSaved = useCallback(
    (goal: LongTermGoal) => {
      setLongTermGoal(goal);
      setLongTermError(null);
      setShowLongTermMetaEdit(false);
      setActiveLongTermGoal(goal);
      saveCachedLongTermGoal(goal);
    },
    [],
  );

  const handleCloseLongTermDetails = useCallback(() => {
    setActiveLongTermGoal(null);
  }, []);


  const handleSelectShowcase = useCallback(
    async (checkpoint: LongTermGoalCheckpoint, artworkId?: number) => {
      if (!longTermGoal) return;
      try {
        const updatedGoal = await updateCheckpoint({
          checkpointIndex: checkpoint.index,
          uploadId: artworkId ?? null,
        });
        setLongTermGoal(updatedGoal);
        if (activeLongTermGoal) {
          setActiveLongTermGoal(updatedGoal);
        }
        saveCachedLongTermGoal(updatedGoal);
      } catch (error) {
        console.error("Failed to update checkpoint showcase", error);
        setLongTermError("更新检查点展示图片失败，请稍后重试");
      }
    },
    [longTermGoal, activeLongTermGoal],
  );

  const handleAddMessage = useCallback(
    async (checkpoint: LongTermGoalCheckpoint, message: string) => {
      if (!longTermGoal) return;
      try {
        const updatedGoal = await updateCheckpoint({
          checkpointIndex: checkpoint.index,
          completionNote: message || null,
        });
        setLongTermGoal(updatedGoal);
        if (activeLongTermGoal) {
          setActiveLongTermGoal(updatedGoal);
        }
        saveCachedLongTermGoal(updatedGoal);
      } catch (error) {
        console.error("Failed to update checkpoint message", error);
        setLongTermError("更新检查点留言失败，请稍后重试");
      }
    },
    [longTermGoal, activeLongTermGoal],
  );

  const handleFinalCheckpointImageSelect = useCallback(
    async (artworkId: number) => {
      if (!completingGoal) return;
      
      // 找到最后一个检查点
      const checkpoints = completingGoal.checkpoints ?? [];
      const lastCheckpoint = checkpoints[checkpoints.length - 1];
      
      if (!lastCheckpoint) return;
      
      try {
        const updatedGoal = await updateCheckpoint({
          checkpointIndex: lastCheckpoint.index,
          uploadId: artworkId,
        });
        setLongTermGoal(updatedGoal);
        saveCachedLongTermGoal(updatedGoal);
        
        // 关闭弹窗，打开详情页，并设置自动滚动标志
        setShowFinalCheckpointImageModal(false);
        setActiveLongTermGoal({ ...updatedGoal, _scrollToLastCheckpoint: true } as LongTermGoal & { _scrollToLastCheckpoint?: boolean });
        setCompletingGoal(null);
      } catch (error) {
        console.error("Failed to update final checkpoint showcase", error);
        setLongTermError("更新最后检查点图片失败，请稍后重试");
      }
    },
    [completingGoal],
  );

  const handleGoalComplete = useCallback(
    async (dateKey: string) => {
      if (!isValidISODate(dateKey)) {
        console.error("[Goals] Invalid date format in handleGoalComplete", dateKey);
        return;
      }

      // 立即更新打卡记录状态
      addCheckInDate(dateKey);

      // 清除该日期所在月份的日历缓存，确保下次加载时获取最新数据
      try {
        const parsed = parseISODateInShanghai(dateKey);
        if (parsed) {
          const year = parsed.getFullYear();
          const month = parsed.getMonth() + 1;
          const cacheKey = getCalendarCacheKey(year, month);
          const timestampKey = getCalendarTimestampKey(year, month);
          window.sessionStorage.removeItem(cacheKey);
          window.sessionStorage.removeItem(timestampKey);
          // 如果当前显示的就是该月份，立即刷新
          if (activeMonth.getFullYear() === year && activeMonth.getMonth() + 1 === month) {
            setAuthVersion((prev) => prev + 1);
          }
        }
      } catch {
        // ignore
      }

      // 刷新打卡记录和任务完成记录，确保与服务器同步
      try {
        const dateRange = activeGoalDetail ? getGoalDateRange(activeGoalDetail) : null;
        if (dateRange) {
          await refreshCheckInDates(dateRange);
        } else {
          await refreshCheckInDates();
        }
        
        // 如果有关联的目标，刷新该目标的任务完成记录
        if (activeGoalDetail) {
          try {
            const data = await fetchShortTermGoalTaskCompletions(activeGoalDetail.id);
            const completions = data.completions || {};
            const completedDates = new Set<string>();
            
            Object.keys(completions).forEach((dateKey) => {
              const tasks = completions[dateKey];
              if (tasks && Object.keys(tasks).length > 0) {
                const normalizedDateKey = formatISODateInShanghai(dateKey) || dateKey;
                completedDates.add(normalizedDateKey);
                if (normalizedDateKey !== dateKey) {
                  completedDates.add(dateKey);
                }
              }
            });
            
            setGoalTaskCompletions((prev) => ({
              ...prev,
              [activeGoalDetail.id]: completedDates,
            }));
          } catch (error) {
            console.warn("[Goals] Failed to refresh task completions after goal completion", error);
          }
        }
      } catch (error) {
        console.error("[Goals] Failed to refresh check-in dates after goal completion", error);
      }
    },
    [activeGoalDetail, addCheckInDate, refreshCheckInDates, getGoalDateRange, activeMonth]
  );

  const handleGoalClose = useCallback(() => {
    // 关闭时刷新打卡记录，确保状态同步
    const dateRange = activeGoalDetail ? getGoalDateRange(activeGoalDetail) : null;
    if (dateRange) {
      refreshCheckInDates(dateRange);
    } else {
      refreshCheckInDates();
    }
    setActiveGoalDetail(null);
  }, [activeGoalDetail, refreshCheckInDates, getGoalDateRange]);

  const handleGoalDeleted = useCallback(
    (goalId: number) => {
      removeGoal(goalId);
      // 清除该目标的任务完成记录
      setGoalTaskCompletions((prev) => {
        const next = { ...prev };
        delete next[goalId];
        return next;
      });
    },
    [removeGoal]
  );

  const handleGoalOpen = useCallback(
    async (goal: ShortTermGoal) => {
      // 根据状态打开不同的详情页面
      if (goal.status === "saved") {
        // 已保存未进行状态，打开保存详情页面
        setActiveGoalDetail(goal);
        return;
      }
      // 进行中或已完成状态，打开原有详情页面
      const dateRange = getGoalDateRange(goal);
      if (dateRange) {
        await refreshCheckInDates(dateRange);
      } else {
        await refreshCheckInDates();
      }
      setActiveGoalDetail(goal);
    },
    [refreshCheckInDates, getGoalDateRange]
  );

  // 优化：只传递该目标自己的完成日期，使用任务完成记录（按目标ID隔离）
  // 注意：这个 hook 必须在所有早期返回之前调用，遵守 React Hooks 规则
  const filteredUploadDates = useMemo(() => {
    if (!activeGoalDetail?.id) {
      return new Set<string>();
    }
    
    // 使用该目标的任务完成记录
    const completedDates = goalTaskCompletions[activeGoalDetail.id];
    if (!completedDates) {
      return new Set<string>();
    }
    
    // 只返回在打卡记录中存在的日期（用于验证）
    const filtered = new Set<string>();
    completedDates.forEach((dateKey) => {
      if (localUploadDates.has(dateKey)) {
        filtered.add(dateKey);
      }
    });
    
    return filtered;
  }, [localUploadDates, activeGoalDetail?.id, goalTaskCompletions]);

  if (showLongTermMetaEdit && longTermGoal) {
    return (
      <LongTermGoalSetup
        mode="edit-meta"
        onClose={() => setShowLongTermMetaEdit(false)}
        onSaved={handleLongTermMetaSaved}
        initialGoal={longTermGoal}
      />
    );
  }

  if (activeLongTermGoal) {
    // 验证数据完整性，确保 progress 和 checkpoints 存在
    const safeGoal: LongTermGoal = {
      ...activeLongTermGoal,
      progress: activeLongTermGoal.progress ?? {
        spentMinutes: 0,
        spentHours: 0,
        progressRatio: 0,
        progressPercent: 0,
        targetHours: activeLongTermGoal.targetHours,
        elapsedDays: 0,
        completedCheckpoints: 0,
        totalCheckpoints: activeLongTermGoal.checkpointCount,
        nextCheckpoint: null,
        startedDate: activeLongTermGoal.startedAt,
      },
      checkpoints: activeLongTermGoal.checkpoints ?? [],
    };

    return (
      <ErrorBoundary
        fallback={
          <div className="goals-card goals-card--error" style={{ margin: "1rem" }}>
            <p className="goals-card__error-text">长期目标详情渲染失败。</p>
            <button
              type="button"
              className="goals-card__retry"
              onClick={handleCloseLongTermDetails}
            >
              返回
            </button>
          </div>
        }
        onError={(error) => {
          if (typeof console !== "undefined" && typeof console.error === "function") {
            console.error("[Goals] LongTermGoalDetails render failed:", error, {
              goal: activeLongTermGoal,
            });
          }
        }}
      >
        <LongTermGoalDetails
          goal={safeGoal}
          onClose={handleCloseLongTermDetails}
          onEdit={() => {
            setActiveLongTermGoal(null);
            setShowLongTermMetaEdit(true);
          }}
          onSelectShowcase={handleSelectShowcase}
          onAddMessage={handleAddMessage}
          onComplete={async (completedGoal) => {
            // 完成长期目标后，先跳转到已完成目标页面
            // 注意：此时不立即清除目标，以便在已完成页面能正确显示
            setActiveLongTermGoal(null);
            setShowCompletedLongTermGoals(true);
          }}
        />
      </ErrorBoundary>
    );
  }

  if (activeGoalDetail) {
    // 根据状态显示不同的详情页面
    if (activeGoalDetail.status === "saved") {
      return (
        <ShortTermGoalSavedDetails
          goal={activeGoalDetail}
          onClose={handleGoalClose}
          onStart={(updatedGoal) => {
            // 启动成功后更新目标列表并关闭详情页
            updateGoal(updatedGoal);
            handleGoalClose();
          }}
          onEdit={(goal) => {
            // 打开编辑模式
            setActiveGoalDetail(null);
            setShowWizard(true);
            setEditingGoal(goal);
          }}
          onUpdated={(updatedGoal) => {
            // 更新目标列表（启动后状态变为active）
            updateGoal(updatedGoal);
          }}
          onDeleted={handleGoalDeleted}
        />
      );
    }
    return (
      <ShortTermGoalDetails
        goal={activeGoalDetail}
        onClose={handleGoalClose}
        uploadDates={filteredUploadDates}
        onComplete={handleGoalComplete}
        onDeleted={handleGoalDeleted}
      />
    );
  }

  if (showLongTermSetup) {
    return (
      <LongTermGoalSetup
        mode="create"
        onClose={() => setShowLongTermSetup(false)}
        onSaved={handleLongTermSaved}
        initialGoal={longTermGoal}
      />
    );
  }

  if (showWizard) {
    return (
      <NewChallengeWizard
        onClose={handleWizardClose}
        onSaved={handleGoalSaved}
        initialGoal={editingGoal}
        mode={editingGoal ? "edit" : "create"}
      />
    );
  }

  // 已完成目标列表页面
  if (showCompletedLongTermGoals || showCompletedShortTermGoals) {
    const type = showCompletedLongTermGoals ? "long-term" : "short-term";
    // 过滤出已完成的短期目标，并验证数据有效性
    const completedShortTermGoals = shortTermGoals
      .filter(goal => {
        // 验证目标数据有效性
        if (!goal || !goal.id) {
          return false;
        }
        // 只返回状态为completed的目标
        return goal.status === "completed";
      })
      .sort((a, b) => {
        // 按更新时间倒序排列（最新的在前）
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

    const goals = type === "long-term" 
      ? completedLongTermGoals
      : completedShortTermGoals;

    return (
      <div className="goals-screen">
        <div className="goals-screen__background">
          <div className="goals-screen__glow goals-screen__glow--mint" />
          <div className="goals-screen__glow goals-screen__glow--brown" />
        </div>

        <TopNav 
          title={type === "long-term" ? "已完成的长期目标" : "已完成的短期目标"}
          subtitle="Completed Goals"
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: () => {
              // 从已完成页面返回时，只关闭已完成目标列表，不删除当前进行中的目标
              setShowCompletedLongTermGoals(false);
              setShowCompletedShortTermGoals(false);
              // 重置分页
              setCompletedShortTermGoalsPage(1);
            },
          }}
        />

        <main className="goals-screen__content">
          {type === "long-term" && completedLongTermLoading ? (
            <div className="goals-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <p style={{ color: "rgba(239, 234, 231, 0.6)", margin: 0 }}>
                加载已完成的长期目标中...
              </p>
            </div>
          ) : type === "long-term" && completedLongTermError ? (
            <div className="goals-card goals-card--error" style={{ padding: "1.5rem" }}>
              <p className="goals-card__error-text">{completedLongTermError}</p>
            </div>
          ) : type === "short-term" && shortTermLoading ? (
            <div className="goals-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <p style={{ color: "rgba(239, 234, 231, 0.6)", margin: 0 }}>
                加载已完成的短期目标中...
              </p>
            </div>
          ) : type === "short-term" && shortTermError ? (
            <div className="goals-card goals-card--error" style={{ padding: "1.5rem" }}>
              <p className="goals-card__error-text">{shortTermError}</p>
            </div>
          ) : goals.length === 0 ? (
            <div className="goals-card" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <p style={{ color: "rgba(239, 234, 231, 0.6)", margin: 0 }}>
                暂无已完成的目标
              </p>
            </div>
          ) : (
            <>
              {type === "short-term" ? (
                (() => {
                  const ITEMS_PER_PAGE = 10;
                  const totalPages = Math.ceil(goals.length / ITEMS_PER_PAGE);
                  const currentPage = completedShortTermGoalsPage;
                  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
                  const endIndex = startIndex + ITEMS_PER_PAGE;
                  const paginatedGoals = goals.slice(startIndex, endIndex);
                  
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                      <div className="goals-carousel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        {paginatedGoals.map((goal) => {
                          const shortTerm = goal as ShortTermGoal;
                          // 验证短期目标数据有效性
                          if (!shortTerm || !shortTerm.id || !shortTerm.title) {
                            return null; // 跳过无效数据
                          }
                          
                          const statusText = getShortTermGoalStatusText(shortTerm);
                          // 使用任务完成记录计算完成天数
                          const completedDays = getShortTermGoalCompletedDays(shortTerm, goalTaskCompletions);
                          const durationDays = shortTerm.durationDays ?? 0;
                          const progressPercent = durationDays > 0 
                            ? Math.min(Math.round((completedDays / durationDays) * 100), 100)
                            : 0;
                          const boxCount = durationDays;
                          // 获取启动日期：已完成的目标使用创建日期作为启动日期
                          const startDate = shortTerm.createdAt;
                          const startDateFormatted = formatDateYYYYMMDD(startDate);
                          
                          return (
                            <button
                              key={shortTerm.id}
                              type="button"
                              className="goals-card goals-card--primary goals-card--actionable goals-card--short-term"
                              onClick={() => {
                                handleGoalOpen(shortTerm);
                                setShowCompletedShortTermGoals(false);
                              }}
                            >
                              <div className="goals-short-term__header">
                                <p className="goals-short-term__title">{shortTerm.title}</p>
                                <p className="goals-short-term__status">{statusText}</p>
                              </div>
                              <div className="goals-short-term__content">
                                <div className="goals-short-term__boxes">
                                  {Array.from({ length: boxCount }).map((_, index) => {
                                    const isCompleted = index < completedDays;
                                    return (
                                      <div
                                        key={index}
                                        className={`goals-short-term__box ${isCompleted ? 'goals-short-term__box--completed' : ''}`}
                                      />
                                    );
                                  })}
                                </div>
                                <div className="goals-short-term__summary">
                                  <p className="goals-short-term__caption">
                                    {startDateFormatted} {completedDays} / {durationDays} 天
                                  </p>
                                  <p className="goals-short-term__percent">{progressPercent}%</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      
                      {totalPages > 1 && (
                        <div style={{ 
                          display: "flex", 
                          justifyContent: "center", 
                          alignItems: "center", 
                          gap: "1rem",
                          padding: "1rem 0"
                        }}>
                          <button
                            type="button"
                            onClick={() => setCompletedShortTermGoalsPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            style={{
                              padding: "0.5rem 1rem",
                              backgroundColor: currentPage === 1 ? "rgba(239, 234, 231, 0.1)" : "rgba(152, 219, 198, 0.2)",
                              color: currentPage === 1 ? "rgba(239, 234, 231, 0.4)" : "#98dbc6",
                              border: "1px solid rgba(239, 234, 231, 0.12)",
                              borderRadius: "0.5rem",
                              cursor: currentPage === 1 ? "not-allowed" : "pointer",
                              fontSize: "0.9rem",
                            }}
                          >
                            上一页
                          </button>
                          <span style={{ 
                            color: "rgba(239, 234, 231, 0.7)",
                            fontSize: "0.9rem"
                          }}>
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCompletedShortTermGoalsPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            style={{
                              padding: "0.5rem 1rem",
                              backgroundColor: currentPage === totalPages ? "rgba(239, 234, 231, 0.1)" : "rgba(152, 219, 198, 0.2)",
                              color: currentPage === totalPages ? "rgba(239, 234, 231, 0.4)" : "#98dbc6",
                              border: "1px solid rgba(239, 234, 231, 0.12)",
                              borderRadius: "0.5rem",
                              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                              fontSize: "0.9rem",
                            }}
                          >
                            下一页
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {goals.map((goal) => {
                if (type === "long-term") {
                  const longTerm = goal as LongTermGoal;
                  const progress = longTerm.progress ?? {
                    progressPercent: 0,
                    spentHours: 0,
                    elapsedDays: 0,
                    completedCheckpoints: 0,
                    totalCheckpoints: 0,
                  };
                  const progressPercent = 100; // 已完成目标进度条为100%
                  const spentHours = progress.spentHours;
                  const targetHours = longTerm.targetHours;
                  const spentLabel = `${formatHours(spentHours)}h`;
                  const targetLabel = `${formatHours(targetHours)}h`;
                  const startDateLabel = formatDateLabel(longTerm.startedAt);
                  const checkpointSummary = `${progress.completedCheckpoints}/${progress.totalCheckpoints}`;
                  const progressLabel = `${spentLabel} / ${targetLabel}`;
                  const showLabelInside = progressPercent >= 50; // 100%时标签在内部
                  // 获取完成日期：使用最后一个完成的checkpoint的reachedAt，如果没有则使用当前日期
                  const completedCheckpoints = (longTerm.checkpoints ?? []).filter(
                    (cp) => cp.status === "completed" && cp.reachedAt
                  );
                  const lastCompletedCheckpoint = completedCheckpoints.length > 0
                    ? completedCheckpoints[completedCheckpoints.length - 1]
                    : null;
                  const completedDate = lastCompletedCheckpoint?.reachedAt
                    ? formatDateLabel(lastCompletedCheckpoint.reachedAt)
                    : formatDateLabel(new Date().toISOString());

                  return (
                    <button
                      key={longTerm.id}
                      type="button"
                      onClick={() => {
                        setActiveLongTermGoal(longTerm);
                        setShowCompletedLongTermGoals(false);
                      }}
                      className="goals-card goals-card--primary goals-card--actionable goals-card--long-term"
                      aria-label={`查看长期目标 ${longTerm.title}`}
                    >
                      <div className="goals-long-term__header">
                        <p className="goals-long-term__title">{longTerm.title}</p>
                        <p className="goals-long-term__checkpoint">检查点 {checkpointSummary}</p>
                      </div>
                      <div className="goals-long-term__content">
                        <div className="goals-long-term__track" aria-hidden="true">
                          <div
                            className="goals-long-term__bar"
                            style={{ width: `${progressPercent}%` }}
                          >
                            {showLabelInside ? (
                              <span className="goals-long-term__bar-label goals-long-term__bar-label--inside">
                                {progressLabel}
                              </span>
                            ) : null}
                          </div>
                          {showLabelInside ? null : (
                            <span className="goals-long-term__bar-label goals-long-term__bar-label--outside">
                              {progressLabel}
                            </span>
                          )}
                        </div>
                        <div className="goals-long-term__summary">
                          <div className="goals-long-term__caption" style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                            <p style={{ margin: 0 }}>开始于：{startDateLabel}</p>
                            <p style={{ margin: 0 }}>完成于：{completedDate}</p>
                          </div>
                          <p className="goals-long-term__percent">{progressPercent}%</p>
                        </div>
                      </div>
                    </button>
                  );
                }
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="goals-screen">
      <div className="goals-screen__background">
        <div className="goals-screen__glow goals-screen__glow--mint" />
        <div className="goals-screen__glow goals-screen__glow--brown" />
      </div>

      <TopNav title="目标" subtitle="Progress" className="top-nav--fixed top-nav--flush" />

      <main className="goals-screen__content">
        <section className="goals-section">
          <div className="goals-section__header">
            <h2 className="goals-section__title">长期目标</h2>
            <button
              type="button"
              className="goals-section__action"
              onClick={() => setShowCompletedLongTermGoals(true)}
              aria-label="查看已完成的长期目标"
            >
              <MaterialIcon name="arrow_forward" />
            </button>
          </div>
          {longTermLoading ? (
            <article className="goals-card goals-card--primary goals-card--loading">
              <p className="goals-card__headline">加载长期目标中...</p>
            </article>
          ) : longTermError ? (
            <div className="goals-card goals-card--error">
              <p className="goals-card__error-text">{longTermError}</p>
              {longTermRetryable ? (
                <button
                  type="button"
                  className="goals-card__retry"
                  onClick={reloadLongTermGoal}
                >
                  重试
                </button>
              ) : null}
            </div>
          ) : hasLongTermGoal && longTermGoal ? (
            (() => {
              const progress = longTermGoal.progress ?? {
                progressPercent: 0,
                spentHours: 0,
                elapsedDays: 0,
                completedCheckpoints: 0,
                totalCheckpoints: 0,
              };
              const progressPercent = clampPercent(progress.progressPercent);
              const spentHours = progress.spentHours;
              const targetHours = longTermGoal.targetHours ?? 0;
              const checkpointCount = longTermGoal.checkpointCount ?? 0;
              
              // 验证目标数据是否完整有效
              const isValidGoal = targetHours > 0 && checkpointCount > 0;
              
              // 只有当目标有效且真正完成时才显示完成状态
              // 避免在数据不完整时（如targetHours为0）错误显示"0H目标达成"
              const isCompleted = isValidGoal && (
                progressPercent >= 100 || 
                (targetHours > 0 && spentHours >= targetHours)
              );
              
              // 如果目标数据不完整，不显示完成状态，而是显示正常的目标卡片
              // 但这种情况应该很少见，因为后端会验证数据完整性
              if (!isValidGoal) {
                // 数据不完整，显示正常的目标卡片（虽然这种情况不应该发生）
                const spentLabel = `${formatHours(spentHours)}h`;
                const targetLabel = `${formatHours(targetHours)}h`;
                const startDateLabel = formatDateLabel(longTermGoal.startedAt);
                const elapsedDays = progress.elapsedDays;
                const checkpointSummary = `${progress.completedCheckpoints}/${progress.totalCheckpoints}`;
                const progressLabel = `${spentLabel} / ${targetLabel}`;
                const showLabelInside = progressPercent >= 50;
                
                return (
                  <button
                    type="button"
                    className="goals-card goals-card--primary goals-card--actionable goals-card--long-term"
                    onClick={() => setActiveLongTermGoal(longTermGoal)}
                    aria-label={`查看长期目标 ${longTermGoal.title}`}
                  >
                    <div className="goals-long-term__header">
                      <p className="goals-long-term__title">{longTermGoal.title}</p>
                      <p className="goals-long-term__checkpoint">检查点 {checkpointSummary}</p>
                    </div>
                    <div className="goals-long-term__content">
                      <div className="goals-long-term__track" aria-hidden="true">
                        <div
                          className="goals-long-term__bar"
                          style={{ width: `${progressPercent}%` }}
                        >
                          {showLabelInside ? (
                            <span className="goals-long-term__bar-label goals-long-term__bar-label--inside">
                              {progressLabel}
                            </span>
                          ) : null}
                        </div>
                        {showLabelInside ? null : (
                          <span className="goals-long-term__bar-label goals-long-term__bar-label--outside">
                            {progressLabel}
                          </span>
                        )}
                      </div>
                      <div className="goals-long-term__summary">
                        <p className="goals-long-term__caption">
                          Started: {startDateLabel} • {elapsedDays} days passed
                        </p>
                        <p className="goals-long-term__percent">{progressPercent}%</p>
                      </div>
                    </div>
                  </button>
                );
              }
              
              const spentLabel = `${formatHours(spentHours)}h`;
              const targetLabel = `${formatHours(targetHours)}h`;
              const startDateLabel = formatDateLabel(longTermGoal.startedAt);
              const elapsedDays = progress.elapsedDays;
              const checkpointSummary = `${progress.completedCheckpoints}/${progress.totalCheckpoints}`;
              const progressLabel = `${spentLabel} / ${targetLabel}`;
              const showLabelInside = progressPercent >= 50;
              
              // 如果达成，显示达成样式
              if (isCompleted) {
                // 获取达成日期：使用最后一个完成的checkpoint的reachedAt，如果没有则使用当前日期
                const completedCheckpoints = (longTermGoal.checkpoints ?? []).filter(
                  (cp) => cp.status === "completed" && cp.reachedAt
                );
                const lastCompletedCheckpoint = completedCheckpoints.length > 0
                  ? completedCheckpoints[completedCheckpoints.length - 1]
                  : null;
                const completedDate = lastCompletedCheckpoint?.reachedAt
                  ? formatDateLabel(lastCompletedCheckpoint.reachedAt)
                  : formatDateLabel(new Date().toISOString());
                
                return (
                  <button
                    type="button"
                    className="goals-card goals-card--primary goals-card--actionable goals-card--long-term goals-card--long-term--completed"
                    onClick={() => {
                      // 如果达成目标，先显示图片选择弹窗
                      setCompletingGoal(longTermGoal);
                      setShowFinalCheckpointImageModal(true);
                    }}
                    aria-label={`查看长期目标 ${longTermGoal.title}`}
                  >
                    <div className="goals-long-term__wave goals-long-term__wave--1" />
                    <div className="goals-long-term__wave goals-long-term__wave--2" />
                    <div className="goals-long-term__wave goals-long-term__wave--3" />
                    {/* 左侧烟花 */}
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={`left-${i}`}
                        className="goals-long-term__firework goals-long-term__firework--left"
                        style={{
                          animationDelay: `${i * 0.2}s`,
                          top: `${15 + i * 10}%`,
                        }}
                      />
                    ))}
                    {/* 右侧烟花 */}
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={`right-${i}`}
                        className="goals-long-term__firework goals-long-term__firework--right"
                        style={{
                          animationDelay: `${i * 0.2 + 0.5}s`,
                          top: `${15 + i * 10}%`,
                        }}
                      />
                    ))}
                    <div className="goals-long-term__completed-content">
                      <div className="goals-long-term__completed-title">{targetLabel} 达成</div>
                      <div className="goals-long-term__completed-subtitle">{longTermGoal.title}</div>
                      <div className="goals-long-term__completed-date">达成于 {completedDate}</div>
                    </div>
                  </button>
                );
              }
              
              return (
                <button
                  type="button"
                  className="goals-card goals-card--primary goals-card--actionable goals-card--long-term"
                  onClick={() => setActiveLongTermGoal(longTermGoal)}
                  aria-label={`查看长期目标 ${longTermGoal.title}`}
                >
                  <div className="goals-long-term__header">
                    <p className="goals-long-term__title">{longTermGoal.title}</p>
                    <p className="goals-long-term__checkpoint">检查点 {checkpointSummary}</p>
                  </div>
                  <div className="goals-long-term__content">
                    <div className="goals-long-term__track" aria-hidden="true">
                      <div
                        className="goals-long-term__bar"
                        style={{ width: `${progressPercent}%` }}
                      >
                        {showLabelInside ? (
                          <span className="goals-long-term__bar-label goals-long-term__bar-label--inside">
                            {progressLabel}
                          </span>
                        ) : null}
                      </div>
                      {showLabelInside ? null : (
                        <span className="goals-long-term__bar-label goals-long-term__bar-label--outside">
                          {progressLabel}
                        </span>
                      )}
                    </div>
                    <div className="goals-long-term__summary">
                      <p className="goals-long-term__caption">
                        Started: {startDateLabel} • {elapsedDays} days passed
                      </p>
                      <p className="goals-long-term__percent">{progressPercent}%</p>
                    </div>
                  </div>
                </button>
              );
            })()
          ) : (
            <button
              type="button"
              className="goals-card goals-card--cta"
              onClick={() => setShowLongTermSetup(true)}
            >
              <div className="goals-card__cta-icon">
                <MaterialIcon name="add" />
              </div>
              <div className="goals-card__cta-body">
                <p className="goals-card__cta-title">启动长期计划</p>
                <p className="goals-card__cta-subtitle">制定愿景与里程碑，让创作之路更清晰</p>
              </div>
            </button>
          )}
        </section>

        <section className="goals-section">
          <div className="goals-section__header">
            <h2 className="goals-section__title">短期目标</h2>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="goals-section__action"
                onClick={() => setShowWizard(true)}
                aria-label="新建短期目标"
              >
                <MaterialIcon name="add" />
              </button>
              <button
                type="button"
                className="goals-section__action"
                onClick={() => setShowCompletedShortTermGoals(true)}
                aria-label="查看已完成的短期目标"
              >
                <MaterialIcon name="arrow_forward" />
              </button>
            </div>
          </div>
          <div className="goals-carousel">
            {shortTermLoading ? (
              <p className="goals-carousel__message">加载短期目标中...</p>
            ) : shortTermError ? (
              <p className="goals-carousel__message goals-carousel__message--error">
                {shortTermError}
              </p>
            ) : shortTermGoals.length === 0 ? (
              <div className="goals-carousel__empty">
                <div className="goals-carousel__empty-divider">
                  <div className="goals-carousel__empty-divider-line"></div>
                  <div className="goals-carousel__empty-divider-dot"></div>
                  <div className="goals-carousel__empty-divider-line"></div>
                </div>
                <p className="goals-carousel__empty-text">暂无目标</p>
              </div>
            ) : (
              shortTermGoals
                .filter((goal) => goal.status !== "completed") // 过滤掉已完成的目标
                .map((goal) => {
                  const statusText = getShortTermGoalStatusText(goal);
                  // 使用任务完成记录计算完成天数（按目标ID隔离）
                  const completedDays = getShortTermGoalCompletedDays(goal, goalTaskCompletions);
                  const durationDays = goal.durationDays ?? 0;
                  const progressPercent = durationDays > 0 
                    ? Math.min(Math.round((completedDays / durationDays) * 100), 100)
                    : 0;
                  
                  // 根据天数确定小方块数量（7、14、21、28）
                  const boxCount = durationDays;
                  // 获取启动日期：使用创建日期作为启动日期
                  const startDate = goal.createdAt;
                  const startDateFormatted = formatDateYYYYMMDD(startDate);
                  
                  return (
                    <button
                      type="button"
                      className={`goals-card goals-card--primary goals-card--actionable goals-card--short-term ${goal.status === "saved" ? "goals-card--short-term--saved" : ""}`}
                      key={goal.id}
                      onClick={() => handleGoalOpen(goal)}
                    >
                      <div className="goals-short-term__header">
                        <p className="goals-short-term__title">{goal.title}</p>
                        <p className={`goals-short-term__status ${goal.status === "saved" ? "goals-short-term__status--saved" : ""}`}>
                          {statusText}
                        </p>
                      </div>
                      <div className="goals-short-term__content">
                        <div className="goals-short-term__boxes">
                          {Array.from({ length: boxCount }).map((_, index) => {
                            const isCompleted = index < completedDays;
                            return (
                              <div
                                key={index}
                                className={`goals-short-term__box ${isCompleted ? 'goals-short-term__box--completed' : ''}`}
                              />
                            );
                          })}
                        </div>
                        <div className="goals-short-term__summary">
                          <p className="goals-short-term__caption">
                            {startDateFormatted} {completedDays} / {durationDays} 天
                          </p>
                          <p className="goals-short-term__percent">{progressPercent}%</p>
                        </div>
                      </div>
                    </button>
                  );
                })
            )}
          </div>
        </section>

      </main>

      {/* 最后一个检查点图片选择弹窗 */}
      {showFinalCheckpointImageModal && completingGoal && (
        <FinalCheckpointImageModal
          goal={completingGoal}
          onClose={() => {
            setShowFinalCheckpointImageModal(false);
            setCompletingGoal(null);
          }}
          onSelect={handleFinalCheckpointImageSelect}
        />
      )}
    </div>
  );
}

export default Goals;


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

function formatDateLabel(iso: string | null | undefined): string {
  if (!iso) {
    return "";
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

// 格式化日期为 YYYY-MM-DD 格式
function formatDateYYYYMMDD(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Removed unused function: formatMonthDayLabel

type FinalCheckpointImageModalProps = {
  goal: LongTermGoal;
  onClose: () => void;
  onSelect: (artworkId: number) => void;
};

function FinalCheckpointImageModal({
  goal,
  onClose,
  onSelect,
}: FinalCheckpointImageModalProps) {
  const [allArtworks, setAllArtworks] = useState<Artwork[]>(() => loadStoredArtworks());
  const [isExpanding, setIsExpanding] = useState(false);
  
  // 监听画作数据变化
  useEffect(() => {
    const handleArtworksChange = () => {
      setAllArtworks(loadStoredArtworks());
    };
    
    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChange);
    return () => {
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChange);
    };
  }, []);

  // 展开动画
  useEffect(() => {
    setIsExpanding(true);
  }, []);

  // 计算最后一个检查点的时间范围
  const checkpoints = goal.checkpoints ?? [];
  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  const previousCheckpoint = checkpoints.length > 1 
    ? checkpoints[checkpoints.length - 2]
    : null;
  
  const startDate = previousCheckpoint?.reachedAt 
    ? new Date(previousCheckpoint.reachedAt)
    : new Date(goal.startedAt);
  const endDate = lastCheckpoint?.reachedAt 
    ? new Date(lastCheckpoint.reachedAt)
    : new Date();

  // 筛选在最后一个检查点时间段内的画作
  const filteredArtworks = useMemo(() => {
    return allArtworks.filter((artwork) => {
      const artworkDate = artwork.uploadedAt 
        ? new Date(artwork.uploadedAt)
        : artwork.uploadedDate
        ? new Date(`${artwork.uploadedDate}T00:00:00Z`)
        : null;
      
      if (!artworkDate) return false;
      
      return artworkDate >= startDate && artworkDate <= endDate;
    });
  }, [allArtworks, startDate, endDate]);

  return (
    <div 
      className={`final-checkpoint-image-modal ${isExpanding ? 'final-checkpoint-image-modal--expanded' : ''}`}
      onClick={onClose}
    >
      <div 
        className="final-checkpoint-image-modal__content" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="final-checkpoint-image-modal__header">
          <div className="final-checkpoint-image-modal__header-content">
            <h3 className="final-checkpoint-image-modal__title">
              为<span className="final-checkpoint-image-modal__title-hours">{formatHours(goal.targetHours)}h</span>计划
              <br />
              最后一个检查点选择图片
            </h3>
          </div>
          <button
            type="button"
            className="final-checkpoint-image-modal__close"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        <div className="final-checkpoint-image-modal__body">
          {filteredArtworks.length === 0 ? (
            <div className="final-checkpoint-image-modal__empty">
              <MaterialIcon name="image_not_supported" />
              <p>该时间段内没有上传的画作</p>
            </div>
          ) : (
            <div className="final-checkpoint-image-modal__grid">
              {filteredArtworks.map((artwork) => (
                <button
                  key={artwork.id}
                  type="button"
                  className="final-checkpoint-image-modal__item"
                  onClick={() => {
                    const numericId = artwork.id.replace(/^art-/, "");
                    const uploadId = Number.parseInt(numericId, 10);
                    if (Number.isFinite(uploadId) && uploadId > 0) {
                      onSelect(uploadId);
                    }
                  }}
                >
                  <img
                    src={artwork.imageSrc}
                    alt={artwork.title}
                    className="final-checkpoint-image-modal__item-image"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


