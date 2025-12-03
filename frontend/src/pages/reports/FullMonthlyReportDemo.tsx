import { useEffect, useMemo, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";

import "./FullMonthlyReportDemo.css";

type FullMonthlyReportDemoProps = {
  open: boolean;
  onClose: () => void;
};

type ReportScreen = {
  id: number;
  label: string;
  title: string;
  description: string;
  src: string;
};

const REPORT_SCREENS: ReportScreen[] = [
  {
    id: 5,
    label: "reports_screen_5",
    title: "月度摘要",
    description: "本月概览与关键指标",
    src: "/reports/full-monthly/reports_screen_5.html",
  },
  {
    id: 6,
    label: "reports_screen_6",
    title: "节律与习惯",
    description: "创作时段与周内节奏",
    src: "/reports/full-monthly/reports_screen_6.html",
  },
  {
    id: 8,
    label: "reports_screen_8",
    title: "标签快照",
    description: "标签分布与表现概览",
    src: "/reports/full-monthly/reports_screen_8.html",
  },
  {
    id: 9,
    label: "reports_screen_9",
    title: "节点回顾",
    description: "作品对比与高分亮点",
    src: "/reports/full-monthly/reports_screen_9.html",
  },
  {
    id: 10,
    label: "reports_screen_10",
    title: "创作深度",
    description: "创作时长结构与专注分布",
    src: "/reports/full-monthly/reports_screen_10.html",
  },
  {
    id: 11,
    label: "reports_screen_11",
    title: "趋势对比",
    description: "与过往时段的表现对比",
    src: "/reports/full-monthly/reports_screen_11.html",
  },
  {
    id: 12,
    label: "reports_screen_12",
    title: "个性化洞察",
    description: "针对习惯与情绪的洞察建议",
    src: "/reports/full-monthly/reports_screen_12.html",
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

function FullMonthlyReportDemo({ open, onClose }: FullMonthlyReportDemoProps) {
  const totalScreens = REPORT_SCREENS.length;
  const [activeIndex, setActiveIndex] = useState(0);

  const activeScreen = useMemo(() => REPORT_SCREENS[activeIndex] ?? REPORT_SCREENS[0], [activeIndex]);

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

  if (!open) {
    return null;
  }

  return (
    <div className="full-monthly-report-demo" role="dialog" aria-modal="true" aria-label="完整月报预览">
      <div className="full-monthly-report-demo__backdrop" onClick={onClose} />
      <div className="full-monthly-report-demo__container">
        <header className="full-monthly-report-demo__header">
          <div className="full-monthly-report-demo__bar">
            <span className="full-monthly-report-demo__eyebrow">完整月报 · 0000-00-00</span>
            <div className="full-monthly-report-demo__bar-actions">
              <span className="full-monthly-report-demo__counter">
                {String(activeIndex + 1).padStart(2, "0")} / {String(totalScreens).padStart(2, "0")}
              </span>
              <button type="button" className="full-monthly-report-demo__close" onClick={onClose} aria-label="关闭预览">
                <MaterialIcon name="close" />
              </button>
            </div>
          </div>
          <div className="full-monthly-report-demo__title-row">
            <button
              type="button"
              className="full-monthly-report-demo__nav-button"
              onClick={() => setActiveIndex((prev) => clamp(prev - 1, 0, totalScreens - 1))}
              disabled={activeIndex === 0}
              aria-label="上一页"
            >
              <MaterialIcon name="chevron_left" />
            </button>
            <h2 className="full-monthly-report-demo__title">{activeScreen.title}</h2>
            <button
              type="button"
              className="full-monthly-report-demo__nav-button"
              onClick={() => setActiveIndex((prev) => clamp(prev + 1, 0, totalScreens - 1))}
              disabled={activeIndex === totalScreens - 1}
              aria-label="下一页"
            >
              <MaterialIcon name="chevron_right" />
            </button>
          </div>
          <p className="full-monthly-report-demo__subtitle">{activeScreen.description}</p>
        </header>

        <main className="full-monthly-report-demo__stage">
          <iframe
            key={activeScreen.id}
            className="full-monthly-report-demo__frame"
            src={activeScreen.src}
            title={activeScreen.label}
            loading="lazy"
            sandbox="allow-same-origin allow-scripts"
          />
        </main>
      </div>
    </div>
  );
}

export default FullMonthlyReportDemo;

