import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import html2canvas from "html2canvas";
import MaterialIcon from "@/components/MaterialIcon";
import { ArtisticLoader } from "@/components/ArtisticLoader";
import { fetchUserUploads, type UserUploadRecord } from "@/services/api";
import api from "@/services/api";
import { formatISODateInShanghai, parseISODateInShanghai, getTodayInShanghai } from "@/utils/dateUtils";
import { replaceLocalhostInUrl } from "@/utils/urlUtils";
import type { AdminMonthlyReportTemplate } from "@/admin/api";

import "./FullMonthlyReport.css";

type FullMonthlyReportProps = {
  open: boolean;
  onClose: () => void;
  targetMonth?: string; // YYYY-MM 格式，默认为当前月
  adminUserId?: number; // 后台管理员查看指定用户的月报时使用
};

type ReportScreen = {
  id: number;
  label: string;
  title: string;
  description: string;
};

type MonthlyStats = {
  totalUploads: number;
  totalHours: number;
  avgHoursPerUpload: number;
  avgRating: number;
  mostUploadDay: { date: string; count: number } | null;
  currentStreak: number;
  longestStreak: number;
};

type TimeDistribution = {
  hour: number;
  count: number;
  percentage: number;
};

type WeeklyDistribution = {
  weekday: number; // 0-6, 0=Monday
  count: number;
  minutes: number;
};

type TagStat = {
  tag: string;
  count: number;
  percentage: number;
  avgDurationMinutes: number;
  avgRating: number;
};

type CalendarDay = {
  day: number; // 日期（1-31）
  count: number; // 该日上传数量
  weekday: number; // 星期几（0=周一，6=周日）
  opacity: number; // 背景透明度（0-1）
};

const REPORT_SCREENS: ReportScreen[] = [
  {
    id: 5,
    label: "reports_screen_5",
    title: "月度摘要",
    description: "本月概览与关键指标",
  },
  {
    id: 6,
    label: "reports_screen_6",
    title: "节律与习惯",
    description: "创作时段与周内节奏",
  },
  {
    id: 8,
    label: "reports_screen_8",
    title: "标签快照",
    description: "标签分布与表现概览",
  },
  {
    id: 9,
    label: "reports_screen_9",
    title: "节点回顾",
    description: "作品对比与高分亮点",
  },
  {
    id: 10,
    label: "reports_screen_10",
    title: "创作深度",
    description: "创作时长结构与专注分布",
  },
  {
    id: 11,
    label: "reports_screen_11",
    title: "趋势对比",
    description: "与过往时段的表现对比",
  },
  {
    id: 12,
    label: "reports_screen_12",
    title: "个性化洞察",
    description: "针对习惯与情绪的洞察建议",
  },
];

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

