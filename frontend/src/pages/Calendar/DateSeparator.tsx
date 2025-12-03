import { formatISODateInShanghai, getTodayInShanghai } from "@/utils/dateUtils";
import "./DateSeparator.css";

type DateSeparatorProps = {
  date: string; // ISO date string (YYYY-MM-DD)
};

export function DateSeparator({ date }: DateSeparatorProps) {
  const formattedDate = formatISODateInShanghai(date);
  if (!formattedDate) return null;

  const [year, month, day] = formattedDate.split("-");
  const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  const todayStr = getTodayInShanghai();
  const isToday = date === todayStr;

  // 格式化日期显示
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekday = weekdays[dateObj.getDay()];
  
  let displayText = "";
  if (isToday) {
    displayText = "今天";
  } else {
    // 计算昨天
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatISODateInShanghai(yesterday);
    const isYesterday = date === yesterdayStr;
    
    if (isYesterday) {
      displayText = "昨天";
    } else {
      // 移除前导零
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);
      displayText = `${monthNum}月${dayNum}日 ${weekday}`;
    }
  }

  return (
    <div className="date-separator">
      <div className="date-separator__line" />
      <span className="date-separator__text">{displayText}</span>
      <div className="date-separator__line" />
    </div>
  );
}

