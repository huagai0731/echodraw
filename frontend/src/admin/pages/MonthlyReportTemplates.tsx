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

const SECTION_CHOICES = [
  { value: "monthly_summary", label: "月度摘要" },
  { value: "rhythm", label: "节律与习惯" },
  { value: "tags", label: "标签快照" },
  { value: "milestone_review", label: "节点回顾" },
  { value: "creative_depth", label: "创作深度" },
  { value: "trend_comparison", label: "趋势对比" },
  { value: "personalized_insight", label: "个性化洞察" },
];

const CREATOR_TYPE_CHOICES = [
  { value: "fragmented", label: "碎片型创作者" },
  { value: "focused", label: "专注型创作者" },
  { value: "balanced", label: "平衡型创作者" },
];

const CHANGE_DIRECTION_CHOICES = [
  { value: "increase", label: "增加" },
  { value: "decrease", label: "减少" },
  { value: "stable", label: "稳定" },
];

const TEMPLATE_EMPTY = {
  section: "monthly_summary",
  name: "",
  text_template: "",
  priority: "100",
  is_active: true,
  min_total_uploads: "",
  max_total_uploads: "",
  min_total_hours: "",
  max_total_hours: "",
  min_avg_hours: "",
  max_avg_hours: "",
  creator_type: "",
  min_avg_rating: "",
  max_avg_rating: "",
  uploads_change_direction: "",
  hours_change_direction: "",
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

  const filteredTemplates = useMemo(() => {
    let result = templates;
    if (selectedSection) {
      result = result.filter((t) => t.section === selectedSection);
    }
    return result.sort((a, b) => {
      if (a.section !== b.section) {
        return a.section.localeCompare(b.section);
      }
      return a.priority - b.priority;
    });
  }, [templates, selectedSection]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listMonthlyReportTemplates();
        setTemplates(data);
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
        min_total_uploads: parseNullableNumber(draft.min_total_uploads),
        max_total_uploads: parseNullableNumber(draft.max_total_uploads),
        min_total_hours: parseNullableNumber(draft.min_total_hours),
        max_total_hours: parseNullableNumber(draft.max_total_hours),
        min_avg_hours: parseNullableNumber(draft.min_avg_hours),
        max_avg_hours: parseNullableNumber(draft.max_avg_hours),
        creator_type: draft.creator_type || null,
        min_avg_rating: parseNullableNumber(draft.min_avg_rating),
        max_avg_rating: parseNullableNumber(draft.max_avg_rating),
        uploads_change_direction: draft.uploads_change_direction || null,
        hours_change_direction: draft.hours_change_direction || null,
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

  const startCreate = () => {
    if (editingId !== null) return;
    setDraft({ ...TEMPLATE_EMPTY, section: selectedSection || "monthly_summary" });
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
      min_total_hours: template.min_total_hours === null ? "" : String(template.min_total_hours),
      max_total_hours: template.max_total_hours === null ? "" : String(template.max_total_hours),
      min_avg_hours: template.min_avg_hours === null ? "" : String(template.min_avg_hours),
      max_avg_hours: template.max_avg_hours === null ? "" : String(template.max_avg_hours),
      creator_type: template.creator_type || "",
      min_avg_rating: template.min_avg_rating === null ? "" : String(template.min_avg_rating),
      max_avg_rating: template.max_avg_rating === null ? "" : String(template.max_avg_rating),
      uploads_change_direction: template.uploads_change_direction || "",
      hours_change_direction: template.hours_change_direction || "",
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

  const getSectionLabel = (section: string) => {
    const found = SECTION_CHOICES.find((s) => s.value === section);
    return found?.label || section;
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
          <p>管理月报各部分的个性化文案模板，支持根据用户数据条件匹配不同文案。</p>
        </div>
        <button type="button" className="admin-monthly-report-templates__create" onClick={startCreate}>
          <MaterialIcon name="add" />
          新建模板
        </button>
      </header>

      {error && (
        <div className="admin-monthly-report-templates__error">
          <MaterialIcon name="error" />
          {error}
        </div>
      )}

      <div className="admin-monthly-report-templates__filter">
        <label>
          <span>筛选部分：</span>
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
          >
            <option value="">全部部分</option>
            {SECTION_CHOICES.map((section) => (
              <option key={section.value} value={section.value}>
                {section.label}
              </option>
            ))}
          </select>
        </label>
      </div>

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
                <span>部分 *</span>
                <select
                  value={draft.section}
                  onChange={(e) => setDraft({ ...draft, section: e.target.value })}
                >
                  {SECTION_CHOICES.map((section) => (
                    <option key={section.value} value={section.value}>
                      {section.label}
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
                  placeholder="例如：比上月更专注文案"
                />
              </label>
            </div>

            <div className="admin-monthly-report-templates__form-row">
              <label>
                <span>文案模板 *</span>
                <textarea
                  value={draft.text_template}
                  onChange={(e) => setDraft({ ...draft, text_template: e.target.value })}
                  placeholder='例如：你本月画了 {count} 张图，累计 {hours} 小时，比上月更专注，也更温柔。支持变量：{count}、{hours}、{avg_hours}、{creator_type}、{rating}、{trend}'
                  rows={4}
                />
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
              <h4>条件规则（可选，留空表示不限制）</h4>

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
                  <span>总时长范围（小时）</span>
                  <div className="admin-monthly-report-templates__form-range">
                    <input
                      type="number"
                      step="0.1"
                      value={draft.min_total_hours}
                      onChange={(e) => setDraft({ ...draft, min_total_hours: e.target.value })}
                      placeholder="最小值"
                      min="0"
                    />
                    <span>至</span>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.max_total_hours}
                      onChange={(e) => setDraft({ ...draft, max_total_hours: e.target.value })}
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

              <div className="admin-monthly-report-templates__form-row">
                <label>
                  <span>创作类型</span>
                  <select
                    value={draft.creator_type}
                    onChange={(e) => setDraft({ ...draft, creator_type: e.target.value })}
                  >
                    <option value="">不限</option>
                    {CREATOR_TYPE_CHOICES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="admin-monthly-report-templates__form-row">
                <label>
                  <span>平均评分范围</span>
                  <div className="admin-monthly-report-templates__form-range">
                    <input
                      type="number"
                      step="0.1"
                      value={draft.min_avg_rating}
                      onChange={(e) => setDraft({ ...draft, min_avg_rating: e.target.value })}
                      placeholder="最小值"
                      min="0"
                      max="5"
                    />
                    <span>至</span>
                    <input
                      type="number"
                      step="0.1"
                      value={draft.max_avg_rating}
                      onChange={(e) => setDraft({ ...draft, max_avg_rating: e.target.value })}
                      placeholder="最大值"
                      min="0"
                      max="5"
                    />
                  </div>
                </label>
              </div>

              <div className="admin-monthly-report-templates__form-row">
                <label>
                  <span>与上月对比 - 上传数变化</span>
                  <select
                    value={draft.uploads_change_direction}
                    onChange={(e) => setDraft({ ...draft, uploads_change_direction: e.target.value })}
                  >
                    <option value="">不限</option>
                    {CHANGE_DIRECTION_CHOICES.map((dir) => (
                      <option key={dir.value} value={dir.value}>
                        {dir.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="admin-monthly-report-templates__form-row">
                <label>
                  <span>与上月对比 - 总时长变化</span>
                  <select
                    value={draft.hours_change_direction}
                    onChange={(e) => setDraft({ ...draft, hours_change_direction: e.target.value })}
                  >
                    <option value="">不限</option>
                    {CHANGE_DIRECTION_CHOICES.map((dir) => (
                      <option key={dir.value} value={dir.value}>
                        {dir.label}
                      </option>
                    ))}
                  </select>
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

      <div className="admin-monthly-report-templates__list">
        {filteredTemplates.length === 0 ? (
          <div className="admin-monthly-report-templates__empty">
            暂无模板，点击"新建模板"添加
          </div>
        ) : (
          filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={`admin-monthly-report-templates__item ${
                editingId === template.id ? "admin-monthly-report-templates__item--editing" : ""
              } ${!template.is_active ? "admin-monthly-report-templates__item--inactive" : ""}`}
            >
              <div className="admin-monthly-report-templates__item-header">
                <div>
                  <span className="admin-monthly-report-templates__item-section">
                    {getSectionLabel(template.section)}
                  </span>
                  <h3>{template.name}</h3>
                  {!template.is_active && (
                    <span className="admin-monthly-report-templates__item-badge">已禁用</span>
                  )}
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
                <div className="admin-monthly-report-templates__item-meta">
                  <span>优先级: {template.priority}</span>
                  {template.min_total_uploads !== null && (
                    <span>上传数: {template.min_total_uploads}
                      {template.max_total_uploads !== null ? `-${template.max_total_uploads}` : "+"}
                    </span>
                  )}
                  {template.creator_type && (
                    <span>类型: {CREATOR_TYPE_CHOICES.find((t) => t.value === template.creator_type)?.label}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default MonthlyReportTemplatesPage;