// 计算连续打卡天数
function calculateStreaks(uploadDates: Set<string>): { current: number; longest: number } {
  if (uploadDates.size === 0) {
    return { current: 0, longest: 0 };
  }

  const sortedDates = Array.from(uploadDates)
    .map((dateStr) => {
      const date = parseISODateInShanghai(dateStr);
      return date ? { date, dateStr } : null;
    })
    .filter((item): item is { date: Date; dateStr: string } => item !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (sortedDates.length === 0) {
    return { current: 0, longest: 0 };
  }

  // 计算当前连续天数
  const today = getTodayInShanghai();
  const todayDate = parseISODateInShanghai(today);
  let currentStreak = 0;

  if (todayDate) {
    let checkDate = new Date(todayDate);
    let foundToday = false;

    // 检查今天是否有打卡
    const todayStr = formatISODateInShanghai(checkDate);
    if (todayStr && uploadDates.has(todayStr)) {
      currentStreak = 1;
      foundToday = true;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // 从今天或昨天往前数
    while (true) {
      const dateStr = formatISODateInShanghai(checkDate);
      if (!dateStr || !uploadDates.has(dateStr)) {
        break;
      }
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // 如果今天没有打卡，且昨天也没打卡，则连续天数为0
    if (!foundToday && currentStreak === 0) {
      currentStreak = 0;
    }
  }

  // 计算历史最长连续天数
  let longestStreak = 0;
  let currentRun = 1;
  let prevDate: Date | null = null;

  for (const { date } of sortedDates) {
    if (prevDate === null) {
      prevDate = date;
      longestStreak = 1;
      continue;
    }

    const diffDays = Math.floor((prevDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      currentRun++;
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 1;
    }
    
    prevDate = date;
  }

  return {
    current: currentStreak,
    longest: longestStreak,
  };
}

// 计算月度统计数据
function calculateMonthlyStats(
  uploads: UserUploadRecord[],
  targetMonth: string
): MonthlyStats {
  const [year, month] = targetMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const startDateStr = formatISODateInShanghai(startDate);
  const endDateStr = formatISODateInShanghai(endDate);

  if (!startDateStr || !endDateStr) {
    return {
      totalUploads: 0,
      totalHours: 0,
      avgHoursPerUpload: 0,
      avgRating: 0,
      mostUploadDay: null,
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  // 筛选出本月的上传记录
  const monthlyUploads = uploads.filter((upload) => {
    const uploadDateStr = formatISODateInShanghai(upload.uploaded_at);
    if (!uploadDateStr) return false;
    return uploadDateStr >= startDateStr && uploadDateStr <= endDateStr;
  });

  // 计算总上传数和总时长
  const totalUploads = monthlyUploads.length;
  const totalMinutes = monthlyUploads.reduce((sum, upload) => {
    return sum + (upload.duration_minutes || 0);
  }, 0);
  const totalHours = totalMinutes / 60;
  const avgHoursPerUpload = totalUploads > 0 ? totalHours / totalUploads : 0;

  // 计算平均评分
  const ratings = monthlyUploads
    .map((upload) => upload.self_rating)
    .filter((rating): rating is number => rating !== null && rating > 0);
  const avgRating = ratings.length > 0
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : 0;

  // 找出最多上传的日期
  const dateCounts = new Map<string, number>();
  monthlyUploads.forEach((upload) => {
    const dateStr = formatISODateInShanghai(upload.uploaded_at);
    if (dateStr) {
      dateCounts.set(dateStr, (dateCounts.get(dateStr) || 0) + 1);
    }
  });

  let mostUploadDay: { date: string; count: number } | null = null;
  dateCounts.forEach((count, dateStr) => {
    if (!mostUploadDay || count > mostUploadDay.count) {
      mostUploadDay = { date: dateStr, count };
    }
  });

  // 计算连续打卡天数（需要所有历史数据）
  const allUploadDates = new Set<string>();
  uploads.forEach((upload) => {
    const dateStr = formatISODateInShanghai(upload.uploaded_at);
    if (dateStr) {
      allUploadDates.add(dateStr);
    }
  });
  const streaks = calculateStreaks(allUploadDates);

  return {
    totalUploads,
    totalHours,
    avgHoursPerUpload,
    avgRating,
    mostUploadDay,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
  };
}

// 计算时段分布
function calculateTimeDistribution(
  uploads: UserUploadRecord[],
  targetMonth: string
): TimeDistribution[] {
  const [year, month] = targetMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const startDateStr = formatISODateInShanghai(startDate);
  const endDateStr = formatISODateInShanghai(endDate);

  if (!startDateStr || !endDateStr) {
    return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, percentage: 0 }));
  }

  const monthlyUploads = uploads.filter((upload) => {
    const uploadDateStr = formatISODateInShanghai(upload.uploaded_at);
    if (!uploadDateStr) return false;
    return uploadDateStr >= startDateStr && uploadDateStr <= endDateStr;
  });

  const hourCounts = new Map<number, number>();
  monthlyUploads.forEach((upload) => {
    const uploadDate = new Date(upload.uploaded_at);
    const hour = uploadDate.getHours();
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  });

  const total = monthlyUploads.length;
  const distribution: TimeDistribution[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: hourCounts.get(i) || 0,
    percentage: total > 0 ? ((hourCounts.get(i) || 0) / total) * 100 : 0,
  }));

  return distribution;
}

// 计算周内分布
function calculateWeeklyDistribution(
  uploads: UserUploadRecord[],
  targetMonth: string
): WeeklyDistribution[] {
  const [year, month] = targetMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const startDateStr = formatISODateInShanghai(startDate);
  const endDateStr = formatISODateInShanghai(endDate);

  if (!startDateStr || !endDateStr) {
    return Array.from({ length: 7 }, (_, i) => ({ weekday: i, count: 0, minutes: 0 }));
  }

  const monthlyUploads = uploads.filter((upload) => {
    const uploadDateStr = formatISODateInShanghai(upload.uploaded_at);
    if (!uploadDateStr) return false;
    return uploadDateStr >= startDateStr && uploadDateStr <= endDateStr;
  });

  const weekdayStats = Array.from({ length: 7 }, () => ({ count: 0, minutes: 0 }));

  monthlyUploads.forEach((upload) => {
    const uploadDate = new Date(upload.uploaded_at);
    // getDay() 返回 0-6，0=Sunday，我们需要转换为 0=Monday
    let weekday = uploadDate.getDay();
    weekday = weekday === 0 ? 6 : weekday - 1; // 转换：0(Sun)->6, 1(Mon)->0, ..., 6(Sat)->5

    weekdayStats[weekday].count++;
    weekdayStats[weekday].minutes += upload.duration_minutes || 0;
  });

  return weekdayStats.map((stats, i) => ({
    weekday: i,
    count: stats.count,
    minutes: stats.minutes,
  }));
}

// 计算热力日历图数据
function calculateHeatmapCalendar(
  uploads: UserUploadRecord[],
  targetMonth: string
): CalendarDay[] {
  const [year, month] = targetMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const startDateStr = formatISODateInShanghai(startDate);
  const endDateStr = formatISODateInShanghai(endDate);

  if (!startDateStr || !endDateStr) {
    return [];
  }

  // 筛选出本月的上传记录
  const monthlyUploads = uploads.filter((upload) => {
    const uploadDateStr = formatISODateInShanghai(upload.uploaded_at);
    if (!uploadDateStr) return false;
    return uploadDateStr >= startDateStr && uploadDateStr <= endDateStr;
  });

  // 统计每天的上传数量
  const dayCounts = new Map<number, number>();
  monthlyUploads.forEach((upload) => {
    const uploadDateStr = formatISODateInShanghai(upload.uploaded_at);
    if (!uploadDateStr) return;
    const uploadDate = parseISODateInShanghai(uploadDateStr);
    if (!uploadDate) return;
    const day = uploadDate.getDate();
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
  });

  // 获取月份的第一天和最后一天
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();

  // 获取第一天是星期几（转换为周一=0）
  let firstWeekday = firstDay.getDay();
  firstWeekday = firstWeekday === 0 ? 6 : firstWeekday - 1;

  // 找出最大上传数，用于计算透明度
  const maxCount = Math.max(...Array.from(dayCounts.values()), 1);

  // 生成日历数据
  const calendar: CalendarDay[] = [];

  // 添加月份开始前的空白日期
  for (let i = 0; i < firstWeekday; i++) {
    calendar.push({
      day: 0, // 0表示空白
      count: 0,
      weekday: i,
      opacity: 0,
    });
  }

  // 添加月份的所有日期
  for (let day = 1; day <= daysInMonth; day++) {
    const count = dayCounts.get(day) || 0;
    // 计算透明度：0.1 (最少) 到 0.95 (最多)
    const opacity = count > 0 ? Math.min(0.1 + (count / maxCount) * 0.85, 0.95) : 0;
    
    // 计算该日期是星期几
    const date = new Date(year, month - 1, day);
    let weekday = date.getDay();
    weekday = weekday === 0 ? 6 : weekday - 1;

    calendar.push({
      day,
      count,
      weekday,
      opacity,
    });
  }

  return calendar;
}

// 计算标签统计
function calculateTagStats(
  uploads: UserUploadRecord[],
  targetMonth: string
): TagStat[] {
  const [year, month] = targetMonth.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const startDateStr = formatISODateInShanghai(startDate);
  const endDateStr = formatISODateInShanghai(endDate);

  if (!startDateStr || !endDateStr) {
    return [];
  }

  const monthlyUploads = uploads.filter((upload) => {
    const uploadDateStr = formatISODateInShanghai(upload.uploaded_at);
    if (!uploadDateStr) return false;
    return uploadDateStr >= startDateStr && uploadDateStr <= endDateStr;
  });

  // 统计每个标签的数据
  const tagData = new Map<string, { count: number; durations: number[]; ratings: number[] }>();
  
  monthlyUploads.forEach((upload) => {
    upload.tags.forEach((tag) => {
      if (!tagData.has(tag)) {
        tagData.set(tag, { count: 0, durations: [], ratings: [] });
      }
      const data = tagData.get(tag)!;
      data.count++;
      if (upload.duration_minutes) {
        data.durations.push(upload.duration_minutes);
      }
      if (upload.self_rating !== null && upload.self_rating > 0) {
        data.ratings.push(upload.self_rating);
      }
    });
  });

  const total = monthlyUploads.length;
  const tagStats: TagStat[] = Array.from(tagData.entries())
    .map(([tag, data]) => {
      const avgDuration = data.durations.length > 0
        ? data.durations.reduce((sum, d) => sum + d, 0) / data.durations.length
        : 0;
      const avgRating = data.ratings.length > 0
        ? data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length
        : 0;
      
      return {
        tag,
        count: data.count,
        percentage: total > 0 ? (data.count / total) * 100 : 0,
        avgDurationMinutes: avgDuration,
        avgRating,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // 只取前10个

  return tagStats;
}

// 格式化时长为 "Xh Ym" 格式
function formatDurationShort(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "0h 0m";
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

type FixedMonthlyReport = {
  exists: boolean;
  year: number;
  month: number;
  stats?: MonthlyStats;
  timeDistribution?: TimeDistribution[];
  weeklyDistribution?: WeeklyDistribution[];
  tagStats?: TagStat[];
  heatmapCalendar?: CalendarDay[];
  uploadIds?: number[];
  reportTexts?: Record<string, string>;
  createdAt?: string;
};

function FullMonthlyReport({ open, onClose, targetMonth, adminUserId }: FullMonthlyReportProps) {
  const totalScreens = REPORT_SCREENS.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [uploads, setUploads] = useState<UserUploadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [monthlySummaryTemplate, setMonthlySummaryTemplate] = useState<React.ReactNode | null>(null);
  const [allTemplates, setAllTemplates] = useState<AdminMonthlyReportTemplate[]>([]);
  const [fixedReport, setFixedReport] = useState<FixedMonthlyReport | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportedImageUrl, setExportedImageUrl] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 确定目标月份
  const effectiveTargetMonth = useMemo(() => {
    if (targetMonth) {
      console.log("[FullMonthlyReport] Using targetMonth:", targetMonth);
      return targetMonth;
    }
    // 如果没有targetMonth，返回空字符串（不应该发生，因为组件只在有targetMonth时渲染）
    console.warn("[FullMonthlyReport] No targetMonth provided, using empty string");
    return "";
  }, [targetMonth]);

  // 匹配月报模板（通用版本，支持传入统计对象）
  const matchTemplate = useCallback((
    templates: AdminMonthlyReportTemplate[],
    stats: MonthlyStats | { totalUploads?: number; totalHours?: number; avgHoursPerUpload?: number; avgRating?: number },
    section: string
  ): AdminMonthlyReportTemplate | null => {
    const activeTemplates = templates
      .filter((t) => t.section === section && t.is_active)
      .sort((a, b) => a.priority - b.priority);

    for (const template of activeTemplates) {
      // 检查条件
      if (template.min_total_uploads !== null && (stats.totalUploads ?? 0) < template.min_total_uploads) {
        continue;
      }
      if (template.max_total_uploads !== null && (stats.totalUploads ?? 0) > template.max_total_uploads) {
        continue;
      }
      if (template.min_total_hours !== null && (stats.totalHours ?? 0) < template.min_total_hours) {
        continue;
      }
      if (template.max_total_hours !== null && (stats.totalHours ?? 0) > template.max_total_hours) {
        continue;
      }
      if (template.min_avg_hours !== null && (stats.avgHoursPerUpload ?? 0) < template.min_avg_hours) {
        continue;
      }
      if (template.max_avg_hours !== null && (stats.avgHoursPerUpload ?? 0) > template.max_avg_hours) {
        continue;
      }
      if (template.min_avg_rating !== null && (stats.avgRating ?? 0) < template.min_avg_rating) {
        continue;
      }
      if (template.max_avg_rating !== null && (stats.avgRating ?? 0) > template.max_avg_rating) {
        continue;
      }
      return template;
    }
    return null;
  }, []);

  // 通用的模板渲染函数，支持多种变量
  const renderTemplate = useCallback((
    template: string,
    variables: Record<string, string | number | null | undefined>
  ): string => {
    let text = template;
    
    // 替换所有变量
    Object.entries(variables).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        const replacement = typeof value === 'number' ? value.toFixed(1) : String(value);
        text = text.replace(new RegExp(`{${key}}`, 'g'), replacement);
      }
    });
    
    return text;
  }, []);

  // 渲染模板文案（返回JSX，带数字高亮）
  const renderTemplateText = useCallback((
    template: string,
    variables: Record<string, string | number | null | undefined>
  ): React.ReactNode => {
    const text = renderTemplate(template, variables);
    
    // 提取数字并添加高亮
    const parts: React.ReactNode[] = [];
    const regex = /(\d+(?:\.\d+)?)/g;
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      parts.push(<span key={match.index} className="highlight">{match[0]}</span>);
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    
    return parts.length > 0 ? <>{parts}</> : text;
  }, [renderTemplate]);

  // 加载上传数据和模板
  useEffect(() => {
    console.log("[FullMonthlyReport] useEffect triggered - open:", open, "targetMonth:", targetMonth, "effectiveTargetMonth:", effectiveTargetMonth);
    
    // 如果关闭了，重置状态
    if (!open) {
      console.log("[FullMonthlyReport] Component closed, resetting state");
      setFixedReport(null);
      setUploads([]);
      setLoading(false);
      return;
    }
    
    // 如果打开了但没有targetMonth，等待
    if (!effectiveTargetMonth) {
      console.log("[FullMonthlyReport] Waiting for effectiveTargetMonth...");
      return;
    }
    
    console.log("[FullMonthlyReport] Loading report for:", effectiveTargetMonth);

    let cancelled = false;
    setLoading(true);

    const [year, month] = effectiveTargetMonth.split("-").map(Number);

    // 首先尝试获取固定月报
    api
      .get<FixedMonthlyReport>(
        adminUserId ? `/admin/reports/monthly/` : `/reports/monthly/`,
        {
          params: adminUserId
            ? { user_id: adminUserId, year, month }
            : { year, month },
        }
      )
      .then((res) => {
        if (!cancelled) {
          const reportData = res.data;
          setFixedReport(reportData);

          if (reportData.exists && reportData.stats) {
            // 使用固定月报数据
            // 设置月报文案
            if (reportData.reportTexts?.monthly_summary) {
              // 渲染模板文案（添加高亮）
              const text = reportData.reportTexts.monthly_summary;
              const parts: React.ReactNode[] = [];
              const regex = /(\d+(?:\.\d+)?)/g;
              let lastIndex = 0;
              let match;
              
              while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                  parts.push(text.substring(lastIndex, match.index));
                }
                parts.push(<span key={match.index} className="highlight">{match[0]}</span>);
                lastIndex = match.index + match[0].length;
              }
              
              if (lastIndex < text.length) {
                parts.push(text.substring(lastIndex));
              }
              
              setMonthlySummaryTemplate(parts.length > 0 ? <>{parts}</> : text);
            } else {
              setMonthlySummaryTemplate(null);
            }
            setLoading(false);
          } else {
            // 如果没有固定月报，实时计算
            Promise.all([
              adminUserId
                ? api.get(`/admin/users/uploads/`, { params: { user_id: adminUserId } }).then((res) => res.data)
                : fetchUserUploads(),
              api.get<AdminMonthlyReportTemplate[]>("/admin/reports/monthly-templates/", {
                params: { section: "monthly_summary" },
              }).then((res) => res.data).catch(() => []),
            ])
              .then(([uploadData, templates]) => {
                if (!cancelled) {
                  setUploads(uploadData);
                  setAllTemplates(templates);
                  // 计算统计数据并匹配模板
                  const calculatedStats = calculateMonthlyStats(uploadData, effectiveTargetMonth);
                  const matchedTemplate = matchTemplate(templates, calculatedStats, "monthly_summary");
                  if (matchedTemplate) {
                    setMonthlySummaryTemplate(renderTemplateText(matchedTemplate.text_template, {
                      count: calculatedStats.totalUploads,
                      hours: calculatedStats.totalHours,
                      avg_hours: calculatedStats.avgHoursPerUpload,
                      rating: calculatedStats.avgRating,
                    }));
                  } else {
                    setMonthlySummaryTemplate(null);
                  }
                }
              })
              .catch((error) => {
                if (!cancelled) {
                  console.warn("Failed to fetch data", error);
                  setUploads([]);
                  setMonthlySummaryTemplate(null);
                }
              })
              .finally(() => {
                if (!cancelled) {
                  setLoading(false);
                }
              });
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("Failed to fetch fixed report, falling back to real-time calculation", error);
          // 回退到实时计算
          Promise.all([
            adminUserId
              ? api.get(`/admin/users/uploads/`, { params: { user_id: adminUserId } }).then((res) => res.data)
              : fetchUserUploads(),
            api.get<AdminMonthlyReportTemplate[]>("/admin/reports/monthly-templates/", {}).then((res) => res.data).catch(() => []),
          ])
            .then(([uploadData, templates]) => {
              if (!cancelled) {
                setUploads(uploadData);
                setAllTemplates(templates);
                const calculatedStats = calculateMonthlyStats(uploadData, effectiveTargetMonth);
                const matchedTemplate = matchTemplate(templates, calculatedStats, "monthly_summary");
                if (matchedTemplate) {
                  setMonthlySummaryTemplate(renderTemplateText(matchedTemplate.text_template, {
                    count: calculatedStats.totalUploads,
                    hours: calculatedStats.totalHours,
                    avg_hours: calculatedStats.avgHoursPerUpload,
                    rating: calculatedStats.avgRating,
                  }));
                } else {
                  setMonthlySummaryTemplate(null);
                }
              }
            })
            .catch((err) => {
              if (!cancelled) {
                console.warn("Failed to fetch data", err);
                setUploads([]);
                setMonthlySummaryTemplate(null);
              }
            })
            .finally(() => {
              if (!cancelled) {
                setLoading(false);
              }
            });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, effectiveTargetMonth, matchTemplate, renderTemplateText]);

  // 计算统计数据（优先使用固定月报，否则实时计算）
  const stats = useMemo(() => {
    if (!effectiveTargetMonth) {
      return null;
    }
    if (fixedReport?.exists && fixedReport.stats) {
      return fixedReport.stats;
    }
    return calculateMonthlyStats(uploads, effectiveTargetMonth);
  }, [fixedReport, uploads, effectiveTargetMonth]);

  // 获取模板文案（如果匹配到模板则返回渲染后的文案，否则返回null）
  const getTemplateText = useCallback((
    section: string,
    variables: Record<string, string | number | null | undefined>,
    conditionStats?: MonthlyStats | { totalUploads?: number; totalHours?: number; avgHoursPerUpload?: number; avgRating?: number }
  ): string | null => {
    if (!allTemplates.length) return null;
    const statsForCondition = conditionStats || stats || {};
    const matched = matchTemplate(allTemplates, statsForCondition, section);
    if (!matched) return null;
    return renderTemplate(matched.text_template, variables);
  }, [allTemplates, matchTemplate, renderTemplate, stats]);

  const timeDistribution = useMemo(() => {
    if (!effectiveTargetMonth) {
      return [];
    }
    if (fixedReport?.exists && fixedReport.timeDistribution) {
      return fixedReport.timeDistribution;
    }
    return calculateTimeDistribution(uploads, effectiveTargetMonth);
  }, [fixedReport, uploads, effectiveTargetMonth]);

  const weeklyDistribution = useMemo(() => {
    if (!effectiveTargetMonth) {
      return [];
    }
    if (fixedReport?.exists && fixedReport.weeklyDistribution) {
      return fixedReport.weeklyDistribution;
    }
    return calculateWeeklyDistribution(uploads, effectiveTargetMonth);
  }, [fixedReport, uploads, effectiveTargetMonth]);

  const tagStats = useMemo(() => {
    if (!effectiveTargetMonth) {
      return [];
    }
    if (fixedReport?.exists && fixedReport.tagStats) {
      return fixedReport.tagStats;
    }
    return calculateTagStats(uploads, effectiveTargetMonth);
  }, [fixedReport, uploads, effectiveTargetMonth]);

  const heatmapCalendar = useMemo(() => {
    if (!effectiveTargetMonth) {
      return [];
    }
    if (fixedReport?.exists && fixedReport.heatmapCalendar) {
      return fixedReport.heatmapCalendar;
    }
    return calculateHeatmapCalendar(uploads, effectiveTargetMonth);
  }, [fixedReport, uploads, effectiveTargetMonth]);

  // 获取本月的上传记录
  const monthlyUploads = useMemo(() => {
    if (!effectiveTargetMonth) {
      return [];
    }
    
    // 如果使用固定月报且有uploadIds，优先使用固定月报的ID列表
    if (fixedReport?.exists && fixedReport.uploadIds && fixedReport.uploadIds.length > 0) {
      // 根据ID过滤上传记录
      const uploadIdSet = new Set(fixedReport.uploadIds);
      return uploads
        .filter((upload) => uploadIdSet.has(upload.id))
        .sort((a, b) => {
          const dateA = formatISODateInShanghai(a.uploaded_at);
          const dateB = formatISODateInShanghai(b.uploaded_at);
          if (!dateA || !dateB) return 0;
          return dateA.localeCompare(dateB);
        });
    }
    
    // 否则实时计算
    const [year, month] = effectiveTargetMonth.split("-").map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const startDateStr = formatISODateInShanghai(startDate);
    const endDateStr = formatISODateInShanghai(endDate);

    if (!startDateStr || !endDateStr) {
      return [];
    }

    return uploads
      .filter((upload) => {
        const uploadDateStr = formatISODateInShanghai(upload.uploaded_at);
        if (!uploadDateStr) return false;
        return uploadDateStr >= startDateStr && uploadDateStr <= endDateStr;
      })
      .sort((a, b) => {
        const dateA = formatISODateInShanghai(a.uploaded_at);
        const dateB = formatISODateInShanghai(b.uploaded_at);
        if (!dateA || !dateB) return 0;
        return dateA.localeCompare(dateB);
      });
  }, [fixedReport, uploads, effectiveTargetMonth]);

  // 节点回顾：第一张和最后一张作品
  const firstUpload = useMemo(() => monthlyUploads[0] || null, [monthlyUploads]);
  const lastUpload = useMemo(() => monthlyUploads[monthlyUploads.length - 1] || null, [monthlyUploads]);

  // 节点回顾：最高分作品
  const highestRatedUpload = useMemo(() => {
    const rated = monthlyUploads
      .filter((upload) => upload.self_rating !== null && upload.self_rating > 0)
      .sort((a, b) => (b.self_rating || 0) - (a.self_rating || 0))[0];
    return rated || null;
  }, [monthlyUploads]);

  // 节点回顾：最意外作品（评分高但时长短，或评分低但时长长）
  const mostUnexpectedUpload = useMemo(() => {
    if (monthlyUploads.length === 0) return null;
    
    const rated = monthlyUploads.filter((upload) => upload.self_rating !== null && upload.self_rating > 0);
    if (rated.length === 0) return null;

    const avgRating = rated.reduce((sum, u) => sum + (u.self_rating || 0), 0) / rated.length;
    const avgDuration = rated.reduce((sum, u) => sum + (u.duration_minutes || 0), 0) / rated.length;

    // 找出评分与时长差异最大的作品
    let maxDiff = 0;
    let mostUnexpected: UserUploadRecord | null = null;

    rated.forEach((upload) => {
      const ratingDiff = Math.abs((upload.self_rating || 0) - avgRating);
      const durationDiff = Math.abs((upload.duration_minutes || 0) - avgDuration);
      const totalDiff = ratingDiff + (durationDiff / 60); // 时长转换为小时
      
      if (totalDiff > maxDiff) {
        maxDiff = totalDiff;
        mostUnexpected = upload;
      }
    });

    return mostUnexpected;
  }, [monthlyUploads]);

  // 创作深度：判断创作类型（碎片型/深度型）
  const creatorDepthType = useMemo(() => {
    if (monthlyUploads.length === 0) return { type: "碎片型", percentage: 0 };
    const shortCount = monthlyUploads.filter((u) => (u.duration_minutes || 0) <= 20).length;
    const percentage = (shortCount / monthlyUploads.length) * 100;
    return {
      type: percentage >= 50 ? "碎片型" : "深度型",
      percentage: Math.round(percentage),
    };
  }, [monthlyUploads]);

  // 创作深度：时长格阵图数据（15个格子，5x3）
  const durationGrid = useMemo(() => {
    if (monthlyUploads.length === 0) return Array(15).fill(0);
    const sorted = [...monthlyUploads]
      .sort((a, b) => {
        const dateA = formatISODateInShanghai(a.uploaded_at);
        const dateB = formatISODateInShanghai(b.uploaded_at);
        if (!dateA || !dateB) return 0;
        return dateA.localeCompare(dateB);
      })
      .slice(0, 15);
    const maxDuration = Math.max(...sorted.map((u) => u.duration_minutes || 0), 1);
    return sorted.map((u) => {
      const duration = u.duration_minutes || 0;
      return maxDuration > 0 ? (duration / maxDuration) * 100 : 0;
    });
  }, [monthlyUploads]);

  // 创作深度：时长分布（短/中/长）
  const durationDistribution = useMemo(() => {
    const short = monthlyUploads.filter((u) => (u.duration_minutes || 0) <= 15).length;
    const medium = monthlyUploads.filter((u) => {
      const d = u.duration_minutes || 0;
      return d > 15 && d <= 120;
    }).length;
    const long = monthlyUploads.filter((u) => (u.duration_minutes || 0) > 120).length;
    const total = monthlyUploads.length;
    const max = Math.max(short, medium, long, 1);
    return {
      short: { count: short, percentage: total > 0 ? (short / total) * 100 : 0, height: (short / max) * 100 },
      medium: { count: medium, percentage: total > 0 ? (medium / total) * 100 : 0, height: (medium / max) * 100 },
      long: { count: long, percentage: total > 0 ? (long / total) * 100 : 0, height: (long / max) * 100 },
    };
  }, [monthlyUploads]);

  // 趋势对比：计算上月和近三月的统计数据
  const previousMonthStats = useMemo(() => {
    if (!effectiveTargetMonth) return null;
    const [year, month] = effectiveTargetMonth.split("-").map(Number);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    return calculateMonthlyStats(uploads, prevMonthStr);
  }, [uploads, effectiveTargetMonth]);

  const lastThreeMonthsStats = useMemo(() => {
    if (!effectiveTargetMonth) return null;
    const [year, month] = effectiveTargetMonth.split("-").map(Number);
    const threeMonthsAgo = month <= 3 ? month + 9 : month - 3;
    const threeMonthsAgoYear = month <= 3 ? year - 1 : year;
    
    // 计算近三个月的平均值
    let totalUploads = 0;
    let totalHours = 0;
    let totalRating = 0;
    let count = 0;
    
    for (let i = 0; i < 3; i++) {
      const m = threeMonthsAgo + i;
      const y = m > 12 ? threeMonthsAgoYear + 1 : threeMonthsAgoYear;
      const monthStr = `${y}-${String(m > 12 ? m - 12 : m).padStart(2, "0")}`;
      const stats = calculateMonthlyStats(uploads, monthStr);
      totalUploads += stats.totalUploads;
      totalHours += stats.totalHours;
      totalRating += stats.avgRating;
      count++;
    }
    
    return {
      totalUploads: count > 0 ? totalUploads / count : 0,
      totalHours: count > 0 ? totalHours / count : 0,
      avgRating: count > 0 ? totalRating / count : 0,
    };
  }, [uploads, effectiveTargetMonth]);

  // 个性化洞察：效率窗口（哪个时段评分最高）
  const efficiencyWindow = useMemo(() => {
    if (monthlyUploads.length === 0) return null;
    const rated = monthlyUploads.filter((u) => u.self_rating !== null && u.self_rating > 0);
    if (rated.length < 3) return null;

    const hourStats = new Map<number, { count: number; totalRating: number }>();
    rated.forEach((u) => {
      const date = new Date(u.uploaded_at);
      const hour = date.getHours();
      const stats = hourStats.get(hour) || { count: 0, totalRating: 0 };
      stats.count++;
      stats.totalRating += u.self_rating || 0;
      hourStats.set(hour, stats);
    });

    // 找出评分最高的时段（至少要有2个作品）
    let bestWindow: { start: number; end: number; avgRating: number } | null = null;
    hourStats.forEach((stats, hour) => {
      if (stats.count < 2) return; // 至少要有2个作品
      const avgRating = stats.totalRating / stats.count;
      if (!bestWindow || avgRating > bestWindow.avgRating) {
        bestWindow = { start: hour, end: hour + 1, avgRating };
      }
    });

    if (!bestWindow) return null;

    // 计算该时段与其他时段的平均分差
    const allAvgRating = rated.reduce((sum, u) => sum + (u.self_rating || 0), 0) / rated.length;
    const window: { start: number; end: number; avgRating: number } = bestWindow;
    const diff = window.avgRating - allAvgRating;

    // 只有当差异大于0.3时才显示
    if (diff < 0.3) return null;

    return { ...window, diff };
  }, [monthlyUploads]);

  // 个性化洞察：时长临界点（超过多少分钟后评分下降）
  const durationThreshold = useMemo(() => {
    if (monthlyUploads.length === 0) return null;
    const rated = monthlyUploads.filter((u) => u.self_rating !== null && u.self_rating > 0 && u.duration_minutes);
    if (rated.length < 5) return null;

    // 按时长分组，找出评分开始下降的临界点
    const buckets: { duration: number; ratings: number[] }[] = [];
    rated.forEach((u) => {
      const duration = u.duration_minutes || 0;
      const bucket = Math.floor(duration / 15) * 15; // 每15分钟一个桶
      let bucketData = buckets.find((b) => b.duration === bucket);
      if (!bucketData) {
        bucketData = { duration: bucket, ratings: [] };
        buckets.push(bucketData);
      }
      bucketData.ratings.push(u.self_rating || 0);
    });

    buckets.sort((a, b) => a.duration - b.duration);
    
    // 找出评分开始下降的点
    for (let i = 1; i < buckets.length; i++) {
      const prevAvg = buckets[i - 1].ratings.reduce((s, r) => s + r, 0) / buckets[i - 1].ratings.length;
      const currAvg = buckets[i].ratings.reduce((s, r) => s + r, 0) / buckets[i].ratings.length;
      if (currAvg < prevAvg * 0.95) { // 下降超过5%
        return buckets[i].duration;
      }
    }

    return null;
  }, [monthlyUploads]);

  // 个性化洞察：情绪差异（哪个情绪状态下评分最高）
  const emotionInsight = useMemo(() => {
    if (monthlyUploads.length === 0) return null;
    const rated = monthlyUploads.filter((u) => u.self_rating !== null && u.self_rating > 0 && u.mood_label);
    if (rated.length === 0) return null;

    const moodStats = new Map<string, { count: number; totalRating: number }>();
    rated.forEach((u) => {
      const mood = u.mood_label || "";
      const stats = moodStats.get(mood) || { count: 0, totalRating: 0 };
      stats.count++;
      stats.totalRating += u.self_rating || 0;
      moodStats.set(mood, stats);
    });

    let bestMood: { mood: string; avgRating: number } | null = null;
    const allAvgRating = rated.reduce((sum, u) => sum + (u.self_rating || 0), 0) / rated.length;

    moodStats.forEach((stats, mood) => {
      const avgRating = stats.totalRating / stats.count;
      if (!bestMood || avgRating > bestMood.avgRating) {
        bestMood = { mood, avgRating };
      }
    });

    if (!bestMood) return null;

    const mood: { mood: string; avgRating: number } = bestMood;
    const diff = ((mood.avgRating - allAvgRating) / allAvgRating) * 100;

    return { ...mood, diff };
  }, [monthlyUploads]);

  const activeScreen = useMemo(
    () => REPORT_SCREENS[activeIndex] ?? REPORT_SCREENS[0],
    [activeIndex]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((prev) => clamp(prev + 1, 0, totalScreens - 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((prev) => clamp(prev - 1, 0, totalScreens - 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, totalScreens]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  // 格式化日期显示
  const formatDateDisplay = useCallback((dateStr: string): string => {
    const date = parseISODateInShanghai(dateStr);
    if (!date) return dateStr;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  }, []);

  // 判断创作类型（夜行型/日行型）
  const getCreatorType = useCallback((): { type: string; percentage: number } => {
    const nightCount = timeDistribution
      .filter((item) => item.hour >= 21 || item.hour < 6)
      .reduce((sum, item) => sum + item.count, 0);
    const total = timeDistribution.reduce((sum, item) => sum + item.count, 0);
    
    if (total === 0) {
      return { type: "未知", percentage: 0 };
    }
    
    const nightPercentage = (nightCount / total) * 100;
    if (nightPercentage >= 50) {
      return { type: "夜行型", percentage: nightPercentage };
    } else {
      return { type: "日行型", percentage: 100 - nightPercentage };
    }
  }, [timeDistribution]);

  // 导出当前页面为图片
  const handleExport = useCallback(async () => {
    if (!containerRef.current) return;
    
    // 查找当前显示的 frame-wrapper
    const frameWrappers = containerRef.current.querySelectorAll('.full-monthly-report__frame-wrapper');
    let targetWrapper: Element | null = null;
    
    // 找到当前显示的 frame（非 display: none 的）
    for (let i = 0; i < frameWrappers.length; i++) {
      const wrapper = frameWrappers[i];
      const style = window.getComputedStyle(wrapper);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        targetWrapper = wrapper;
        break;
      }
    }
    
    if (!targetWrapper) {
      alert("无法找到要导出的内容");
      return;
    }
    
    // 找到内部的 frame 元素，它包含实际内容
    const frameElement = targetWrapper.querySelector('.full-monthly-report__frame') as HTMLElement;
    if (!frameElement) {
      alert("无法找到要导出的内容");
      return;
    }
    
    setExporting(true);
    try {
      // 保存原始样式
      const originalOverflow = frameElement.style.overflow;
      const originalHeight = frameElement.style.height;
      const originalMaxHeight = frameElement.style.maxHeight;
      const originalWidth = frameElement.style.width;
      
      // 临时设置样式以确保完整内容可见
      frameElement.style.overflow = 'visible';
      frameElement.style.height = 'auto';
      frameElement.style.maxHeight = 'none';
      // 让宽度自适应内容，避免右边有多余空白
      frameElement.style.width = 'auto';
      frameElement.style.maxWidth = 'none';
      
      // 等待样式应用
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 获取实际内容尺寸
      // 使用 scrollHeight 和 scrollWidth 获取完整内容尺寸
      const contentHeight = frameElement.scrollHeight;
      const contentWidth = frameElement.scrollWidth;
      
      // 统一的边距（像素值，会根据 scale 自动缩放）
      // ⭐ 修改边距大小：修改下面这个数字即可（单位：像素）
      const padding = 24; // 24px 边距 - 修改这里来调整边距大小
      const scale = 2;
      const paddedWidth = contentWidth + padding * 2;
      const paddedHeight = contentHeight + padding * 2;
      
      // 先导出 frame 元素（包含边框和背景）
      const contentCanvas = await html2canvas(frameElement, {
        backgroundColor: null, // 透明背景，我们会在外层添加
        scale: scale,
        useCORS: true,
        logging: false,
        width: contentWidth,
        height: contentHeight,
        scrollX: 0,
        scrollY: 0,
        windowWidth: contentWidth,
        windowHeight: contentHeight,
      });
      
      // 创建带边距的新 canvas
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = paddedWidth * scale;
      finalCanvas.height = paddedHeight * scale;
      const ctx = finalCanvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('无法创建 canvas context');
      }
      
      // 填充背景色
      ctx.fillStyle = '#221b1b';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      
      // 绘制内容（添加边距，居中绘制）
      const drawX = padding * scale;
      const drawY = padding * scale;
      ctx.drawImage(
        contentCanvas,
        drawX,
        drawY,
        contentCanvas.width,
        contentCanvas.height
      );
      
      // 恢复原始样式
      frameElement.style.overflow = originalOverflow;
      frameElement.style.height = originalHeight;
      frameElement.style.maxHeight = originalMaxHeight;
      frameElement.style.width = originalWidth;
      
      // 等待绘制完成（移动设备可能需要更长时间）
      const { waitForCanvasRender, exportCanvasToDataURL } = await import("@/utils/canvasExport");
      await waitForCanvasRender();

      // 现在尝试导出（使用安全的导出函数，包含移动端处理）
      const dataUrl = exportCanvasToDataURL(finalCanvas, "image/png");
      setExportedImageUrl(dataUrl);
      setShowImageModal(true);
    } catch (error) {
      console.error("导出图片失败:", error);
      let errorMessage = "导出图片失败，请稍后重试";
      
      if (error instanceof Error) {
        if (error.message.includes("Tainted") || error.message.includes("SecurityError") || error.message.includes("CORS") || error.message.includes("跨域")) {
          errorMessage = "导出失败：图片跨域限制。请确保图片服务器允许跨域访问（CORS）。如果问题持续，请联系管理员。";
        } else if (error.message.includes("尺寸过大") || error.message.includes("尺寸无效")) {
          errorMessage = error.message;
        } else {
          errorMessage = `导出失败：${error.message}`;
        }
      }
      
      alert(errorMessage);
    } finally {
      setExporting(false);
    }
  }, []);

  // 关闭图片预览弹窗
  const handleCloseImageModal = useCallback(() => {
    setShowImageModal(false);
    setExportedImageUrl(null);
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (exportedImageUrl) {
        setExportedImageUrl(null);
      }
    };
  }, [exportedImageUrl]);

  const creatorType = getCreatorType();

  if (!open) {
    return null;
  }

  return (
    <div className="full-monthly-report" role="dialog" aria-modal="true" aria-label="完整月报">
      <div className="full-monthly-report__backdrop" onClick={onClose} />
      <div className="full-monthly-report__container" ref={containerRef}>
        <header className="full-monthly-report__header">
          <div className="full-monthly-report__bar">
            <span className="full-monthly-report__eyebrow">
              完整月报 · {effectiveTargetMonth || "加载中..."}
            </span>
            <div className="full-monthly-report__bar-actions">
              <span className="full-monthly-report__counter">
                {String(activeIndex + 1).padStart(2, "0")} / {String(totalScreens).padStart(2, "0")}
              </span>
              <button
                type="button"
                className="full-monthly-report__export"
                onClick={handleExport}
                disabled={exporting || loading}
                aria-label="导出为图片"
                title="导出为图片"
              >
                {exporting ? (
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <ArtisticLoader size="small" text="" />
                  </div>
                ) : (
                  <MaterialIcon name="download" />
                )}
              </button>
              <button
                type="button"
                className="full-monthly-report__close"
                onClick={onClose}
                aria-label="关闭预览"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
          </div>
          <div className="full-monthly-report__title-row">
            <button
              type="button"
              className="full-monthly-report__nav-button"
              onClick={() => setActiveIndex((prev) => clamp(prev - 1, 0, totalScreens - 1))}
              disabled={activeIndex === 0}
              aria-label="上一页"
            >
              <MaterialIcon name="chevron_left" />
            </button>
            <h2 className="full-monthly-report__title">{activeScreen.title}</h2>
            <button
              type="button"
              className="full-monthly-report__nav-button"
              onClick={() => setActiveIndex((prev) => clamp(prev + 1, 0, totalScreens - 1))}
              disabled={activeIndex === totalScreens - 1}
              aria-label="下一页"
            >
              <MaterialIcon name="chevron_right" />
            </button>
          </div>
          <p className="full-monthly-report__subtitle">{activeScreen.description}</p>
        </header>

        <main className="full-monthly-report__stage">
          {loading ? (
            <div className="full-monthly-report__loading">加载数据中...</div>
          ) : (
            <>
              {/* Screen 5: 月度摘要 */}
              {activeIndex === 0 && stats && (
                <div className="full-monthly-report__frame-wrapper">
                  <div className="full-monthly-report__frame">
                    <div className="full-monthly-report__screen-content">
                      <div className="monthly-summary__container">
                        <div className="monthly-summary__text">
                          <p>
                            你本月画了 <span className="monthly-summary__highlight">{stats.totalUploads}</span> 张图，累计{" "}
                            <span className="monthly-summary__highlight">{stats.totalHours.toFixed(1)}</span> 小时
                            {monthlySummaryTemplate ? (
                              <>，{monthlySummaryTemplate}</>
                            ) : "。"}
                          </p>
                        </div>
                        <div className="monthly-summary__grid">
                          <div className="monthly-summary__card monthly-summary__card--square">
                            <div className="monthly-summary__card-header">
                              <p>上传总数</p>
                              <MaterialIcon name="layers" className="monthly-summary__icon" />
                            </div>
                            <div className="monthly-summary__card-value">
                              <p className="monthly-summary__number-large">{stats.totalUploads}</p>
                              <p className="monthly-summary__label">Total Uploads</p>
                            </div>
                          </div>
                          <div className="monthly-summary__card monthly-summary__card--square">
                            <div className="monthly-summary__card-header">
                              <p>总绘画时长</p>
                              <MaterialIcon name="schedule" className="monthly-summary__icon" />
                            </div>
                            <div className="monthly-summary__card-value">
                              <div className="monthly-summary__number-with-unit">
                                <p className="monthly-summary__number-large">{stats.totalHours.toFixed(0)}</p>
                                <p className="monthly-summary__unit">h</p>
                              </div>
                              <p className="monthly-summary__label">Total Duration</p>
                            </div>
                          </div>
                          <div className="monthly-summary__card">
                            <div className="monthly-summary__card-header">
                              <p>平均单张时长</p>
                              <MaterialIcon name="timer" className="monthly-summary__icon" />
                            </div>
                            <div className="monthly-summary__card-value monthly-summary__card-value--with-margin">
                              <div className="monthly-summary__number-with-unit">
                                <p className="monthly-summary__number-medium">{stats.avgHoursPerUpload.toFixed(1)}</p>
                                <p className="monthly-summary__unit-medium">h</p>
                              </div>
                              <p className="monthly-summary__label">Avg Duration</p>
                            </div>
                          </div>
                          <div className="monthly-summary__card">
                            <div className="monthly-summary__card-header">
                              <p>平均自评分</p>
                              <MaterialIcon name="star_half" className="monthly-summary__icon" />
                            </div>
                            <div className="monthly-summary__card-value monthly-summary__card-value--with-margin">
                              <div className="monthly-summary__number-with-unit">
                                <p className="monthly-summary__number-medium">{stats.avgRating.toFixed(1)}</p>
                                <p className="monthly-summary__unit-medium">/ 5</p>
                              </div>
                              <p className="monthly-summary__label">Avg Rating</p>
                            </div>
                          </div>
                          {stats.mostUploadDay && (
                            <div className="monthly-summary__card monthly-summary__card--full">
                              <div className="monthly-summary__row">
                                <div>
                                  <p className="monthly-summary__row-label">最多上传日</p>
                                  <p className="monthly-summary__row-sublabel">Most Upload Day</p>
                                </div>
                                <div className="monthly-summary__row-value">
                                  <p className="monthly-summary__row-text">{formatDateDisplay(stats.mostUploadDay.date)}</p>
                                  <p className="monthly-summary__row-highlight">{stats.mostUploadDay.count} 张</p>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="monthly-summary__card monthly-summary__card--full">
                            <div className="monthly-summary__row">
                              <div>
                                <p className="monthly-summary__row-label">连续打卡最长天数</p>
                                <p className="monthly-summary__row-sublabel">Longest Streak</p>
                              </div>
                              <div className="monthly-summary__streak">
                                <div>
                                  <p className="monthly-summary__streak-number">{stats.currentStreak}</p>
                                  <p className="monthly-summary__streak-label">当前</p>
                                </div>
                                <div className="monthly-summary__streak-divider"></div>
                                <div>
                                  <p className="monthly-summary__streak-number">{stats.longestStreak}</p>
                                  <p className="monthly-summary__streak-label">历史</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Screen 6: 节律与习惯 */}
              {activeIndex === 1 && (
                <div className="full-monthly-report__frame-wrapper">
                  <div className="full-monthly-report__frame">
                    <div className="full-monthly-report__screen-content">
                      <div className="rhythm__container">
                        <div className="rhythm__text">
                          <p>
                            你是<span className="rhythm__highlight">{creatorType.type}</span>创作者：
                            <span className="rhythm__highlight">{creatorType.percentage.toFixed(0)}%</span>{" "}
                            作品诞生在 {creatorType.type === "夜行型" ? "21:00 后" : "白天"}。
                          </p>
                        </div>
                        
                        {/* 热力日历图 */}
                        <div className="rhythm__heatmap">
                          <div className="rhythm__heatmap-header">
                            <h2 className="rhythm__heatmap-title">热力日历图</h2>
                            <div className="rhythm__heatmap-legend">
                              <span className="rhythm__legend-dot rhythm__legend-dot--low"></span> 少
                              <span className="rhythm__legend-dot rhythm__legend-dot--mid"></span>
                              <span className="rhythm__legend-dot rhythm__legend-dot--high"></span> 多
                            </div>
                          </div>
                          <div className="rhythm__heatmap-grid">
                            {/* 星期标题 */}
                            <div className="rhythm__weekday-label">一</div>
                            <div className="rhythm__weekday-label">二</div>
                            <div className="rhythm__weekday-label">三</div>
                            <div className="rhythm__weekday-label">四</div>
                            <div className="rhythm__weekday-label">五</div>
                            <div className="rhythm__weekday-label rhythm__weekday-label--weekend">六</div>
                            <div className="rhythm__weekday-label rhythm__weekday-label--weekend">日</div>
                            {/* 日历格子 */}
                            {heatmapCalendar.map((day, index) => {
                              if (day.day === 0) {
                                return (
                                  <div
                                    key={`empty-${index}`}
                                    className="rhythm__day-cell"
                                  />
                                );
                              }
                              const hasGlow = day.count > 0 && day.opacity > 0.8;
                              return (
                                <div
                                  key={`day-${day.day}`}
                                  className={`rhythm__day-cell ${hasGlow ? "rhythm__day-cell--glow" : ""}`}
                                  style={{
                                    backgroundColor: day.opacity > 0
                                      ? `rgba(152, 219, 198, ${day.opacity})`
                                      : "transparent",
                                  }}
                                  title={`${effectiveTargetMonth.split("-")[0]}年${effectiveTargetMonth.split("-")[1]}月${day.day}日 - ${day.count} 张`}
                                />
                              );
                            })}
                          </div>
                        </div>
                        
                        {/* 小时分布图 */}
                        <div className="rhythm__hour-chart">
                          <h2 className="rhythm__chart-title">小时分布图</h2>
                          {(() => {
                            const topHours = timeDistribution
                              .filter(item => item.count > 0)
                              .sort((a, b) => b.count - a.count)
                              .slice(0, 2)
                              .map(item => `${item.hour}:00`);
                            return (
                              <p className="rhythm__chart-subtitle">高频时段: {topHours.join(", ")}</p>
                            );
                          })()}
                          <div className="rhythm__hour-bars">
                            {timeDistribution.map((item) => {
                              const maxCount = Math.max(...timeDistribution.map(t => t.count), 1);
                              const heightPercent = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                              const hasGlow = heightPercent > 70;
                              return (
                                <div key={item.hour} className="rhythm__hour-bar">
                                  <div
                                    className={`rhythm__hour-bar-fill ${hasGlow ? "rhythm__hour-bar-fill--glow" : ""}`}
                                    style={{ height: `${heightPercent}%` }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="rhythm__hour-labels">
                            <span>0h</span>
                            <span>6h</span>
                            <span>12h</span>
                            <span>18h</span>
                            <span>23h</span>
                          </div>
                        </div>
                        
                        {/* 周内分布图 */}
                        <div className="rhythm__weekly-chart">
                          <h2 className="rhythm__chart-title">周内分布图</h2>
                          <div className="rhythm__weekly-bars">
                            <div className="rhythm__weekly-grid-line rhythm__weekly-grid-line--bottom"></div>
                            <div className="rhythm__weekly-grid-line rhythm__weekly-grid-line--middle-1"></div>
                            <div className="rhythm__weekly-grid-line rhythm__weekly-grid-line--middle-2"></div>
                            <div className="rhythm__weekly-bars-content">
                              {["一", "二", "三", "四", "五", "六", "日"].map((_label, index) => {
                                const stats = weeklyDistribution[index];
                                const maxCount = Math.max(...weeklyDistribution.map(w => w.count), 1);
                                const heightPercent = stats && maxCount > 0 ? (stats.count / maxCount) * 100 : 0;
                                const hasGlow = stats && heightPercent > 70;
                                return (
                                  <div key={index} className={`rhythm__weekly-bar ${hasGlow ? "rhythm__weekly-bar--glow" : ""}`} style={{ width: "20px", height: `${heightPercent}%` }}>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="rhythm__weekly-labels">
                            <span>一</span>
                            <span>二</span>
                            <span>三</span>
                            <span>四</span>
                            <span>五</span>
                            <span className="rhythm__weekly-label--weekend">六</span>
                            <span className="rhythm__weekly-label--weekend">日</span>
                          </div>
                        </div>
                        
                        {/* 底部总结文案 */}
                        <div className="rhythm__summary">
                          <p>
                            {(() => {
                              const templateText = getTemplateText("rhythm_summary", {
                                creator_type: creatorType.type,
                                percentage: creatorType.percentage,
                              }, stats || undefined);
                              
                              if (templateText) {
                                // 渲染模板文案，高亮百分比和类型
                                const parts: React.ReactNode[] = [];
                                let text = templateText;
                                
                                // 高亮百分比和类型
                                text = text.replace(
                                  new RegExp(`(${creatorType.type}|${creatorType.percentage.toFixed(0)}%)`, 'g'),
                                  '<span class="rhythm__summary-highlight">$1</span>'
                                );
                                
                                // 简单的高亮处理
                                const highlightRegex = /<span class="rhythm__summary-highlight">(.+?)<\/span>/g;
                                let lastIndex = 0;
                                let match;
                                
                                while ((match = highlightRegex.exec(text)) !== null) {
                                  if (match.index > lastIndex) {
                                    parts.push(text.substring(lastIndex, match.index));
                                  }
                                  parts.push(<span key={match.index} className="rhythm__summary-highlight">{match[1]}</span>);
                                  lastIndex = match.index + match[0].length;
                                }
                                
                                if (lastIndex < text.length) {
                                  parts.push(text.substring(lastIndex));
                                }
                                
                                return parts.length > 0 ? <>{parts}</> : templateText;
                              }
                              
                              // 默认文案
                              return (
                                <>
                                  你是<span className="rhythm__summary-highlight">{creatorType.type}</span>创作者，{creatorType.type === "夜行型" ? "多数作品诞生在深夜。" : "创作节奏更适合白天。"}
                                </>
                              );
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Screen 8: 标签快照 */}
              {activeIndex === 2 && (
                <div className="full-monthly-report__frame-wrapper">
                  <div className="full-monthly-report__frame">
                    <div className="full-monthly-report__screen-content">
                      <div className="tag-snapshot__container">
                        {tagStats.length > 0 ? (
                          <>
                            {/* 顶部柱状图 - 显示前3个标签 */}
                            <div className="tag-snapshot__chart">
                              <div className="tag-snapshot__chart-bars">
                                {tagStats.slice(0, 3).map((tag, _index) => {
                                  // 找出最高的百分比
                                  const maxPercentage = Math.max(...tagStats.slice(0, 3).map(t => t.percentage));
                                  const isTop = tag.percentage === maxPercentage;
                                  // 计算高度：最高160px，其他按比例
                                  const maxHeight = 160;
                                  const minHeight = 60;
                                  const barHeight = maxPercentage > 0 
                                    ? Math.max((tag.percentage / maxPercentage) * maxHeight, minHeight)
                                    : minHeight;
                                  
                                  return (
                                    <div key={tag.tag} className={`tag-snapshot__chart-bar ${isTop ? 'tag-snapshot__chart-bar--top' : ''}`} style={{ width: isTop ? '33.333%' : '25%' }}>
                                      <div className="tag-snapshot__chart-info">
                                        <p className={`tag-snapshot__chart-label ${isTop ? 'tag-snapshot__chart-label--top' : ''}`}>{tag.tag}</p>
                                        <p className={`tag-snapshot__chart-percentage ${isTop ? 'tag-snapshot__chart-percentage--top' : ''}`}>{tag.percentage.toFixed(0)}%</p>
                                        <p className={`tag-snapshot__chart-count ${isTop ? 'tag-snapshot__chart-count--top' : ''}`}>{tag.count} 次</p>
                                      </div>
                                      <div 
                                        className={`tag-snapshot__chart-bar-fill ${isTop ? 'tag-snapshot__chart-bar-fill--top' : ''}`}
                                        style={{ height: `${barHeight}px` }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            
                            {/* 详细列表 */}
                            <div className="tag-snapshot__list">
                              {tagStats.map((tag, index) => (
                                <div key={tag.tag} className="tag-snapshot__item">
                                  <p className="tag-snapshot__item-label">#{index + 1} {tag.tag}</p>
                                  <div className="tag-snapshot__item-stats">
                                    <div>
                                      <p className="tag-snapshot__item-stat-label">平均时长</p>
                                      <p className="tag-snapshot__item-stat-value">{formatDurationShort(tag.avgDurationMinutes)}</p>
                                    </div>
                                    <div>
                                      <p className="tag-snapshot__item-stat-label">平均自评分</p>
                                      <p className="tag-snapshot__item-stat-value">{tag.avgRating.toFixed(1)} ★</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* 总结文案 */}
                            <div className="tag-snapshot__summary">
                              <p>
                                {(() => {
                                  const templateText = getTemplateText("tags_summary", {
                                    top_tag: tagStats[0]?.tag || "",
                                    top_percentage: tagStats[0]?.percentage || 0,
                                    top_rating: tagStats[0]?.avgRating || 0,
                                  }, stats || undefined);
                                  
                                  if (templateText) {
                                    // 简单渲染，可以后续优化高亮
                                    return templateText;
                                  }
                                  
                                  // 默认文案
                                  return (
                                    <>
                                      你本月最常画的是：
                                      {tagStats.slice(0, 3).map((tag, index) => (
                                        <span key={tag.tag}>
                                          {index > 0 && "、"}
                                          <span className={index === 0 ? "tag-snapshot__summary-highlight" : ""}>
                                            {tag.tag} ({tag.percentage.toFixed(0)}%)
                                          </span>
                                        </span>
                                      ))}
                                      。
                                      {tagStats[0] && tagStats[0].avgRating > 0 && (
                                        <> {tagStats[0].tag}的平均分 {tagStats[0].avgRating.toFixed(1)}，练习开始显效。</>
                                      )}
                                    </>
                                  );
                                })()}
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="tag-snapshot__empty">本月暂无标签数据</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Screen 9: 节点回顾 */}
              {activeIndex === 3 && (
                <div className="full-monthly-report__frame-wrapper">
                  <div className="full-monthly-report__frame">
                    <div className="full-monthly-report__screen-content">
                      <div className="milestone__container">
                        <div className="milestone__summary">
                          <p>
                            {(() => {
                              const templateText = getTemplateText("milestone_summary", {
                                first_rating: firstUpload?.self_rating || 0,
                                last_rating: lastUpload?.self_rating || 0,
                              }, stats || undefined);
                              
                              if (templateText) {
                                return templateText;
                              }
                              
                              // 默认文案
                              if (lastUpload && lastUpload.self_rating && firstUpload && firstUpload.self_rating && 
                                 (lastUpload.self_rating || 0) >= (firstUpload.self_rating || 0)) {
                                return <>你的最后一张作品是评分最高的，整体节奏逐步走向稳定。</>;
                              }
                              return <>你的创作节奏正在调整中，继续探索适合自己的节奏。</>;
                            })()}
                          </p>
                        </div>
                        
                        {/* 第一张 vs 最后一张 */}
                        {firstUpload && lastUpload && (
                          <div className="milestone__comparison">
                            <div className="milestone__comparison-item">
                              {firstUpload.image && (
                                <img
                                  src={replaceLocalhostInUrl(firstUpload.image)}
                                  alt={firstUpload.title}
                                  className="milestone__thumbnail"
                                />
                              )}
                              <p className="milestone__duration">{formatDurationShort(firstUpload.duration_minutes || 0)}</p>
                              <p className="milestone__rating">
                                {firstUpload.self_rating ? `${firstUpload.self_rating.toFixed(1)} ★` : "未评分"} | {firstUpload.mood_label || "无情绪"}
                              </p>
                            </div>
                            <div className="milestone__vs">vs</div>
                            <div className="milestone__comparison-item milestone__comparison-item--highlight">
                              {lastUpload.image && (
                                <img
                                  src={replaceLocalhostInUrl(lastUpload.image)}
                                  alt={lastUpload.title}
                                  className="milestone__thumbnail milestone__thumbnail--glow"
                                />
                              )}
                              <p className="milestone__duration">{formatDurationShort(lastUpload.duration_minutes || 0)}</p>
                              <p className="milestone__rating">
                                {lastUpload.self_rating ? `${lastUpload.self_rating.toFixed(1)} ★` : "未评分"} | {lastUpload.mood_label || "无情绪"}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* 最高分和最意外作品 */}
                        <div className="milestone__highlights">
                          {highestRatedUpload && (
                            <div className="milestone__highlight-item milestone__highlight-item--top">
                              {highestRatedUpload.image && (
                                <img
                                  src={replaceLocalhostInUrl(highestRatedUpload.image)}
                                  alt={highestRatedUpload.title}
                                  className="milestone__thumbnail milestone__thumbnail--glow"
                                />
                              )}
                              <p className="milestone__duration">{formatDurationShort(highestRatedUpload.duration_minutes || 0)}</p>
                              <p className="milestone__rating">
                                {highestRatedUpload.self_rating ? `${highestRatedUpload.self_rating.toFixed(1)} ★` : "未评分"} | {highestRatedUpload.mood_label || "无情绪"}
                              </p>
                            </div>
                          )}
                          {mostUnexpectedUpload && (() => {
                            const upload: UserUploadRecord = mostUnexpectedUpload;
                            return (
                              <div className="milestone__highlight-item">
                                {upload.image && (
                                  <img
                                    src={replaceLocalhostInUrl(upload.image)}
                                    alt={upload.title}
                                    className="milestone__thumbnail"
                                  />
                                )}
                                <p className="milestone__duration">{formatDurationShort(upload.duration_minutes || 0)}</p>
                                <p className="milestone__rating">
                                  {upload.self_rating ? `${upload.self_rating.toFixed(1)} ★` : "未评分"} | {upload.mood_label || "无情绪"}
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                        
                        {mostUnexpectedUpload && (
                          <div className="milestone__insight">
                            <p>
                              {(() => {
                                if (!mostUnexpectedUpload) return "短时间的创作也带来了高分，灵感总在不经意间迸发。";
                                const upload: UserUploadRecord = mostUnexpectedUpload;
                                const templateText = getTemplateText("milestone_insight", {
                                  duration: upload.duration_minutes || 0,
                                  rating: upload.self_rating || 0,
                                }, stats || undefined);
                                
                                return templateText || "短时间的创作也带来了高分，灵感总在不经意间迸发。";
                              })()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Screen 10: 创作深度 */}
              {activeIndex === 4 && (
                <div className="full-monthly-report__frame-wrapper">
                  <div className="full-monthly-report__frame">
                    <div className="full-monthly-report__screen-content">
                      <div className="depth__container">
                        <div className="depth__summary">
                          <p>
                            你是<span className="depth__highlight">{creatorDepthType.type}</span>创作者：本月 <span className="depth__highlight">{creatorDepthType.percentage}%</span> 的记录都在 20 分钟以内。
                          </p>
                        </div>
                        
                        {/* 时长格阵图 */}
                        <div className="depth__grid-card">
                          <div className="depth__grid-header">
                            <h2 className="depth__grid-title">时长格阵图</h2>
                            <div className="depth__grid-legend">
                              <span className="depth__legend-dot depth__legend-dot--low"></span> 短
                              <span className="depth__legend-dot depth__legend-dot--mid"></span>
                              <span className="depth__legend-dot depth__legend-dot--high"></span> 长
                            </div>
                          </div>
                          <div className="depth__grid">
                            {Array.from({ length: 15 }, (_, i) => {
                              const height = durationGrid[i] || 0;
                              const opacity = height / 100;
                              return (
                                <div key={i} className="depth__grid-cell">
                                  <div
                                    className="depth__grid-fill"
                                    style={{
                                      height: `${height}%`,
                                      background: `linear-gradient(to top, rgba(152, 219, 198, ${Math.min(opacity * 0.8 + 0.2, 1)}), rgba(152, 219, 198, ${Math.min(opacity * 0.4 + 0.1, 0.6)}))`,
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        {/* 时长分布柱状图 */}
                        <div className="depth__bar-card">
                          <h2 className="depth__bar-title">时长分布柱状</h2>
                          <div className="depth__bars">
                            <div className="depth__bar-item">
                              <div className="depth__bar-wrapper">
                                <div
                                  className="depth__bar-fill depth__bar-fill--glow"
                                  style={{ height: `${durationDistribution.short.height}%` }}
                                />
                              </div>
                              <p className="depth__bar-label">短 &lt;=15m</p>
                            </div>
                            <div className="depth__bar-item">
                              <div className="depth__bar-wrapper">
                                <div
                                  className="depth__bar-fill depth__bar-fill--glow"
                                  style={{ height: `${durationDistribution.medium.height}%` }}
                                />
                              </div>
                              <p className="depth__bar-label">中 15-120m</p>
                            </div>
                            <div className="depth__bar-item">
                              <div className="depth__bar-wrapper">
                                <div
                                  className="depth__bar-fill depth__bar-fill--glow"
                                  style={{ height: `${durationDistribution.long.height}%` }}
                                />
                              </div>
                              <p className="depth__bar-label">长 &gt;120m</p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="depth__insight">
                          <p>
                            {(() => {
                              const templateText = getTemplateText("depth_insight", {
                                creator_type: creatorDepthType.type,
                                percentage: creatorDepthType.percentage,
                              }, stats || undefined);
                              
                              if (templateText) {
                                // 高亮创作者类型和百分比
                                const parts: React.ReactNode[] = [];
                                let text = templateText;
                                
                                // 高亮类型和百分比
                                text = text.replace(
                                  new RegExp(`(${creatorDepthType.type}|${creatorDepthType.percentage}%)`, 'g'),
                                  '<span class="depth__insight-highlight">$1</span>'
                                );
                                
                                const highlightRegex = /<span class="depth__insight-highlight">(.+?)<\/span>/g;
                                let lastIndex = 0;
                                let match;
                                
                                while ((match = highlightRegex.exec(text)) !== null) {
                                  if (match.index > lastIndex) {
                                    parts.push(text.substring(lastIndex, match.index));
                                  }
                                  parts.push(<span key={match.index} className="depth__insight-highlight">{match[1]}</span>);
                                  lastIndex = match.index + match[0].length;
                                }
                                
                                if (lastIndex < text.length) {
                                  parts.push(text.substring(lastIndex));
                                }
                                
                                return parts.length > 0 ? <>{parts}</> : templateText;
                              }
                              
                              // 默认文案
                              return (
                                <>
                                  你是典型的<span className="depth__insight-highlight">{creatorDepthType.type}创作者</span>，擅长在短时间内捕捉灵感。尝试安排<span className="depth__insight-highlight">整块时间</span>，或许能开启更深度的创作旅程。
                                </>
                              );
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Screen 11: 趋势对比 */}
              {activeIndex === 5 && (
                <div className="full-monthly-report__frame-wrapper">
                  <div className="full-monthly-report__frame">
                    <div className="full-monthly-report__screen-content">
                      <div className="trend__container">
                        <div className="trend__summary-card">
                          <p>
                            {stats && previousMonthStats && lastThreeMonthsStats ? (
                              <>
                                相较于上月和过去三个月，你的创作时长{stats.totalHours > previousMonthStats.totalHours ? "稳定增长" : "有所波动"}，上传数量{stats.totalUploads > previousMonthStats.totalUploads ? "稳步提升" : "虽有波动"}，但整体效率更高，更专注于长时创作。
                              </>
                            ) : (
                              <>正在分析你的创作趋势...</>
                            )}
                          </p>
                        </div>
                        
                        {stats && previousMonthStats && lastThreeMonthsStats && (
                          <div className="trend__metrics">
                            {/* 上传数量 */}
                            <div className="trend__metric-card">
                              <div className="trend__metric-header">
                                <div className="trend__metric-icon">
                                  <MaterialIcon name="upload" />
                                </div>
                                <div className="trend__metric-info">
                                  <p className="trend__metric-title">上传数量</p>
                                  <p className="trend__metric-subtitle">本月 {stats.totalUploads}</p>
                                </div>
                              </div>
                              <div className="trend__metric-comparison">
                                <div className="trend__comparison-item">
                                  <p className="trend__comparison-label">对比上月</p>
                                  <div className="trend__comparison-value">
                                    {(() => {
                                      const diff = ((stats.totalUploads - previousMonthStats.totalUploads) / Math.max(previousMonthStats.totalUploads, 1)) * 100;
                                      const isPositive = diff >= 0;
                                      return (
                                        <>
                                          <MaterialIcon name={isPositive ? "arrow_left_alt" : "arrow_right_alt"} className={isPositive ? "trend__arrow-up" : "trend__arrow-down"} />
                                          <span className={isPositive ? "trend__value-up" : "trend__value-down"}>
                                            {isPositive ? "+" : ""}{diff.toFixed(0)}%
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                                <div className="trend__divider"></div>
                                <div className="trend__comparison-item">
                                  <p className="trend__comparison-label">对比近三月</p>
                                  <div className="trend__comparison-value">
                                    {(() => {
                                      const diff = ((stats.totalUploads - lastThreeMonthsStats.totalUploads) / Math.max(lastThreeMonthsStats.totalUploads, 1)) * 100;
                                      const isPositive = diff >= 0;
                                      return (
                                        <>
                                          <MaterialIcon name={isPositive ? "arrow_left_alt" : "arrow_right_alt"} className={isPositive ? "trend__arrow-up" : "trend__arrow-down"} />
                                          <span className={isPositive ? "trend__value-up" : "trend__value-down"}>
                                            {isPositive ? "+" : ""}{diff.toFixed(0)}%
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* 总时长 */}
                            <div className="trend__metric-card">
                              <div className="trend__metric-header">
                                <div className="trend__metric-icon">
                                  <MaterialIcon name="timer" />
                                </div>
                                <div className="trend__metric-info">
                                  <p className="trend__metric-title">总时长</p>
                                  <p className="trend__metric-subtitle">本月 {formatDurationShort(stats.totalHours * 60)}</p>
                                </div>
                              </div>
                              <div className="trend__metric-comparison">
                                <div className="trend__comparison-item">
                                  <p className="trend__comparison-label">对比上月</p>
                                  <div className="trend__comparison-value">
                                    {(() => {
                                      const diff = ((stats.totalHours - previousMonthStats.totalHours) / Math.max(previousMonthStats.totalHours, 1)) * 100;
                                      const isPositive = diff >= 0;
                                      return (
                                        <>
                                          <MaterialIcon name={isPositive ? "arrow_left_alt" : "arrow_right_alt"} className={isPositive ? "trend__arrow-up" : "trend__arrow-down"} />
                                          <span className={isPositive ? "trend__value-up" : "trend__value-down"}>
                                            {isPositive ? "+" : ""}{diff.toFixed(0)}%
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                                <div className="trend__divider"></div>
                                <div className="trend__comparison-item">
                                  <p className="trend__comparison-label">对比近三月</p>
                                  <div className="trend__comparison-value">
                                    {(() => {
                                      const diff = ((stats.totalHours - lastThreeMonthsStats.totalHours) / Math.max(lastThreeMonthsStats.totalHours, 1)) * 100;
                                      const isPositive = diff >= 0;
                                      return (
                                        <>
                                          <MaterialIcon name={isPositive ? "arrow_left_alt" : "arrow_right_alt"} className={isPositive ? "trend__arrow-up" : "trend__arrow-down"} />
                                          <span className={isPositive ? "trend__value-up" : "trend__value-down"}>
                                            {isPositive ? "+" : ""}{diff.toFixed(0)}%
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* 平均自评分 */}
                            <div className="trend__metric-card">
                              <div className="trend__metric-header">
                                <div className="trend__metric-icon">
                                  <MaterialIcon name="sentiment_satisfied" />
                                </div>
                                <div className="trend__metric-info">
                                  <p className="trend__metric-title">平均自评分</p>
                                  <p className="trend__metric-subtitle">本月 {stats.avgRating.toFixed(1)} ★</p>
                                </div>
                              </div>
                              <div className="trend__metric-comparison">
                                <div className="trend__comparison-item">
                                  <p className="trend__comparison-label">对比上月</p>
                                  <div className="trend__comparison-value">
                                    {(() => {
                                      const diff = stats.avgRating - previousMonthStats.avgRating;
                                      if (Math.abs(diff) < 0.1) {
                                        return (
                                          <>
                                            <MaterialIcon name="remove" className="trend__arrow-neutral" />
                                            <span className="trend__value-neutral">±0</span>
                                          </>
                                        );
                                      }
                                      const isPositive = diff > 0;
                                      return (
                                        <>
                                          <MaterialIcon name={isPositive ? "arrow_left_alt" : "arrow_right_alt"} className={isPositive ? "trend__arrow-up" : "trend__arrow-down"} />
                                          <span className={isPositive ? "trend__value-up" : "trend__value-down"}>
                                            {isPositive ? "+" : ""}{diff.toFixed(1)}
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                                <div className="trend__divider"></div>
                                <div className="trend__comparison-item">
                                  <p className="trend__comparison-label">对比近三月</p>
                                  <div className="trend__comparison-value">
                                    {(() => {
                                      const diff = stats.avgRating - lastThreeMonthsStats.avgRating;
                                      if (Math.abs(diff) < 0.1) {
                                        return (
                                          <>
                                            <MaterialIcon name="remove" className="trend__arrow-neutral" />
                                            <span className="trend__value-neutral">±0</span>
                                          </>
                                        );
                                      }
                                      const isPositive = diff > 0;
                                      return (
                                        <>
                                          <MaterialIcon name={isPositive ? "arrow_left_alt" : "arrow_right_alt"} className={isPositive ? "trend__arrow-up" : "trend__arrow-down"} />
                                          <span className={isPositive ? "trend__value-up" : "trend__value-down"}>
                                            {isPositive ? "+" : ""}{diff.toFixed(1)}
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Screen 12: 个性化洞察 */}
              {activeIndex === 6 && (
                <div className="full-monthly-report__frame-wrapper">
                  <div className="full-monthly-report__frame">
                    <div className="full-monthly-report__screen-content">
                      <div className="insight__container">
                        {/* 效率窗口 */}
                        {efficiencyWindow && (
                          <div className="insight__card">
                            <div className="insight__card-label">效率窗口</div>
                            <h2 className="insight__card-title">
                              你的黄金创作窗：<br />
                              {efficiencyWindow.start}–{efficiencyWindow.end} 点
                            </h2>
                            <p className="insight__card-description">
                              你在 {efficiencyWindow.start}:00–{efficiencyWindow.end}:00 的作品平均得分比其他时段高 {efficiencyWindow.diff.toFixed(1)} 分。
                            </p>
                          </div>
                        )}
                        
                        {/* 时长临界点 */}
                        {durationThreshold && (
                          <div className="insight__card">
                            <div className="insight__card-label">时长临界点</div>
                            <h2 className="insight__card-title">
                              专注力峰值：<br />
                              {durationThreshold} 分钟
                            </h2>
                            <p className="insight__card-description">
                              单次创作超过 {durationThreshold} 分钟后，你的平均情绪评分开始出现下降趋势。
                            </p>
                          </div>
                        )}
                        
                        {/* 情绪差异 */}
                        {emotionInsight && (
                          <div className="insight__card">
                            <div className="insight__card-label">情绪差异</div>
                            <h2 className="insight__card-title">
                              "{emotionInsight.mood}"状态下<br />
                              评分最高
                            </h2>
                            <p className="insight__card-description">
                              当记录的情绪为"{emotionInsight.mood}"时，你的作品自评分相较于其他情绪状态高出 {Math.abs(emotionInsight.diff).toFixed(0)}%。
                            </p>
                          </div>
                        )}
                        
                        {!efficiencyWindow && !durationThreshold && !emotionInsight && (
                          <div className="insight__empty">
                            数据不足，无法生成个性化洞察
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* 图片预览弹窗 */}
      {showImageModal && exportedImageUrl && (
        <div className="full-monthly-report__image-modal" role="dialog" aria-modal="true" aria-label="图片预览">
          <div className="full-monthly-report__image-modal-backdrop" onClick={handleCloseImageModal} />
          <div className="full-monthly-report__image-modal-content">
            <div className="full-monthly-report__image-modal-header">
              <h3>月报图片</h3>
              <button
                type="button"
                className="full-monthly-report__image-modal-close"
                onClick={handleCloseImageModal}
                aria-label="关闭"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="full-monthly-report__image-modal-body">
              <img
                src={exportedImageUrl}
                alt="月报截图"
                className="full-monthly-report__exported-image"
              />
              <p className="full-monthly-report__image-modal-hint">
                长按图片即可保存到相册
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FullMonthlyReport;

