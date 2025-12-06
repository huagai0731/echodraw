import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createShortTermTaskPreset,
  deleteShortTermTaskPreset,
  listShortTermTaskPresets,
  updateShortTermTaskPreset,
} from "@/admin/api";
import type { AdminShortTermTaskPreset } from "@/admin/api";

import "../styles/ShortTermTaskPresets.css";

const PRESET_EMPTY = {
  code: "",
  category: "",
  title: "",
  description: "",
  display_order: "100",
  metadata_json: "{}",
  is_active: true,
};

function ShortTermTaskPresetsPage() {
  const [presets, setPresets] = useState<AdminShortTermTaskPreset[]>([]);
  const [draft, setDraft] = useState(PRESET_EMPTY);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listShortTermTaskPresets();
        setPresets(data);
      } catch (err) {
        handleError(err, "加载任务预设失败，请稍后再试。");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleError = (err: unknown, fallback: string) => {
    if (isAxiosError(err)) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" && detail.length > 0 ? detail : fallback);
    } else if (err instanceof Error) {
      setError(err.message || fallback);
    } else {
      setError(fallback);
    }
  };

  const resetDraft = () => {
    setDraft(PRESET_EMPTY);
    setEditingId(null);
    setSaving(false);
    setError(null);
  };

  const handleSave = async () => {
    if (saving || editingId === null) {
      return;
    }

    const trimmedCode = draft.code.trim();
    const trimmedCategory = draft.category.trim();
    const trimmedTitle = draft.title.trim();
    const trimmedDescription = draft.description.trim();
    const displayOrder = Number(draft.display_order) || 100;

    if (!trimmedCode) {
      setError("请填写任务标识 code。");
      return;
    }
    if (!trimmedCategory) {
      setError("请填写任务分类。");
      return;
    }
    if (!trimmedTitle) {
      setError("请填写任务名称。");
      return;
    }

    let metadata: Record<string, unknown> = {};
    try {
      metadata = safeParseJSON(draft.metadata_json, "元数据");
    } catch (err) {
      setError(err instanceof Error ? err.message : "元数据 JSON 格式不正确。");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      code: trimmedCode,
      category: trimmedCategory,
      title: trimmedTitle,
      description: trimmedDescription,
      display_order: displayOrder,
      is_active: draft.is_active,
      metadata,
    };

    try {
      if (editingId === "new") {
        const created = await createShortTermTaskPreset(payload);
        setPresets((prev) => [created, ...prev]);
      } else {
        const updated = await updateShortTermTaskPreset(editingId, payload);
        setPresets((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      }
      resetDraft();
    } catch (err) {
      handleError(err, "保存任务预设失败。");
    } finally {
      setSaving(false);
    }
  };

  const startCreate = () => {
    if (editingId !== null) return;
    setDraft(PRESET_EMPTY);
    setEditingId("new");
  };

  const handleEdit = (preset: AdminShortTermTaskPreset) => {
    if (editingId !== null) return;
    setDraft({
      code: preset.code,
      category: preset.category,
      title: preset.title,
      description: preset.description ?? "",
      display_order: String(preset.display_order),
      metadata_json: JSON.stringify(preset.metadata ?? {}, null, 2),
      is_active: preset.is_active,
    });
    setEditingId(preset.id);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这个任务预设吗？此操作不可恢复。")) {
      return;
    }

    try {
      await deleteShortTermTaskPreset(id);
      setPresets((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        resetDraft();
      }
    } catch (err) {
      handleError(err, "删除任务预设失败。");
    }
  };

  const orderedPresets = useMemo(() => {
    return presets
      .slice()
      .sort((a, b) => a.display_order - b.display_order || a.code.localeCompare(b.code));
  }, [presets]);

  return (
    <div className="admin-task-presets">
      <header className="admin-task-presets__header">
        <div>
          <h2>短期任务预设</h2>
          <p>为用户配置创建短期目标时可选的任务模板。</p>
        </div>
        <button
          type="button"
          className="admin-task-presets__action"
          onClick={startCreate}
          disabled={editingId !== null}
        >
          <MaterialIcon name="add_circle" />
          新增任务
        </button>
      </header>

      {error ? <p className="admin-task-presets__error">{error}</p> : null}

      <section className="admin-task-presets__table-card">
        <header className="admin-task-presets__table-header">
          <h3>任务预设列表</h3>
          <p>通过行内编辑快速维护任务模板。</p>
        </header>

        {loading ? (
          <div className="admin-task-presets__loading">
            <div className="admin-task-presets__spinner" />
            <span>正在加载任务预设...</span>
          </div>
        ) : null}

        <div className="admin-task-presets__table-wrapper">
          <table className="admin-task-presets__table">
            <thead>
              <tr>
                <th>任务标识</th>
                <th>分类</th>
                <th>任务名称</th>
                <th>简介</th>
                <th>顺序</th>
                <th>元数据（JSON）</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {editingId === "new" ? (
                <tr>
                  <td>
                    <input
                      type="text"
                      placeholder="如：sketch-warmup"
                      value={draft.code}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, code: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="如：速写 / 色彩"
                      value={draft.category}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, category: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="任务名称"
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, title: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      rows={3}
                      placeholder="简要说明任务目标或操作提示"
                      value={draft.description}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, description: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={draft.display_order}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, display_order: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      rows={5}
                      value={draft.metadata_json}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, metadata_json: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <label className="admin-task-presets__toggle">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, is_active: event.target.checked }))
                        }
                      />
                      <span>{draft.is_active ? "启用" : "停用"}</span>
                    </label>
                  </td>
                  <td>
                    <div className="admin-task-presets__actions-group">
                      <button type="button" onClick={resetDraft}>
                        取消
                      </button>
                      <button type="button" onClick={handleSave} disabled={saving}>
                        {saving ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}

              {orderedPresets.length === 0 && editingId === null ? (
                <tr>
                  <td className="admin-task-presets__empty" colSpan={8}>
                    暂未配置任务预设。
                  </td>
                </tr>
              ) : null}

              {orderedPresets.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            type="text"
                            value={draft.code}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, code: event.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={draft.category}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, category: event.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={draft.title}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, title: event.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <textarea
                            rows={3}
                            value={draft.description}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                description: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={draft.display_order}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, display_order: event.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <textarea
                            rows={5}
                            value={draft.metadata_json}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                metadata_json: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td>
                          <label className="admin-task-presets__toggle">
                            <input
                              type="checkbox"
                              checked={draft.is_active}
                              onChange={(event) =>
                                setDraft((prev) => ({ ...prev, is_active: event.target.checked }))
                              }
                            />
                            <span>{draft.is_active ? "启用" : "停用"}</span>
                          </label>
                        </td>
                        <td>
                          <div className="admin-task-presets__actions-group">
                            <button type="button" onClick={resetDraft}>
                              取消
                            </button>
                            <button type="button" onClick={handleSave} disabled={saving}>
                              {saving ? "保存中..." : "保存"}
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{item.code}</td>
                        <td>{item.category}</td>
                        <td>{item.title}</td>
                        <td className="admin-task-presets__text">
                          {item.description || "—"}
                        </td>
                        <td>{item.display_order}</td>
                        <td>
                          <details>
                            <summary>查看</summary>
                            <pre>{JSON.stringify(item.metadata ?? {}, null, 2)}</pre>
                          </details>
                        </td>
                        <td>
                          <span className={item.is_active ? "status status--active" : "status"}>
                            {item.is_active ? "启用" : "停用"}
                          </span>
                        </td>
                        <td>
                          <div className="admin-task-presets__actions-group">
                            <button
                              type="button"
                              onClick={() => handleEdit(item)}
                              disabled={editingId !== null}
                            >
                              <MaterialIcon name="edit" />
                              编辑
                            </button>
                            <button type="button" onClick={() => handleDelete(item.id)}>
                              <MaterialIcon name="delete" />
                              删除
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function safeParseJSON(raw: string, label: string): Record<string, unknown> {
  try {
    if (!raw.trim()) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${label} 必须是 JSON 对象。`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`${label} JSON 格式不正确。`);
    }
    throw err;
  }
}

export default ShortTermTaskPresetsPage;



