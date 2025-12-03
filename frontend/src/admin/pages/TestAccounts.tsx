import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  createTestAccount,
  deleteTestAccount,
  listTestAccounts,
  updateTestAccount,
} from "@/admin/api";
import type { AdminTestAccount } from "@/admin/api";

import "../styles/TestAccounts.css";

const DEFAULT_FORM: {
  email: string;
  password: string;
  display_name: string;
  tags: string;
  notes: string;
  is_active: boolean;
} = {
  email: "",
  password: "",
  display_name: "",
  tags: "",
  notes: "",
  is_active: true,
};

function TestAccountsPage() {
  const [accounts, setAccounts] = useState<AdminTestAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await listTestAccounts();
        setAccounts(data);
      } catch (err) {
        handleError(err, "加载测试账号失败，请稍后再试。");
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

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: {
        email: string;
        password: string;
        display_name?: string;
        notes?: string;
        tags: string[];
        metadata: Record<string, unknown>;
        user: { email: string; is_active: boolean };
      } = {
        email: form.email.trim(),
        password: form.password,
        display_name: form.display_name.trim(),
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes: form.notes.trim(),
        metadata: {},
        user: {
          email: form.email.trim(),
          is_active: form.is_active,
        },
      };

      if (!payload.email) {
        throw new Error("请填写测试账号邮箱。");
      }
      if (!payload.password) {
        throw new Error("请设置测试账号密码。");
      }

      const created = await createTestAccount(payload);
      setAccounts((prev) => [created, ...prev]);
      resetForm();
    } catch (err) {
      handleError(err, "创建测试账号失败。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (account: AdminTestAccount) => {
    try {
      const updated = await updateTestAccount(account.id, { is_active: !account.is_active });
      setAccounts((prev) => prev.map((item) => (item.id === account.id ? updated : item)));
    } catch (err) {
      handleError(err, "更新账号状态失败。");
    }
  };

  const handleDelete = async (account: AdminTestAccount) => {
    if (!window.confirm(`确定要删除测试账号 ${account.email} 吗？此操作不可恢复。`)) {
      return;
    }

    try {
      await deleteTestAccount(account.id);
      setAccounts((prev) => prev.filter((item) => item.id !== account.id));
    } catch (err) {
      handleError(err, "删除测试账号失败。");
    }
  };

  const filteredAccounts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return accounts;
    }
    return accounts.filter((account) => {
      return (
        account.email.toLowerCase().includes(keyword) ||
        account.display_name?.toLowerCase().includes(keyword) ||
        account.tags?.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [accounts, search]);

  return (
    <div className="admin-test-accounts">
      <header className="admin-test-accounts__header">
        <div>
          <h2>测试账号</h2>
          <p>创建、管理内部测试账号，并快速跳转到详细数据页面。</p>
        </div>
        <div className="admin-test-accounts__search">
          <MaterialIcon name="search" />
          <input
            type="search"
            placeholder="按邮箱、昵称或标签搜索..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </header>

      {error ? <p className="admin-test-accounts__error">{error}</p> : null}

      <section className="admin-test-accounts__form-card">
        <header>
          <h3>快速创建测试账号</h3>
          <p>支持为测试账号预设备注、标签等信息。</p>
        </header>

        <form className="admin-test-accounts__form" onSubmit={handleSubmit}>
          <label>
            邮箱
            <input
              type="email"
              placeholder="test@example.com"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label>
            初始密码
            <input
              type="password"
              placeholder="至少 8 位"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>
          <label>
            显示昵称（可选）
            <input
              type="text"
              placeholder="默认为邮箱前缀"
              value={form.display_name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, display_name: event.target.value }))
              }
            />
          </label>
          <label>
            标签（逗号分隔）
            <input
              type="text"
              placeholder="如：画廊, 灯塔活动"
              value={form.tags}
              onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
            />
          </label>
          <label className="admin-test-accounts__full">
            备注信息
            <textarea
              rows={3}
              placeholder="记录账号用途、场景等"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          <label className="admin-test-accounts__switch">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            />
            <span>保持账号启用状态</span>
          </label>

          <div className="admin-test-accounts__actions">
            <button type="button" onClick={resetForm}>
              清空表单
            </button>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "创建中..." : "创建测试账号"}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-test-accounts__list">
        <header>
          <h3>测试账号列表</h3>
          <span>共 {filteredAccounts.length} 个账号</span>
        </header>

        {loading ? (
          <div className="admin-test-accounts__loading">
            <div className="admin-test-accounts__spinner" />
            <span>正在加载测试账号...</span>
          </div>
        ) : null}

        <div className="admin-test-accounts__table-wrapper">
          <table className="admin-test-accounts__table">
            <thead>
              <tr>
                <th>显示昵称</th>
                <th>登录邮箱</th>
                <th>标签</th>
                <th>备注</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 && !loading ? (
                <tr>
                  <td className="admin-test-accounts__empty" colSpan={6}>
                    暂无匹配的测试账号。
                  </td>
                </tr>
              ) : null}
              {filteredAccounts.map((account) => (
                <tr key={account.id}>
                  <td data-title="显示昵称">{account.display_name || "（未设置）"}</td>
                  <td data-title="登录邮箱" className="admin-test-accounts__email">
                    {account.email}
                  </td>
                  <td data-title="标签">
                    {account.tags?.length ? account.tags.join("、") : "—"}
                  </td>
                  <td data-title="备注" className="admin-test-accounts__notes">
                    {account.notes || "—"}
                  </td>
                  <td data-title="状态">
                    <span className={account.is_active ? "status status--active" : "status"}>
                      {account.is_active ? "启用" : "停用"}
                    </span>
                  </td>
                  <td data-title="操作">
                    <div className="admin-test-accounts__actions-group">
                      <button type="button" onClick={() => handleToggleActive(account)}>
                        <MaterialIcon name={account.is_active ? "toggle_on" : "toggle_off"} />
                        {account.is_active ? "停用" : "启用"}
                      </button>
                      <Link to={`/admin/test-accounts/${account.id}`}>
                        <MaterialIcon name="open_in_new" />
                        详情
                      </Link>
                      <button type="button" onClick={() => handleDelete(account)}>
                        <MaterialIcon name="delete" />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default TestAccountsPage;

