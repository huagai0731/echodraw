import { useCallback, useMemo, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import type { Artwork } from "@/types/artwork";
import FourArtworkTemplateDesigner from "@/pages/reports/FourArtworkTemplateDesigner";
import SingleArtworkTemplateDesigner from "@/pages/reports/SingleArtworkTemplateDesigner";
import FullMonthlyReportDemo from "@/pages/reports/FullMonthlyReportDemo";

import "./Reports.css";

type TabKey = "reports" | "templates";
type FilterKey = "周报" | "月报" | "测试" | "其他";

type ReportItem = {
  id: string;
  category: FilterKey;
  title: string;
  subtitle: string;
  glow: number;
};

type TemplateAction = "single" | "quad";

type TemplateItem = {
  id: string;
  icon: string;
  label: string;
  action?: TemplateAction;
};

type TemplateGroup = {
  id: string;
  title: string;
  items: TemplateItem[];
};

const FILTER_OPTIONS: FilterKey[] = ["周报", "月报", "测试", "其他"];

const REPORT_ITEMS: ReportItem[] = [
  {
    id: "weekly-42",
    category: "周报",
    title: "第四十二周仪式感",
    subtitle: "2023年10月23日 - 10月29日",
    glow: 1,
  },
  {
    id: "weekly-41",
    category: "周报",
    title: "第四十一周仪式感",
    subtitle: "2023年10月16日 - 10月22日",
    glow: 2,
  },
  {
    id: "monthly-10",
    category: "月报",
    title: "十月创作回顾",
    subtitle: "2023年10月",
    glow: 3,
  },
  {
    id: "experimental-color",
    category: "测试",
    title: "色彩情感实验",
    subtitle: "2023年9月30日",
    glow: 4,
  },
  {
    id: "weekly-39",
    category: "周报",
    title: "第三十九周仪式感",
    subtitle: "2023年10月02日 - 10月08日",
    glow: 5,
  },
  {
    id: "monthly-09",
    category: "月报",
    title: "九月创作回顾",
    subtitle: "2023年9月",
    glow: 6,
  },
  {
    id: "yearly-summary",
    category: "其他",
    title: "年度项目总结",
    subtitle: "2022年12月31日",
    glow: 7,
  },
];

const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    id: "visual-export",
    title: "图片导出",
    items: [
      { id: "single-artwork", icon: "image", label: "单图导出", action: "single" },
      { id: "quad-artwork", icon: "grid_view", label: "四图导出", action: "quad" },
    ],
  },
  {
    id: "calendar-export",
    title: "日历导出",
    items: [{ id: "calendar-export", icon: "calendar_month", label: "日历导出" }],
  },
  {
    id: "short-term-export",
    title: "短期目标导出",
    items: [{ id: "short-term-goal-export", icon: "flag", label: "短期目标导出" }],
  },
  {
    id: "long-term-export",
    title: "长期目标导出",
    items: [{ id: "long-term-goal-export", icon: "flag_circle", label: "长期目标导出" }],
  },
];

type ReportsProps = {
  artworks?: Artwork[];
};

