import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createNotification,
  deleteNotification,
  listNotifications,
  updateNotification,
  type AdminNotification,
} from "@/admin/api";

import "../styles/Notifications.css";

const NOTIFICATION_EMPTY = {
  title: "",
  summary: "",
  content: "",
  is_active: true,
};

function NotificationsPage() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [draft, setDraft] = useState(NOTIFICATION_EMPTY);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listNotifications();
        setNotifications(data);
      } catch (err) {
        handleError(err, "加载通知数据失败，请稍后重试。");
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

  const handleSave = async () => {
    if (saving || editingId === null) {
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const payload = {
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        content: draft.content.trim(),
        is_active: draft.is_active,
      };

      if (!payload.title) {
        throw new Error("请填写通知标题。");
      }
      if (!payload.summary) {
        throw new Error("请填写通知摘要。");
      }
      if (!payload.content) {
        throw new Error("请填写通知正文。");
      }

      if (editingId === "new") {
        const created = await createNotification(payload);
        setNotifications((prev) => [created, ...prev]);
      } else {
        const updated = await updateNotification(editingId, payload);
        setNotifications((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      }

      setDraft(NOTIFICATION_EMPTY);
      setEditingId(null);
    } catch (err) {
      handleError(err, "保存通知失败。");
    } finally {
      setSaving(false);
    }
  };

  const startCreate = () => {
    if (editingId !== null) return;
    setDraft(NOTIFICATION_EMPTY);
    setEditingId("new");
  };

  const handleEdit = (notification: AdminNotification) => {
    if (editingId !== null) return;
    setDraft({
      title: notification.title,
      summary: notification.summary,
      content: notification.content,
      is_active: notification.is_active,
    });
    setEditingId(notification.id);
  };

  const cancelEdit = () => {
    setDraft(NOTIFICATION_EMPTY);
    setEditingId(null);
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这条通知吗？")) {
      return;
    }

    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      handleError(err, "删除通知失败。");
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="admin-notifications">
      <div className="admin-notifications__header">
        <div>
          <h2>系统通知管理</h2>
          <p>创建并推送通知给所有用户</p>
        </div>
        <button
          type="button"
          className="admin-notifications__create-button"
          onClick={startCreate}
          disabled={editingId !== null}
        >
          <MaterialIcon name="add" />
          新建通知
        </button>
      </div>

      {error && (
        <div className="admin-notifications__error">
          <MaterialIcon name="error" />
          {error}
        </div>
      )}

      {loading && (
        <div className="admin-notifications__loading">
          <p>正在加载...</p>
        </div>
      )}

      {editingId !== null && (
        <div className="admin-notifications__editor">
          <h3>{editingId === "new" ? "新建通知" : "编辑通知"}</h3>
          <div className="admin-notifications__form">
            <label>
              标题 <span className="required">*</span>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="通知标题"
              />
            </label>
            <label>
              摘要 <span className="required">*</span>
              <input
                type="text"
                value={draft.summary}
                onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
                placeholder="通知摘要，显示在通知列表中"
                maxLength={512}
              />
            </label>
            <label>
              正文 <span className="required">*</span>
              <textarea
                value={draft.content}
                onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="通知正文，显示在通知详情页"
                rows={10}
              />
            </label>
            <label className="admin-notifications__toggle">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => setDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              <span>启用此通知</span>
            </label>
            <div className="admin-notifications__actions">
              <button type="button" onClick={cancelEdit} disabled={saving}>
                取消
              </button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <div className="admin-notifications__list">
          <table>
            <thead>
              <tr>
                <th>标题</th>
                <th>摘要</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {notifications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-notifications__empty">
                    暂无通知
                  </td>
                </tr>
              ) : (
                notifications.map((item) =>
                  editingId === item.id ? (
                    <tr key={item.id}>
                      <td colSpan={5}>
                        <div className="admin-notifications__editor-inline">
                          <div className="admin-notifications__form">
                            <label>
                              标题 <span className="required">*</span>
                              <input
                                type="text"
                                value={draft.title}
                                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                              />
                            </label>
                            <label>
                              摘要 <span className="required">*</span>
                              <input
                                type="text"
                                value={draft.summary}
                                onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
                                maxLength={512}
                              />
                            </label>
                            <label>
                              正文 <span className="required">*</span>
                              <textarea
                                value={draft.content}
                                onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
                                rows={8}
                              />
                            </label>
                            <label className="admin-notifications__toggle">
                              <input
                                type="checkbox"
                                checked={draft.is_active}
                                onChange={(e) => setDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
                              />
                              <span>启用此通知</span>
                            </label>
                            <div className="admin-notifications__actions">
                              <button type="button" onClick={cancelEdit} disabled={saving}>
                                取消
                              </button>
                              <button type="button" onClick={handleSave} disabled={saving}>
                                {saving ? "保存中..." : "保存"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id}>
                      <td className="admin-notifications__title">{item.title}</td>
                      <td className="admin-notifications__summary">{item.summary}</td>
                      <td>
                        <span className={item.is_active ? "status status--active" : "status"}>
                          {item.is_active ? "启用" : "停用"}
                        </span>
                      </td>
                      <td className="admin-notifications__date">{formatDate(item.created_at)}</td>
                      <td>
                        <div className="admin-notifications__actions-group">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            disabled={editingId !== null}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            disabled={editingId !== null}
                            className="admin-notifications__delete-button"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;







