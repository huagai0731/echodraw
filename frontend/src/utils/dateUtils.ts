/**
 * 日期工具函数 - 统一使用上海时区（Asia/Shanghai）
 */

const SHANGHAI_TIMEZONE = "Asia/Shanghai";

/**
 * 将日期转换为上海时区的 ISO 日期字符串（YYYY-MM-DD）
 * @param date 日期对象或时间戳
 * @returns ISO 日期字符串，如果转换失败返回 null
 */
export function formatISODateInShanghai(date: Date | number | string): string | null {
  try {
    let dateObj: Date;
    if (typeof date === "string") {
      const parsed = Date.parse(date);
      if (Number.isNaN(parsed)) {
        return null;
      }
      dateObj = new Date(parsed);
    } else if (typeof date === "number") {
      dateObj = new Date(date);
    } else {
      dateObj = date;
    }

    if (Number.isNaN(dateObj.getTime())) {
      return null;
    }

    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: SHANGHAI_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(dateObj);
    const year = parts.find((p) => p.type === "year")?.value ?? null;
    const month = parts.find((p) => p.type === "month")?.value ?? null;
    const day = parts.find((p) => p.type === "day")?.value ?? null;

    if (!year || !month || !day) {
      return null;
    }

    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/**
 * 验证日期字符串格式（YYYY-MM-DD）并检查有效性
 * @param dateStr 日期字符串
 * @returns 如果格式有效返回 true，否则返回 false
 */
export function isValidISODate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return false;
  }

  // 检查日期有效性
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * 将日期字符串（YYYY-MM-DD）解析为上海时区的日期对象（午夜）
 * @param dateStr 日期字符串
 * @returns 日期对象，如果解析失败返回 null
 */
export function parseISODateInShanghai(dateStr: string): Date | null {
  if (!isValidISODate(dateStr)) {
    return null;
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  
  // 使用上海时区创建日期
  // 上海是 UTC+8，所以我们需要创建一个表示上海时区午夜的 Date 对象
  // 由于 JavaScript Date 对象总是使用本地时区，我们需要计算偏移
  try {
    // 创建一个表示上海时区午夜的 Date 对象
    // 使用 UTC 时间，然后根据时区偏移调整
    // 上海时区是 UTC+8，所以 2024-01-01 00:00:00 CST = 2024-01-01 00:00:00+08:00 = 2023-12-31 16:00:00 UTC
    // 但为了简化，我们直接使用本地时区创建，因为前端通常假设服务器返回的日期已经是正确的
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);
    
    // 验证日期是否有效
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 模拟时间的 localStorage key
 */
const SIMULATED_DATE_KEY = "echo-simulated-date";

/**
 * 检查是否允许使用模拟日期（仅在开发环境）
 * @returns 如果是开发环境返回 true，否则返回 false
 */
function isSimulatedDateAllowed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  
  // 检查是否为开发环境
  // 1. 检查 Vite 环境变量（如果可用）
  try {
    // @ts-ignore - import.meta 在 Vite 中总是可用
    if (import.meta?.env) {
      // @ts-ignore
      if (import.meta.env.DEV || import.meta.env.MODE === "development") {
        return true;
      }
    }
  } catch {
    // 如果 import.meta 不可用，继续检查其他条件
  }
  
  // 2. 检查 hostname（本地开发环境）
  const hostname = window.location.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.")
  ) {
    return true;
  }
  
  // 生产环境不允许使用模拟日期
  return false;
}

/**
 * 设置模拟日期
 * @param dateStr 日期字符串（YYYY-MM-DD），如果为 null 则清除模拟
 */
export function setSimulatedDate(dateStr: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  
  // 生产环境不允许设置模拟日期
  if (!isSimulatedDateAllowed()) {
    console.warn("[Echo] 模拟日期功能仅在开发环境可用，已忽略设置请求");
    // 如果尝试设置，同时清除可能存在的旧数据
    window.localStorage.removeItem(SIMULATED_DATE_KEY);
    return;
  }
  
  if (dateStr === null) {
    window.localStorage.removeItem(SIMULATED_DATE_KEY);
  } else {
    window.localStorage.setItem(SIMULATED_DATE_KEY, dateStr);
  }
}

/**
 * 获取模拟日期
 * @returns 模拟日期字符串（YYYY-MM-DD），如果未设置或不在开发环境返回 null
 */
export function getSimulatedDate(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  
  // 生产环境不允许使用模拟日期
  if (!isSimulatedDateAllowed()) {
    // 清除可能存在的模拟日期（防止之前开发时留下的数据）
    const existing = window.localStorage.getItem(SIMULATED_DATE_KEY);
    if (existing) {
      window.localStorage.removeItem(SIMULATED_DATE_KEY);
    }
    return null;
  }
  
  const simulated = window.localStorage.getItem(SIMULATED_DATE_KEY);
  if (simulated && isValidISODate(simulated)) {
    return simulated;
  }
  return null;
}

/**
 * 获取上海时区的当前日期字符串（YYYY-MM-DD）
 * 如果设置了模拟日期且允许使用，则返回模拟日期；否则返回真实日期
 */
export function getTodayInShanghai(): string {
  // 优先使用模拟日期（仅在开发环境）
  const simulated = getSimulatedDate();
  if (simulated) {
    return simulated;
  }
  
  // 返回真实日期
  const today = formatISODateInShanghai(new Date());
  return today || "";
}
/**
 * 标准化上传日期 - 统一使用上海时区
 * @param uploadedDate 已格式化的日期字符串（YYYY-MM-DD）
 * @param uploadedAt ISO 时间字符串
 * @returns 标准化的日期字符串（YYYY-MM-DD），如果无效返回 null
 */
export function normalizeUploadedDateInShanghai(
  uploadedDate?: string | null,
  uploadedAt?: string | null,
): string | null {
  // 如果已有格式化的日期字符串，验证并返回
  if (uploadedDate && isValidISODate(uploadedDate)) {
    return uploadedDate;
  }

  // 如果没有上传时间，返回 null
  if (!uploadedAt) {
    return null;
  }

  // 从 ISO 时间字符串转换为上海时区的日期
  return formatISODateInShanghai(uploadedAt);
}

/**
 * 获取上海时区的一周开始日期（周一）
 * @param reference 参考日期
 * @returns 周一 00:00:00 的日期对象（上海时区）
 */
export function startOfWeekInShanghai(reference: Date): Date {
  // 获取参考日期在上海时区的日期部分
  const shanghaiDateStr = formatISODateInShanghai(reference);
  if (!shanghaiDateStr) {
    // Fallback
    const result = new Date(reference);
    result.setHours(0, 0, 0, 0);
    const day = result.getDay();
    const diff = (day + 6) % 7; // 转换为周一为第一天
    result.setDate(result.getDate() - diff);
    return result;
  }

  const [year, month, day] = shanghaiDateStr.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  result.setHours(0, 0, 0, 0);
  const weekday = result.getDay();
  const diff = (weekday + 6) % 7; // 转换为周一为第一天
  result.setDate(result.getDate() - diff);
  return result;
}

/**
 * 判断某年某月的月报是否可见
 * 月报在当月1号及之后可见
 * @param year 年份
 * @param month 月份（1-12）
 * @returns 如果月报可见返回 true，否则返回 false
 */
export function isMonthlyReportVisible(year: number, month: number): boolean {
  const todayStr = getTodayInShanghai();
  if (!todayStr) {
    return false;
  }
  
  const today = parseISODateInShanghai(todayStr);
  if (!today) {
    return false;
  }
  
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1; // 1-12
  const todayDay = today.getDate();
  
  // 计算该月报的可见日期（当月1号）
  const visibleYear = year;
  const visibleMonth = month;
  
  // 如果当前日期 >= 可见日期，则可见
  if (todayYear > visibleYear) {
    return true;
  }
  if (todayYear === visibleYear && todayMonth > visibleMonth) {
    return true;
  }
  if (todayYear === visibleYear && todayMonth === visibleMonth && todayDay >= 1) {
    return true;
  }
  
  return false;
}

/**
 * 获取应该显示的月报月份列表
 * 从用户注册日期所在的月份开始，到当前月份
 * @param userRegistrationDate 用户注册日期（ISO格式字符串，如 "2025-12-07"），如果未提供则从当前月份往前推12个月
 * @returns 应该显示的月报月份列表，格式为 {year: number, month: number}[]
 */
export function getVisibleMonthlyReports(userRegistrationDate?: string | null): Array<{ year: number; month: number }> {
  const todayStr = getTodayInShanghai();
  if (!todayStr) {
    return [];
  }
  
  const today = parseISODateInShanghai(todayStr);
  if (!today) {
    return [];
  }
  
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  
  const reports: Array<{ year: number; month: number }> = [];
  
  // 确定起始月份：从用户注册日期所在的月份开始
  let startYear: number;
  let startMonth: number;
  
  if (userRegistrationDate) {
    // 先提取日期部分（如果是ISO格式）
    const dateOnly = userRegistrationDate.split('T')[0];
    const registrationDate = parseISODateInShanghai(dateOnly);
    
    if (registrationDate) {
      // 起始月份是用户注册日期所在的月份
      // 例如：用户9月12日注册，第一个月报是9月月报（在9月1日可见）
      startYear = registrationDate.getFullYear();
      startMonth = registrationDate.getMonth() + 1; // 1-12
    } else {
      // 解析失败，使用默认逻辑（从当前月份往前推12个月）
      startYear = currentYear;
      startMonth = currentMonth - 12;
      while (startMonth <= 0) {
        startMonth += 12;
        startYear -= 1;
      }
    }
  } else {
    // 没有注册日期，使用默认逻辑（从当前月份往前推12个月）
    startYear = currentYear;
    startMonth = currentMonth - 12;
    while (startMonth <= 0) {
      startMonth += 12;
      startYear -= 1;
    }
  }
  
  // 从起始月份开始，到当前月份（因为当前月份的月报在当月1号即可可见）
  let year = startYear;
  let month = startMonth;
  const endYear = currentYear;
  const endMonth = currentMonth; // 当前月份
  
  // 如果起始月份已经超过结束月份，直接返回空数组
  if (year > endYear || (year === endYear && month > endMonth)) {
    return [];
  }
  
  while (true) {
    // 检查是否超过结束月份（在检查可见性之前）
    if (year > endYear || (year === endYear && month > endMonth)) {
      break;
    }
    
    const isVisible = isMonthlyReportVisible(year, month);
    
    // 如果这个月报可见，加入列表
    if (isVisible) {
      reports.push({ year, month });
    }
    
    // 移动到下一个月
    if (month === 12) {
      month = 1;
      year += 1;
    } else {
      month += 1;
    }
    
    // 安全措施：防止无限循环
    if (reports.length > 24) {
      break;
    }
  }
  
  return reports;
}

/**
 * 计算全年计划的阶段数据
 * @param daysPerPhase 每个阶段的天数（7-21）
 * @returns 阶段数组，每个阶段包含index、startDate、endDate
 */
export function calculateYearlyPhases(daysPerPhase: number): Array<{
  index: number;
  startDate: string;
  endDate: string;
}> {
  if (daysPerPhase < 7 || daysPerPhase > 21) {
    return [];
  }
  
  // 阶段数量：floor(365 / daysPerPhase)，忽略余数
  const phaseCount = Math.floor(365 / daysPerPhase);
  const phases: Array<{ index: number; startDate: string; endDate: string }> = [];
  
  // 起始日期：2026-01-01
  const startDate = new Date(2026, 0, 1); // 月份从0开始，所以0表示1月
  
  for (let i = 1; i <= phaseCount; i++) {
    // 计算每个阶段的开始和结束日期
    const phaseStart = new Date(startDate);
    phaseStart.setDate(startDate.getDate() + (i - 1) * daysPerPhase);
    
    const phaseEnd = new Date(phaseStart);
    phaseEnd.setDate(phaseStart.getDate() + daysPerPhase - 1);
    
    // 格式化为ISO日期字符串（YYYY-MM-DD）
    const startDateStr = formatISODateInShanghai(phaseStart);
    const endDateStr = formatISODateInShanghai(phaseEnd);
    
    if (startDateStr && endDateStr) {
      phases.push({
        index: i,
        startDate: startDateStr,
        endDate: endDateStr,
      });
    }
  }
  
  return phases;
}

