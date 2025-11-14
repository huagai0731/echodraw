import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createAchievementGroup,
  deleteAchievementGroup,
  listAchievementGroups,
  updateAchievementGroup,
} from "@/admin/api";
import type { AdminAchievementGroup } from "@/admin/api";

import "../styles/AchievementGroups.css";

const DEFAULT_FORM: Partial<AdminAchievementGroup> & {
  metadata_json: string;
} = {
  slug: "",
  name: "",
  description: "",
  category: "",
  icon: "",
  display_order: 100,
  metadata_json: "{}",
};

function normalizeGroup(group: AdminAchievementGroup): AdminAchievementGroup {
  return {
    ...group,
    metadata:
      typeof group.metadata === "object" && group.metadata !== null && !Array.isArray(group.metadata)
        ? group.metadata
        : {},
    achievements: Array.isArray(group.achievements) ? group.achievements : [],
  };
}

function AchievementGroupsPage() {
  const [groups, setGroups] = useState<AdminAchievementGroup[]>([]);
  const [rowForm, setRowForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const data = await listAchievementGroups();
        if (!mounted) {
          return;
        }
        setGroups(data.map((group) => normalizeGroup(group)));
      } catch (err) {
        if (!mounted) {
          return;
        }
        handleError(err, "加载成就组数据失败，请稍后重试。");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
    };
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

  const startEdit = (group: AdminAchievementGroup) => {
    setRowForm({
      ...group,
      metadata_json: JSON.stringify(group.metadata ?? {}, null, 2),
    });
    setEditingId(group.id);
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
      const metadata = safeParseJSON(rowForm.metadata_json ?? "", "metadata");

      const payload = {
        slug: rowForm.slug?.trim() ?? "",
        name: rowForm.name?.trim() ?? "",
        description: rowForm.description?.trim() ?? "",
        category: rowForm.category?.trim() ?? "",
        icon: rowForm.icon?.trim() ?? "",
        display_order: Number(rowForm.display_order) || 100,
        metadata,
      };

      if (!payload.slug) {
        throw new Error("请填写成就组标识 slug。");
      }

      if (!payload.name) {
        throw new Error("请填写成就组名称。");
      }

      if (editingId === "new") {
        const created = await createAchievementGroup(payload);
        setGroups((prev) => [normalizeGroup(created), ...prev]);
      } else {
        const updated = await updateAchievementGroup(editingId, payload);
        setGroups((prev) =>
          prev.map((item) => (item.id === editingId ? normalizeGroup(updated) : item)),
        );
      }

      cancelEdit();
    } catch (err) {
      handleError(err, "保存成就组失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这个成就组吗？此操作不可恢复。")) {
      return;
    }

    try {
      await deleteAchievementGroup(id);
      setGroups((prev) => prev.filter((item) => item.id !== id));
      if (editingId === id) {
        cancelEdit();
      }
    } catch (err) {
      handleError(err, "删除成就组失败。");
    }
  };

  const orderedGroups = useMemo(() => {
    return groups.slice().sort((a, b) => a.display_order - b.display_order);
  }, [groups]);

  return (
    <div className="admin-achievement-groups">
      <header className="admin-achievement-groups__header">
        <div>
          <h2>成就组管理</h2>
          <p>维护成就体系的分组、图标与元数据，帮助更好地组织成就等级。</p>
        </div>
        <button
          type="button"
          className="admin-achievement-groups__reset"
          onClick={startCreate}
          disabled={editingId === "new"}
        >
          <MaterialIcon name="add_circle" />
          新增成就组
        </button>
      </header>

      {error ? <p className="admin-achievement-groups__error">{error}</p> : null}

      <section className="admin-achievement-groups__list">
        <h3>成就组列表</h3>
        {loading ? (
          <div className="admin-achievement-groups__loading">
            <div className="admin-achievement-groups__spinner" />
            <span>正在加载成就组数据...</span>
          </div>
        ) : null}

        <div className="admin-achievement-groups__table-wrapper">
          <table className="admin-achievement-groups__table">
            <thead>
              <tr>
                <th>成就组名称</th>
                <th>Slug</th>
                <th>分类</th>
                <th>描述</th>
                <th>排序</th>
                <th>元数据</th>
                <th>包含成就</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {editingId === "new" ? renderEditableRow("new") : null}
              {orderedGroups.length === 0 && !loading ? (
                <tr>
                  <td className="admin-achievement-groups__empty" colSpan={8}>
                    暂未配置成就组。
                  </td>
                </tr>
              ) : null}
              {orderedGroups.map((item) =>
                editingId === item.id ? renderEditableRow(item.id, item) : renderStaticRow(item),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  function renderEditableRow(id: number | "new", original?: AdminAchievementGroup) {
    return (
      <tr key={id}>
        <td data-title="成就组名称">
          <div className="admin-achievement-groups__field">
            <input
              type="text"
              placeholder="请输入成就组名称"
              value={rowForm.name ?? ""}
              onChange={(event) => setRowForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <input
              type="text"
              placeholder="可选：icon 路径或名称"
              value={rowForm.icon ?? ""}
              onChange={(event) => setRowForm((prev) => ({ ...prev, icon: event.target.value }))}
            />
          </div>
        </td>
        <td data-title="Slug">
          <input
            type="text"
            placeholder="唯一标识"
            value={rowForm.slug ?? ""}
            onChange={(event) => setRowForm((prev) => ({ ...prev, slug: event.target.value }))}
            disabled={typeof id === "number"}
          />
        </td>
        <td data-title="分类">
          <input
            type="text"
            placeholder="可选分类"
            value={rowForm.category ?? ""}
            onChange={(event) => setRowForm((prev) => ({ ...prev, category: event.target.value }))}
          />
        </td>
        <td data-title="描述">
          <textarea
            rows={3}
            placeholder="描述成就组的定位或奖励"
            value={rowForm.description ?? ""}
            onChange={(event) => setRowForm((prev) => ({ ...prev, description: event.target.value }))}
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
        <td data-title="包含成就" className="admin-achievement-groups__included">
          {typeof id === "number" && original ? (
            <details>
              <summary>{original.achievements.length ? `已有 ${original.achievements.length} 个` : "暂无"}</summary>
              {original.achievements.length ? (
                <ul>
                  {original.achievements.map((achievement) => (
                    <li key={achievement.id}>{achievement.name}</li>
                  ))}
                </ul>
              ) : null}
            </details>
          ) : (
            <span>保存后显示关联成就</span>
          )}
        </td>
        <td data-title="操作">
          <div className="admin-achievement-groups__actions-group">
            <button type="button" onClick={cancelEdit}>
              取消
            </button>
            <button type="button" onClick={handleSave} disabled={submitting}>
              {submitting ? "保存中..." : "保存"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function renderStaticRow(item: AdminAchievementGroup) {
    return (
      <tr key={item.id}>
        <td data-title="成就组名称">
          <div className="admin-achievement-groups__name">
            <strong>{item.name}</strong>
            <small>{item.icon ? `图标：${item.icon}` : ""}</small>
          </div>
        </td>
        <td data-title="Slug" className="admin-achievement-groups__slug">
          {item.slug}
        </td>
        <td data-title="分类">{item.category || "—"}</td>
        <td data-title="描述" className="admin-achievement-groups__description">
          {item.description || "—"}
        </td>
        <td data-title="排序">{item.display_order}</td>
        <td data-title="元数据" className="admin-achievement-groups__json">
          {item.metadata && Object.keys(item.metadata).length ? (
            <details>
              <summary>查看</summary>
              <pre>{JSON.stringify(item.metadata, null, 2)}</pre>
            </details>
          ) : (
            "—"
          )}
        </td>
        <td data-title="包含成就" className="admin-achievement-groups__included">
          {item.achievements.length ? (
            <details>
              <summary>{`共有 ${item.achievements.length} 个`}</summary>
              <ul>
                {item.achievements.map((achievement) => (
                  <li key={achievement.id}>{achievement.name}</li>
                ))}
              </ul>
            </details>
          ) : (
            "—"
          )}
        </td>
        <td data-title="操作">
          <div className="admin-achievement-groups__actions-group">
            <button type="button" onClick={() => startEdit(item)} disabled={editingId !== null}>
              <MaterialIcon name="edit" />
              编辑
            </button>
            <button type="button" onClick={() => handleDelete(item.id)}>
              <MaterialIcon name="delete" />
              删除
            </button>
          </div>
        </td>
      </tr>
    );
  }
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

export default AchievementGroupsPage;


