import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchGoalsCalendar,
  hasAuthToken,
} from "@/services/api";
import { loadStoredArtworks } from "@/services/artworkStorage";
import {
  formatISODateInShanghai,
  isValidISODate,
  normalizeUploadedDateInShanghai,
  parseISODateInShanghai,
} from "@/utils/dateUtils";

/**
 * 管理打卡记录的状态
 */
export function useCheckInDates() {
  const [checkInDates, setCheckInDates] = useState<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  // 从本地作品存储中提取上传日期
  const refreshLocalDates = useCallback(() => {
    const stored = loadStoredArtworks();
    const dates = new Set<string>();
    stored.forEach((artwork) => {
      const dateKey = normalizeUploadedDateInShanghai(
        artwork.uploadedDate ?? null,
        artwork.uploadedAt ?? null
      );
      if (dateKey) {
        dates.add(dateKey);
      }
    });
    return dates;
  }, []);

  // 获取指定日期范围的打卡记录
  const refreshCheckInDates = useCallback(
    async (dateRange?: { startDate: Date; endDate: Date }) => {
      if (!hasAuthToken()) {
        const localDates = refreshLocalDates();
        setCheckInDates(localDates);
        return;
      }

      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const dates = new Set<string>();

        if (dateRange) {
          // 获取目标日期范围内的打卡记录
          const startDateStr = formatISODateInShanghai(dateRange.startDate);
          const endDateStr = formatISODateInShanghai(dateRange.endDate);

          if (!startDateStr || !endDateStr) {
            const localDates = refreshLocalDates();
            setCheckInDates(localDates);
            return;
          }

          const start = parseISODateInShanghai(startDateStr);
          const end = parseISODateInShanghai(endDateStr);

          if (!start || !end) {
            const localDates = refreshLocalDates();
            setCheckInDates(localDates);
            return;
          }

          // 计算需要获取的月份范围
          const startYear = start.getFullYear();
          const startMonth = start.getMonth() + 1;
          const endYear = end.getFullYear();
          const endMonth = end.getMonth() + 1;

          // 生成需要获取的月份列表
          const monthsToFetch: Array<{ year: number; month: number }> = [];
          let currentYear = startYear;
          let currentMonth = startMonth;

          while (
            currentYear < endYear ||
            (currentYear === endYear && currentMonth <= endMonth)
          ) {
            monthsToFetch.push({ year: currentYear, month: currentMonth });
            currentMonth += 1;
            if (currentMonth > 12) {
              currentMonth = 1;
              currentYear += 1;
            }
          }

          // 限制并发请求数量
          const MAX_CONCURRENT = monthsToFetch.length > 12 ? 2 : 3;
          const MAX_MONTHS = 24;
          const limitedMonths = monthsToFetch.slice(-MAX_MONTHS);

          // 请求去重
          const uniqueMonths = limitedMonths.filter(({ year, month }) => {
            const key = `${year}-${month}`;
            if (pendingRequestsRef.current.has(key)) {
              pendingRequestsRef.current.delete(key);
            }
            pendingRequestsRef.current.add(key);
            return true;
          });

          // 批量请求
          for (let i = 0; i < uniqueMonths.length; i += MAX_CONCURRENT) {
            if (abortController.signal.aborted) {
              break;
            }

            const batch = uniqueMonths.slice(i, i + MAX_CONCURRENT);
            const batchPromises = batch.map(async ({ year, month }) => {
              const key = `${year}-${month}`;
              try {
                const data = await fetchGoalsCalendar({ year, month });
                if (abortController.signal.aborted) {
                  throw new Error("Request aborted");
                }
                return { success: true, data, key };
              } catch (error) {
                if (
                  error instanceof Error &&
                  (error.name === "AbortError" || abortController.signal.aborted)
                ) {
                  pendingRequestsRef.current.delete(key);
                  return { success: false, data: { days: [] }, key };
                }
                console.warn(`Failed to fetch calendar for ${year}-${month}`, error);
                setTimeout(() => {
                  pendingRequestsRef.current.delete(key);
                }, 5000);
                return { success: false, data: { days: [] }, key };
              } finally {
                if (!abortController.signal.aborted) {
                  setTimeout(() => {
                    pendingRequestsRef.current.delete(key);
                  }, 1000);
                }
              }
            });

            const batchResults = await Promise.allSettled(batchPromises);
            batchResults.forEach((result) => {
              if (result.status === "fulfilled" && result.value.success) {
                result.value.data.days.forEach((day) => {
                  if (
                    isValidISODate(day.date) &&
                    (day.status === "check" || day.status === "upload") &&
                    day.date >= startDateStr &&
                    day.date <= endDateStr
                  ) {
                    dates.add(day.date);
                  }
                });
              }
            });
          }
        } else {
          // 获取当前月的打卡记录
          const todayStr = formatISODateInShanghai(new Date());
          let currentYear: number;
          let currentMonth: number;

          if (todayStr) {
            const parsed = parseISODateInShanghai(todayStr);
            if (parsed) {
              currentYear = parsed.getFullYear();
              currentMonth = parsed.getMonth() + 1;
            } else {
              const today = new Date();
              currentYear = today.getFullYear();
              currentMonth = today.getMonth() + 1;
            }
          } else {
            const today = new Date();
            currentYear = today.getFullYear();
            currentMonth = today.getMonth() + 1;
          }

          if (abortController.signal.aborted) {
            return;
          }

          const key = `${currentYear}-${currentMonth}`;
          if (pendingRequestsRef.current.has(key)) {
            pendingRequestsRef.current.delete(key);
          }
          pendingRequestsRef.current.add(key);

          try {
            const data = await fetchGoalsCalendar({
              year: currentYear,
              month: currentMonth,
            });
            data.days.forEach((day) => {
              if (
                isValidISODate(day.date) &&
                (day.status === "check" || day.status === "upload")
              ) {
                dates.add(day.date);
              }
            });
          } finally {
            pendingRequestsRef.current.delete(key);
          }
        }

        // 合并本地上传日期
        const localDates = refreshLocalDates();
        localDates.forEach((date) => dates.add(date));

        // 合并当前状态
        setCheckInDates((prev) => {
          const merged = new Set(dates);
          prev.forEach((date) => merged.add(date));
          return merged;
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.warn("Failed to refresh check-in dates", error);
        const localDates = refreshLocalDates();
        setCheckInDates((prev) => {
          const merged = new Set(localDates);
          prev.forEach((date) => merged.add(date));
          return merged;
        });
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [refreshLocalDates]
  );

  // 添加打卡日期
  const addCheckInDate = useCallback((dateKey: string) => {
    setCheckInDates((prev) => {
      const next = new Set(prev);
      next.add(dateKey);
      return next;
    });
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      pendingRequestsRef.current.clear();
    };
  }, []);

  return {
    checkInDates,
    refreshCheckInDates,
    addCheckInDate,
  };
}


