import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createTestAccountCheckIn,
  createTestAccountUpload,
  deleteTestAccount,
  deleteTestAccountCheckIn,
  deleteTestAccountUpload,
  getTestAccount,
  listTestAccountCheckIns,
  listTestAccountUploads,
  updateTestAccount,
  updateTestAccountCheckIn,
  updateTestAccountUpload,
} from "@/admin/api";
import type { AdminCheckIn, AdminTestAccount, AdminUpload, AdminUploadInput } from "@/admin/api";

import "../styles/TestAccountDetail.css";

type AccountFormState = {
  display_name: string;
  notes: string;
  tags: string;
  metadata_json: string;
  password: string;
  is_active: boolean;
};

const DEFAULT_CHECKIN_FORM: {
  date: string;
  source: string;
} = {
  date: "",
  source: "admin",
};

type UploadFormState = {
  uploaded_at: string;
  self_rating: string;
  mood_label: string;
  tags: string;
  duration_hours: string;
  duration_minutes: string;
  notes: string;
  imageFile: File | null;
  imagePreview: string | null;
  imageUrl: string | null;
  clearImage: boolean;
};

const DEFAULT_UPLOAD_FORM: UploadFormState = {
  uploaded_at: "",
  self_rating: "",
  mood_label: "",
  tags: "",
  duration_hours: "",
  duration_minutes: "",
  notes: "",
  imageFile: null,
  imagePreview: null,
  imageUrl: null,
  clearImage: false,
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function TestAccountDetailPage() {
  const { profileId } = useParams<{ profileId: string }>();
  const navigate = useNavigate();
  const [account, setAccount] = useState<AdminTestAccount | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormState | null>(null);
  const [checkins, setCheckins] = useState<AdminCheckIn[]>([]);
  const [uploads, setUploads] = useState<AdminUpload[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [checkinForm, setCheckinForm] = useState(DEFAULT_CHECKIN_FORM);
  const [editingCheckinId, setEditingCheckinId] = useState<number | null>(null);
  const [uploadForm, setUploadForm] = useState<UploadFormState>(() => ({ ...DEFAULT_UPLOAD_FORM }));
  const [editingUploadId, setEditingUploadId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadImageInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingCheckinDates, setPendingCheckinDates] = useState<Set<string>>(new Set());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const id = Number(profileId);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      navigate("/admin/test-accounts", { replace: true });
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const [profile, checkinData, uploadData] = await Promise.all([
          getTestAccount(id),
          listTestAccountCheckIns(id),
          listTestAccountUploads(id),
        ]);
        setAccount(profile);
        setAccountForm({
          display_name: profile.display_name ?? "",
          notes: profile.notes ?? "",
          tags: (profile.tags ?? []).join(", "),
          metadata_json: JSON.stringify(profile.metadata ?? {}, null, 2),
          password: "",
          is_active: profile.is_active,
        });
        // 确保 checkinData 和 uploadData 始终是数组
        setCheckins(Array.isArray(checkinData) ? checkinData : []);
        setUploads(Array.isArray(uploadData) ? uploadData : []);
      } catch (err) {
        handleError(err, "加载测试账号详情失败。");
        setTimeout(() => navigate("/admin/test-accounts", { replace: true }), 800);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, navigate]);

  useEffect(() => {
    return () => {
      if (uploadForm.imagePreview && uploadForm.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(uploadForm.imagePreview);
      }
    };
  }, [uploadForm.imagePreview]);

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

  const calendarDays = useMemo<CalendarDisplayDay[]>(() => {
    // 确保 checkins 是数组
    const safeCheckins = Array.isArray(checkins) ? checkins : [];
    const checkinSet = new Set(safeCheckins.map((entry) => entry.date));
    return buildCalendarDays(calendarMonth).map((day) => ({
      ...day,
      checked: checkinSet.has(day.date),
    }));
  }, [calendarMonth, checkins]);

  const calendarTitle = useMemo(() => formatMonthLabel(calendarMonth), [calendarMonth]);

  const handleAccountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountForm || !account) {
      return;
    }
    setSavingAccount(true);
    setError(null);

    try {
      const metadata = parseMetadata(accountForm.metadata_json);
      const payload = {
        display_name: accountForm.display_name.trim(),
        notes: accountForm.notes.trim(),
        tags: accountForm.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        metadata,
        is_active: accountForm.is_active,
      } as Partial<AdminTestAccount> & { password?: string };

      if (accountForm.password.trim()) {
        payload.password = accountForm.password.trim();
      }

      const updated = await updateTestAccount(account.id, payload);
      setAccount(updated);
      setAccountForm((prev) =>
        prev
          ? {
              ...prev,
              password: "",
              tags: (updated.tags ?? []).join(", "),
              metadata_json: JSON.stringify(updated.metadata ?? {}, null, 2),
            }
          : null,
      );
    } catch (err) {
      handleError(err, "保存账号信息失败。");
    } finally {
      setSavingAccount(false);
    }
  };

  const handleArchiveAccount = async () => {
    if (!account) return;
    if (
      !window.confirm(
        `确定要删除测试账号 ${account.email} 吗？将同步清理该账号的打卡与上传记录。`,
      )
    ) {
      return;
    }

    try {
      await deleteTestAccount(account.id);
      navigate("/admin/test-accounts", { replace: true });
    } catch (err) {
      handleError(err, "删除账号失败。");
    }
  };

  const handleCalendarMonthChange = (offset: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const handleCalendarToggle = async (day: CalendarDisplayDay) => {
    if (!account) return;

    if (!day.inMonth) {
      const [year, month] = day.date.split("-");
      if (year && month) {
        const parsedYear = Number(year);
        const parsedMonth = Number(month);
        if (Number.isFinite(parsedYear) && Number.isFinite(parsedMonth)) {
          setCalendarMonth(new Date(parsedYear, parsedMonth - 1, 1));
        }
      }
      return;
    }

    const isoDate = day.date;
    if (pendingCheckinDates.has(isoDate)) {
      return;
    }

    setPendingCheckinDates((prev) => {
      const next = new Set(prev);
      next.add(isoDate);
      return next;
    });

    try {
      const existing = checkins.find((entry) => entry.date === isoDate);
      if (existing) {
        await deleteTestAccountCheckIn(account.id, existing.id);
        setCheckins((prev) => prev.filter((item) => item.id !== existing.id));
        if (editingCheckinId === existing.id) {
          setEditingCheckinId(null);
          setCheckinForm(DEFAULT_CHECKIN_FORM);
        }
      } else {
        const created = await createTestAccountCheckIn(account.id, {
          date: isoDate,
          source: checkinForm.source.trim() || "admin",
        });
        setCheckins((prev) => [created, ...prev]);
      }
    } catch (err) {
      handleError(err, "更新打卡记录失败。");
    } finally {
      setPendingCheckinDates((prev) => {
        const next = new Set(prev);
        next.delete(isoDate);
        return next;
      });
    }
  };

  const handleCheckinSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account) return;

    const payload = {
      date: checkinForm.date,
      source: checkinForm.source.trim() || "admin",
    };

    try {
      if (editingCheckinId) {
        const updated = await updateTestAccountCheckIn(account.id, editingCheckinId, payload);
        setCheckins((prev) =>
          prev.map((item) => (item.id === editingCheckinId ? updated : item)),
        );
      } else {
        const created = await createTestAccountCheckIn(account.id, payload);
        setCheckins((prev) => [created, ...prev]);
      }
      setCheckinForm(DEFAULT_CHECKIN_FORM);
      setEditingCheckinId(null);
    } catch (err) {
      handleError(err, "保存打卡记录失败。");
    }
  };

  const handleCheckinEdit = (entry: AdminCheckIn) => {
    setEditingCheckinId(entry.id);
    setCheckinForm({
      date: entry.date,
      source: entry.source ?? "admin",
    });
    const [year, month] = entry.date.split("-");
    if (year && month) {
      const parsedYear = Number(year);
      const parsedMonth = Number(month);
      if (Number.isFinite(parsedYear) && Number.isFinite(parsedMonth)) {
        setCalendarMonth(new Date(parsedYear, parsedMonth - 1, 1));
      }
    }
  };

  const handleCheckinDelete = async (entry: AdminCheckIn) => {
    if (!account) return;
    if (!window.confirm(`确定要删除 ${entry.date} 的打卡记录吗？`)) {
      return;
    }

    try {
      await deleteTestAccountCheckIn(account.id, entry.id);
      setCheckins((prev) => prev.filter((item) => item.id !== entry.id));
      if (editingCheckinId === entry.id) {
        setEditingCheckinId(null);
        setCheckinForm(DEFAULT_CHECKIN_FORM);
      }
    } catch (err) {
      handleError(err, "删除打卡记录失败。");
    }
  };

  const resetUploadFormState = (options?: { keepEditing?: boolean }) => {
    setUploadForm((prev) => {
      if (prev.imagePreview && prev.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.imagePreview);
      }
      return { ...DEFAULT_UPLOAD_FORM };
    });
    if (!options?.keepEditing) {
      setEditingUploadId(null);
    }
    if (uploadImageInputRef.current) {
      uploadImageInputRef.current.value = "";
    }
  };

  const handleUploadImagePick = () => {
    uploadImageInputRef.current?.click();
  };

  const handleUploadImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setUploadForm((prev) => {
      if (prev.imagePreview && prev.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.imagePreview);
      }
      return {
        ...prev,
        imageFile: file,
        imagePreview: previewUrl,
        imageUrl: null,
        clearImage: false,
      };
    });

    try {
      event.currentTarget.value = "";
    } catch (error) {
      console.warn("[AdminUpload] 重置文件输入失败：", error);
    }
  };

  const handleUploadClearImage = () => {
    setUploadForm((prev) => {
      if (prev.imagePreview && prev.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.imagePreview);
      }
      const hadExistingImage = Boolean(prev.imageUrl);
      return {
        ...prev,
        imageFile: null,
        imagePreview: null,
        imageUrl: null,
        clearImage: hadExistingImage,
      };
    });
    if (uploadImageInputRef.current) {
      uploadImageInputRef.current.value = "";
    }
  };

  const handleUploadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account) return;

    const hasDurationInput =
      uploadForm.duration_hours.trim() !== "" || uploadForm.duration_minutes.trim() !== "";
    const parsedHours = Number.parseInt(uploadForm.duration_hours, 10);
    const parsedMinutes = Number.parseInt(uploadForm.duration_minutes, 10);
    const safeHours = Number.isNaN(parsedHours) ? 0 : Math.max(parsedHours, 0);
    const safeMinutes = Number.isNaN(parsedMinutes) ? 0 : Math.max(parsedMinutes, 0);
    const extraHours = Math.floor(safeMinutes / 60);
    const normalizedMinutes = safeMinutes % 60;
    const durationMinutesValue = hasDurationInput
      ? (safeHours + extraHours) * 60 + normalizedMinutes
      : null;

    const payload: AdminUploadInput = {
      uploaded_at: uploadForm.uploaded_at ? new Date(uploadForm.uploaded_at).toISOString() : undefined,
      self_rating: uploadForm.self_rating ? Number(uploadForm.self_rating) : null,
      mood_label: uploadForm.mood_label.trim(),
      tags: uploadForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      duration_minutes: durationMinutesValue,
      notes: uploadForm.notes.trim(),
    };

    if (uploadForm.imageFile) {
      payload.image = uploadForm.imageFile;
    } else if (uploadForm.clearImage) {
      payload.image = null;
      payload.clear_image = true;
    }

    try {
      if (editingUploadId) {
        const updated = await updateTestAccountUpload(account.id, editingUploadId, payload);
        setUploads((prev) => prev.map((item) => (item.id === editingUploadId ? updated : item)));
      } else {
        const created = await createTestAccountUpload(account.id, payload);
        setUploads((prev) => [created, ...prev]);
      }

      resetUploadFormState();
    } catch (err) {
      handleError(err, "保存上传记录失败。");
    }
  };

  const handleUploadEdit = (upload: AdminUpload) => {
    setEditingUploadId(upload.id);
    setUploadForm((prev) => {
      if (prev.imagePreview && prev.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.imagePreview);
      }
      const duration = upload.duration_minutes;
      const hours = duration != null ? Math.floor(duration / 60) : null;
      const minutes = duration != null ? duration % 60 : null;
      return {
        ...DEFAULT_UPLOAD_FORM,
        uploaded_at: upload.uploaded_at ? upload.uploaded_at.slice(0, 16) : "",
        self_rating: upload.self_rating != null ? String(upload.self_rating) : "",
        mood_label: upload.mood_label ?? "",
        tags: (upload.tags ?? []).join(", "),
        duration_hours: hours != null ? String(hours) : "",
        duration_minutes: minutes != null ? String(minutes) : "",
        notes: upload.notes ?? "",
        imageUrl: upload.image ?? null,
        clearImage: false,
      };
    });
    if (uploadImageInputRef.current) {
      uploadImageInputRef.current.value = "";
    }
  };

  const handleUploadDelete = async (upload: AdminUpload) => {
    if (!account) return;
    if (!window.confirm("确定要删除这条上传记录吗？")) {
      return;
    }

    try {
      await deleteTestAccountUpload(account.id, upload.id);
      setUploads((prev) => prev.filter((item) => item.id !== upload.id));
      if (editingUploadId === upload.id) {
        resetUploadFormState();
      }
    } catch (err) {
      handleError(err, "删除上传记录失败。");
    }
  };

  const sortedCheckins = useMemo(() => {
    const safeCheckins = Array.isArray(checkins) ? checkins : [];
    return safeCheckins.slice().sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [checkins]);

  const sortedUploads = useMemo(() => {
    return uploads
      .slice()
      .sort((a, b) => (a.uploaded_at > b.uploaded_at ? -1 : 1));
  }, [uploads]);

  if (loading || !account || !accountForm) {
    return (
      <div className="admin-test-account-detail admin-test-account-detail--loading">
        <div className="admin-test-account-detail__loader">
          <div className="admin-test-account-detail__spinner" />
          <p>正在加载测试账号详情...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-test-account-detail">
      <header className="admin-test-account-detail__header">
        <div>
          <button
            type="button"
            className="admin-test-account-detail__back"
            onClick={() => navigate("/admin/test-accounts")}
          >
            <MaterialIcon name="arrow_back" />
            返回列表
          </button>
          <h2>{account.display_name || account.email}</h2>
          <p>{account.email}</p>
        </div>
        <button type="button" className="admin-test-account-detail__danger" onClick={handleArchiveAccount}>
          <MaterialIcon name="delete_forever" />
          删除账号
        </button>
      </header>

      {error ? <p className="admin-test-account-detail__error">{error}</p> : null}

      <section className="admin-test-account-detail__card">
        <header>
          <h3>账号信息</h3>
          <span>最近登录：{account.last_login ? formatDateTime(account.last_login) : "暂无记录"}</span>
        </header>

        <form className="admin-test-account-detail__form" onSubmit={handleAccountSubmit}>
          <label>
            显示昵称
            <input
              type="text"
              value={accountForm.display_name}
              onChange={(event) =>
                setAccountForm((prev) => prev && { ...prev, display_name: event.target.value })
              }
            />
          </label>
          <label>
            标签（逗号分隔）
            <input
              type="text"
              value={accountForm.tags}
              onChange={(event) =>
                setAccountForm((prev) => prev && { ...prev, tags: event.target.value })
              }
            />
          </label>
          <label className="admin-test-account-detail__full">
            备注
            <textarea
              rows={3}
              value={accountForm.notes}
              onChange={(event) =>
                setAccountForm((prev) => prev && { ...prev, notes: event.target.value })
              }
            />
          </label>
          <label>
            重设密码（可选）
            <input
              type="password"
              placeholder="留空则不修改"
              value={accountForm.password}
              onChange={(event) =>
                setAccountForm((prev) => prev && { ...prev, password: event.target.value })
              }
            />
          </label>
          <label className="admin-test-account-detail__switch">
            <input
              type="checkbox"
              checked={accountForm.is_active}
              onChange={(event) =>
                setAccountForm((prev) => prev && { ...prev, is_active: event.target.checked })
              }
            />
            <span>保持账号启用</span>
          </label>
          <label className="admin-test-account-detail__full">
            自定义元数据（JSON）
            <textarea
              rows={4}
              value={accountForm.metadata_json}
              onChange={(event) =>
                setAccountForm((prev) => prev && { ...prev, metadata_json: event.target.value })
              }
            />
          </label>

          <div className="admin-test-account-detail__actions">
            <button type="submit" className="primary" disabled={savingAccount}>
              {savingAccount ? "保存中..." : "保存账号信息"}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-test-account-detail__card">
        <header>
          <h3>历史打卡</h3>
          <span>共 {checkins.length} 条</span>
        </header>

        <div className="admin-test-account-detail__calendar">
          <div className="admin-test-account-detail__calendar-header">
            <button type="button" onClick={() => handleCalendarMonthChange(-1)}>
              <MaterialIcon name="chevron_left" />
            </button>
            <strong>{calendarTitle}</strong>
            <button type="button" onClick={() => handleCalendarMonthChange(1)}>
              <MaterialIcon name="chevron_right" />
            </button>
          </div>
          <div className="admin-test-account-detail__calendar-grid">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="admin-test-account-detail__calendar-weekday">
                {label}
              </div>
            ))}
            {calendarDays.map((day) => {
              const isPending = pendingCheckinDates.has(day.date);
              const classNames = [
                "admin-test-account-detail__calendar-cell",
                day.inMonth ? "" : "admin-test-account-detail__calendar-cell--muted",
                day.isToday ? "admin-test-account-detail__calendar-cell--today" : "",
                day.checked ? "admin-test-account-detail__calendar-cell--checked" : "",
                isPending ? "admin-test-account-detail__calendar-cell--pending" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={day.date}
                  type="button"
                  className={classNames}
                  onClick={() => handleCalendarToggle(day)}
                  disabled={isPending}
                >
                  <span className="admin-test-account-detail__calendar-day">{day.day}</span>
                  <span className="admin-test-account-detail__calendar-status">
                    {isPending ? (
                      <span className="admin-test-account-detail__calendar-spinner" />
                    ) : day.checked ? (
                      <MaterialIcon name="check" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="admin-test-account-detail__calendar-hint">点击当月日期即可快速切换打卡状态。</p>
        </div>

        <form className="admin-test-account-detail__grid" onSubmit={handleCheckinSubmit}>
          <label>
            打卡日期
            <input
              type="date"
              value={checkinForm.date}
              onChange={(event) => setCheckinForm((prev) => ({ ...prev, date: event.target.value }))}
              required
            />
          </label>
          <label>
            来源（可选）
            <input
              type="text"
              placeholder="默认 admin"
              value={checkinForm.source}
              onChange={(event) =>
                setCheckinForm((prev) => ({ ...prev, source: event.target.value }))
              }
            />
          </label>
          <div className="admin-test-account-detail__actions">
            {editingCheckinId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingCheckinId(null);
                  setCheckinForm(DEFAULT_CHECKIN_FORM);
                }}
              >
                取消编辑
              </button>
            ) : null}
            <button type="submit" className="primary">
              {editingCheckinId ? "更新打卡" : "新增打卡"}
            </button>
          </div>
        </form>

        <div className="admin-test-account-detail__table">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>来源</th>
                <th>记录时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedCheckins.length === 0 ? (
                <tr>
                  <td colSpan={4}>暂无打卡记录</td>
                </tr>
              ) : (
                sortedCheckins.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.date}</td>
                    <td>{entry.source || "admin"}</td>
                    <td>{formatDateTime(entry.checked_at)}</td>
                    <td>
                      <button type="button" onClick={() => handleCheckinEdit(entry)}>
                        编辑
                      </button>
                      <button type="button" onClick={() => handleCheckinDelete(entry)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-test-account-detail__card">
        <header>
          <h3>历史上传</h3>
          <span>共 {uploads.length} 条</span>
        </header>

        <form
          className="admin-test-account-detail__grid admin-test-account-detail__grid--uploads"
          onSubmit={handleUploadSubmit}
        >
          <label>
            上传时间
            <input
              type="datetime-local"
              value={uploadForm.uploaded_at}
              onChange={(event) =>
                setUploadForm((prev) => ({ ...prev, uploaded_at: event.target.value }))
              }
              required
            />
          </label>
          <label>
            自评分（0-100）
            <input
              type="number"
              min={0}
              max={100}
              value={uploadForm.self_rating}
              onChange={(event) =>
                setUploadForm((prev) => ({ ...prev, self_rating: event.target.value }))
              }
            />
          </label>
          <label>
            心情标签
            <input
              type="text"
              value={uploadForm.mood_label}
              onChange={(event) =>
                setUploadForm((prev) => ({ ...prev, mood_label: event.target.value }))
              }
            />
          </label>
          <label>
            作品标签（逗号分隔）
            <input
              type="text"
              value={uploadForm.tags}
              onChange={(event) => setUploadForm((prev) => ({ ...prev, tags: event.target.value }))}
            />
          </label>
          <label>
            时长
            <div className="admin-test-account-detail__duration">
              <input
                type="number"
                min={0}
                value={uploadForm.duration_hours}
                onChange={(event) =>
                  setUploadForm((prev) => ({ ...prev, duration_hours: event.target.value }))
                }
                placeholder="0"
              />
              <span>小时</span>
              <input
                type="number"
                min={0}
                max={59}
                value={uploadForm.duration_minutes}
                onChange={(event) =>
                  setUploadForm((prev) => ({ ...prev, duration_minutes: event.target.value }))
                }
                placeholder="0"
              />
              <span>分钟</span>
            </div>
          </label>
          <label className="admin-test-account-detail__full admin-test-account-detail__upload-field">
            作品图片（可选）
            <input
              ref={uploadImageInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadImageChange}
              hidden
            />
            <div className="admin-test-account-detail__upload-actions">
              <button type="button" onClick={handleUploadImagePick}>
                {uploadForm.imageFile || uploadForm.imageUrl ? "更换图片" : "上传图片"}
              </button>
              {uploadForm.imagePreview || uploadForm.imageUrl ? (
                <button type="button" onClick={handleUploadClearImage}>
                  移除图片
                </button>
              ) : null}
            </div>
            {uploadForm.imagePreview || uploadForm.imageUrl ? (
              <div className="admin-test-account-detail__upload-preview">
                <img
                  src={uploadForm.imagePreview ?? uploadForm.imageUrl ?? ""}
                  alt="作品图片预览"
                />
              </div>
            ) : (
              <p className="admin-test-account-detail__upload-hint">支持 jpg、png 等常见格式。</p>
            )}
          </label>
          <label className="admin-test-account-detail__full">
            备注
            <textarea
              rows={3}
              value={uploadForm.notes}
              onChange={(event) => setUploadForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          <div className="admin-test-account-detail__actions admin-test-account-detail__full">
            {editingUploadId ? (
              <button
                type="button"
                onClick={() => {
                  resetUploadFormState();
                }}
              >
                取消编辑
              </button>
            ) : null}
            <button type="submit" className="primary">
              {editingUploadId ? "更新上传" : "新增上传"}
            </button>
          </div>
        </form>

        <div className="admin-test-account-detail__table">
          <table>
            <thead>
              <tr>
                <th>上传时间</th>
                <th>自评分</th>
                <th>心情</th>
                <th>标签</th>
                <th>作品图片</th>
                <th>时长</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedUploads.length === 0 ? (
                <tr>
                  <td colSpan={7}>暂无上传记录</td>
                </tr>
              ) : (
                sortedUploads.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.uploaded_at)}</td>
                    <td>{item.self_rating ?? "--"}</td>
                    <td>{item.mood_label || "--"}</td>
                    <td>{item.tags?.join(", ") || "--"}</td>
                    <td>
                      {item.image ? (
                        <a
                          href={item.image}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-test-account-detail__image-link"
                        >
                          <img src={item.image} alt="作品图片" />
                        </a>
                      ) : (
                        "--"
                      )}
                    </td>
                    <td>{formatDurationLabel(item.duration_minutes)}</td>
                    <td>
                      <button type="button" onClick={() => handleUploadEdit(item)}>
                        编辑
                      </button>
                      <button type="button" onClick={() => handleUploadDelete(item)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type CalendarCell = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

type CalendarDisplayDay = CalendarCell & {
  checked: boolean;
};

function buildCalendarDays(month: Date): CalendarCell[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const startWeekday = firstDay.getDay();
  const startDate = new Date(year, monthIndex, 1 - startWeekday);
  const todayStr = formatDateOnly(new Date());

  const days: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + i);
    const dateStr = formatDateOnly(current);
    days.push({
      date: dateStr,
      day: current.getDate(),
      inMonth: current.getMonth() === monthIndex,
      isToday: dateStr === todayStr,
    });
  }

  return days;
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year} 年 ${month} 月`;
}

function formatDurationLabel(value: number | null | undefined): string {
  if (value == null) {
    return "--";
  }
  const totalMinutes = Math.max(0, value);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}小时`);
  }
  parts.push(`${minutes}分钟`);

  return parts.join("");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    if (!value.trim()) {
      return {};
    }
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("元数据必须是 JSON 对象。");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("元数据 JSON 格式不正确。");
    }
    throw err;
  }
}

export default TestAccountDetailPage;

