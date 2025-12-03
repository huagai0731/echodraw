/**
 * 格式化时长为可读字符串
 * @param minutes 时长（分钟）
 * @returns 格式化后的字符串，如 "2 小时 30 分钟"
 */
export function formatDurationLabel(minutes: number | null | undefined): string {
  if (!Number.isFinite(minutes) || minutes === null || minutes === undefined || minutes <= 0) {
    return "0 分钟";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours > 0 && remaining > 0) {
    return `${hours} 小时 ${remaining} 分钟`;
  }
  if (hours > 0) {
    return `${hours} 小时`;
  }
  return `${remaining} 分钟`;
}

