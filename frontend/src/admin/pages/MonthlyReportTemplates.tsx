import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createMonthlyReportTemplate,
  deleteMonthlyReportTemplate,
  listMonthlyReportTemplates,
  updateMonthlyReportTemplate,
} from "@/admin/api";
import type { AdminMonthlyReportTemplate } from "@/admin/api";

import "../styles/MonthlyReportTemplates.css";

// 月报屏幕配置 - 每个屏幕有独立的文案管理
const REPORT_SCREENS = [
  {
    id: "monthly_summary",
    label: "月度摘要",
    description: "本月概览与关键指标",
    helpText: "支持变量：{count}（上传数）、{hours}（总时长）、{avg_hours}（平均时长）、{rating}（平均评分）",
  },
  {
    id: "rhythm_summary",
    label: "节律与习惯 - 底部总结",
    description: "节律与习惯屏幕底部的总结文案",
    helpText: "支持变量：{creator_type}（创作者类型：夜行型/日行型）、{percentage}（百分比）",
  },
  {
    id: "tags_summary",
    label: "标签快照 - 总结文案",
    description: "标签快照屏幕底部的总结文案",
    helpText: "支持变量：{top_tag}（最常用标签）、{top_percentage}（百分比）、{top_rating}（最高分标签的平均分）",
  },
  {
    id: "milestone_summary",
    label: "节点回顾 - 总结文案",
    description: "节点回顾屏幕顶部的总结文案",
    helpText: "支持变量：{first_rating}（第一张评分）、{last_rating}（最后一张评分）",
  },
  {
    id: "milestone_insight",
    label: "节点回顾 - 最意外作品洞察",
    description: "节点回顾屏幕中关于最意外作品的洞察文案",
    helpText: "支持变量：{duration}（时长）、{rating}（评分）",
  },
  {
    id: "depth_insight",
    label: "创作深度 - 洞察文案",
    description: "创作深度屏幕底部的洞察文案",
    helpText: "支持变量：{creator_type}（碎片型/深度型）、{percentage}（百分比）",
  },
  {
    id: "trend_summary",
    label: "趋势对比 - 总结文案",
    description: "趋势对比屏幕顶部的总结文案",
    helpText: "支持变量：{hours_trend}（时长趋势：稳定增长/有所波动）、{uploads_trend}（上传趋势：稳步提升/虽有波动）",
  },
  {
    id: "insight_efficiency_title",
    label: "个性化洞察 - 效率窗口标题",
    description: "个性化洞察中效率窗口卡片的标题",
    helpText: "支持变量：{start_hour}（开始时间）、{end_hour}（结束时间）",
  },
  {
    id: "insight_efficiency_desc",
    label: "个性化洞察 - 效率窗口描述",
    description: "个性化洞察中效率窗口卡片的描述",
    helpText: "支持变量：{start_hour}（开始时间）、{end_hour}（结束时间）、{diff}（分差）",
  },
  {
    id: "insight_duration_title",
    label: "个性化洞察 - 时长临界点标题",
    description: "个性化洞察中时长临界点卡片的标题",
    helpText: "支持变量：{threshold}（临界点分钟数）",
  },
  {
    id: "insight_duration_desc",
    label: "个性化洞察 - 时长临界点描述",
    description: "个性化洞察中时长临界点卡片的描述",
    helpText: "支持变量：{threshold}（临界点分钟数）",
  },
  {
    id: "insight_emotion_title",
    label: "个性化洞察 - 情绪差异标题",
    description: "个性化洞察中情绪差异卡片的标题",
    helpText: "支持变量：{mood}（情绪标签）",
  },
  {
    id: "insight_emotion_desc",
    label: "个性化洞察 - 情绪差异描述",
    description: "个性化洞察中情绪差异卡片的描述",
    helpText: "支持变量：{mood}（情绪标签）、{diff_percent}（差异百分比）",
  },
];

// 简化的模板空对象
const TEMPLATE_EMPTY = {
  section: "monthly_summary",
  name: "",
  text_template: "",
  priority: "100",
  is_active: true,
  // 简化的条件 - 只保留最常用的
  min_total_uploads: "",
  max_total_uploads: "",
  min_avg_hours: "",
  max_avg_hours: "",
};

function parseNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return isNaN(num) ? null : num;
}

function MonthlyReportTemplatesPage() {
  const [templates, setTemplates] = useState<AdminMonthlyReportTemplate[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [draft, setDraft] = useState(TEMPLATE_EMPTY);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // 按屏幕分组模板
  const templatesBySection = useMemo(() => {
    const grouped: Record<string, AdminMonthlyReportTemplate[]> = {};
    REPORT_SCREENS.forEach((screen) => {
      grouped[screen.id] = [];
    });
    
    templates.forEach((template) => {
      if (grouped[template.section]) {
        grouped[template.section].push(template);
      } else {
        // 如果屏幕不在列表中，创建一个新组
        if (!grouped[template.section]) {
          grouped[template.section] = [];
        }
        grouped[template.section].push(template);
      }
    });
    
    // 按优先级排序
    Object.keys(grouped).forEach((section) => {
      grouped[section].sort((a, b) => a.priority - b.priority);
    });
    
    return grouped;
  }, [templates]);

  // 过滤显示的屏幕
  const visibleScreens = useMemo(() => {
    if (!selectedSection) {
      return REPORT_SCREENS;
    }
    return REPORT_SCREENS.filter((screen) => screen.id === selectedSection);
  }, [selectedSection]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listMonthlyReportTemplates();
        setTemplates(data);
        // 默认展开所有屏幕
        setExpandedSections(new Set(REPORT_SCREENS.map((s) => s.id)));
      } catch (err) {
        handleError(err, "加载月报文案模板失败，请稍后重试。");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleError = (err: unknown, defaultMessage: string) => {
    if (isAxiosError(err)) {
      const message = err.response?.data?.detail || err.response?.data?.message || defaultMessage;
      setError(message);
    } else if (err instanceof Error) {
      setError(err.message);
    } else {
      setError(defaultMessage);
    }
    setTimeout(() => setError(null), 5000);
  };

  const handleSave = async () => {
    if (saving || editingId === null) {
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const payload = {
        section: draft.section,
        name: draft.name.trim(),
        text_template: draft.text_template.trim(),
        priority: Number(draft.priority) || 100,
        is_active: draft.is_active,
        // 简化的条件 - 只发送有值的
        min_total_uploads: parseNullableNumber(draft.min_total_uploads),
        max_total_uploads: parseNullableNumber(draft.max_total_uploads),
        min_total_hours: null,
        max_total_hours: null,
        min_avg_hours: parseNullableNumber(draft.min_avg_hours),
        max_avg_hours: parseNullableNumber(draft.max_avg_hours),
        creator_type: null,
        min_avg_rating: null,
        max_avg_rating: null,
        uploads_change_direction: null,
        hours_change_direction: null,
      };

      if (!payload.name) {
        throw new Error("请填写模板名称。");
      }
      if (!payload.text_template) {
        throw new Error("请填写文案模板。");
      }

      if (editingId === "new") {
        const created = await createMonthlyReportTemplate(payload);
        setTemplates((prev) => [created, ...prev]);
      } else {
        const updated = await updateMonthlyReportTemplate(editingId, payload);
        setTemplates((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      }

      setDraft(TEMPLATE_EMPTY);
      setEditingId(null);
    } catch (err) {
      handleError(err, "保存月报文案模板失败。");
    } finally {
      setSaving(false);
    }
  };

  const startCreate = (section?: string) => {
    if (editingId !== null) return;
    setDraft({ 
      ...TEMPLATE_EMPTY, 
      section: section || selectedSection || "monthly_summary" 
    });
    setEditingId("new");
  };

  const handleEdit = (template: AdminMonthlyReportTemplate) => {
    if (editingId !== null) return;
    setDraft({
      section: template.section,
      name: template.name,
      text_template: template.text_template,
      priority: String(template.priority),
      is_active: template.is_active,
      min_total_uploads: template.min_total_uploads === null ? "" : String(template.min_total_uploads),
      max_total_uploads: template.max_total_uploads === null ? "" : String(template.max_total_uploads),
      min_avg_hours: template.min_avg_hours === null ? "" : String(template.min_avg_hours),
      max_avg_hours: template.max_avg_hours === null ? "" : String(template.max_avg_hours),
    });
    setEditingId(template.id);
  };

  const cancelEdit = () => {
    setDraft(TEMPLATE_EMPTY);
    setEditingId(null);
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除此月报文案模板吗？")) {
      return;
    }

    try {
      await deleteMonthlyReportTemplate(id);
      setTemplates((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        cancelEdit();
      }
    } catch (err) {
      handleError(err, "删除失败，请稍后重试。");
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const getSectionInfo = (sectionId: string) => {
    return REPORT_SCREENS.find((s) => s.id === sectionId);
  };

  if (loading) {
    return (
      <div className="admin-monthly-report-templates">
        <div className="admin-monthly-report-templates__loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="admin-monthly-report-templates">
      <header className="admin-monthly-report-templates__header">
        <div>
          <h2>月报文案模板管理</h2>
          <p>为月报的各个屏幕管理个性化文案模板，支持变量替换和条件匹配。</p>
        </div>
      </header>

      {error && (
        <div className="admin-monthly-report-templates__error">
          <MaterialIcon name="error" />
          {error}
        </div>
      )}

      <div className="admin-monthly-report-templates__filter">
        <label>
          <span>筛选屏幕：</span>
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
          >
            <option value="">全部屏幕</option>
            {REPORT_SCREENS.map((screen) => (
              <option key={screen.id} value={screen.id}>
                {screen.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 编辑表单 */}
      {editingId !== null && (
        <div className="admin-monthly-report-templates__form">
          <div className="admin-monthly-report-templates__form-header">
            <h3>{editingId === "new" ? "新建模板" : "编辑模板"}</h3>
            <button type="button" onClick={cancelEdit}>
              <MaterialIcon name="close" />
            </button>
          </div>

          <div className="admin-monthly-report-templates__form-body">
            <div className="admin-monthly-report-templates__form-row">
              <label>
                <span>屏幕 *</span>
                <select
                  value={draft.section}
                  onChange={(e) => setDraft({ ...draft, section: e.target.value })}
                  disabled={editingId !== "new"}
                >
                  {REPORT_SCREENS.map((screen) => (
                    <option key={screen.id} value={screen.id}>
                      {screen.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="admin-monthly-report-templates__form-row">
              <label>
                <span>模板名称 *</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="例如：高产量模板"
                />
              </label>
            </div>

            <div className="admin-monthly-report-templates__form-row">
              <label>
                <span>文案模板 *</span>
                <textarea
                  value={draft.text_template}
                  onChange={(e) => setDraft({ ...draft, text_template: e.target.value })}
                  placeholder="输入文案内容，支持变量替换..."
                  rows={6}
                />
                {getSectionInfo(draft.section) && (
                  <small>{getSectionInfo(draft.section)?.helpText}</small>
                )}
              </label>
            </div>

            <div className="admin-monthly-report-templates__form-row admin-monthly-report-templates__form-row--inline">
              <label>
                <span>优先级</span>
                <input
                  type="number"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                  placeholder="100"
                />
                <small>数字越小优先级越高</small>
              </label>
              <label>
                <span>是否启用</span>
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                />
              </label>
            </div>

            <div className="admin-monthly-report-templates__form-section">
              <h4>条件规则（可选，用于匹配不同情况的用户）</h4>

              <div className="admin-monthly-report-templates__form-row">
                <label>
                  <span>上传数范围</span>
                  <div className="admin-monthly-report-templates__form-range">
                    <input
                      type="number"
                      value={draft.min_total_uploads}
                      onChange={(e) => setDraft({ ...draft, min_total_uploads: e.target.value })}
                      placeholder="最小值"
                      min="0"
                    />
                    <span>至</span>
                    <input
                      type="number"
                      value={draft.max_total_uploads}
                      onChange={(e) => setDraft({ ...draft, max_total_uploads: e.target.value })}
                      placeholder="最大值"
                      min="0"
                    />
                  </div>
                </label>
              </div>

              <div className="admin-monthly-report-templates__form-row">
                <label>
                  <span>平均时长范围（小时）</span>
                  <div className="admin-monthly-report-templates__form-range">
                    <input
                      type="number"
                      step="0.1"
                      value={draft.min_avg_hours}
                      onChange={(e) => setDraft({ ...draft, min_avg_hours: e.target.value })}
                      placeholder="最小值"
                      min="0"
                    />
                    <span>至</span>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.max_avg_hours}
                      onChange={(e) => setDraft({ ...draft, max_avg_hours: e.target.value })}
                      placeholder="最大值"
                      min="0"
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="admin-monthly-report-templates__form-actions">
              <button type="button" onClick={cancelEdit}>
                取消
              </button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 按屏幕分组的模板列表 */}
      <div className="admin-monthly-report-templates__sections">
        {visibleScreens.map((screen) => {
          const sectionTemplates = templatesBySection[screen.id] || [];
          const isExpanded = expandedSections.has(screen.id);
          
          return (
            <div key={screen.id} className="admin-monthly-report-templates__section">
              <div 
                className="admin-monthly-report-templates__section-header"
                onClick={() => toggleSection(screen.id)}
              >
                <div>
                  <h3>{screen.label}</h3>
                  <p>{screen.description}</p>
                </div>
                <div className="admin-monthly-report-templates__section-header-actions">
                  <span className="admin-monthly-report-templates__section-count">
                    {sectionTemplates.length} 个模板
                  </span>
                  <button
                    type="button"
                    className="admin-monthly-report-templates__section-add"
                    onClick={(e) => {
                      e.stopPropagation();
                      startCreate(screen.id);
                    }}
                    disabled={editingId !== null}
                  >
                    <MaterialIcon name="add" />
                    添加模板
                  </button>
                  <MaterialIcon 
                    name={isExpanded ? "expand_less" : "expand_more"} 
                    className="admin-monthly-report-templates__section-toggle"
                  />
                </div>
              </div>

              {isExpanded && (
                <div className="admin-monthly-report-templates__section-content">
                  {sectionTemplates.length === 0 ? (
                    <div className="admin-monthly-report-templates__empty">
                      暂无模板，点击"添加模板"创建
                    </div>
                  ) : (
                    sectionTemplates.map((template) => (
                      <div
                        key={template.id}
                        className={`admin-monthly-report-templates__item ${
                          editingId === template.id ? "admin-monthly-report-templates__item--editing" : ""
                        } ${!template.is_active ? "admin-monthly-report-templates__item--inactive" : ""}`}
                      >
                        <div className="admin-monthly-report-templates__item-header">
                          <div>
                            <h4>{template.name}</h4>
                            {!template.is_active && (
                              <span className="admin-monthly-report-templates__item-badge">已禁用</span>
                            )}
                            <span className="admin-monthly-report-templates__item-priority">
                              优先级: {template.priority}
                            </span>
                          </div>
                          <div className="admin-monthly-report-templates__item-actions">
                            <button
                              type="button"
                              onClick={() => handleEdit(template)}
                              disabled={editingId !== null}
                            >
                              <MaterialIcon name="edit" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(template.id)}
                              disabled={editingId !== null}
                            >
                              <MaterialIcon name="delete" />
                            </button>
                          </div>
                        </div>
                        <div className="admin-monthly-report-templates__item-body">
                          <p className="admin-monthly-report-templates__item-text">{template.text_template}</p>
                          {(template.min_total_uploads !== null || 
                            template.max_total_uploads !== null ||
                            template.min_avg_hours !== null ||
                            template.max_avg_hours !== null) && (
                            <div className="admin-monthly-report-templates__item-meta">
                              {template.min_total_uploads !== null && (
                                <span>
                                  上传数: {template.min_total_uploads}
                                  {template.max_total_uploads !== null ? `-${template.max_total_uploads}` : "+"}
                                </span>
                              )}
                              {template.min_avg_hours !== null && (
                                <span>
                                  平均时长: {template.min_avg_hours}h
                                  {template.max_avg_hours !== null ? `-${template.max_avg_hours}h` : "+"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MonthlyReportTemplatesPage;