function Reports({ artworks = [] }: ReportsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("reports");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("周报");
  const [singleTemplateOpen, setSingleTemplateOpen] = useState(false);
  const [quadTemplateOpen, setQuadTemplateOpen] = useState(false);
  const [fullMonthlyDemoOpen, setFullMonthlyDemoOpen] = useState(false);
  const isTemplatesTab = activeTab === "templates";
  const isTemplateExperience = isTemplatesTab || singleTemplateOpen || quadTemplateOpen;
  const showTemplateBack = singleTemplateOpen || quadTemplateOpen;
  const handleTemplateBack = useCallback(() => {
    if (singleTemplateOpen) {
      setSingleTemplateOpen(false);
      return;
    }
    if (quadTemplateOpen) {
      setQuadTemplateOpen(false);
    }
  }, [quadTemplateOpen, singleTemplateOpen]);
  const handleTemplateAction = useCallback(
    (action: TemplateAction) => {
      if (action === "single") {
        setSingleTemplateOpen(true);
        return;
      }
      if (action === "quad") {
        setQuadTemplateOpen(true);
      }
    },
    [],
  );

  const filteredReports = useMemo(() => {
    if (activeFilter === "其他") {
      return REPORT_ITEMS.filter((item) => item.category === activeFilter);
    }
    if (activeFilter === "测试") {
      return REPORT_ITEMS.filter((item) => item.category === activeFilter);
    }
    return REPORT_ITEMS.filter((item) => item.category === activeFilter);
  }, [activeFilter]);

  const renderTemplateItem = useCallback(
    (item: TemplateItem) => {
      if (item.action) {
        return (
          <button
            key={item.id}
            type="button"
            className="reports-template reports-template--action"
            onClick={() => handleTemplateAction(item.action!)}
          >
            <MaterialIcon name={item.icon} className="reports-template__icon" />
            <p className="reports-template__label">{item.label}</p>
          </button>
        );
      }
      return (
        <article key={item.id} className="reports-template">
          <MaterialIcon name={item.icon} className="reports-template__icon" />
          <p className="reports-template__label">{item.label}</p>
        </article>
      );
    },
    [handleTemplateAction],
  );

  return (
    <div className="reports-screen">
      <div className="reports-screen__background">
        <div className="reports-screen__pattern" />
        <div className="reports-screen__glow reports-screen__glow--one" />
        <div className="reports-screen__glow reports-screen__glow--two" />
        <div className="reports-screen__glow reports-screen__glow--three" />
      </div>

      <TopNav
        title={isTemplateExperience ? "模版" : "报告"}
        subtitle={isTemplateExperience ? "Templates" : "Reports"}
        className="top-nav--fixed"
        leadingAction={
          showTemplateBack
            ? {
                icon: "arrow_back",
                label: "返回",
                onClick: handleTemplateBack,
              }
            : null
        }
      />

      <main className="reports-screen__content">
        <div className="reports-screen__tabs">
          <div className="reports-topnav__segment">
            <button
              type="button"
              className={
                activeTab === "reports"
                  ? "reports-topnav__button reports-topnav__button--active"
                  : "reports-topnav__button"
              }
              onClick={() => setActiveTab("reports")}
            >
              报告
            </button>
            <button
              type="button"
              className={
                activeTab === "templates"
                  ? "reports-topnav__button reports-topnav__button--active"
                  : "reports-topnav__button"
              }
              onClick={() => setActiveTab("templates")}
            >
              模板
            </button>
          </div>
        </div>

        {activeTab === "reports" ? (
          <>
            <div className="reports-screen__filters" role="tablist" aria-label="报表类型">
              {FILTER_OPTIONS.map((option) => {
                const isActive = activeFilter === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={
                      isActive ? "reports-filter reports-filter--active" : "reports-filter"
                    }
                    onClick={() => setActiveFilter(option)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <section className="reports-screen__demo" aria-label="完整月报 Demo">
              <div className="reports-screen__demo-text">
                <p className="reports-screen__demo-title">完整月报 · 0000-00-00</p>
                <p className="reports-screen__demo-subtitle">按顺序预览 reports_screen_5 — reports_screen_12 的成品页面。</p>
              </div>
              <button
                type="button"
                className="reports-screen__demo-button"
                onClick={() => setFullMonthlyDemoOpen(true)}
              >
                <MaterialIcon name="play_arrow" />
                打开 Demo
              </button>
            </section>

            <div className="reports-screen__list">
              {filteredReports.map((item) => (
                <article
                  key={item.id}
                  className={`reports-card reports-card--glow-${item.glow}`}
                >
                  <div className="reports-card__body">
                    <p className="reports-card__title">
                      {item.category}：
                      <span>{item.title}</span>
                    </p>
                    <p className="reports-card__subtitle">{item.subtitle}</p>
                  </div>
                  <MaterialIcon name="chevron_right" className="reports-card__icon" />
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="reports-screen__templates">
            {TEMPLATE_GROUPS.map((group) => (
              <section key={group.id} className="reports-section">
                <header className="reports-section__header">
                  <h2>{group.title}</h2>
                </header>
                <div className="reports-section__grid">
                  {group.items.map((item) => renderTemplateItem(item))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <SingleArtworkTemplateDesigner
        open={singleTemplateOpen}
        artworks={artworks}
        onClose={() => setSingleTemplateOpen(false)}
      />
      <FourArtworkTemplateDesigner
        open={quadTemplateOpen}
        artworks={artworks}
        onClose={() => setQuadTemplateOpen(false)}
      />
      <FullMonthlyReportDemo open={fullMonthlyDemoOpen} onClose={() => setFullMonthlyDemoOpen(false)} />
    </div>
  );
}

export default Reports;

