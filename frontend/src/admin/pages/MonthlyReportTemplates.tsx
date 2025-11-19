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

// 预设的5条月度摘要模板数据
const MONTHLY_SUMMARY_TEMPLATES = [
  {
    name: "作品多×时长长",
    text_template: "你把大部分时间都压在创作上，本月的节奏扎实而集中。",
    priority: 10,
    min_total_uploads: 10,
    max_total_uploads: null,
    min_avg_hours: 1,
    max_avg_hours: null,
  },
  {
    name: "作品多×时长短",
    text_template: "你的想法出现得频繁，本月的产出轻快但持续。",
    priority: 20,
    min_total_uploads: 10,
    max_total_uploads: null,
    min_avg_hours: null,
    max_avg_hours: 0.99,
  },
  {
    name: "作品少×时长长",
    text_template: "你把精力放在少数画面上，本月整体偏向耐心地打磨。",
    priority: 30,
    min_total_uploads: 1,
    max_total_uploads: 9,
    min_avg_hours: 1,
    max_avg_hours: null,
  },
  {
    name: "作品少×时长短",
    text_template: "你偶尔想起就画一会儿，本月记录不多但保持着自己的节奏。",
    priority: 40,
    min_total_uploads: 1,
    max_total_uploads: 9,
    min_avg_hours: null,
    max_avg_hours: 0.99,
  },
  {
    name: "零作品",
    text_template: "这个月你几乎没打开画面，很正常，创作的节律随时都会回来。",
    priority: 50,
    min_total_uploads: 0,
    max_total_uploads: 0,
    min_avg_hours: null,
    max_avg_hours: null,
  },
];

// 预设的15条节律与习惯模板数据
const RHYTHM_TEMPLATES = [
  // Weekday × 时间段（5条）
  {
    name: "工作日清晨型",
    text_template: "你是工作日清晨型创作者：大部分作品在上班日前的安静时段完成。",
    priority: 10,
    extra_conditions: {
      weekday_ratio_min: 0.6,
      morning_ratio_min: 0.4,
    },
  },
  {
    name: "工作日午后型",
    text_template: "你是工作日午后型创作者：创作高峰常常落在白天光线最舒服的时段。",
    priority: 20,
    extra_conditions: {
      weekday_ratio_min: 0.6,
      afternoon_ratio_min: 0.4,
    },
  },
  {
    name: "工作日傍晚型",
    text_template: "你是工作日傍晚型创作者：你的节奏在下班后的黄金时段最容易启动。",
    priority: 30,
    extra_conditions: {
      weekday_ratio_min: 0.6,
      dusk_ratio_min: 0.4,
    },
  },
  {
    name: "工作日夜行型",
    text_template: "你是工作日夜行型创作者：多数作品诞生在深夜的长线专注里。",
    priority: 40,
    extra_conditions: {
      weekday_ratio_min: 0.6,
      night_ratio_min: 0.4,
    },
  },
  {
    name: "工作日零散型",
    text_template: "你是工作日零散型创作者：一周的白天与夜晚都能看到你分散的创作痕迹。",
    priority: 50,
    extra_conditions: {
      weekday_ratio_min: 0.6,
      scatter_time: true, // 所有时段都 < 40%
    },
  },
  // Weekend × 时间段（5条）
  {
    name: "周末清晨型",
    text_template: "你是周末清晨型创作者：大部分作品来自休息日的早晨，从醒来就开始进入创作状态。",
    priority: 60,
    extra_conditions: {
      weekend_ratio_min: 0.6,
      morning_ratio_min: 0.4,
    },
  },
  {
    name: "周末午后型",
    text_template: "你是周末午后型创作者：作品常集中在放松的午后，是你最自在的创作窗口。",
    priority: 70,
    extra_conditions: {
      weekend_ratio_min: 0.6,
      afternoon_ratio_min: 0.4,
    },
  },
  {
    name: "周末傍晚型",
    text_template: "你是周末傍晚型创作者：你的创作习惯多在周末黄昏后被点亮。",
    priority: 80,
    extra_conditions: {
      weekend_ratio_min: 0.6,
      dusk_ratio_min: 0.4,
    },
  },
  {
    name: "周末夜行型",
    text_template: "你是周末夜行型创作者：多数作品来自假日的深夜，是你最沉得住气的时间。",
    priority: 90,
    extra_conditions: {
      weekend_ratio_min: 0.6,
      night_ratio_min: 0.4,
    },
  },
  {
    name: "周末零散型",
    text_template: "你是周末零散型创作者：你的创作在休息日的各个时段都能出现，没有固定节奏。",
    priority: 100,
    extra_conditions: {
      weekend_ratio_min: 0.6,
      scatter_time: true,
    },
  },
  // Balanced × 时间段（5条）
  {
    name: "均衡清晨型",
    text_template: "你是均衡清晨型创作者：清晨是你跨一周最稳定的启动力量。",
    priority: 110,
    extra_conditions: {
      balanced_week: true, // 工作日和周末都 < 60%
      morning_ratio_min: 0.4,
    },
  },
  {
    name: "均衡午后型",
    text_template: "你是均衡午后型创作者：你的节奏稳在白天，整体创作分布在午后最为集中。",
    priority: 120,
    extra_conditions: {
      balanced_week: true,
      afternoon_ratio_min: 0.4,
    },
  },
  {
    name: "均衡傍晚型",
    text_template: "你是均衡傍晚型创作者：傍晚是你整周持续稳定的创作起点。",
    priority: 130,
    extra_conditions: {
      balanced_week: true,
      dusk_ratio_min: 0.4,
    },
  },
  {
    name: "均衡夜行型",
    text_template: "你是均衡夜行型创作者：深夜是一周中最能沉下来完成作品的时段。",
    priority: 140,
    extra_conditions: {
      balanced_week: true,
      night_ratio_min: 0.4,
    },
  },
  {
    name: "均衡零散型",
    text_template: "你是均衡零散型创作者：你的创作分布平均，不被特定时段限制。",
    priority: 150,
    extra_conditions: {
      balanced_week: true,
      scatter_time: true,
    },
  },
];

