import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createConditionalMessage,
  createEncouragementMessage,
  createHistoryMessage,
  deleteConditionalMessage,
  deleteEncouragementMessage,
  deleteHistoryMessage,
  listConditionalMessages,
  listEncouragementMessages,
  listHistoryMessages,
  updateConditionalMessage,
  updateEncouragementMessage,
  updateHistoryMessage,
} from "@/admin/api";
import type {
  AdminConditionalMessage,
  AdminEncouragementMessage,
  AdminHistoryMessage,
} from "@/admin/api";

import "../styles/HomeContent.css";

type TabKey = "history" | "encouragement" | "conditional";

const HISTORY_EMPTY = {
  date: "",
  headline: "",
  text: "",
  is_active: true,
};

const ENCOURAGEMENT_EMPTY = {
  text: "",
  weight: "1",
  is_active: true,
};

const CONDITIONAL_EMPTY = {
  name: "",
  text: "",
  priority: "100",
  is_active: true,
  // 打卡条件
  min_total_checkins: "",
  max_total_checkins: "",
  min_streak_days: "",
  max_streak_days: "",
  // 上传条件
  min_total_uploads: "",
  max_total_uploads: "",
  // 上一次上传条件
  match_last_upload_moods: "",
  match_last_upload_tags: "",
};

function HomeContentPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("history");

  const [historyMessages, setHistoryMessages] = useState<AdminHistoryMessage[]>([]);
  const [historyDraft, setHistoryDraft] = useState(HISTORY_EMPTY);
  const [historyEditingId, setHistoryEditingId] = useState<number | "new" | null>(null);
  const [historySaving, setHistorySaving] = useState(false);

  const [encouragements, setEncouragements] = useState<AdminEncouragementMessage[]>([]);
  const [encouragementDraft, setEncouragementDraft] = useState(ENCOURAGEMENT_EMPTY);
  const [encouragementEditingId, setEncouragementEditingId] = useState<number | "new" | null>(null);
  const [encouragementSaving, setEncouragementSaving] = useState(false);

  const [conditionals, setConditionals] = useState<AdminConditionalMessage[]>([]);
  const [conditionalDraft, setConditionalDraft] = useState(CONDITIONAL_EMPTY);
  const [conditionalEditingId, setConditionalEditingId] = useState<number | "new" | null>(null);
  const [conditionalSaving, setConditionalSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [historyData, encouragementData, conditionalData] = await Promise.all([
          listHistoryMessages(),
          listEncouragementMessages(),
          listConditionalMessages(),
        ]);
        setHistoryMessages(historyData);
        setEncouragements(encouragementData);
        setConditionals(conditionalData);
      } catch (err) {
        handleError(err, "加载首页文案数据失败，请稍后重试。");
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

  const resetForms = () => {
    setHistoryDraft(HISTORY_EMPTY);
    setHistoryEditingId(null);
    setHistorySaving(false);
    setEncouragementDraft(ENCOURAGEMENT_EMPTY);
    setEncouragementEditingId(null);
    setEncouragementSaving(false);
    setConditionalDraft(CONDITIONAL_EMPTY);
    setConditionalEditingId(null);
    setConditionalSaving(false);
    setError(null);
  };

  const handleHistorySave = async () => {
    if (historySaving || historyEditingId === null) {
      return;
    }
    setHistorySaving(true);
    setError(null);

    try {
      const payload = {
        date: historyDraft.date,
        headline: historyDraft.headline.trim(),
        text: historyDraft.text.trim(),
        is_active: historyDraft.is_active,
      };

      if (!payload.date) {
        throw new Error("请填写日期。");
      }
      if (!payload.text) {
        throw new Error("请填写文案内容。");
      }

      if (historyEditingId === "new") {
        const created = await createHistoryMessage(payload);
        setHistoryMessages((prev) => [created, ...prev]);
      } else {
        const updated = await updateHistoryMessage(historyEditingId, payload);
        setHistoryMessages((prev) =>
          prev.map((item) => (item.id === historyEditingId ? updated : item)),
        );
      }

      setHistoryDraft(HISTORY_EMPTY);
      setHistoryEditingId(null);
    } catch (err) {
      handleError(err, "保存历史文案失败。");
    } finally {
      setHistorySaving(false);
    }
  };

  const handleEncouragementSave = async () => {
    if (encouragementSaving || encouragementEditingId === null) {
      return;
    }
    setEncouragementSaving(true);
    setError(null);

    try {
      const payload = {
        text: encouragementDraft.text.trim(),
        weight: Math.max(1, Number(encouragementDraft.weight) || 1),
        is_active: encouragementDraft.is_active,
      };

      if (!payload.text) {
        throw new Error("请填写通用文案内容。");
      }

      if (encouragementEditingId === "new") {
        const created = await createEncouragementMessage(payload);
        setEncouragements((prev) => [created, ...prev]);
      } else {
        const updated = await updateEncouragementMessage(encouragementEditingId, payload);
        setEncouragements((prev) =>
          prev.map((item) => (item.id === encouragementEditingId ? updated : item)),
        );
      }

      setEncouragementDraft(ENCOURAGEMENT_EMPTY);
      setEncouragementEditingId(null);
    } catch (err) {
      handleError(err, "保存通用文案失败。");
    } finally {
      setEncouragementSaving(false);
    }
  };

  const handleConditionalSave = async () => {
    if (conditionalSaving || conditionalEditingId === null) {
      return;
    }
    setConditionalSaving(true);
    setError(null);

    try {
      const payload = {
        name: conditionalDraft.name.trim(),
        text: conditionalDraft.text.trim(),
        priority: Number(conditionalDraft.priority) || 100,
        is_active: conditionalDraft.is_active,
        // 打卡条件
        min_total_checkins: parseNullableNumber(conditionalDraft.min_total_checkins),
        max_total_checkins: parseNullableNumber(conditionalDraft.max_total_checkins),
        min_streak_days: parseNullableNumber(conditionalDraft.min_streak_days),
        max_streak_days: parseNullableNumber(conditionalDraft.max_streak_days),
        // 上传条件
        min_total_uploads: parseNullableNumber(conditionalDraft.min_total_uploads),
        max_total_uploads: parseNullableNumber(conditionalDraft.max_total_uploads),
        // 上一次上传条件
        match_last_upload_moods: parseCommaList(conditionalDraft.match_last_upload_moods),
        match_last_upload_tags: parseCommaList(conditionalDraft.match_last_upload_tags),
      };

      if (!payload.name) {
        throw new Error("请填写文案名称。");
      }
      if (!payload.text) {
        throw new Error("请填写文案内容。");
      }

      if (conditionalEditingId === "new") {
        const created = await createConditionalMessage(payload);
        setConditionals((prev) => [created, ...prev]);
      } else {
        const updated = await updateConditionalMessage(conditionalEditingId, payload);
        setConditionals((prev) =>
          prev.map((item) => (item.id === conditionalEditingId ? updated : item)),
        );
      }

      setConditionalDraft(CONDITIONAL_EMPTY);
      setConditionalEditingId(null);
    } catch (err) {
      handleError(err, "保存用户行为文案失败。");
    } finally {
      setConditionalSaving(false);
    }
  };

  const startHistoryCreate = () => {
    if (historyEditingId !== null) return;
    setActiveTab("history");
    setHistoryDraft(HISTORY_EMPTY);
    setHistoryEditingId("new");
  };

  const handleHistoryEdit = (message: AdminHistoryMessage) => {
    if (historyEditingId !== null) return;
    setHistoryDraft({
      date: message.date,
      headline: message.headline ?? "",
      text: message.text,
      is_active: message.is_active,
    });
    setHistoryEditingId(message.id);
    setActiveTab("history");
  };

  const cancelHistoryEdit = () => {
    setHistoryDraft(HISTORY_EMPTY);
    setHistoryEditingId(null);
    setHistorySaving(false);
  };

  const startEncouragementCreate = () => {
    if (encouragementEditingId !== null) return;
    setActiveTab("encouragement");
    setEncouragementDraft(ENCOURAGEMENT_EMPTY);
    setEncouragementEditingId("new");
  };

  const handleEncouragementEdit = (message: AdminEncouragementMessage) => {
    if (encouragementEditingId !== null) return;
    setEncouragementDraft({
      text: message.text,
      weight: String(message.weight),
      is_active: message.is_active,
    });
    setEncouragementEditingId(message.id);
    setActiveTab("encouragement");
  };

  const cancelEncouragementEdit = () => {
    setEncouragementDraft(ENCOURAGEMENT_EMPTY);
    setEncouragementEditingId(null);
    setEncouragementSaving(false);
  };

  const startConditionalCreate = () => {
    if (conditionalEditingId !== null) return;
    setActiveTab("conditional");
    setConditionalDraft(CONDITIONAL_EMPTY);
    setConditionalEditingId("new");
  };

  const handleConditionalEdit = (message: AdminConditionalMessage) => {
    if (conditionalEditingId !== null) return;
    setConditionalDraft({
      name: message.name,
      text: message.text,
      priority: String(message.priority),
      is_active: message.is_active,
      // 打卡条件
      min_total_checkins:
        message.min_total_checkins === null ? "" : String(message.min_total_checkins),
      max_total_checkins:
        message.max_total_checkins === null ? "" : String(message.max_total_checkins),
      min_streak_days: message.min_streak_days === null ? "" : String(message.min_streak_days),
      max_streak_days: message.max_streak_days === null ? "" : String(message.max_streak_days),
      // 上传条件
      min_total_uploads: message.min_total_uploads === null ? "" : String(message.min_total_uploads),
      max_total_uploads: message.max_total_uploads === null ? "" : String(message.max_total_uploads),
      // 上一次上传条件
      match_last_upload_moods: Array.isArray(message.match_last_upload_moods)
        ? message.match_last_upload_moods.join(", ")
        : "",
      match_last_upload_tags: Array.isArray(message.match_last_upload_tags)
        ? message.match_last_upload_tags.join(", ")
        : "",
    });
    setConditionalEditingId(message.id);
    setActiveTab("conditional");
  };

  const cancelConditionalEdit = () => {
    setConditionalDraft(CONDITIONAL_EMPTY);
    setConditionalEditingId(null);
    setConditionalSaving(false);
  };

  const handleDelete = async (resource: TabKey, id: number) => {
    const confirmMessage =
      resource === "history"
        ? "确定要删除这条“历史上的今天”文案吗？"
        : resource === "encouragement"
          ? "确定要删除这条通用文案吗？"
          : "确定要删除这条用户行为文案吗？";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      if (resource === "history") {
        await deleteHistoryMessage(id);
        setHistoryMessages((prev) => prev.filter((item) => item.id !== id));
        if (historyEditingId === id) {
          cancelHistoryEdit();
        }
      } else if (resource === "encouragement") {
        await deleteEncouragementMessage(id);
        setEncouragements((prev) => prev.filter((item) => item.id !== id));
        if (encouragementEditingId === id) {
          cancelEncouragementEdit();
        }
      } else {
        await deleteConditionalMessage(id);
        setConditionals((prev) => prev.filter((item) => item.id !== id));
        if (conditionalEditingId === id) {
          cancelConditionalEdit();
        }
      }
    } catch (err) {
      handleError(err, "删除失败，请稍后重试。");
    }
  };

  const filteredConditionals = useMemo(() => {
    return conditionals.slice().sort((a, b) => a.priority - b.priority);
  }, [conditionals]);

  return (
    <div className="admin-home">
      <header className="admin-home__header">
        <div>
          <h2>首页内容管理</h2>
          <p>集中管理首页展示的三类文案，保障体验一致性。</p>
        </div>
        <button
          type="button"
          className="admin-home__reset"
          onClick={resetForms}
          disabled={
            historyEditingId === null &&
            encouragementEditingId === null &&
            conditionalEditingId === null
          }
        >
          <MaterialIcon name="refresh" />
          取消所有编辑
        </button>
      </header>

      <div className="admin-home__tabs">
        <button
          type="button"
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
        >
          历史上的今天
        </button>
        <button
          type="button"
          className={activeTab === "encouragement" ? "active" : ""}
          onClick={() => setActiveTab("encouragement")}
        >
          通用文案
        </button>
        <button
          type="button"
          className={activeTab === "conditional" ? "active" : ""}
          onClick={() => setActiveTab("conditional")}
        >
          用户行为文案
        </button>
      </div>

      {error ? <p className="admin-home__error">{error}</p> : null}

      {loading ? (
        <div className="admin-home__loading">
          <div className="admin-home__spinner" />
          <span>正在读取文案配置...</span>
        </div>
      ) : null}

      {!loading && activeTab === "history" ? (
        <section className="admin-home__panel">
          <header className="admin-home__panel-header">
            <div>
              <h3>历史文案列表</h3>
              <p>支持提前配置未来日期的文案。</p>
            </div>
            <button
              type="button"
              className="admin-home__panel-action"
              onClick={startHistoryCreate}
              disabled={historyEditingId !== null}
            >
              <MaterialIcon name="add_circle" />
              新增文案
            </button>
          </header>

          <div className="admin-home__table-wrapper">
            <table className="admin-home__table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>标题</th>
                  <th>文案内容</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {historyEditingId === "new" ? (
                  <tr>
                    <td>
                      <input
                        type="date"
                        value={historyDraft.date}
                        onChange={(event) =>
                          setHistoryDraft((prev) => ({ ...prev, date: event.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="如：世界读书日"
                        value={historyDraft.headline}
                        onChange={(event) =>
                          setHistoryDraft((prev) => ({ ...prev, headline: event.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <textarea
                        rows={3}
                        placeholder="填写文案内容..."
                        value={historyDraft.text}
                        onChange={(event) =>
                          setHistoryDraft((prev) => ({ ...prev, text: event.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <label className="admin-home__toggle">
                        <input
                          type="checkbox"
                          checked={historyDraft.is_active}
                          onChange={(event) =>
                            setHistoryDraft((prev) => ({
                              ...prev,
                              is_active: event.target.checked,
                            }))
                          }
                        />
                        <span>{historyDraft.is_active ? "启用" : "停用"}</span>
                      </label>
                    </td>
                    <td>
                      <div className="admin-home__actions-group">
                        <button type="button" onClick={cancelHistoryEdit}>
                          取消
                        </button>
                        <button type="button" onClick={handleHistorySave} disabled={historySaving}>
                          {historySaving ? "保存中..." : "保存"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {historyMessages.length === 0 && historyEditingId === null ? (
                  <tr>
                    <td className="admin-home__empty" colSpan={5}>
                      暂未配置历史文案。
                    </td>
                  </tr>
                ) : null}

                {historyMessages.map((item) => {
                  const isEditing = historyEditingId === item.id;
                  return (
                    <tr key={item.id}>
                      {isEditing ? (
                        <>
                          <td>
                            <input
                              type="date"
                              value={historyDraft.date}
                              onChange={(event) =>
                                setHistoryDraft((prev) => ({ ...prev, date: event.target.value }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={historyDraft.headline}
                              onChange={(event) =>
                                setHistoryDraft((prev) => ({
                                  ...prev,
                                  headline: event.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={3}
                              value={historyDraft.text}
                              onChange={(event) =>
                                setHistoryDraft((prev) => ({
                                  ...prev,
                                  text: event.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <label className="admin-home__toggle">
                              <input
                                type="checkbox"
                                checked={historyDraft.is_active}
                                onChange={(event) =>
                                  setHistoryDraft((prev) => ({
                                    ...prev,
                                    is_active: event.target.checked,
                                  }))
                                }
                              />
                              <span>{historyDraft.is_active ? "启用" : "停用"}</span>
                            </label>
                          </td>
                          <td>
                            <div className="admin-home__actions-group">
                              <button type="button" onClick={cancelHistoryEdit}>
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={handleHistorySave}
                                disabled={historySaving}
                              >
                                {historySaving ? "保存中..." : "保存"}
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{item.date}</td>
                          <td>{item.headline || "—"}</td>
                          <td className="admin-home__text">{item.text}</td>
                          <td>
                            <span className={item.is_active ? "status status--active" : "status"}>
                              {item.is_active ? "启用" : "停用"}
                            </span>
                          </td>
                          <td>
                            <div className="admin-home__actions-group">
                              <button
                                type="button"
                                onClick={() => handleHistoryEdit(item)}
                                disabled={historyEditingId !== null}
                              >
                                <MaterialIcon name="edit" />
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete("history", item.id)}
                              >
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
      ) : null}

      {!loading && activeTab === "encouragement" ? (
        <section className="admin-home__panel">
          <header className="admin-home__panel-header">
            <div>
              <h3>通用文案列表</h3>
              <p>通用文案会在合适的时机随机展示。</p>
            </div>
            <button
              type="button"
              className="admin-home__panel-action"
              onClick={startEncouragementCreate}
              disabled={encouragementEditingId !== null}
            >
              <MaterialIcon name="add_circle" />
              新增文案
            </button>
          </header>

          <div className="admin-home__table-wrapper">
            <table className="admin-home__table">
              <thead>
                <tr>
                  <th>文案内容</th>
                  <th>权重</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {encouragementEditingId === "new" ? (
                  <tr>
                    <td>
                      <textarea
                        rows={3}
                        placeholder="填写鼓励文案..."
                        value={encouragementDraft.text}
                        onChange={(event) =>
                          setEncouragementDraft((prev) => ({
                            ...prev,
                            text: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={encouragementDraft.weight}
                        onChange={(event) =>
                          setEncouragementDraft((prev) => ({
                            ...prev,
                            weight: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <label className="admin-home__toggle">
                        <input
                          type="checkbox"
                          checked={encouragementDraft.is_active}
                          onChange={(event) =>
                            setEncouragementDraft((prev) => ({
                              ...prev,
                              is_active: event.target.checked,
                            }))
                          }
                        />
                        <span>{encouragementDraft.is_active ? "启用" : "停用"}</span>
                      </label>
                    </td>
                    <td>
                      <div className="admin-home__actions-group">
                        <button type="button" onClick={cancelEncouragementEdit}>
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleEncouragementSave}
                          disabled={encouragementSaving}
                        >
                          {encouragementSaving ? "保存中..." : "保存"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {encouragements.length === 0 && encouragementEditingId === null ? (
                  <tr>
                    <td className="admin-home__empty" colSpan={4}>
                      暂未配置通用文案。
                    </td>
                  </tr>
                ) : null}

                {encouragements.map((item) => {
                  const isEditing = encouragementEditingId === item.id;
                  return (
                    <tr key={item.id}>
                      {isEditing ? (
                        <>
                          <td>
                            <textarea
                              rows={3}
                              value={encouragementDraft.text}
                              onChange={(event) =>
                                setEncouragementDraft((prev) => ({
                                  ...prev,
                                  text: event.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              value={encouragementDraft.weight}
                              onChange={(event) =>
                                setEncouragementDraft((prev) => ({
                                  ...prev,
                                  weight: event.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <label className="admin-home__toggle">
                              <input
                                type="checkbox"
                                checked={encouragementDraft.is_active}
                                onChange={(event) =>
                                  setEncouragementDraft((prev) => ({
                                    ...prev,
                                    is_active: event.target.checked,
                                  }))
                                }
                              />
                              <span>{encouragementDraft.is_active ? "启用" : "停用"}</span>
                            </label>
                          </td>
                          <td>
                            <div className="admin-home__actions-group">
                              <button type="button" onClick={cancelEncouragementEdit}>
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={handleEncouragementSave}
                                disabled={encouragementSaving}
                              >
                                {encouragementSaving ? "保存中..." : "保存"}
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="admin-home__text">{item.text}</td>
                          <td>{item.weight}</td>
                          <td>
                            <span className={item.is_active ? "status status--active" : "status"}>
                              {item.is_active ? "启用" : "停用"}
                            </span>
                          </td>
                          <td>
                            <div className="admin-home__actions-group">
                              <button
                                type="button"
                                onClick={() => handleEncouragementEdit(item)}
                                disabled={encouragementEditingId !== null}
                              >
                                <MaterialIcon name="edit" />
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete("encouragement", item.id)}
                              >
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
      ) : null}

      {!loading && activeTab === "conditional" ? (
        <section className="admin-home__panel">
          <header className="admin-home__panel-header">
            <div>
              <h3>用户行为文案列表（按优先级排序）</h3>
              <p>通过条件匹配，为不同状态用户展示差异化文案。</p>
            </div>
            <button
              type="button"
              className="admin-home__panel-action"
              onClick={startConditionalCreate}
              disabled={conditionalEditingId !== null}
            >
              <MaterialIcon name="add_circle" />
              新增文案
            </button>
          </header>

          <div className="admin-home__table-wrapper">
            <table className="admin-home__table admin-home__table--wide">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>文案内容</th>
                  <th>优先级</th>
                  <th>打卡 / 上传条件</th>
                  <th>上一次上传条件</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {conditionalEditingId === "new" ? (
                  <tr>
                    <td>
                      <input
                        type="text"
                        placeholder="用于后台识别的名称"
                        value={conditionalDraft.name}
                        onChange={(event) =>
                          setConditionalDraft((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <textarea
                        rows={4}
                        placeholder="填写用户行为文案..."
                        value={conditionalDraft.text}
                        onChange={(event) =>
                          setConditionalDraft((prev) => ({ ...prev, text: event.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={conditionalDraft.priority}
                        onChange={(event) =>
                          setConditionalDraft((prev) => ({ ...prev, priority: event.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <div className="admin-home__field-grid">
                        <label>
                          最少打卡次数
                          <input
                            type="number"
                            min={0}
                            value={conditionalDraft.min_total_checkins}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                min_total_checkins: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          最多打卡次数
                          <input
                            type="number"
                            min={0}
                            value={conditionalDraft.max_total_checkins}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                max_total_checkins: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          最少连续打卡天数
                          <input
                            type="number"
                            min={0}
                            value={conditionalDraft.min_streak_days}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                min_streak_days: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          最多连续打卡天数
                          <input
                            type="number"
                            min={0}
                            value={conditionalDraft.max_streak_days}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                max_streak_days: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          最少上传张数
                          <input
                            type="number"
                            min={0}
                            value={conditionalDraft.min_total_uploads}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                min_total_uploads: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          最多上传张数
                          <input
                            type="number"
                            min={0}
                            value={conditionalDraft.max_total_uploads}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                max_total_uploads: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                    </td>
                    <td>
                      <div className="admin-home__field-group">
                        <label>
                          上一次上传心情（逗号分隔）
                          <input
                            type="text"
                            placeholder="如：心如止水, 兴高采烈"
                            value={conditionalDraft.match_last_upload_moods}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                match_last_upload_moods: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          上一次上传标签（逗号分隔）
                          <input
                            type="text"
                            placeholder="如：风景, 油画"
                            value={conditionalDraft.match_last_upload_tags}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                match_last_upload_tags: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>
                    </td>
                    <td>
                      <div className="admin-home__status-column">
                        <label className="admin-home__toggle">
                          <input
                            type="checkbox"
                            checked={conditionalDraft.is_active}
                            onChange={(event) =>
                              setConditionalDraft((prev) => ({
                                ...prev,
                                is_active: event.target.checked,
                              }))
                            }
                          />
                          <span>{conditionalDraft.is_active ? "启用" : "停用"}</span>
                        </label>
                      </div>
                    </td>
                    <td>
                      <div className="admin-home__actions-group">
                        <button type="button" onClick={cancelConditionalEdit}>
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleConditionalSave}
                          disabled={conditionalSaving}
                        >
                          {conditionalSaving ? "保存中..." : "保存"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {filteredConditionals.length === 0 && conditionalEditingId === null ? (
                  <tr>
                    <td className="admin-home__empty" colSpan={7}>
                      暂未配置用户行为文案。
                    </td>
                  </tr>
                ) : null}

                {filteredConditionals.map((item) => {
                  const isEditing = conditionalEditingId === item.id;
                  return (
                    <tr key={item.id}>
                      {isEditing ? (
                        <>
                          <td>
                            <input
                              type="text"
                              value={conditionalDraft.name}
                              onChange={(event) =>
                                setConditionalDraft((prev) => ({
                                  ...prev,
                                  name: event.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={4}
                              value={conditionalDraft.text}
                              onChange={(event) =>
                                setConditionalDraft((prev) => ({
                                  ...prev,
                                  text: event.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={conditionalDraft.priority}
                              onChange={(event) =>
                                setConditionalDraft((prev) => ({
                                  ...prev,
                                  priority: event.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <div className="admin-home__field-grid">
                              <label>
                                最少打卡次数
                                <input
                                  type="number"
                                  min={0}
                                  value={conditionalDraft.min_total_checkins}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      min_total_checkins: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                最多打卡次数
                                <input
                                  type="number"
                                  min={0}
                                  value={conditionalDraft.max_total_checkins}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      max_total_checkins: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                最少连续打卡天数
                                <input
                                  type="number"
                                  min={0}
                                  value={conditionalDraft.min_streak_days}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      min_streak_days: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                最多连续打卡天数
                                <input
                                  type="number"
                                  min={0}
                                  value={conditionalDraft.max_streak_days}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      max_streak_days: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                最少上传张数
                                <input
                                  type="number"
                                  min={0}
                                  value={conditionalDraft.min_total_uploads}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      min_total_uploads: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                最多上传张数
                                <input
                                  type="number"
                                  min={0}
                                  value={conditionalDraft.max_total_uploads}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      max_total_uploads: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          </td>
                          <td>
                            <div className="admin-home__field-group">
                              <label>
                                上一次上传心情（逗号分隔）
                                <input
                                  type="text"
                                  value={conditionalDraft.match_last_upload_moods}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      match_last_upload_moods: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                上一次上传标签（逗号分隔）
                                <input
                                  type="text"
                                  value={conditionalDraft.match_last_upload_tags}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      match_last_upload_tags: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          </td>
                          <td>
                            <div className="admin-home__status-column">
                              <label className="admin-home__toggle">
                                <input
                                  type="checkbox"
                                  checked={conditionalDraft.is_active}
                                  onChange={(event) =>
                                    setConditionalDraft((prev) => ({
                                      ...prev,
                                      is_active: event.target.checked,
                                    }))
                                  }
                                />
                                <span>{conditionalDraft.is_active ? "启用" : "停用"}</span>
                              </label>
                            </div>
                          </td>
                          <td>
                            <div className="admin-home__actions-group">
                              <button type="button" onClick={cancelConditionalEdit}>
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={handleConditionalSave}
                                disabled={conditionalSaving}
                              >
                                {conditionalSaving ? "保存中..." : "保存"}
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{item.name}</td>
                          <td className="admin-home__text">{item.text}</td>
                          <td>{item.priority}</td>
                          <td>
                            <div className="admin-home__meta">{formatConditionSummary(item)}</div>
                          </td>
                          <td>
                            <div className="admin-home__meta">
                              {item.match_last_upload_moods?.length ? (
                                <div>心情：{item.match_last_upload_moods.join(" / ")}</div>
                              ) : (
                                <div>心情：无</div>
                              )}
                              {item.match_last_upload_tags?.length ? (
                                <div>标签：{item.match_last_upload_tags.join(" / ")}</div>
                              ) : (
                                <div>标签：无</div>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="admin-home__status-column">
                              <span className={item.is_active ? "status status--active" : "status"}>
                                {item.is_active ? "启用" : "停用"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="admin-home__actions-group">
                              <button
                                type="button"
                                onClick={() => handleConditionalEdit(item)}
                                disabled={conditionalEditingId !== null}
                              >
                                <MaterialIcon name="edit" />
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete("conditional", item.id)}
                              >
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
      ) : null}
    </div>
  );
}

function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNullableNumber(value: string): number | null {
  if (value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatConditionSummary(item: AdminConditionalMessage): string {
  const parts: string[] = [];
  // 打卡条件
  if (item.min_total_checkins !== null || item.max_total_checkins !== null) {
    const min = item.min_total_checkins ?? 0;
    const max = item.max_total_checkins ?? "∞";
    parts.push(`打卡次数 ${min}-${max}`);
  }
  if (item.min_streak_days !== null || item.max_streak_days !== null) {
    const min = item.min_streak_days ?? 0;
    const max = item.max_streak_days ?? "∞";
    parts.push(`连续打卡 ${min}-${max} 天`);
  }
  // 上传条件
  if (item.min_total_uploads !== null || item.max_total_uploads !== null) {
    const min = item.min_total_uploads ?? 0;
    const max = item.max_total_uploads ?? "∞";
    parts.push(`上传张数 ${min}-${max}`);
  }
  if (!parts.length) {
    return "无附加条件";
  }
  return parts.join(" · ");
}

export default HomeContentPage;

