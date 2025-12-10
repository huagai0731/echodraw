import { memo, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import { ArtisticLoader } from "@/components/ArtisticLoader";
import type { Artwork } from "@/types/artwork";
import WeeklySingleTemplateDesigner from "@/pages/reports/WeeklySingleTemplateDesigner";
import WeeklyDoubleTemplateDesigner from "@/pages/reports/WeeklyDoubleTemplateDesigner";
import MonthlySingleTemplateDesigner from "@/pages/reports/MonthlySingleTemplateDesigner";
import FourImageTemplateDesigner from "@/pages/reports/FourImageTemplateDesigner";
import YearlyTemplateDesigner from "@/pages/reports/YearlyTemplateDesigner";
import FullMonthlyReport from "@/pages/reports/FullMonthlyReport";
import {
  fetchUserTestResults,
  hasAuthToken,
  fetchGoalsCalendar,
  fetchVisualAnalysisResults,
  fetchCurrentUser,
  type UserTestResult,
  type GoalsCalendarDay,
  type VisualAnalysisResultRecord,
} from "@/services/api";
import {
  loadStoredArtworks,
  USER_ARTWORKS_CHANGED_EVENT,
} from "@/services/artworkStorage";
import {
  formatISODateInShanghai,
  parseISODateInShanghai,
  startOfWeekInShanghai,
  getVisibleMonthlyReports,
  getTodayInShanghai,
} from "@/utils/dateUtils";
import { useCheckInDates } from "@/hooks/useCheckInDates";

import "./Reports.css";
import "./Goals.css";
import "./ArtworkDetails.css";

type TemplateAction = "weekly-single" | "weekly-double" | "monthly-single" | "four-image" | "yearly";

type TemplateItem = {
  id: string;
  icon: string;
  label: string;
  action?: TemplateAction;
};

type ReportItem = {
  id: string;
  title: string;
  subtitle: string;
  glow: number;
  testResultId?: number;
  visualAnalysisResultId?: number;
  monthlyReportYear?: number;
  monthlyReportMonth?: number;
  timestamp?: number;
};

type RangeKey = "weekly" | "monthly";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHLY_CHART_WIDTH = 310;
const MONTHLY_CHART_HEIGHT = 192;

// 五个可滑动的模版卡片
const TEMPLATE_CARDS: TemplateItem[] = [
  { id: "weekly-single", icon: "view_week", label: "单周模板", action: "weekly-single" as TemplateAction },
  { id: "weekly-double", icon: "view_week", label: "双周模板", action: "weekly-double" as TemplateAction },
  { id: "monthly-single", icon: "calendar_month", label: "单月模板", action: "monthly-single" as TemplateAction },
  { id: "four-image", icon: "grid_view", label: "四图模板", action: "four-image" as TemplateAction },
  { id: "yearly", icon: "calendar_today", label: "全年模板", action: "yearly" as TemplateAction },
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


function extractDurationMinutes(artwork: Artwork): number {
  if (artwork.durationMinutes !== undefined && artwork.durationMinutes !== null) {
    return Math.max(artwork.durationMinutes, 0);
  }
  // 如果没有durationMinutes，尝试从duration字符串解析
  if (artwork.duration) {
    const match = artwork.duration.trim().match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
    if (match) {
      const hours = parseInt(match[1] || "0", 10);
      const mins = parseInt(match[2] || "0", 10);
      return hours * 60 + mins;
    }
  }
  return 0;
}

function startOfWeek(reference: Date): Date {
  return startOfWeekInShanghai(reference);
}

function computeWeeklyStats(uploads: Artwork[], reference: Date): WeeklyStat[] {
  const start = startOfWeek(reference);
  const startDateStr = formatISODateInShanghai(start);
    if (!startDateStr) {
      return WEEKDAY_LABELS.map((label) => ({
      label,
      minutes: 0,
      valueHours: 0,
      dateKey: "",
    }));
  }

  const startParsed = parseISODateInShanghai(startDateStr);
  if (!startParsed) {
    return WEEKDAY_LABELS.map((label) => ({
      label,
      minutes: 0,
      valueHours: 0,
      dateKey: "",
    }));
  }

    const stats = WEEKDAY_LABELS.map((label, index) => {
      const date = new Date(startParsed);
      date.setDate(date.getDate() + index);
      const dateKey = formatISODateInShanghai(date) || "";
      return {
        label,
        minutes: 0,
        valueHours: 0,
        dateKey,
      };
    });

  uploads.forEach((artwork) => {
    const dateKey = formatISODateInShanghai(new Date(artwork.uploadedAt || artwork.uploadedDate || ""));
    if (!dateKey) return;

    const uploadDate = parseISODateInShanghai(dateKey);
    if (!uploadDate) return;

    const dayIndex = Math.floor((uploadDate.getTime() - startParsed.getTime()) / (1000 * 60 * 60 * 24));
    if (dayIndex >= 0 && dayIndex < 7) {
      const minutes = extractDurationMinutes(artwork);
      stats[dayIndex].minutes += minutes;
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
  const referenceDateStr = formatISODateInShanghai(reference);
  if (!referenceDateStr) {
    const year = reference.getFullYear();
    const monthIndex = reference.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return {
      path: `M0 ${MONTHLY_CHART_HEIGHT} L ${MONTHLY_CHART_WIDTH} ${MONTHLY_CHART_HEIGHT}`,
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
      path: `M0 ${MONTHLY_CHART_HEIGHT} L ${MONTHLY_CHART_WIDTH} ${MONTHLY_CHART_HEIGHT}`,
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
    const dateKey = formatISODateInShanghai(new Date(artwork.uploadedAt || artwork.uploadedDate || ""));
    if (!dateKey) return;
    const [y, m, d] = dateKey.split("-").map(Number);
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

  const maxMinutes = Math.max(...totals, 1);
  const chartHeight = MONTHLY_CHART_HEIGHT - 28;
  const points: MonthlySeriesPoint[] = totals.map((minutes, day) => {
    const x = (day / (daysInMonth - 1)) * MONTHLY_CHART_WIDTH;
    const y = chartHeight - (minutes / maxMinutes) * chartHeight;
    return { x, y, minutes, day: day + 1 };
  });

  const pathParts: string[] = [];
  if (points.length > 0) {
    pathParts.push(`M${points[0].x} ${points[0].y}`);
    for (let i = 1; i < points.length; i++) {
      pathParts.push(`L${points[i].x} ${points[i].y}`);
    }
  } else {
    pathParts.push(`M0 ${chartHeight} L ${MONTHLY_CHART_WIDTH} ${chartHeight}`);
  }

  return {
    path: pathParts.join(" "),
    labels: generateMonthlyLabels(daysInMonth),
    hasData: totals.some((t) => t > 0),
    points,
    defaultHintIndex: Math.floor(points.length / 2),
    year,
    monthIndex,
  };
}

type ReportsProps = {
  artworks?: Artwork[];
  onOpenTestResult?: (resultId: number) => void;
  onOpenVisualAnalysisResult?: (resultId: number) => void;
};

function Reports({ artworks = [], onOpenTestResult, onOpenVisualAnalysisResult }: ReportsProps) {
  // 模版相关状态
  const [weeklySingleTemplateOpen, setWeeklySingleTemplateOpen] = useState(false);
  const [weeklyDoubleTemplateOpen, setWeeklyDoubleTemplateOpen] = useState(false);
  const [monthlySingleTemplateOpen, setMonthlySingleTemplateOpen] = useState(false);
  const [fourImageTemplateOpen, setFourImageTemplateOpen] = useState(false);
  const [yearlyTemplateOpen, setYearlyTemplateOpen] = useState(false);
  const [templatesPageOpen, setTemplatesPageOpen] = useState(false);
  const [reportsPageOpen, setReportsPageOpen] = useState(false);

  // 报告相关状态
  const [testResults, setTestResults] = useState<UserTestResult[]>([]);
  const [visualAnalysisResults, setVisualAnalysisResults] = useState<VisualAnalysisResultRecord[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  
  // 月报相关状态
  const [monthlyReportOpen, setMonthlyReportOpen] = useState(false);
  const [selectedMonthlyReport, setSelectedMonthlyReport] = useState<{
    year: number;
    month: number;
  } | null>(null);

  // 趋势相关状态
  const [range, setRange] = useState<RangeKey>("weekly");
  const [uploads, setUploads] = useState<Artwork[]>([]);
  const [activeMonth, setActiveMonth] = useState(() => {
    const todayStr = getTodayInShanghai();
    const today = parseISODateInShanghai(todayStr) || new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarDays, setCalendarDays] = useState<GoalsCalendarDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [monthlyHoverIndex, setMonthlyHoverIndex] = useState<number | null>(null);
  const [monthlySelectedIndex, setMonthlySelectedIndex] = useState<number | null>(null);
  const [monthlyPointerActive, setMonthlyPointerActive] = useState(false);
  
  // 跟踪触摸起始位置，用于判断是滚动还是交互
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // 栏的展开/收起状态
  // 模版和报告栏始终展开，不再需要状态控制
  // 趋势栏固定展开，不再需要状态控制

  const { checkInDates: localUploadDates } = useCheckInDates();

  // 使用模块级缓存，避免组件重新挂载时丢失数据
  const reportsCacheKey = 'reports-cache';
  const CACHE_MAX_AGE = 5 * 60 * 1000; // 5分钟

  // 加载测试结果和视觉分析结果
  useEffect(() => {
    const loadDataInternal = async () => {
      setReportsLoading(true);
      if (!hasAuthToken()) {
        setTestResults([]);
        setVisualAnalysisResults([]);
        setReportsLoading(false);
        return;
      }

      // 并行加载所有数据，提高速度
      const [results, visualResults] = await Promise.allSettled([
        fetchUserTestResults(),
        fetchVisualAnalysisResults(),
      ]);

      // 处理测试结果
      if (results.status === 'fulfilled') {
        setTestResults(results.value);
      } else {
        setTestResults([]);
      }

      // 处理视觉分析结果
      if (visualResults.status === 'fulfilled') {
        setVisualAnalysisResults(visualResults.value);
      } else {
        setVisualAnalysisResults([]);
      }
      
      setReportsLoading(false);
    };

    // 先检查是否有缓存，如果有缓存则先显示缓存，然后在后台更新
    const hasCache = (() => {
      try {
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem(reportsCacheKey);
          if (cached) {
            const { timestamp } = JSON.parse(cached);
            const cacheAge = Date.now() - timestamp;
            if (cacheAge < CACHE_MAX_AGE) {
              return true;
            }
          }
        }
      } catch {
        // ignore
      }
      return false;
    })();

    // 如果有缓存，延迟加载，避免阻塞渲染
    if (hasCache) {
      startTransition(() => {
        loadDataInternal();
      });
    } else {
      // 没有缓存，立即加载
      loadDataInternal();
    }
  }, []);

  // 组件挂载时，先尝试使用缓存数据（立即显示，提升用户体验）
  const useCacheRef = useRef(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && !useCacheRef.current) {
      useCacheRef.current = true;
      try {
        const cached = localStorage.getItem(reportsCacheKey);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const cacheAge = Date.now() - timestamp;
          if (cacheAge < CACHE_MAX_AGE) {
            setTestResults(data.testResults || []);
            setVisualAnalysisResults(data.visualAnalysisResults || []);
            setReportsLoading(false);
          }
        }
      } catch (err) {
        // Failed to read cache
      }
    }
  }, []);
  
  // 当数据加载成功后，更新缓存
  useEffect(() => {
    if (!reportsLoading && (testResults.length > 0 || visualAnalysisResults.length > 0)) {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(reportsCacheKey, JSON.stringify({
            data: {
              testResults,
              visualAnalysisResults,
            },
            timestamp: Date.now(),
          }));
        } catch (err) {
          // Failed to save cache
        }
      }
    }
  }, [reportsLoading, testResults, visualAnalysisResults]);

  // 加载上传数据
  useEffect(() => {
    const stored = loadStoredArtworks();
    setUploads(stored);
  }, []);

  useEffect(() => {
    const handleArtworksChanged = () => {
      const stored = loadStoredArtworks();
      setUploads(stored);
    };

    window.addEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    return () => {
      window.removeEventListener(USER_ARTWORKS_CHANGED_EVENT, handleArtworksChanged);
    };
  }, []);

  // 加载打卡日历
  useEffect(() => {
    let isMounted = true;

    async function loadCalendar(year: number, month: number) {
      // 未登录时也显示日历（使用空数据，但显示界面）
      if (!hasAuthToken()) {
        setCalendarDays([]);
        setCalendarError(null);
        setCalendarLoading(false);
        return;
      }

      setCalendarLoading(true);
      try {
        const data = await fetchGoalsCalendar({ year, month });
        if (!isMounted) return;
        setCalendarDays(data.days);
        setCalendarError(null);
      } catch (error) {
        if (!isMounted) return;
        setCalendarDays([]);
        setCalendarError("获取打卡记录失败，请稍后重试。");
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
  }, [activeMonth]);

  const mergedCalendarDays = useMemo(() => {
    if (calendarDays.length === 0) return [];
    return calendarDays.map((day) => {
      if (localUploadDates.has(day.date) && day.status === "none") {
        return { ...day, status: "upload" as GoalsCalendarDay["status"] };
      }
      return day;
    });
  }, [calendarDays, localUploadDates]);

  const handleTemplateAction = useCallback(
    (action: TemplateAction) => {
      if (action === "weekly-single") {
        setWeeklySingleTemplateOpen(true);
        return;
      }
      if (action === "weekly-double") {
        setWeeklyDoubleTemplateOpen(true);
        return;
      }
      if (action === "monthly-single") {
        setMonthlySingleTemplateOpen(true);
        return;
      }
      if (action === "four-image") {
        setFourImageTemplateOpen(true);
        return;
      }
      if (action === "yearly") {
        setYearlyTemplateOpen(true);
        return;
      }
    },
    [],
  );

  const renderTemplateItem = useCallback(
    (item: { id: string; icon: string; label: string; action?: TemplateAction }) => {
      if (item.action) {
        return (
          <button
            key={item.id}
            type="button"
            className="reports-template reports-template--action"
            onClick={() => handleTemplateAction(item.action!)}
          >
            <MaterialIcon name={item.icon} className="reports-template__icon" />
            <p className="reports-template__label">{item.label}</p>
          </button>
        );
      }
      return (
        <article key={item.id} className="reports-template">
          <MaterialIcon name={item.icon} className="reports-template__icon" />
          <p className="reports-template__label">{item.label}</p>
        </article>
      );
    },
    [handleTemplateAction],
  );

  // 计算趋势数据
  const todayInShanghai = useMemo(() => {
    const todayStr = getTodayInShanghai();
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
      dateLabel: `${point.day}日`,
      valueLabel: `${valueHours.toFixed(1)} 小时`,
      left,
      top,
    };
  }, [monthlySeries, monthlyHoverIndex, monthlySelectedIndex]);

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
      const isTouch = event.pointerType === "touch";
      
      // 记录触摸起始位置
      if (isTouch) {
        touchStartRef.current = {
          x: event.clientX,
          y: event.clientY,
          time: Date.now(),
        };
        // 触摸设备不阻止默认行为，允许滚动
      } else {
        // 非触摸设备（鼠标/笔）正常处理
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
      }
    },
    [monthlySeries, updateMonthlyHoverIndex],
  );

  const handleMonthlyPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (!monthlySeries.hasData || monthlySeries.points.length === 0) {
        return;
      }
      const isMouseLike = event.pointerType === "mouse" || event.pointerType === "pen";
      const isTouch = event.pointerType === "touch";
      
      if (isTouch) {
        // 触摸设备：检测滑动方向
        if (!touchStartRef.current) {
          return;
        }
        const deltaX = Math.abs(event.clientX - touchStartRef.current.x);
        const deltaY = Math.abs(event.clientY - touchStartRef.current.y);
        
        // 如果是垂直滑动（滚动），不处理，让页面滚动
        if (deltaY > deltaX && deltaY > 10) {
          touchStartRef.current = null;
          setMonthlyPointerActive(false);
          return;
        }
        
        // 如果是水平滑动或点击，激活交互
        if (deltaX > 5 || (deltaX < 5 && deltaY < 5)) {
          if (!monthlyPointerActive) {
            setMonthlyPointerActive(true);
          }
          updateMonthlyHoverIndex(event);
        }
      } else {
        // 鼠标和笔设备正常处理
        if (!isMouseLike && !monthlyPointerActive) {
          return;
        }
        updateMonthlyHoverIndex(event);
      }
    },
    [monthlySeries, monthlyPointerActive, updateMonthlyHoverIndex],
  );

  const endMonthlyPointerInteraction = useCallback(() => {
    setMonthlyPointerActive(false);
    touchStartRef.current = null;
  }, []);

  const handleMonthlyPointerLeave = useCallback(() => {
    setMonthlyPointerActive(false);
    setMonthlyHoverIndex(null);
    touchStartRef.current = null;
  }, []);

  // 获取用户注册日期
  const [userRegistrationDate, setUserRegistrationDate] = useState<string | null>(null);
  
  useEffect(() => {
    if (!hasAuthToken()) {
      setUserRegistrationDate(null);
      return;
    }
    
    fetchCurrentUser()
      .then((user) => {
        // 从 ISO 格式中提取日期部分（YYYY-MM-DD）
        if (user.date_joined) {
          const dateStr = user.date_joined.split('T')[0]; // 提取日期部分
          setUserRegistrationDate(dateStr);
        } else {
          setUserRegistrationDate(null);
        }
      })
      .catch((err) => {
        setUserRegistrationDate(null);
      });
  }, []);
  
  // 获取可见的月报列表
  const visibleMonthlyReports = useMemo(() => {
    const reports = getVisibleMonthlyReports(userRegistrationDate);
    return reports;
  }, [userRegistrationDate]);

  // 构建报告列表
  const reportItems = useMemo<ReportItem[]>(() => {
    const items: ReportItem[] = [];

    // 添加月报卡片
    visibleMonthlyReports.forEach(({ year, month }, index) => {
      items.push({
        id: `monthly-report-${year}-${month}`,
        title: `${month}月月报`,
        subtitle: `${year}年${month}月`,
        glow: (month % 7) + 1,
        monthlyReportYear: year,
        monthlyReportMonth: month,
        timestamp: new Date(year, month - 1, 1).getTime(),
      });
    });

    // 从测试结果中提取
    testResults.forEach((result, index) => {
      const date = new Date(result.completed_at);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      
      items.push({
        id: `test-result-${result.id}`,
        title: result.test_name,
        subtitle: `${year}年${month}月${day}日 ${hours}:${minutes}`,
        glow: ((visibleMonthlyReports.length + index) % 7) + 1,
        testResultId: result.id,
        timestamp: date.getTime(),
      });
    });

    // 从视觉分析结果中提取
    // 视觉分析结果不再显示在报告页（只在视觉分析卡片中显示）
    // visualAnalysisResults.forEach((result, index) => {
    //   const date = new Date(result.created_at);
    //   const year = date.getFullYear();
    //   const month = String(date.getMonth() + 1).padStart(2, "0");
    //   const day = String(date.getDate()).padStart(2, "0");
    //   const hours = String(date.getHours()).padStart(2, "0");
    //   const minutes = String(date.getMinutes()).padStart(2, "0");
    //   
    //   items.push({
    //     id: `visual-analysis-${result.id}`,
    //     title: "视觉分析",
    //     subtitle: `${year}年${month}月${day}日 ${hours}:${minutes}`,
    //     glow: ((testResults.length + index) % 7) + 1,
    //     visualAnalysisResultId: result.id,
    //     timestamp: date.getTime(),
    //   });
    // });

    // 按时间戳排序，最新的在前
    return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [testResults, visualAnalysisResults, visibleMonthlyReports]);

  const unreadReports = useMemo(() => {
    if (!hasAuthToken()) return [];
    // 测试结果默认算作未读
    return reportItems;
  }, [reportItems]);

  const hasUnreadReports = unreadReports.length > 0;


  // 处理打开月报
  const handleOpenMonthlyReport = useCallback((year: number, month: number) => {
    const targetMonthStr = `${year}-${String(month).padStart(2, "0")}`;
    // 先设置selectedMonthlyReport，确保targetMonth有值
    setSelectedMonthlyReport({ year, month });
    // 立即打开（React会批量更新，但我们需要确保顺序）
    // 使用flushSync或者确保状态更新顺序
    setMonthlyReportOpen(true);
  }, []);


  // 处理报告列表页
  if (reportsPageOpen) {
    return (
      <div className="reports-screen">
        <div className="reports-screen__background">
          <div className="reports-screen__glow reports-screen__glow--mint" />
          <div className="reports-screen__glow reports-screen__glow--brown" />
        </div>

        <div className="reports-screen__topbar">
          <TopNav
            title="报告"
            subtitle="Reports"
            className="top-nav--fixed top-nav--flush"
            leadingAction={{
              icon: "arrow_back",
              label: "返回",
              onClick: () => setReportsPageOpen(false),
            }}
          />
        </div>

        <main className="reports-screen__content">
          <div className="reports-screen__list">
            {reportsLoading ? (
              <div className="reports-loading">
                <ArtisticLoader size="medium" text="正在加载报告..." />
              </div>
            ) : reportItems.length > 0 ? (
              reportItems.map((item) => (
                <article
                  key={item.id}
                  className={`reports-card reports-card--glow-${item.glow} reports-card--full-width`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (item.monthlyReportYear && item.monthlyReportMonth) {
                      handleOpenMonthlyReport(item.monthlyReportYear, item.monthlyReportMonth);
                    } else if (item.testResultId !== undefined && onOpenTestResult) {
                      onOpenTestResult(item.testResultId);
                    } else if (item.visualAnalysisResultId !== undefined && onOpenVisualAnalysisResult) {
                      onOpenVisualAnalysisResult(item.visualAnalysisResultId);
                    }
                  }}
                  style={(item.monthlyReportYear !== undefined || item.testResultId !== undefined || item.visualAnalysisResultId !== undefined) ? { cursor: "pointer" } : undefined}
                >
                  <div className="reports-card__body">
                    <p className="reports-card__title">{item.title}</p>
                    <p className="reports-card__subtitle">{item.subtitle}</p>
                  </div>
                  {(item.monthlyReportYear !== undefined || item.testResultId !== undefined || item.visualAnalysisResultId !== undefined) && (
                    <MaterialIcon name="chevron_right" className="reports-card__icon" />
                  )}
                </article>
              ))
            ) : (
              <div className="reports-empty">暂无报告</div>
            )}
          </div>
        </main>

        {selectedMonthlyReport && (
          <FullMonthlyReport
            key={`${selectedMonthlyReport.year}-${selectedMonthlyReport.month}`}
            open={monthlyReportOpen}
            onClose={() => {
              setMonthlyReportOpen(false);
              setSelectedMonthlyReport(null);
            }}
            targetMonth={`${selectedMonthlyReport.year}-${String(selectedMonthlyReport.month).padStart(2, "0")}`}
          />
        )}
      </div>
    );
  }

  // 处理模版页（原来的templates tab）
  if (templatesPageOpen) {
    // 检查是否有模版设计器打开
    const anyTemplateOpen = weeklySingleTemplateOpen || weeklyDoubleTemplateOpen || monthlySingleTemplateOpen || fourImageTemplateOpen || yearlyTemplateOpen;
    
    return (
      <div className="reports-screen">
        <div className="reports-screen__background">
          <div className="reports-screen__glow reports-screen__glow--mint" />
          <div className="reports-screen__glow reports-screen__glow--brown" />
        </div>

        {!anyTemplateOpen && (
          <TopNav
            title="模版"
            subtitle="Templates"
            className="top-nav--fixed top-nav--flush"
            leadingAction={{
              icon: "arrow_back",
              label: "返回",
              onClick: () => setTemplatesPageOpen(false),
            }}
          />
        )}

        <main className="reports-screen__content">
          <div className="reports-screen__templates">
            <section className="reports-section">
              <header className="reports-section__header">
                <h2>图片导出</h2>
              </header>
              <div className="reports-section__grid">
                {TEMPLATE_CARDS.map(renderTemplateItem)}
              </div>
            </section>
          </div>
        </main>

        <WeeklySingleTemplateDesigner open={weeklySingleTemplateOpen} artworks={artworks} onClose={() => setWeeklySingleTemplateOpen(false)} />
        <WeeklyDoubleTemplateDesigner open={weeklyDoubleTemplateOpen} artworks={artworks} onClose={() => setWeeklyDoubleTemplateOpen(false)} />
        <MonthlySingleTemplateDesigner open={monthlySingleTemplateOpen} artworks={artworks} onClose={() => setMonthlySingleTemplateOpen(false)} />
        <FourImageTemplateDesigner open={fourImageTemplateOpen} artworks={artworks} onClose={() => setFourImageTemplateOpen(false)} />
        <YearlyTemplateDesigner open={yearlyTemplateOpen} artworks={artworks} onClose={() => setYearlyTemplateOpen(false)} />
      </div>
    );
  }

  // 检查是否有模版设计器打开
  const anyTemplateOpen = weeklySingleTemplateOpen || weeklyDoubleTemplateOpen || monthlySingleTemplateOpen || fourImageTemplateOpen || yearlyTemplateOpen;

  return (
    <div className="reports-screen">
      <div className="reports-screen__background">
        <div className="reports-screen__pattern" />
        <div className="reports-screen__glow reports-screen__glow--one" />
        <div className="reports-screen__glow reports-screen__glow--two" />
        <div className="reports-screen__glow reports-screen__glow--three" />
      </div>

      {!anyTemplateOpen && (
        <TopNav
          title="报告"
          subtitle="Reports"
          className="top-nav--fixed top-nav--flush"
        />
      )}

      <main className="reports-screen__content">
        {/* 模版栏 */}
        <section className="reports-collapsible">
          <button
            type="button"
            className="reports-collapsible__header"
            onClick={() => setTemplatesPageOpen(true)}
          >
            <h2 className="reports-collapsible__title">模版</h2>
            <MaterialIcon
              name="chevron_right"
              className="reports-collapsible__icon"
            />
          </button>
          <div className="reports-collapsible__content">
            <div className="reports-templates-scroll">
              {TEMPLATE_CARDS.slice(0, 3).map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="reports-template-card"
                  onClick={() => handleTemplateAction(card.action!)}
                >
                  <MaterialIcon name={card.icon} className="reports-template-card__icon" />
                  <p className="reports-template-card__label">{card.label}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 报告栏 */}
        <section className="reports-collapsible">
          <button
            type="button"
            className="reports-collapsible__header"
            onClick={() => setReportsPageOpen(true)}
          >
            <h2 className="reports-collapsible__title">报告</h2>
            <MaterialIcon
              name="chevron_right"
              className="reports-collapsible__icon"
            />
          </button>
          <div className="reports-collapsible__content">
            {hasUnreadReports ? (
              <div className="reports-list-single">
                {unreadReports.slice(0, 1).map((item) => (
                  <article
                    key={item.id}
                    className={`reports-card reports-card--glow-${item.glow} reports-card--full-width`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (item.monthlyReportYear && item.monthlyReportMonth) {
                        handleOpenMonthlyReport(item.monthlyReportYear, item.monthlyReportMonth);
                      } else if (item.testResultId !== undefined && onOpenTestResult) {
                        onOpenTestResult(item.testResultId);
                      } else if (item.visualAnalysisResultId !== undefined && onOpenVisualAnalysisResult) {
                        onOpenVisualAnalysisResult(item.visualAnalysisResultId);
                      }
                    }}
                    style={(item.monthlyReportYear !== undefined || item.testResultId !== undefined || item.visualAnalysisResultId !== undefined) ? { cursor: "pointer" } : undefined}
                  >
                    <div className="reports-card__body">
                      <p className="reports-card__title">{item.title}</p>
                      <p className="reports-card__subtitle">{item.subtitle}</p>
                    </div>
                    {(item.monthlyReportYear !== undefined || item.testResultId !== undefined || item.visualAnalysisResultId !== undefined) && (
                      <MaterialIcon name="chevron_right" className="reports-card__icon" />
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="reports-empty">暂无未读报告</div>
            )}
          </div>
        </section>

        {/* 趋势栏 */}
        <section className="reports-collapsible">
          <div className="reports-collapsible__header">
            <h2 className="reports-collapsible__title">趋势</h2>
          </div>
          <div className="reports-collapsible__content">
              <section className="goals-section">
                <div className="goals-card">
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
                          onPointerDown={(e) => {
                            // 在移动设备上完全禁用交互，避免干扰滚动
                            if (e.pointerType === "touch") {
                              return;
                            }
                            handleMonthlyPointerDown(e);
                          }}
                          onPointerMove={(e) => {
                            // 在移动设备上完全禁用交互，避免干扰滚动
                            if (e.pointerType === "touch") {
                              return;
                            }
                            handleMonthlyPointerMove(e);
                          }}
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
          </div>
        </section>
      </main>

      <WeeklySingleTemplateDesigner open={weeklySingleTemplateOpen} artworks={artworks} onClose={() => setWeeklySingleTemplateOpen(false)} />
      <WeeklyDoubleTemplateDesigner open={weeklyDoubleTemplateOpen} artworks={artworks} onClose={() => setWeeklyDoubleTemplateOpen(false)} />
      <MonthlySingleTemplateDesigner open={monthlySingleTemplateOpen} artworks={artworks} onClose={() => setMonthlySingleTemplateOpen(false)} />
      <FourImageTemplateDesigner open={fourImageTemplateOpen} artworks={artworks} onClose={() => setFourImageTemplateOpen(false)} />
      <YearlyTemplateDesigner open={yearlyTemplateOpen} artworks={artworks} onClose={() => setYearlyTemplateOpen(false)} />
      {selectedMonthlyReport && (
        <FullMonthlyReport
          key={`${selectedMonthlyReport.year}-${selectedMonthlyReport.month}`}
          open={monthlyReportOpen}
          onClose={() => {
            setMonthlyReportOpen(false);
            setSelectedMonthlyReport(null);
          }}
          targetMonth={`${selectedMonthlyReport.year}-${String(selectedMonthlyReport.month).padStart(2, "0")}`}
        />
      )}
    </div>
  );
}

// 使用 React.memo 优化，避免不必要的重渲染
export default memo(Reports);