function MonthlyReportTemplatesPage() {
  const [templates, setTemplates] = useState<AdminMonthlyReportTemplate[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [draft, setDraft] = useState(TEMPLATE_EMPTY);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingRhythm, setImportingRhythm] = useState(false);

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

  // 批量导入月度摘要模板
  const handleImportMonthlySummary = async () => {
    if (importing || editingId !== null) {
      return;
    }

    const confirmed = window.confirm(
      "确定要导入5条预设的月度摘要模板吗？如果已存在同名模板，将会跳过。"
    );
    if (!confirmed) {
      return;
    }

    setImporting(true);
    setError(null);

    try {
      // 检查已存在的模板名称
      const existingNames = new Set(
        templates
          .filter((t) => t.section === "monthly_summary")
          .map((t) => t.name)
      );

      let importedCount = 0;
      let skippedCount = 0;

      for (const templateData of MONTHLY_SUMMARY_TEMPLATES) {
        // 如果已存在同名模板，跳过
        if (existingNames.has(templateData.name)) {
          skippedCount++;
          continue;
        }

        const payload = {
          section: "monthly_summary",
          name: templateData.name,
          text_template: templateData.text_template,
          priority: templateData.priority,
          is_active: true,
          min_total_uploads: templateData.min_total_uploads,
          max_total_uploads: templateData.max_total_uploads,
          min_total_hours: null,
          max_total_hours: null,
          min_avg_hours: templateData.min_avg_hours,
          max_avg_hours: templateData.max_avg_hours,
          creator_type: null,
          min_avg_rating: null,
          max_avg_rating: null,
          uploads_change_direction: null,
          hours_change_direction: null,
        };

        const created = await createMonthlyReportTemplate(payload);
        setTemplates((prev) => [created, ...prev]);
        existingNames.add(templateData.name);
        importedCount++;
      }

      // 重新加载模板列表以确保数据同步
      const refreshed = await listMonthlyReportTemplates();
      setTemplates(refreshed);

      alert(`导入完成！成功导入 ${importedCount} 条模板${skippedCount > 0 ? `，跳过 ${skippedCount} 条已存在的模板` : ""}。`);
    } catch (err) {
      handleError(err, "导入月度摘要模板失败，请稍后重试。");
    } finally {
      setImporting(false);
    }
  };

  // 批量导入节律与习惯模板
  const handleImportRhythm = async () => {
    if (importingRhythm || editingId !== null) {
      return;
    }

    const confirmed = window.confirm(
      "确定要导入15条预设的节律与习惯模板吗？如果已存在同名模板，将会跳过。"
    );
    if (!confirmed) {
      return;
    }

    setImportingRhythm(true);
    setError(null);

    try {
      // 检查已存在的模板名称
      const existingNames = new Set(
        templates
          .filter((t) => t.section === "rhythm")
          .map((t) => t.name)
      );

      let importedCount = 0;
      let skippedCount = 0;

      for (const templateData of RHYTHM_TEMPLATES) {
        // 如果已存在同名模板，跳过
        if (existingNames.has(templateData.name)) {
          skippedCount++;
          continue;
        }

        const payload = {
          section: "rhythm",
          name: templateData.name,
          text_template: templateData.text_template,
          priority: templateData.priority,
          is_active: true,
          min_total_uploads: null,
          max_total_uploads: null,
          min_total_hours: null,
          max_total_hours: null,
          min_avg_hours: null,
          max_avg_hours: null,
          creator_type: null,
          min_avg_rating: null,
          max_avg_rating: null,
          uploads_change_direction: null,
          hours_change_direction: null,
          extra_conditions: templateData.extra_conditions,
        };

        const created = await createMonthlyReportTemplate(payload);
        setTemplates((prev) => [created, ...prev]);
        existingNames.add(templateData.name);
        importedCount++;
      }

      // 重新加载模板列表以确保数据同步
      const refreshed = await listMonthlyReportTemplates();
      setTemplates(refreshed);

      alert(`导入完成！成功导入 ${importedCount} 条模板${skippedCount > 0 ? `，跳过 ${skippedCount} 条已存在的模板` : ""}。`);
    } catch (err) {
      handleError(err, "导入节律与习惯模板失败，请稍后重试。");
    } finally {
      setImportingRhythm(false);
    }
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
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {selectedSection === "monthly_summary" || selectedSection === "" ? (
            <button
              type="button"
              className="admin-monthly-report-templates__create"
              onClick={handleImportMonthlySummary}
              disabled={importing || editingId !== null}
              style={{
                opacity: importing || editingId !== null ? 0.5 : 1,
                cursor: importing || editingId !== null ? "not-allowed" : "pointer",
              }}
            >
              <MaterialIcon name="file_download" />
              {importing ? "导入中..." : "导入月度摘要模板"}
            </button>
          ) : null}
          {selectedSection === "rhythm" || selectedSection === "" ? (
            <button
              type="button"
              className="admin-monthly-report-templates__create"
              onClick={handleImportRhythm}
              disabled={importingRhythm || editingId !== null}
              style={{
                opacity: importingRhythm || editingId !== null ? 0.5 : 1,
                cursor: importingRhythm || editingId !== null ? "not-allowed" : "pointer",
              }}
            >
              <MaterialIcon name="file_download" />
              {importingRhythm ? "导入中..." : "导入节律与习惯模板"}
            </button>
          ) : null}
          <button type="button" className="admin-monthly-report-templates__create" onClick={startCreate}>
            <MaterialIcon name="add" />
            新建模板
          </button>
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




