import { Fragment, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createAchievementGroup,
  createAchievement,
  deleteAchievement,
  deleteAchievementGroup,
  listAchievementGroups,
  updateAchievement,
  updateAchievementGroup,
} from "@/admin/api";
import type { AdminAchievement, AdminAchievementGroup } from "@/admin/api";

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
  const [levelsEditorGroup, setLevelsEditorGroup] = useState<AdminAchievementGroup | null>(null);

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

  const refreshGroups = async () => {
    try {
      const data = await listAchievementGroups();
      setGroups(data.map((group) => normalizeGroup(group)));
    } catch (err) {
      handleError(err, "刷新成就组失败。");
    }
  };

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
              {orderedGroups.map((item) => (
                <Fragment key={item.id}>
                  {editingId === item.id ? renderEditableRow(item.id, item) : renderStaticRow(item)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {levelsEditorGroup ? (
        <GroupLevelsModal
          group={levelsEditorGroup}
          onClose={() => setLevelsEditorGroup(null)}
          onSaved={async () => {
            setLevelsEditorGroup(null);
            await refreshGroups();
          }}
        />
      ) : null}
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
            <button type="button" onClick={() => setLevelsEditorGroup(item)}>
              <MaterialIcon name="tune" />
              管理子成就
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

type LevelDraft = {
  id: number | null;
  slug: string;
  name: string;
  description: string;
  threshold: number;
  condition: Record<string, unknown>;
  level: number;
  display_order: number;
};

type GroupLevelsModalProps = {
  group: AdminAchievementGroup;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

function GroupLevelsModal({ group, onClose, onSaved }: GroupLevelsModalProps) {
  const [drafts, setDrafts] = useState<LevelDraft[]>(() => mapAchievementsToDrafts(group));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(mapAchievementsToDrafts(group));
  }, [group]);

  const handleChange = (index: number, field: keyof LevelDraft, value: string | number) => {
    setDrafts((prev) =>
      prev.map((draft, idx) =>
        idx === index
          ? {
              ...draft,
              [field]: typeof value === "string" ? value : Number(value),
            }
          : draft,
      ),
    );
  };

  const handleThresholdChange = (index: number, value: number) => {
    setDrafts((prev) =>
      prev.map((draft, idx) => (idx === index ? { ...draft, threshold: value } : draft)),
    );
  };

  const handleAddLevel = () => {
    const nextIndex = drafts.length + 1;
    const baseCondition = drafts[0]?.condition ?? {
      metric: "total_uploads",
      operator: ">=",
      threshold: nextIndex,
    };
    const slug = generateLevelSlug(group.slug, drafts.map((draft) => draft.slug), nextIndex);
    setDrafts((prev) => [
      ...prev,
      {
        id: null,
        slug,
        name: `${group.name} ${nextIndex}`,
        description: "",
        threshold: Number(baseCondition.threshold ?? nextIndex),
        condition: { ...baseCondition, threshold: Number(baseCondition.threshold ?? nextIndex) },
        level: nextIndex,
        display_order: nextIndex * 10,
      },
    ]);
  };

  const handleRemoveLevel = (index: number) => {
    setDrafts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveLevels = async () => {
    if (drafts.length === 0) {
      setError("请至少保留一个子成就。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const existingIds = new Set(group.achievements.map((achievement) => achievement.id));
      const nextIds = new Set<number>();

      for (let idx = 0; idx < drafts.length; idx += 1) {
        const draft = drafts[idx];
        const payloadCondition = {
          ...draft.condition,
          threshold: draft.threshold,
        };
        const payload = {
          name: draft.name.trim() || `${group.name} ${idx + 1}`,
          description: draft.description,
          display_order: (idx + 1) * 10,
          level: idx + 1,
          condition: payloadCondition,
          group: group.id,
        };

        if (draft.id) {
          nextIds.add(draft.id);
          await updateAchievement(draft.id, payload);
        } else {
          await createAchievement({
            ...payload,
            slug: draft.slug || generateLevelSlug(group.slug, drafts.map((item) => item.slug), idx + 1),
          });
        }
      }

      for (const id of existingIds) {
        if (!nextIds.has(id)) {
          await deleteAchievement(id);
        }
      }

      await onSaved();
    } catch (err) {
      if (isAxiosError(err)) {
        setError(err.response?.data?.detail || "保存子成就失败，请稍后再试。");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("保存子成就失败，请稍后再试。");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="group-levels-modal" role="dialog" aria-modal="true">
      <div className="group-levels-modal__backdrop" onClick={onClose} />
      <div className="group-levels-modal__body">
        <header className="group-levels-modal__header">
          <div>
            <h4>{group.name} · 子成就</h4>
            <p>调整每一层的阈值与描述，描述用于用户端展示。</p>
          </div>
          <button type="button" className="group-levels-modal__close" onClick={onClose}>
            <MaterialIcon name="close" />
          </button>
        </header>

        <div className="group-levels-modal__content">
          {error ? <div className="group-levels-modal__error">{error}</div> : null}
          <div className="group-levels-modal__list">
            <div className="group-levels-modal__list-header">
              <span>级别</span>
              <span>名称</span>
              <span>描述</span>
              <span>阈值</span>
              <span>条件类型</span>
              <span />
            </div>
            {drafts.map((draft, index) => (
              <div key={draft.id ?? draft.slug ?? `draft-${index}`} className="group-levels-modal__row">
                <div className="group-levels-modal__cell group-levels-modal__cell--level">
                  Lv.{index + 1}
                </div>
                <div className="group-levels-modal__cell">
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) => handleChange(index, "name", event.target.value)}
                  />
                </div>
                <div className="group-levels-modal__cell">
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(event) => handleChange(index, "description", event.target.value)}
                    placeholder="可选描述"
                  />
                </div>
                <div className="group-levels-modal__cell group-levels-modal__cell--threshold">
                  <input
                    type="number"
                    min={0}
                    value={draft.threshold}
                    onChange={(event) => handleThresholdChange(index, Number(event.target.value))}
                  />
                </div>
                <div className="group-levels-modal__cell group-levels-modal__cell--metric">
                  <code>{String(draft.condition.metric || "total_uploads")}</code>
                </div>
                <div className="group-levels-modal__cell group-levels-modal__cell--actions">
                  <button
                    type="button"
                    className="group-levels-modal__delete"
                    onClick={() => handleRemoveLevel(index)}
                    disabled={drafts.length <= 1}
                  >
                    <MaterialIcon name="delete" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="group-levels-modal__actions">
            <button type="button" className="group-levels-modal__add" onClick={handleAddLevel}>
              <MaterialIcon name="add" />
              添加子成就
            </button>
          </div>
        </div>

        <footer className="group-levels-modal__footer">
          <button type="button" onClick={onClose} className="group-levels-modal__button group-levels-modal__button--ghost">
            取消
          </button>
          <button
            type="button"
            onClick={handleSaveLevels}
            className="group-levels-modal__button group-levels-modal__button--primary"
            disabled={saving}
          >
            {saving ? "保存中..." : "保存子成就"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function mapAchievementsToDrafts(group: AdminAchievementGroup): LevelDraft[] {
  if (!group.achievements.length) {
    return [
      {
        id: null,
        slug: `${group.slug}-1`,
        name: `${group.name} 1`,
        description: group.description || "",
        threshold: 1,
        condition: { metric: "total_uploads", operator: ">=", threshold: 1 },
        level: 1,
        display_order: 10,
      },
    ];
  }
  return group.achievements.map((achievement) => ({
    id: achievement.id,
    slug: achievement.slug,
    name: achievement.name,
    description: achievement.description,
    threshold: extractThreshold(achievement),
    condition: achievement.condition ?? {},
    level: achievement.level,
    display_order: achievement.display_order,
  }));
}

function extractThreshold(achievement: AdminAchievement): number {
  const condition = achievement.condition ?? {};
  const raw = condition.threshold;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function generateLevelSlug(groupSlug: string, existingSlugs: string[], targetIndex: number): string {
  const normalized = groupSlug || "group";
  let slug = `${normalized}-${targetIndex}`;
  let counter = 2;
  const taken = new Set(existingSlugs);
  while (taken.has(slug)) {
    slug = `${normalized}-${targetIndex}-${counter}`;
    counter += 1;
  }
  return slug;
}

export default AchievementGroupsPage;


