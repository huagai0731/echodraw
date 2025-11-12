import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createAchievement,
  deleteAchievement,
  listAchievements,
  updateAchievement,
} from "@/admin/api";
import type { AdminAchievement } from "@/admin/api";

import "../styles/Achievements.css";

const DEFAULT_FORM: Partial<AdminAchievement> & {
  condition_json: string;
  metadata_json: string;
} = {
  slug: "",
  name: "",
  description: "",
  category: "",
  icon: "",
  display_order: 100,
  is_active: true,
  condition_json: "{\n  \"metric\": \"total_uploads\",\n  \"operator\": \">=\",\n  \"threshold\": 10\n}",
  metadata_json: "{\n  \"reward_points\": 50\n}",
};

function AchievementsPage() {
  const [achievements, setAchievements] = useState<AdminAchievement[]>([]);
  const [rowForm, setRowForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listAchievements();
        setAchievements(data);
      } catch (err) {
        handleError(err, "加载成就配置失败，请稍后重试。");
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

  const startCreate = () => {
    setEditingId("new");
    setRowForm(DEFAULT_FORM);
    setError(null);
  };

  const startEdit = (achievement: AdminAchievement) => {
    setRowForm({
      ...achievement,
      condition_json: JSON.stringify(achievement.condition ?? {}, null, 2),
      metadata_json: JSON.stringify(achievement.metadata ?? {}, null, 2),
    });
    setEditingId(achievement.id);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRowForm(DEFAULT_FORM);
    setError(null);
  };

  const handleSave = async () => {
    if (submitting || editingId === null) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const condition = safeParseJSON(rowForm.condition_json ?? "", "condition");
      const metadata = safeParseJSON(rowForm.metadata_json ?? "", "metadata");

      const payload = {
        slug: rowForm.slug?.trim() ?? "",
        name: rowForm.name?.trim() ?? "",
        description: rowForm.description?.trim() ?? "",
        category: rowForm.category?.trim() ?? "",
        icon: rowForm.icon?.trim() ?? "",
        is_active: rowForm.is_active ?? true,
        display_order: Number(rowForm.display_order) || 100,
        condition,
        metadata,
      };

      if (!payload.slug) {
        throw new Error("请填写成就标识 slug。");
      }

      if (!payload.name) {
        throw new Error("请填写成就名称。");
      }

      if (editingId === "new") {
        const created = await createAchievement(payload);
        setAchievements((prev) => [created, ...prev]);
      } else {
        const updated = await updateAchievement(editingId, payload);
        setAchievements((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      }

      cancelEdit();
    } catch (err) {
      handleError(err, "保存成就配置失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这个成就吗？此操作不可恢复。")) {
      return;
    }

    try {
      await deleteAchievement(id);
      setAchievements((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        cancelEdit();
      }
    } catch (err) {
      handleError(err, "删除成就失败。");
    }
  };

  const orderedAchievements = useMemo(() => {
    return achievements.slice().sort((a, b) => a.display_order - b.display_order);
  }, [achievements]);

  return (
    <div className="admin-achievements">
      <header className="admin-achievements__header">
        <div>
          <h2>成就系统</h2>
          <p>配置 Echo 平台的成就体系，提升用户激励与沉浸感。</p>
        </div>
        <button
          type="button"
          className="admin-achievements__reset"
          onClick={startCreate}
          disabled={editingId === "new"}
        >
          <MaterialIcon name="add_circle" />
          新增成就行
        </button>
      </header>

      {error ? <p className="admin-achievements__error">{error}</p> : null}

      <section className="admin-achievements__list">
        <h3>成就列表</h3>
        {loading ? (
          <div className="admin-achievements__loading">
            <div className="admin-achievements__spinner" />
            <span>正在加载成就数据...</span>
          </div>
        ) : null}

        <div className="admin-achievements__table-wrapper">
          <table className="admin-achievements__table">
            <thead>
              <tr>
                <th>成就名称</th>
                <th>Slug</th>
                <th>分类</th>
                <th>描述</th>
                <th>排序</th>
                <th>条件（JSON）</th>
                <th>元数据</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {editingId === "new" ? (
                <tr key="new">
                  <td data-title="成就名称">
                    <div className="admin-achievements__field">
                      <input
                        type="text"
                        placeholder="请输入成就名称"
                        value={rowForm.name ?? ""}
                        onChange={(event) =>
                          setRowForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                      <input
                        type="text"
                        placeholder="可选：icon 路径或名称"
                        value={rowForm.icon ?? ""}
                        onChange={(event) =>
                          setRowForm((prev) => ({ ...prev, icon: event.target.value }))
                        }
                      />
                    </div>
                  </td>
                  <td data-title="Slug">
                    <input
                      type="text"
                      placeholder="唯一标识"
                      value={rowForm.slug ?? ""}
                      onChange={(event) =>
                        setRowForm((prev) => ({ ...prev, slug: event.target.value }))
                      }
                    />
                  </td>
                  <td data-title="分类">
                    <input
                      type="text"
                      placeholder="可选分类"
                      value={rowForm.category ?? ""}
                      onChange={(event) =>
                        setRowForm((prev) => ({ ...prev, category: event.target.value }))
                      }
                    />
                  </td>
                  <td data-title="描述">
                    <textarea
                      rows={3}
                      placeholder="描述达成条件或奖励"
                      value={rowForm.description ?? ""}
                      onChange={(event) =>
                        setRowForm((prev) => ({ ...prev, description: event.target.value }))
                      }
                    />
                  </td>
                  <td data-title="排序">
                    <input
                      type="number"
                      value={rowForm.display_order ?? 100}
                      onChange={(event) =>
                        setRowForm((prev) => ({
                          ...prev,
                          display_order: Number(event.target.value),
                        }))
                      }
                    />
                  </td>
                  <td data-title="条件（JSON）">
                    <textarea
                      rows={5}
                      value={rowForm.condition_json ?? ""}
                      onChange={(event) =>
                        setRowForm((prev) => ({ ...prev, condition_json: event.target.value }))
                      }
                    />
                  </td>
                  <td data-title="元数据">
                    <textarea
                      rows={4}
                      placeholder="可选 JSON"
                      value={rowForm.metadata_json ?? ""}
                      onChange={(event) =>
                        setRowForm((prev) => ({ ...prev, metadata_json: event.target.value }))
                      }
                    />
                  </td>
                  <td data-title="状态">
                    <label className="admin-achievements__toggle">
                      <input
                        type="checkbox"
                        checked={rowForm.is_active ?? true}
                        onChange={(event) =>
                          setRowForm((prev) => ({ ...prev, is_active: event.target.checked }))
                        }
                      />
                      <span>{rowForm.is_active ? "启用" : "停用"}</span>
                    </label>
                  </td>
                  <td data-title="操作">
                    <div className="admin-achievements__actions-group">
                      <button type="button" onClick={cancelEdit}>
                        取消
                      </button>
                      <button type="button" onClick={handleSave} disabled={submitting}>
                        {submitting ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : null}
              {orderedAchievements.length === 0 && !loading ? (
                <tr>
                  <td className="admin-achievements__empty" colSpan={9}>
                    暂未配置成就。
                  </td>
                </tr>
              ) : null}
              {orderedAchievements.map((item) => (
                <tr key={item.id}>
                  {editingId === item.id ? (
                    <>
                      <td data-title="成就名称">
                        <div className="admin-achievements__field">
                          <input
                            type="text"
                            value={rowForm.name ?? ""}
                            onChange={(event) =>
                              setRowForm((prev) => ({ ...prev, name: event.target.value }))
                            }
                          />
                          <input
                            type="text"
                            placeholder="图标（可选）"
                            value={rowForm.icon ?? ""}
                            onChange={(event) =>
                              setRowForm((prev) => ({ ...prev, icon: event.target.value }))
                            }
                          />
                        </div>
                      </td>
                      <td data-title="Slug">
                        <input
                          type="text"
                          value={rowForm.slug ?? ""}
                          onChange={(event) =>
                            setRowForm((prev) => ({ ...prev, slug: event.target.value }))
                          }
                        />
                      </td>
                      <td data-title="分类">
                        <input
                          type="text"
                          value={rowForm.category ?? ""}
                          onChange={(event) =>
                            setRowForm((prev) => ({ ...prev, category: event.target.value }))
                          }
                        />
                      </td>
                      <td data-title="描述">
                        <textarea
                          rows={3}
                          value={rowForm.description ?? ""}
                          onChange={(event) =>
                            setRowForm((prev) => ({ ...prev, description: event.target.value }))
                          }
                        />
                      </td>
                      <td data-title="排序">
                        <input
                          type="number"
                          value={rowForm.display_order ?? 100}
                          onChange={(event) =>
                            setRowForm((prev) => ({
                              ...prev,
                              display_order: Number(event.target.value),
                            }))
                          }
                        />
                      </td>
                      <td data-title="条件（JSON）">
                        <textarea
                          rows={5}
                          value={rowForm.condition_json ?? ""}
                          onChange={(event) =>
                            setRowForm((prev) => ({ ...prev, condition_json: event.target.value }))
                          }
                        />
                      </td>
                      <td data-title="元数据">
                        <textarea
                          rows={4}
                          value={rowForm.metadata_json ?? ""}
                          onChange={(event) =>
                            setRowForm((prev) => ({ ...prev, metadata_json: event.target.value }))
                          }
                        />
                      </td>
                      <td data-title="状态">
                        <label className="admin-achievements__toggle">
                          <input
                            type="checkbox"
                            checked={rowForm.is_active ?? true}
                            onChange={(event) =>
                              setRowForm((prev) => ({ ...prev, is_active: event.target.checked }))
                            }
                          />
                          <span>{rowForm.is_active ? "启用" : "停用"}</span>
                        </label>
                      </td>
                      <td data-title="操作">
                        <div className="admin-achievements__actions-group">
                          <button type="button" onClick={cancelEdit}>
                            取消
                          </button>
                          <button type="button" onClick={handleSave} disabled={submitting}>
                            {submitting ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td data-title="成就名称">
                        <div className="admin-achievements__name">
                          <strong>{item.name}</strong>
                          <small>{item.icon ? `图标：${item.icon}` : ""}</small>
                        </div>
                      </td>
                      <td data-title="Slug" className="admin-achievements__slug">
                        {item.slug}
                      </td>
                      <td data-title="分类">{item.category || "—"}</td>
                      <td data-title="描述" className="admin-achievements__description">
                        {item.description || "—"}
                      </td>
                      <td data-title="排序">{item.display_order}</td>
                      <td data-title="条件（JSON）" className="admin-achievements__json">
                        <details>
                          <summary>查看</summary>
                          <pre>{JSON.stringify(item.condition ?? {}, null, 2)}</pre>
                        </details>
                      </td>
                      <td data-title="元数据" className="admin-achievements__json">
                        {item.metadata && Object.keys(item.metadata).length ? (
                          <details>
                            <summary>查看</summary>
                            <pre>{JSON.stringify(item.metadata, null, 2)}</pre>
                          </details>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-title="状态">
                        <span className={item.is_active ? "status status--active" : "status"}>
                          {item.is_active ? "启用" : "停用"}
                        </span>
                      </td>
                      <td data-title="操作">
                        <div className="admin-achievements__actions-group">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
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
              ))}
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
      throw new Error(`${label} 字段必须是 JSON 对象。`);
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`${label} 字段 JSON 格式不正确。`);
    }
    throw err;
  }
}

export default AchievementsPage;

