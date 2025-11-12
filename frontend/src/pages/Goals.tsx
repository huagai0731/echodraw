import { useCallback, useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import NewChallengeWizard from "@/pages/NewChallengeWizard";
import LongTermGoalSetup from "@/pages/LongTermGoalSetup";
import LongTermGoalDetails from "@/pages/LongTermGoalDetails";
import ShortTermGoalDetails from "@/pages/ShortTermGoalDetails";
import TopNav from "@/components/TopNav";
import {
  AUTH_CHANGED_EVENT,
  fetchGoalsCalendar,
  fetchLongTermGoal,
  fetchShortTermGoals,
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

import "./Goals.css";

type RangeKey = "weekly" | "monthly";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHLY_CHART_WIDTH = 310;
const MONTHLY_CHART_HEIGHT = 192;
const MONTHLY_CHART_TOP_PADDING = 16;
const MONTHLY_CHART_BOTTOM_PADDING = 28;

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
  const result = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function computeWeeklyStats(uploads: Artwork[], reference: Date): WeeklyStat[] {
  const start = startOfWeek(reference);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const stats = WEEKDAY_LABELS.map((label, index) => {
    const dayDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      label,
      minutes: 0,
      valueHours: 0,
      dateKey: formatISODate(dayDate),
    };
  });

  uploads.forEach((artwork) => {
    const dateKey = normalizeUploadedDate(artwork.uploadedDate ?? null, artwork.uploadedAt ?? null);
    if (!dateKey) {
      return;
    }
    const [year, month, day] = dateKey.split("-").map(Number);
    const uploadDate = new Date(year, (month || 1) - 1, day || 1);
    if (uploadDate < start || uploadDate > end) {
      return;
    }
    const diffDays = Math.floor((uploadDate.getTime() - start.getTime()) / 86400000);
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
  const year = reference.getFullYear();
  const monthIndex = reference.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totals = new Array<number>(daysInMonth).fill(0);

  uploads.forEach((artwork) => {
    const dateKey = normalizeUploadedDate(artwork.uploadedDate ?? null, artwork.uploadedAt ?? null);
    if (!dateKey) {
      return;
    }
    const [y, m, d] = dateKey.split("-").map(Number);
    if (y !== year || (m || 0) - 1 !== monthIndex || !d) {
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
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, "0");
  const day = String(source.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeUploadedDate(uploadedDate?: string | null, uploadedAt?: string | null) {
  if (uploadedDate && /^\d{4}-\d{2}-\d{2}$/.test(uploadedDate)) {
    return uploadedDate;
  }
  if (!uploadedAt) {
    return null;
  }
  const timestamp = Date.parse(uploadedAt);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return formatISODate(new Date(timestamp));
}

function buildMonthSkeleton(reference: Date): GoalsCalendarDay[] {
  const monthIndex = reference.getMonth();
  const year = reference.getFullYear();

  const firstOfMonth = new Date(year, monthIndex, 1);
  const firstWeekday = firstOfMonth.getDay(); // 0 (Sun) - 6 (Sat)
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
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [uploads, setUploads] = useState<Artwork[]>([]);
  const [localUploadDates, setLocalUploadDates] = useState<Set<string>>(new Set());
  const [shortTermGoals, setShortTermGoals] = useState<ShortTermGoal[]>([]);
  const [shortTermLoading, setShortTermLoading] = useState(false);
  const [shortTermError, setShortTermError] = useState<string | null>(null);
  const [activeGoalDetail, setActiveGoalDetail] = useState<ShortTermGoal | null>(null);
  const [monthlyHoverIndex, setMonthlyHoverIndex] = useState<number | null>(null);
  const [monthlySelectedIndex, setMonthlySelectedIndex] = useState<number | null>(null);
  const [monthlyPointerActive, setMonthlyPointerActive] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthChange = () => {
      setAuthVersion((prev) => prev + 1);
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    };
  }, []);

  const hasLongTermGoal = Boolean(longTermGoal);

  const weeklyStats = useMemo(() => computeWeeklyStats(uploads, new Date()), [uploads]);
  const maxWeekly = useMemo(
    () => weeklyStats.reduce((max, item) => Math.max(max, item.valueHours), 0),
    [weeklyStats],
  );
  const hasWeeklyData = weeklyStats.some((item) => item.minutes > 0);
  const monthlySeries = useMemo(() => buildMonthlySeries(uploads, new Date()), [uploads]);
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
      dateLabel: formatMonthDayLabel(monthlySeries.year, monthlySeries.monthIndex, point.day),
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
    const next = new Set<string>();
    stored.forEach((artwork) => {
      const dateKey = normalizeUploadedDate(artwork.uploadedDate ?? null, artwork.uploadedAt ?? null);
      if (dateKey) {
        next.add(dateKey);
      }
    });
    setLocalUploadDates(next);
  }, []);

  useEffect(() => {
    refreshUploadData();
  }, [refreshUploadData]);

  useEffect(() => {
    let active = true;

    async function loadInitialLongTermGoal() {
      setLongTermLoading(true);
      try {
        if (!hasAuthToken()) {
          setLongTermGoal(null);
          setLongTermError("登录后可同步长期目标。");
          setLongTermRetryable(false);
          return;
        }

        const goal = await fetchLongTermGoal();
        if (!active) {
          return;
        }
        setLongTermGoal(goal);
        setLongTermError(null);
        setLongTermRetryable(true);
      } catch (error) {
        if (!active) {
          return;
        }
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

  useEffect(() => {
    let isMounted = true;

    async function loadShortTerm() {
      if (!hasAuthToken()) {
        setShortTermGoals([]);
        setShortTermError("登录后可查看短期目标。");
        return;
      }

      setShortTermLoading(true);
      try {
        const data = await fetchShortTermGoals();
        if (!isMounted) {
          return;
        }
        setShortTermGoals(data);
        setShortTermError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          setShortTermGoals([]);
          setShortTermError("登录后可查看短期目标。");
        } else {
          console.warn("Failed to load short-term goals", error);
          setShortTermGoals([]);
          setShortTermError("获取短期目标失败，请稍后重试。");
        }
      } finally {
        if (isMounted) {
          setShortTermLoading(false);
        }
      }
    }

    loadShortTerm();

    return () => {
      isMounted = false;
    };
  }, [authVersion]);

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
    return base.map((day) => {
      if (localUploadDates.has(day.date)) {
        if (day.status === "upload") {
          return day;
        }
        return { ...day, status: "upload" as GoalsCalendarDay["status"] };
      }
      return day;
    });
  }, [calendarDays, activeMonth, localUploadDates]);

  const handleWizardClose = useCallback(() => {
    setShowWizard(false);
  }, []);

  const handleGoalSaved = useCallback((goal: ShortTermGoal) => {
    setShortTermGoals((prev) => {
      const filtered = prev.filter((item) => item.id !== goal.id);
      const next = [goal, ...filtered];
      next.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return next;
    });
    setShortTermError(null);
  }, []);

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
    return (
      <LongTermGoalDetails
        goal={activeLongTermGoal}
        onClose={handleCloseLongTermDetails}
        onEdit={() => {
          setActiveLongTermGoal(null);
          setShowLongTermMetaEdit(true);
        }}
        onExport={handleLongTermExport}
      />
    );
  }

  if (activeGoalDetail) {
    return (
      <ShortTermGoalDetails
        goal={activeGoalDetail}
        onClose={() => setActiveGoalDetail(null)}
        uploadDates={localUploadDates}
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

      <TopNav title="目标" subtitle="Progress" className="top-nav--fixed" />

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
              const progressPercent = clampPercent(longTermGoal.progress.progressPercent);
              const spentLabel = `${formatHours(longTermGoal.progress.spentHours)}h`;
              const targetLabel = `${formatHours(longTermGoal.targetHours)}h`;
              const startDateLabel = formatDateLabel(longTermGoal.startedAt);
              const elapsedDays = longTermGoal.progress.elapsedDays;
              const checkpointSummary = `${longTermGoal.progress.completedCheckpoints}/${longTermGoal.progress.totalCheckpoints}`;
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
                        <span className="goals-long-term__bar-label">
                          {spentLabel} / {targetLabel}
                        </span>
                      </div>
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
                  onClick={() => setActiveGoalDetail(goal)}
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

function formatDateLabel(iso: string): string {
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

function formatMonthDayLabel(year: number, monthIndex: number, day: number): string {
  const month = monthIndex + 1;
  return `${month} 月 ${day} 日`;
}


