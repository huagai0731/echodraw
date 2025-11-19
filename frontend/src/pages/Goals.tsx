import { useCallback, useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import NewChallengeWizard from "@/pages/NewChallengeWizard";
import LongTermGoalSetup from "@/pages/LongTermGoalSetup";
import LongTermGoalDetails from "@/pages/LongTermGoalDetails";
import ShortTermGoalDetails from "@/pages/ShortTermGoalDetails";
import ErrorBoundary from "@/components/ErrorBoundary";
import TopNav from "@/components/TopNav";
import {
  AUTH_CHANGED_EVENT,
  fetchGoalsCalendar,
  fetchLongTermGoal,
  hasAuthToken,
  type GoalsCalendarDay,
  type LongTermGoal,
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
  startOfWeekInShanghai,
} from "@/utils/dateUtils";
import { useShortTermGoals } from "@/hooks/useShortTermGoals";
import { useCheckInDates } from "@/hooks/useCheckInDates";

import "./Goals.css";

type RangeKey = "weekly" | "monthly";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHLY_CHART_WIDTH = 310;
const MONTHLY_CHART_HEIGHT = 192;
const MONTHLY_CHART_TOP_PADDING = 16;
const MONTHLY_CHART_BOTTOM_PADDING = 28;

const LONG_TERM_GOAL_CACHE_KEY = "echo-long-term-goal-cache";
const LONG_TERM_GOAL_CACHE_TIMESTAMP_KEY = "echo-long-term-goal-cache-timestamp";
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5分钟缓存有效期

const FALLBACK_COVER_GRADIENTS = [
  "linear-gradient(135deg, rgba(152, 219, 198, 0.45), rgba(74, 63, 58, 0.55))",
  "linear-gradient(135deg, rgba(255, 197, 164, 0.5), rgba(116, 90, 84, 0.5))",
  "linear-gradient(135deg, rgba(167, 190, 255, 0.5), rgba(70, 78, 115, 0.5))",
];

type WeeklyStat = {
  label: string;
  minutes: number;
  valueHours: number;
  dateKey: string;
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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

function startOfWeek(reference: Date): Date {
  return startOfWeekInShanghai(reference);
}

function computeWeeklyStats(uploads: Artwork[], reference: Date): WeeklyStat[] {
  const start = startOfWeek(reference);
  // 使用上海时区格式化开始日期，然后解析以确保时区一致
  const startDateStr = formatISODateInShanghai(start);
  if (!startDateStr) {
    // 如果格式化失败，返回空统计
    return WEEKDAY_LABELS.map((label, index) => ({
      label,
      minutes: 0,
      valueHours: 0,
      dateKey: formatISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)),
    }));
  }
  
  const startParsed = parseISODateInShanghai(startDateStr);
  if (!startParsed) {
    return WEEKDAY_LABELS.map((label, index) => ({
      label,
      minutes: 0,
      valueHours: 0,
      dateKey: formatISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)),
    }));
  }
  
  // 计算结束日期（第7天，即周日）
  const endParsed = new Date(startParsed);
  endParsed.setDate(endParsed.getDate() + 6);
  endParsed.setHours(23, 59, 59, 999);
  const endDateStr = formatISODateInShanghai(endParsed);
  
  const stats = WEEKDAY_LABELS.map((label, index) => {
    const dayDate = new Date(startParsed);
    dayDate.setDate(dayDate.getDate() + index);
    return {
      label,
      minutes: 0,
      valueHours: 0,
      dateKey: formatISODate(dayDate),
    };
  });

  uploads.forEach((artwork) => {
    const dateKey = normalizeUploadedDate(artwork.uploadedDate ?? null, artwork.uploadedAt ?? null);
    if (!dateKey || !isValidISODate(dateKey)) {
      return;
    }
    // 使用上海时区解析日期
    const uploadDate = parseISODateInShanghai(dateKey);
    if (!uploadDate) {
      return;
    }
    
    // 使用日期字符串比较，避免时区问题
    if (!endDateStr || dateKey < startDateStr || dateKey > endDateStr) {
      return;
    }
    
    // 计算日期差（使用日期字符串比较）
    const uploadDateStr = formatISODateInShanghai(uploadDate);
    if (!uploadDateStr) {
      return;
    }
    
    // 解析两个日期字符串，计算天数差
    const [startY, startM, startD] = startDateStr.split("-").map(Number);
    const [uploadY, uploadM, uploadD] = uploadDateStr.split("-").map(Number);
    
    const startDateObj = new Date(startY, startM - 1, startD);
    const uploadDateObj = new Date(uploadY, uploadM - 1, uploadD);
    const diffDays = Math.floor((uploadDateObj.getTime() - startDateObj.getTime()) / 86400000);
    
    const minutes = extractDurationMinutes(artwork);
    if (diffDays >= 0 && diffDays < stats.length) {
      stats[diffDays].minutes += minutes;
    }
  });

  return stats.map((item) => ({
    ...item,
    valueHours: item.minutes / 60,
  }));
}

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

