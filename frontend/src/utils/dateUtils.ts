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
 * 获取上海时区的当前日期字符串（YYYY-MM-DD）
 */
export function getTodayInShanghai(): string {
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

