import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";
import { useNavigate } from "react-router-dom";

import { AUTH_STORAGE_KEY, login as loginRequest, setAuthToken } from "@/services/api";

import "./AdminLogin.css";

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !submitting;
  }, [email, password, submitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const payload = await loginRequest({
        email: email.trim(),
        password,
      });

      if (!payload.user.is_staff) {
        setError("该账号没有后台权限，请联系管理员。");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
      }
      setAuthToken(payload.token);
      navigate("/admin/home-content", { replace: true });
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === "string" && detail ? detail : "登录失败，请检查账号信息。");
      } else {
        setError("登录失败，请稍后再试。");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="admin-login__panel">
        <header className="admin-login__header">
          <div className="admin-login__badge">Echo Admin</div>
          <h1>管理后台</h1>
          <p>欢迎回来，请使用后台账号登录。</p>
        </header>
        <form className="admin-login__form" onSubmit={handleSubmit}>
          <label className="admin-login__field">
            <span>邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
              disabled={submitting}
              required
            />
          </label>
          <label className="admin-login__field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入后台密码"
              autoComplete="current-password"
              disabled={submitting}
              required
            />
          </label>
          {error ? <p className="admin-login__error">{error}</p> : null}
          <button type="submit" className="admin-login__submit" disabled={!canSubmit}>
            {submitting ? "登录中..." : "登录后台"}
          </button>
        </form>
        <footer className="admin-login__footer">
          <small>如果忘记后台密码，请联系系统管理员重置。</small>
        </footer>
      </div>
    </div>
  );
}

export default AdminLogin;

