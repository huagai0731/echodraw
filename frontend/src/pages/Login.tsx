import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";

import TopNav from "@/components/TopNav";
import api from "@/services/api";

import "./Login.css";

type AuthSuccessPayload = {
  token: string;
  user: {
    email: string;
  };
};

type LoginProps = {
  onBack?: () => void;
  onSuccess?: (payload: AuthSuccessPayload) => void;
  initialEmail?: string;
  onForgotPassword?: (email: string) => void;
};

function Login({ onBack, onSuccess, initialEmail = "", onForgotPassword }: LoginProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !submitting;
  }, [email, password, submitting]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await api.post<AuthSuccessPayload>("/auth/login/", {
        email: email.trim(),
        password,
      });

      onSuccess?.(response.data);
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setError(
          typeof detail === "string" && detail.length > 0
            ? detail
            : "登录失败，请检查邮箱和密码"
        );
      } else {
        setError("登录失败，请稍后再试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-screen__background">
        <div className="login-screen__glow login-screen__glow--mint" />
        <div className="login-screen__glow login-screen__glow--brown" />
        <div className="login-screen__glow login-screen__glow--blue" />
      </div>

      <TopNav
        className="top-nav--flush login-screen__nav"
        leadingAction={
          onBack
            ? {
                icon: "arrow_back",
                label: "返回",
                onClick: () => onBack(),
              }
            : null
        }
        title="Echo"
        subtitle="Login"
      />

      <div className="login-screen__content">
        <header className="login-screen__header">
          <div className="login-screen__headline">
            <h1>
              再次创作，
              <br />记录灵感
            </h1>
            <p>欢迎回到 EchoDraw</p>
          </div>
        </header>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-form__field">
            <span>邮箱</span>
            <input
              type="email"
              placeholder="例如：artist@echo.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <label className="login-form__field">
            <span>密码</span>
            <input
              type="password"
              placeholder="············"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

          {error ? <p className="login-form__message login-form__message--error">{error}</p> : null}

          <button type="submit" className="login-form__submit" disabled={!canSubmit}>
            {submitting ? "登录中..." : "登录"}
          </button>
        </form>

        <button
          type="button"
          className="login-screen__link"
          onClick={() => onForgotPassword?.(email)}
          disabled={submitting}
        >
          忘记密码？
        </button>
      </div>
    </div>
  );
}

export default Login;

