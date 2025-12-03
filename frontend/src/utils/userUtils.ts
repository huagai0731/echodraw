/**
 * 用户相关工具函数
 */

/**
 * 从邮箱地址格式化用户名
 */
export function formatNameFromEmail(email: string): string {
  const name = email.split("@")[0];
  if (name.length === 0) {
    return "回声艺术家";
  }
  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

/**
 * 截断用户名，避免过长
 */
export function truncateName(name: string, maxLength: number = 12): string {
  if (name.length <= maxLength) {
    return name;
  }
  return name.slice(0, maxLength - 1) + "…";
}

