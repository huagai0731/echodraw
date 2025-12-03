import { useCallback, useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createLongTermCopy,
  deleteLongTermCopy,
  listLongTermCopies,
  updateLongTermCopy,
  type AdminLongTermCopy,
} from "@/admin/api";

import "../styles/LongTermCopy.css";

type DraftState = {
  minHours: string;
  maxHours: string;
  message: string;
  isActive: boolean;
};

type SampleCopy = {
  min_hours: number;
  max_hours: number | null;
  message: string;
  is_active: boolean;
};

type StoredCopy = {
  id: number;
  min_hours: number;
  max_hours: number | null;
  message: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const DRAFT_EMPTY: DraftState = {
  minHours: "50",
  maxHours: "",
  message: "",
  isActive: true,
};

const SAMPLE_COPIES: SampleCopy[] = [
  {
    min_hours: 50,
    max_hours: 99,
    message: "这是一个入门级长线计划，可用于集中训练单一技巧或完成小型系列。",
    is_active: true,
  },
  {
    min_hours: 100,
    max_hours: 199,
    message: "中等时长适合安排阶段性迭代，每 20-30 小时总结一次产出与经验。",
    is_active: true,
  },
  {
    min_hours: 200,
    max_hours: 399,
    message: "大跨度创作建议拆分为多个主题或章节，确保每个检查点有清晰目标。",
    is_active: true,
  },
  {
    min_hours: 400,
    max_hours: null,
    message: "超长计划请预留充足的缓冲时间，并定期复盘资源投入与创作成果。",
    is_active: true,
  },
];

const LOCAL_STORAGE_KEY = "echo-admin-long-term-copy";

let localIdCounter = -1;

function generateLocalId() {
  localIdCounter -= 1;
  return localIdCounter;
}

function mapSampleToAdmin(sample: SampleCopy): AdminLongTermCopy {
  const timestamp = new Date().toISOString();
  return {
    id: generateLocalId(),
    min_hours: sample.min_hours,
    max_hours: sample.max_hours,
    message: sample.message,
    is_active: sample.is_active,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function mapPayloadToAdmin(
  payload: Pick<AdminLongTermCopy, "min_hours" | "max_hours" | "message" | "is_active">,
  id = generateLocalId(),
  previous?: AdminLongTermCopy,
): AdminLongTermCopy {
  const now = new Date().toISOString();
  return {
    id,
    min_hours: payload.min_hours,
    max_hours: payload.max_hours ?? null,
    message: payload.message,
    is_active: payload.is_active,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
}

function readLocalCopies(): AdminLongTermCopy[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredCopy[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    const mapped = parsed.map((item) => ({
      id: item.id,
      min_hours: item.min_hours,
      max_hours: item.max_hours ?? null,
      message: item.message,
      is_active: item.is_active,
      created_at: item.created_at ?? new Date().toISOString(),
      updated_at: item.updated_at ?? new Date().toISOString(),
    }));
    const minId = mapped.reduce((acc, item) => Math.min(acc, item.id ?? acc), 0);
    if (minId < 0) {
      localIdCounter = Math.min(localIdCounter, minId);
    }
    return mapped;
  } catch (error) {
    console.warn("[Admin] Failed to read local long-term copies", error);
    return [];
  }
}

function persistLocalCopies(copies: AdminLongTermCopy[]) {
  if (typeof window === "undefined") {
    return;
  }
  const payload: StoredCopy[] = copies.map((item) => ({
    id: item.id,
    min_hours: item.min_hours,
    max_hours: item.max_hours ?? null,
    message: item.message,
    is_active: item.is_active,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }));
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[Admin] Failed to persist local long-term copies", error);
  }
}

function mergeSampleCopies(existing: AdminLongTermCopy[], samples: SampleCopy[]) {
  const existingKey = new Set(
    existing.map((item) => `${item.min_hours}-${item.max_hours ?? "inf"}`),
  );
  const additions = samples
    .filter((sample) => !existingKey.has(`${sample.min_hours}-${sample.max_hours ?? "inf"}`))
    .map(mapSampleToAdmin);
  if (!additions.length) {
    return existing;
  }
  return [...existing, ...additions];
}

function isNotFoundError(error: unknown) {
  return isAxiosError(error) && error.response?.status === 404;
}

function LongTermCopyPage() {
  const [copies, setCopies] = useState<AdminLongTermCopy[]>([]);
  const [draft, setDraft] = useState<DraftState>(DRAFT_EMPTY);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [autoSeeded, setAutoSeeded] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleError = useCallback((err: unknown, fallback: string) => {
    if (isAxiosError(err)) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" && detail.length > 0 ? detail : fallback);
    } else if (err instanceof Error && err.message) {
      setError(err.message);
    } else {
      setError(fallback);
    }
  }, []);

  const enableLocalMode = useCallback(() => {
    setBackendAvailable(false);
    setInfoMessage("后台暂未提供长期计划文案接口，已启用本地存储进行模拟。");
    setError(null);
  }, []);

  const ensureLocalCopies = useCallback(() => {
    const localCopies = readLocalCopies();
    if (localCopies.length > 0) {
      return localCopies;
    }
    const seeded = SAMPLE_COPIES.map(mapSampleToAdmin);
    persistLocalCopies(seeded);
    return seeded;
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listLongTermCopies();
        setCopies(data);
        setBackendAvailable(true);
        setInfoMessage(null);
        setError(null);
      } catch (err) {
        if (isNotFoundError(err)) {
          const localCopies = ensureLocalCopies();
          setCopies(localCopies);
          enableLocalMode();
          setError(null);
          setAutoSeeded(true);
        } else {
          handleError(err, "加载长期计划文案失败，请稍后重试。");
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [enableLocalMode, ensureLocalCopies, handleError]);

  const resetDraft = () => {
    setDraft(DRAFT_EMPTY);
    setEditingId(null);
    setSaving(false);
    setError(null);
  };

  const handleSeed = useCallback(
    async (auto = false) => {
      if (seeding) {
        return;
      }
      setSeeding(true);
      if (!auto) {
        setError(null);
      }

      try {
        if (backendAvailable) {
          const existingKey = new Set(
            copies.map((item) => `${item.min_hours}-${item.max_hours ?? "inf"}`),
          );
          const candidates = SAMPLE_COPIES.filter(
            (sample) => !existingKey.has(`${sample.min_hours}-${sample.max_hours ?? "inf"}`),
          );

          if (candidates.length === 0) {
            if (!auto) {
              setError("示例文案已存在，无需重复生成。");
            }
            setAutoSeeded(true);
            return;
          }

          const created: AdminLongTermCopy[] = [];
          for (const sample of candidates) {
            const record = await createLongTermCopy(sample);
            created.push(record);
          }
          setCopies((prev) => [...created, ...prev]);
          setAutoSeeded(true);
        } else {
          const next = mergeSampleCopies(copies, SAMPLE_COPIES);
          if (next.length === copies.length) {
            if (!auto) {
              setError("示例文案已存在，无需重复生成。");
            }
          } else {
            setCopies(next);
            persistLocalCopies(next);
            setError(null);
          }
          setAutoSeeded(true);
        }
      } catch (err) {
        if (isNotFoundError(err)) {
          enableLocalMode();
          const next = mergeSampleCopies(copies, SAMPLE_COPIES);
          if (next.length !== copies.length) {
            setCopies(next);
            persistLocalCopies(next);
          }
          setError(null);
          setAutoSeeded(true);
        } else {
          handleError(
            err,
            auto ? "自动生成示例文案失败，请稍后手动生成。" : "生成示例文案失败。",
          );
          if (auto) {
            setAutoSeeded(true);
          }
        }
      } finally {
        setSeeding(false);
      }
    },
    [backendAvailable, copies, enableLocalMode, handleError, seeding],
  );

  useEffect(() => {
    if (!loading && copies.length === 0 && !autoSeeded) {
      void handleSeed(true);
    }
  }, [loading, copies.length, autoSeeded, handleSeed]);

  const handleSave = async () => {
    if (saving || editingId === null) {
      return;
    }

    const parsedMin = Number(draft.minHours);
    const parsedMax = draft.maxHours.trim() === "" ? null : Number(draft.maxHours);

    if (!Number.isFinite(parsedMin) || parsedMin < 0) {
      setError("请填写不小于 0 的最小时长。");
      return;
    }

    if (parsedMax !== null) {
      if (!Number.isFinite(parsedMax) || parsedMax < parsedMin) {
        setError("最大时长需大于或等于最小时长，或留空表示不限。");
        return;
      }
    }

    const trimmedMessage = draft.message.trim();
    if (!trimmedMessage) {
      setError("请填写提示文案内容。");
      return;
    }

    const payload = {
      min_hours: Math.round(parsedMin),
      max_hours: parsedMax === null ? null : Math.round(parsedMax),
      message: trimmedMessage,
      is_active: draft.isActive,
    };

    setSaving(true);
    setError(null);

    try {
      if (backendAvailable) {
        if (editingId === "new") {
          const created = await createLongTermCopy(payload);
          setCopies((prev) => [created, ...prev]);
        } else if (typeof editingId === "number") {
          const updated = await updateLongTermCopy(editingId, payload);
          setCopies((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
        }
        resetDraft();
        return;
      }

      const next = (() => {
        if (editingId === "new") {
          const created = mapPayloadToAdmin(payload);
          return [created, ...copies];
        }
        return copies.map((item) =>
          item.id === editingId ? mapPayloadToAdmin(payload, editingId, item) : item,
        );
      })();

      setCopies(next);
      persistLocalCopies(next);
      resetDraft();
    } catch (err) {
      if (isNotFoundError(err)) {
        enableLocalMode();
        const next = (() => {
          if (editingId === "new") {
            const created = mapPayloadToAdmin(payload);
            return [created, ...copies];
          }
          return copies.map((item) =>
            item.id === editingId ? mapPayloadToAdmin(payload, editingId, item) : item,
          );
        })();
        setCopies(next);
        persistLocalCopies(next);
        resetDraft();
      } else {
        handleError(err, editingId === "new" ? "创建文案失败。" : "更新文案失败。");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record: AdminLongTermCopy) => {
    setDraft({
      minHours: String(record.min_hours),
      maxHours: record.max_hours === null ? "" : String(record.max_hours),
      message: record.message,
      isActive: record.is_active,
    });
    setEditingId(record.id);
    setError(null);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这条长期计划文案吗？")) {
      return;
    }
    try {
      if (backendAvailable) {
        await deleteLongTermCopy(id);
        setCopies((prev) => prev.filter((item) => item.id !== id));
        if (editingId === id) {
          resetDraft();
        }
        return;
      }
      const next = copies.filter((item) => item.id !== id);
      setCopies(next);
      persistLocalCopies(next);
      if (editingId === id) {
        resetDraft();
      }
    } catch (err) {
      if (isNotFoundError(err)) {
        enableLocalMode();
        const next = copies.filter((item) => item.id !== id);
        setCopies(next);
        persistLocalCopies(next);
        if (editingId === id) {
          resetDraft();
        }
      } else {
        handleError(err, "删除文案失败，请稍后重试。");
      }
    }
  };

  const sortedCopies = useMemo(() => {
    return copies
      .slice()
      .sort((a, b) => {
        if (a.min_hours !== b.min_hours) {
          return a.min_hours - b.min_hours;
        }
        const aMax = a.max_hours ?? Number.POSITIVE_INFINITY;
        const bMax = b.max_hours ?? Number.POSITIVE_INFINITY;
        return aMax - bMax;
      });
  }, [copies]);

  return (
    <div className="admin-long-term-copy">
      <header className="admin-long-term-copy__header">
        <div>
          <h2>长期计划文案</h2>
          <p>为不同时长区间配置创作建议，帮助用户快速理解计划安排。</p>
        </div>
        <div className="admin-long-term-copy__header-actions">
          <button
            type="button"
            className="admin-long-term-copy__seed"
            onClick={() => void handleSeed()}
            disabled={seeding}
          >
            <MaterialIcon name="auto_fix_high" />
            {seeding ? "生成中..." : "生成示例文案"}
          </button>
          <button
            type="button"
            className="admin-long-term-copy__add"
            onClick={() => {
              if (editingId !== null) {
                return;
              }
              setDraft(DRAFT_EMPTY);
              setEditingId("new");
              setError(null);
            }}
            disabled={editingId !== null}
          >
            <MaterialIcon name="add_circle" />
            新增文案
          </button>
          <button
            type="button"
            className="admin-long-term-copy__reset"
            onClick={resetDraft}
            disabled={editingId === null}
          >
            <MaterialIcon name="refresh" />
            取消编辑
          </button>
        </div>
      </header>

      {infoMessage ? <p className="admin-long-term-copy__info">{infoMessage}</p> : null}
      {error ? <p className="admin-long-term-copy__error">{error}</p> : null}

      {loading ? (
        <div className="admin-long-term-copy__loading">
          <div className="admin-long-term-copy__spinner" />
          <span>正在读取长期计划文案...</span>
        </div>
      ) : null}

      <section className="admin-long-term-copy__table-card">
        <header className="admin-long-term-copy__table-header">
          <h3>文案列表</h3>
          <p>按最小时长升序排列，支持行内创建与编辑。</p>
        </header>

        <div className="admin-long-term-copy__table-wrapper">
          <table className="admin-long-term-copy__table">
            <thead>
              <tr>
                <th>最小时长（小时）</th>
                <th>最大时长（小时）</th>
                <th>提示文案</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {editingId === "new" ? (
                <tr>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={draft.minHours}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, minHours: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      placeholder="留空表示无上限"
                      value={draft.maxHours}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, maxHours: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      rows={3}
                      placeholder="根据时长区间为用户定制的说明或建议"
                      value={draft.message}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, message: event.target.value }))
                      }
                    />
                  </td>
                  <td>
                    <label className="admin-long-term-copy__toggle">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, isActive: event.target.checked }))
                        }
                      />
                      <span>{draft.isActive ? "启用" : "停用"}</span>
                    </label>
                  </td>
                  <td>
                    <div className="admin-long-term-copy__actions-group">
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

              {sortedCopies.length === 0 && editingId === null ? (
                <tr>
                  <td className="admin-long-term-copy__empty" colSpan={5}>
                    暂未配置任何长期计划文案。
                  </td>
                </tr>
              ) : null}

              {sortedCopies.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            type="number"
                            min={0}
                            value={draft.minHours}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, minHours: event.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            placeholder="留空表示无上限"
                            value={draft.maxHours}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, maxHours: event.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <textarea
                            rows={3}
                            value={draft.message}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, message: event.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <label className="admin-long-term-copy__toggle">
                            <input
                              type="checkbox"
                              checked={draft.isActive}
                              onChange={(event) =>
                                setDraft((prev) => ({ ...prev, isActive: event.target.checked }))
                              }
                            />
                            <span>{draft.isActive ? "启用" : "停用"}</span>
                          </label>
                        </td>
                        <td>
                          <div className="admin-long-term-copy__actions-group">
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
                        <td>{item.min_hours}</td>
                        <td>{item.max_hours ?? "不限"}</td>
                        <td className="admin-long-term-copy__text">{item.message}</td>
                        <td>
                          <span className={item.is_active ? "status status--active" : "status"}>
                            {item.is_active ? "启用" : "停用"}
                          </span>
                        </td>
                        <td>
                          <div className="admin-long-term-copy__actions-group">
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

export default LongTermCopyPage;
