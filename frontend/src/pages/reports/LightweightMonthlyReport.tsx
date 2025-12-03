import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import html2canvas from "html2canvas";
import MaterialIcon from "@/components/MaterialIcon";
import { fetchUserUploads, type UserUploadRecord } from "@/services/api";
import api from "@/services/api";
import { formatISODateInShanghai, parseISODateInShanghai, getTodayInShanghai } from "@/utils/dateUtils";
import type { AdminMonthlyReportTemplate } from "@/admin/api";

import "./FullMonthlyReport.css"; // 复用完整版月报的样式

type LightweightMonthlyReportProps = {
  open: boolean;
  onClose: () => void;
  targetMonth?: string; // YYYY-MM 格式，默认为当前月
  adminUserId?: number; // 后台管理员查看指定用户的月报时使用
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

type TagStat = {
  tag: string;
  count: number;
  percentage: number;
  avgDurationMinutes: number;
  avgRating: number;
};

type ReportScreen = {
  id: number;
  label: string;
  title: string;
  description: string;
};

const REPORT_SCREENS: ReportScreen[] = [
  {
    id: 5,
    label: "reports_screen_5",
    title: "月度摘要",
    description: "本月概览与关键指标",
  },
  {
    id: 8,
    label: "reports_screen_8",
    title: "标签快照",
    description: "标签分布与表现概览",
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
  tagStats?: TagStat[];
  reportTexts?: Record<string, string>;
  createdAt?: string;
};

function LightweightMonthlyReport({ open, onClose, targetMonth, adminUserId }: LightweightMonthlyReportProps) {
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
    if (targetMonth) return targetMonth;
    const today = getTodayInShanghai();
    const todayDate = parseISODateInShanghai(today);
    if (!todayDate) return "";
    const year = todayDate.getFullYear();
    const month = String(todayDate.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, [targetMonth]);

  // 匹配月报模板
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

  // 通用的模板渲染函数
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
    if (!open || !effectiveTargetMonth) return;

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
  }, [open, effectiveTargetMonth, matchTemplate, renderTemplateText, adminUserId]);

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

  // 获取模板文案
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

  const tagStats = useMemo(() => {
    if (!effectiveTargetMonth) {
      return [];
    }
    if (fixedReport?.exists && fixedReport.tagStats) {
      return fixedReport.tagStats;
    }
    return calculateTagStats(uploads, effectiveTargetMonth);
  }, [fixedReport, uploads, effectiveTargetMonth]);

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
      frameElement.style.width = 'auto';
      frameElement.style.maxWidth = 'none';
      
      // 等待样式应用
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 获取实际内容尺寸
      const contentHeight = frameElement.scrollHeight;
      const contentWidth = frameElement.scrollWidth;
      
      // 统一的边距
      const padding = 24;
      const scale = 2;
      const paddedWidth = contentWidth + padding * 2;
      const paddedHeight = contentHeight + padding * 2;
      
      // 导出 frame 元素
      const contentCanvas = await html2canvas(frameElement, {
        backgroundColor: null,
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
      
      const dataUrl = finalCanvas.toDataURL("image/png");
      setExportedImageUrl(dataUrl);
      setShowImageModal(true);
    } catch (error) {
      console.error("导出图片失败:", error);
      alert("导出图片失败，请稍后重试");
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

  if (!open) {
    return null;
  }

  return (
    <div className="full-monthly-report" role="dialog" aria-modal="true" aria-label="轻量月报">
      <div className="full-monthly-report__backdrop" onClick={onClose} />
      <div className="full-monthly-report__container" ref={containerRef}>
        <header className="full-monthly-report__header">
          <div className="full-monthly-report__bar">
            <span className="full-monthly-report__eyebrow">
              轻量月报 · {effectiveTargetMonth || "加载中..."}
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
                <MaterialIcon name={exporting ? "hourglass_empty" : "download"} />
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
              {/* Screen 1: 月度摘要 */}
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

              {/* Screen 2: 标签快照 */}
              {activeIndex === 1 && (
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

export default LightweightMonthlyReport;

