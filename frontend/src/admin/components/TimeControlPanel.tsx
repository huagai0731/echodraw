import { useState, useEffect, useCallback } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { getTodayInShanghai, setSimulatedDate, getSimulatedDate, formatISODateInShanghai, parseISODateInShanghai } from "@/utils/dateUtils";

import "../styles/TimeControlPanel.css";

type TimeControlPanelProps = {
  onDateChange?: () => void;
};

function TimeControlPanel({ onDateChange }: TimeControlPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentDate, setCurrentDate] = useState<string>(getTodayInShanghai());
  const [isSimulated, setIsSimulated] = useState(false);

  useEffect(() => {
    const simulated = getSimulatedDate();
    setIsSimulated(simulated !== null);
    setCurrentDate(getTodayInShanghai());
  }, []);

  const handleDateChange = useCallback((newDate: string) => {
    if (newDate && newDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setSimulatedDate(newDate);
      setCurrentDate(newDate);
      setIsSimulated(true);
      onDateChange?.();
    }
  }, [onDateChange]);

  const handleReset = useCallback(() => {
    setSimulatedDate(null);
    const realDate = formatISODateInShanghai(new Date()) || "";
    setCurrentDate(realDate);
    setIsSimulated(false);
    onDateChange?.();
  }, [onDateChange]);

  const handleQuickDate = useCallback((days: number) => {
    const today = parseISODateInShanghai(getTodayInShanghai());
    if (!today) return;
    
    const newDate = new Date(today);
    newDate.setDate(newDate.getDate() + days);
    const newDateStr = formatISODateInShanghai(newDate);
    if (newDateStr) {
      handleDateChange(newDateStr);
    }
  }, [handleDateChange]);

  const handleToday = useCallback(() => {
    handleReset();
  }, [handleReset]);

  if (!isExpanded) {
    return (
      <div className="time-control-panel time-control-panel--collapsed">
        <button
          type="button"
          className="time-control-panel__toggle"
          onClick={() => setIsExpanded(true)}
          title="展开时间控制面板"
        >
          <MaterialIcon name="schedule" />
          {isSimulated && <span className="time-control-panel__badge">模拟</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="time-control-panel time-control-panel--expanded">
      <div className="time-control-panel__header">
        <div className="time-control-panel__title">
          <MaterialIcon name="schedule" />
          <span>时间控制</span>
          {isSimulated && <span className="time-control-panel__simulated-badge">模拟模式</span>}
        </div>
        <button
          type="button"
          className="time-control-panel__close"
          onClick={() => setIsExpanded(false)}
          title="折叠"
        >
          <MaterialIcon name="close" />
        </button>
      </div>

      <div className="time-control-panel__content">
        <div className="time-control-panel__current">
          <label>当前日期：</label>
          <span className="time-control-panel__date-display">{currentDate}</span>
        </div>

        <div className="time-control-panel__date-input">
          <label htmlFor="simulated-date">设置日期：</label>
          <input
            id="simulated-date"
            type="date"
            value={currentDate}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>

        <div className="time-control-panel__quick-actions">
          <button type="button" onClick={handleToday} className="time-control-panel__quick-btn">
            今天
          </button>
          <button type="button" onClick={() => handleQuickDate(1)} className="time-control-panel__quick-btn">
            +1天
          </button>
          <button type="button" onClick={() => handleQuickDate(7)} className="time-control-panel__quick-btn">
            +7天
          </button>
          <button type="button" onClick={() => handleQuickDate(30)} className="time-control-panel__quick-btn">
            +30天
          </button>
        </div>

        {isSimulated && (
          <button
            type="button"
            onClick={handleReset}
            className="time-control-panel__reset"
          >
            <MaterialIcon name="refresh" />
            重置为真实时间
          </button>
        )}

        <div className="time-control-panel__refresh-hint">
          <MaterialIcon name="info" />
          <span>修改日期后需要刷新页面才能生效</span>
        </div>
      </div>
    </div>
  );
}

export default TimeControlPanel;