function pickCoverGradient(index: number): string {
  if (FALLBACK_COVER_GRADIENTS.length === 0) {
    return "linear-gradient(135deg, rgba(152, 219, 198, 0.45), rgba(74, 63, 58, 0.55))";
  }
  return FALLBACK_COVER_GRADIENTS[index % FALLBACK_COVER_GRADIENTS.length];
}

function formatShortTermGoalSubtitle(goal: ShortTermGoal): string {
  const summaryPrefix =
    goal.planType === "same" ? "每日重复任务" : "每日不同任务";
  const sortedSchedule = [...goal.schedule].sort((a, b) => a.dayIndex - b.dayIndex);
  const firstWithTasks = sortedSchedule.find((day) => day.tasks.length > 0);

  if (!firstWithTasks) {
    return `持续 ${goal.durationDays} 天 · ${summaryPrefix}`;
  }

  if (goal.planType === "same") {
    const names = firstWithTasks.tasks
      .map((task) => task.title.trim())
      .filter((title) => title.length > 0)
      .slice(0, 3);
    if (names.length === 0) {
      return `持续 ${goal.durationDays} 天 · ${summaryPrefix}`;
    }
    const suffix = firstWithTasks.tasks.length > names.length ? " ..." : "";
    return `每日：${names.join(" / ")}${suffix}`;
  }

  const dayNumber = Math.min(firstWithTasks.dayIndex + 1, goal.durationDays);
  const title = firstWithTasks.tasks[0]?.title?.trim() || "未安排任务";
  return `第 ${dayNumber}/${goal.durationDays} 天：${title}`;
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

// 短期目标相关的缓存和状态管理已移动到 useShortTermGoals hook

function Goals() {
  const [range, setRange] = useState<RangeKey>("weekly");
  const [showWizard, setShowWizard] = useState(false);
  const [showLongTermSetup, setShowLongTermSetup] = useState(false);
  const [showLongTermMetaEdit, setShowLongTermMetaEdit] = useState(false);
  const [longTermGoal, setLongTermGoal] = useState<LongTermGoal | null>(null);
  const [longTermLoading, setLongTermLoading] = useState(false);
  const [longTermError, setLongTermError] = useState<string | null>(null);
  const [longTermRetryable, setLongTermRetryable] = useState(true);
  const [activeLongTermGoal, setActiveLongTermGoal] = useState<LongTermGoal | null>(null);
  const [calendarDays, setCalendarDays] = useState<GoalsCalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [activeMonth, setActiveMonth] = useState(() => {
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
  const [monthlyHoverIndex, setMonthlyHoverIndex] = useState<number | null>(null);
  const [monthlySelectedIndex, setMonthlySelectedIndex] = useState<number | null>(null);
  const [monthlyPointerActive, setMonthlyPointerActive] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);

  // 使用自定义 hooks 管理短期目标和打卡记录
  const {
    goals: shortTermGoals,
    loading: shortTermLoading,
    error: shortTermError,
    addGoal,
    removeGoal,
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

  const weeklyStats = useMemo(() => computeWeeklyStats(uploads, todayInShanghai), [uploads, todayInShanghai]);
  const maxWeekly = useMemo(
    () => weeklyStats.reduce((max, item) => Math.max(max, item.valueHours), 0),
    [weeklyStats],
  );
  const hasWeeklyData = weeklyStats.some((item) => item.minutes > 0);
  const monthlySeries = useMemo(() => buildMonthlySeries(uploads, todayInShanghai), [uploads, todayInShanghai]);
  const monthlyHint = useMemo(() => {
    if (!monthlySeries.hasData || monthlySeries.points.length === 0) {
      return null;
    }
    const maxIndex = monthlySeries.points.length - 1;
    const targetIndex =
      monthlyHoverIndex !== null
        ? clamp(monthlyHoverIndex, 0, maxIndex)
        : monthlySelectedIndex !== null
          ? clamp(monthlySelectedIndex, 0, maxIndex)
          : clamp(monthlySeries.defaultHintIndex, 0, maxIndex);
    const point = monthlySeries.points[targetIndex];
    const left = clamp((point.x / MONTHLY_CHART_WIDTH) * 100, 0, 100);
    const top = clamp((point.y / MONTHLY_CHART_HEIGHT) * 100, 0, 100);
    const valueHours = point.minutes / 60;
    return {
      dateLabel: formatMonthDayLabel(monthlySeries.monthIndex, point.day),
      valueLabel: `${valueHours.toFixed(1)} 小时`,
      left,
      top,
    };
  }, [monthlySeries, monthlyHoverIndex, monthlySelectedIndex]);

  useEffect(() => {
    setMonthlyHoverIndex(null);
    setMonthlySelectedIndex(null);
  }, [monthlySeries.year, monthlySeries.monthIndex, monthlySeries.points.length]);

  const updateMonthlyHoverIndex = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!monthlySeries.hasData || monthlySeries.points.length === 0) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width === 0) {
        return;
      }
      const relativeX = clamp(event.clientX - rect.left, 0, rect.width);
      const ratio =
        monthlySeries.points.length > 1 ? relativeX / rect.width : 0;
      const nextIndex = Math.round(
        ratio * (monthlySeries.points.length - 1),
      );
      setMonthlyHoverIndex(nextIndex);
      setMonthlySelectedIndex(nextIndex);
    },
    [monthlySeries],
  );

  const handleMonthlyPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!monthlySeries.hasData || monthlySeries.points.length === 0) {
        return;
      }
      event.preventDefault();
      setMonthlyPointerActive(true);
      if (event.currentTarget.setPointerCapture) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // ignore capture errors
        }
      }
      updateMonthlyHoverIndex(event);
    },
    [monthlySeries, updateMonthlyHoverIndex],
  );

  const handleMonthlyPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!monthlySeries.hasData || monthlySeries.points.length === 0) {
        return;
      }
      const isMouseLike = event.pointerType === "mouse" || event.pointerType === "pen";
      if (!isMouseLike && !monthlyPointerActive) {
        return;
      }
      updateMonthlyHoverIndex(event);
    },
    [monthlySeries, monthlyPointerActive, updateMonthlyHoverIndex],
  );

  const endMonthlyPointerInteraction = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.releasePointerCapture) {
      try {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // ignore release errors
      }
    }
    setMonthlyPointerActive(false);
  }, []);

  const handleMonthlyPointerLeave = useCallback(() => {
    setMonthlyPointerActive(false);
    setMonthlyHoverIndex(null);
  }, []);

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
      // 先尝试从缓存加载，避免闪烁
      const cached = loadCachedLongTermGoal();
      if (cached && active) {
        setLongTermGoal(cached);
        setLongTermError(null);
        setLongTermRetryable(true);
        setLongTermLoading(false);
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
        setLongTermGoal(goal);
        setLongTermError(null);
        setLongTermRetryable(true);
        saveCachedLongTermGoal(goal);
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
          // 如果出错但有缓存，保持使用缓存，不显示错误
          if (!cached) {
            setLongTermGoal(null);
            setLongTermError("获取长期目标失败，请稍后重试。");
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
    };

    const handleArtworksChanged = () => {
      refreshUploadData();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    };
  }, [refreshUploadData]);

  useEffect(() => {
    let isMounted = true;

    async function loadCalendar(year: number, month: number) {
      if (!hasAuthToken()) {
        setCalendarDays([]);
        setCalendarError("登录后可查看打卡记录。");
        return;
      }

      setCalendarLoading(true);
      try {
        const data = await fetchGoalsCalendar({ year, month });
        if (!isMounted) {
          return;
        }
        setCalendarDays(data.days);
        setCalendarError(null);
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
          setCalendarDays([]);
          setCalendarError("获取打卡记录失败，请稍后重试。");
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

  const mergedCalendarDays = useMemo(() => {
    const base = calendarDays.length > 0 ? calendarDays : buildMonthSkeleton(activeMonth);
    if (localUploadDates.size === 0) {
      return base;
    }
    // 如果本地有上传日期但后端日历中没有标记为 upload，则标记为 upload
    // 但不要覆盖已经明确标记为 check 的状态（只打卡没有上传的情况）
    return base.map((day) => {
      if (localUploadDates.has(day.date) && day.status === "none") {
        // 本地有上传但后端还没同步，标记为 upload
        return { ...day, status: "upload" as GoalsCalendarDay["status"] };
      }
      // 保持后端的原始状态：check（只打卡）或 upload（有上传）
      return day;
    });
  }, [calendarDays, activeMonth, localUploadDates]);

  const handleWizardClose = useCallback(() => {
    setShowWizard(false);
  }, []);

  const handleGoalSaved = useCallback(
    (goal: ShortTermGoal) => {
      addGoal(goal);
    },
    [addGoal]
  );

  const handleLongTermSaved = useCallback(
    (goal: LongTermGoal) => {
      setLongTermGoal(goal);
      setLongTermError(null);
      setShowLongTermSetup(false);
      setActiveLongTermGoal(goal);
    },
    [],
  );

  const handleLongTermMetaSaved = useCallback(
    (goal: LongTermGoal) => {
      setLongTermGoal(goal);
      setLongTermError(null);
      setShowLongTermMetaEdit(false);
      setActiveLongTermGoal(goal);
    },
    [],
  );

  const handleCloseLongTermDetails = useCallback(() => {
    setActiveLongTermGoal(null);
  }, []);

  const handleLongTermExport = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.print();
      } catch (error) {
        console.info("Export action triggered", error);
      }
    }
  }, []);

  const handleGoalComplete = useCallback(
    async (dateKey: string) => {
      if (!isValidISODate(dateKey)) {
        console.error("[Goals] Invalid date format in handleGoalComplete", dateKey);
        return;
      }

      // 立即更新打卡记录状态
      addCheckInDate(dateKey);

      // 刷新打卡记录，确保与服务器同步
      try {
        const dateRange = activeGoalDetail ? getGoalDateRange(activeGoalDetail) : null;
        if (dateRange) {
          await refreshCheckInDates(dateRange);
        } else {
          await refreshCheckInDates();
        }
      } catch (error) {
        console.error("[Goals] Failed to refresh check-in dates after goal completion", error);
      }
    },
    [activeGoalDetail, addCheckInDate, refreshCheckInDates, getGoalDateRange]
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
    },
    [removeGoal]
  );

  const handleGoalOpen = useCallback(
    async (goal: ShortTermGoal) => {
      // 打开详情页面时刷新打卡记录，确保显示最新状态
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

  // 优化：只传递该目标自己的完成日期对应的打卡记录，用于验证
  // 因为已经完全隔离，每个目标只使用自己的 goalCompletedDates
  // uploadDates 的作用只是验证这些日期是否真的有打卡记录
  // 这样不限制日期范围，用户可以随时完成任何一天的任务
  // 注意：这个 hook 必须在所有早期返回之前调用，遵守 React Hooks 规则
  const filteredUploadDates = useMemo(() => {
    if (!activeGoalDetail?.id) {
      return new Set<string>();
    }
    
    // 从 localStorage 读取该目标的完成日期列表
    try {
      const completedDatesKey = `short-term-goal-${activeGoalDetail.id}-completed-dates`;
      const stored = localStorage.getItem(completedDatesKey);
      if (!stored) {
        // 如果还没有完成日期，返回空集合
        return new Set<string>();
      }
      
      const completedDates = JSON.parse(stored) as string[];
      const filtered = new Set<string>();
      
      // 只传递该目标自己的完成日期对应的打卡记录
      completedDates.forEach((dateKey) => {
        if (localUploadDates.has(dateKey)) {
          filtered.add(dateKey);
        }
      });
      
      return filtered;
    } catch (error) {
      console.warn("[Goals] Failed to load completed dates for filtering", error);
      return new Set<string>();
    }
  }, [localUploadDates, activeGoalDetail?.id]);

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
          onExport={handleLongTermExport}
        />
      </ErrorBoundary>
    );
  }

  if (activeGoalDetail) {
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
    return <NewChallengeWizard onClose={handleWizardClose} onSaved={handleGoalSaved} />;
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
          <h2 className="goals-section__title">长期目标</h2>
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
              const spentLabel = `${formatHours(progress.spentHours)}h`;
              const targetLabel = `${formatHours(longTermGoal.targetHours)}h`;
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
            {shortTermGoals.length > 0 ? (
              <button
                type="button"
                className="goals-section__action"
                onClick={() => setShowWizard(true)}
                aria-label="新建短期目标"
              >
                <MaterialIcon name="add" />
              </button>
            ) : null}
          </div>
          <div className="goals-carousel">
            {shortTermLoading ? (
              <p className="goals-carousel__message">加载短期目标中...</p>
            ) : shortTermError ? (
              <p className="goals-carousel__message goals-carousel__message--error">
                {shortTermError}
              </p>
            ) : shortTermGoals.length === 0 ? (
              <button
                type="button"
                className="goals-carousel__item goals-carousel__item--cta"
                onClick={() => setShowWizard(true)}
              >
                <div className="goals-carousel__cover goals-carousel__cover--cta">
                  <MaterialIcon name="add" />
                </div>
                <div className="goals-carousel__body">
                  <p className="goals-carousel__title">创建新目标</p>
                  <p className="goals-carousel__subtitle">为你的短期计划设定节奏</p>
                </div>
              </button>
            ) : (
              shortTermGoals.map((goal, index) => (
                <button
                  type="button"
                  className="goals-carousel__item goals-carousel__item--button"
                  key={goal.id}
                  onClick={() => handleGoalOpen(goal)}
                >
                  <div
                    className="goals-carousel__cover goals-carousel__cover--fallback"
                    style={{ backgroundImage: pickCoverGradient(index) }}
                    aria-hidden="true"
                  />
                  <div className="goals-carousel__body">
                    <p className="goals-carousel__title">{goal.title}</p>
                    <p className="goals-carousel__subtitle">
                      {formatShortTermGoalSubtitle(goal)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="goals-section">
          <h2 className="goals-section__title">趋势</h2>
          <div className="goals-card goals-card--secondary">
            <div className="goals-toggle">
              <button
                type="button"
                className={
                  range === "weekly"
                    ? "goals-toggle__button goals-toggle__button--active"
                    : "goals-toggle__button"
                }
                onClick={() => setRange("weekly")}
              >
                周度
              </button>
              <button
                type="button"
                className={
                  range === "monthly"
                    ? "goals-toggle__button goals-toggle__button--active"
                    : "goals-toggle__button"
                }
                onClick={() => setRange("monthly")}
              >
                月度
              </button>
            </div>

            {range === "weekly" ? (
              hasWeeklyData ? (
                <div className="goals-weekly">
                  {weeklyStats.map((item) => {
                    const ratio = maxWeekly > 0 ? item.valueHours / maxWeekly : 0;
                    const height = ratio * 100;
                    return (
                      <div className="goals-weekly__bar" key={item.dateKey}>
                          <span className="goals-weekly__value">{item.valueHours.toFixed(1)} h</span>
                        <div className="goals-weekly__track">
                          <div
                            className="goals-weekly__fill"
                            style={{ height: `${height}%` }}
                          >
                            <span className="goals-weekly__spark" />
                          </div>
                        </div>
                        <span className="goals-weekly__label">{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="goals-trend__empty">暂无绘画时长数据</p>
              )
            ) : (
              <div className="goals-monthly">
                <div className="goals-monthly__grid">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span key={index} className="goals-monthly__line" />
                  ))}
                </div>
                <div className="goals-monthly__canvas">
                  <svg
                    className="goals-monthly__path"
                    viewBox="0 0 310 192"
                    xmlns="http://www.w3.org/2000/svg"
                    preserveAspectRatio="none"
                    onPointerDown={handleMonthlyPointerDown}
                    onPointerMove={handleMonthlyPointerMove}
                    onPointerUp={endMonthlyPointerInteraction}
                    onPointerCancel={endMonthlyPointerInteraction}
                    onPointerLeave={handleMonthlyPointerLeave}
                  >
                    <rect className="goals-monthly__hit" x="0" y="0" width="310" height="192" fill="transparent" />
                    <path d={monthlySeries.path} />
                  </svg>
                  {monthlyHint ? (
                    <div
                      className="goals-monthly__hint"
                      style={{
                        left: `${monthlyHint.left}%`,
                        top: `${monthlyHint.top}%`,
                      }}
                    >
                      <div className="goals-monthly__hint-card">
                        <span>{monthlyHint.dateLabel}</span>
                        <strong>{monthlyHint.valueLabel}</strong>
                      </div>
                      <span className="goals-monthly__hint-line" />
                      <span className="goals-monthly__hint-dot" />
                    </div>
                  ) : null}
                </div>
                <div className="goals-monthly__labels">
                  {monthlySeries.labels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                {!monthlySeries.hasData && (
                  <p className="goals-trend__empty">暂无绘画时长数据</p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="goals-section">
          <h2 className="goals-section__subtitle">打卡记录</h2>
          <div className="goals-card goals-card--calendar">
            <header className="goals-calendar__header">
              <h3>
                {activeMonth.toLocaleDateString("zh-CN", {
                  year: "numeric",
                  month: "long",
                })}
              </h3>
              <div className="goals-calendar__pager">
                <button
                  type="button"
                  className="goals-calendar__pager-button"
                  onClick={() =>
                    setActiveMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                    )
                  }
                  aria-label="上一月"
                >
                  <MaterialIcon name="chevron_left" />
                </button>
                <button
                  type="button"
                  className="goals-calendar__pager-button"
                  onClick={() =>
                    setActiveMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                    )
                  }
                  aria-label="下一月"
                >
                  <MaterialIcon name="chevron_right" />
                </button>
              </div>
            </header>
            <div className="goals-calendar__weekdays">
              <span>日</span>
              <span>一</span>
              <span>二</span>
              <span>三</span>
              <span>四</span>
              <span>五</span>
              <span>六</span>
            </div>
            <div
              className="goals-calendar__days"
              aria-busy={calendarLoading ? "true" : undefined}
            >
              {mergedCalendarDays.map((day) => {
                const classes = [
                  "goals-calendar__day",
                  day.in_month ? "" : "goals-calendar__day--muted",
                  day.status === "check" ? "goals-calendar__day--check" : "",
                  day.status === "upload" ? "goals-calendar__day--upload" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <span key={day.date} className={classes}>
                    {day.day}
                  </span>
                );
              })}
            </div>
            {calendarError && !calendarLoading && (
              <p className="goals-calendar__message goals-calendar__message--error">
                {calendarError}
              </p>
            )}
            <footer className="goals-calendar__legend">
              <div className="goals-calendar__legend-item">
                <span className="goals-calendar__dot goals-calendar__dot--check" />
                <span>已打卡</span>
              </div>
              <div className="goals-calendar__legend-item">
                <span className="goals-calendar__dot goals-calendar__dot--upload" />
                <span>上传作品</span>
              </div>
            </footer>
          </div>
        </section>
      </main>
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

function formatMonthDayLabel(monthIndex: number, day: number): string {
  const month = monthIndex + 1;
  return `${month} 月 ${day} 日`;
}


