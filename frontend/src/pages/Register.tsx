import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { isAxiosError } from "axios";

import TopNav from "@/components/TopNav";
import api from "@/services/api";

import "./Register.css";

type AuthSuccessPayload = {
  token: string;
  user: {
    email: string;
  };
};

type RegisterProps = {
  onBack?: () => void;
  onLogin?: () => void;
  onRequestCode?: () => void;
  onSuccess?: (payload: AuthSuccessPayload) => void;
};

function Register({ onBack, onLogin, onRequestCode, onSuccess }: RegisterProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [countdown]);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 0 &&
      password.length >= 8 &&
      confirmPassword.length >= 8 &&
      code.trim().length > 0 &&
      !submitting
    );
  }, [email, password, confirmPassword, code, submitting]);

  const canSendCode = useMemo(() => {
    return email.trim().length > 0 && !sendingCode && countdown === 0;
  }, [email, sendingCode, countdown]);

  const handleSendCode = async () => {
    if (!canSendCode) {
      return;
    }

    setSendingCode(true);
    setError(null);
    setInfo(null);

    try {
      await api.post("/auth/send-code/", {
        email: email.trim(),
        purpose: "register",
      });

      setCountdown(60);
      setInfo("验证码已发送，请检查邮箱");
      onRequestCode?.();
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        const retryAfter = err.response?.data?.retry_after;
        if (typeof retryAfter === "number" && retryAfter > 0) {
          setCountdown(retryAfter);
        }
        setError(
          typeof detail === "string" && detail.length > 0
            ? detail
            : "验证码发送失败，请稍后再试"
        );
      } else {
        setError("验证码发送失败，请稍后再试");
      }
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const response = await api.post<AuthSuccessPayload>("/auth/register/", {
        email: email.trim(),
        password,
        confirm_password: confirmPassword,
        code: code.trim(),
      });

      setInfo("注册成功，正在为您登录...");
      onSuccess?.(response.data);
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setError(
          typeof detail === "string" && detail.length > 0
            ? detail
            : "注册失败，请检查输入信息"
        );
      } else {
        setError("注册失败，请稍后再试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="register-screen">
      <div className="register-screen__background">
        <div className="register-screen__glow register-screen__glow--mint" />
        <div className="register-screen__glow register-screen__glow--brown" />
        <div className="register-screen__glow register-screen__glow--blue" />
      </div>

      <TopNav
        className="top-nav--flush register-screen__nav"
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
        subtitle="Sign Up"
      />

      <div className="register-screen__content">
        <header className="register-screen__header">
          <div className="register-screen__headline">
            <h1>
              开启创作旅程，
              <br />点亮灵感
            </h1>
            <p>立即加入 EchoDraw</p>
          </div>
        </header>

        <form className="register-form" onSubmit={handleSubmit}>
          <label className="register-form__field">
            <span>邮箱</span>
            <input
              type="email"
              placeholder="例如：artist@echo.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting || sendingCode}
              required
            />
          </label>
          <label className="register-form__field">
            <span>密码</span>
            <input
              type="password"
              placeholder="至少 8 位密码"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              minLength={8}
              required
            />
          </label>
          <label className="register-form__field">
            <span>确认密码</span>
            <input
              type="password"
              placeholder="再次输入密码"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={submitting}
              minLength={8}
              required
            />
          </label>
          <label className="register-form__field register-form__field--verification">
            <span>验证码</span>
            <div className="register-form__verification">
              <input
                type="text"
                placeholder="输入验证码"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={submitting}
                required
              />
              <button
                type="button"
                className="register-form__get-code"
                onClick={handleSendCode}
                disabled={!canSendCode}
              >
                {countdown > 0 ? `重新发送 (${countdown} 秒)` : sendingCode ? "发送中..." : "获取验证码"}
              </button>
            </div>
          </label>

          {error ? (
            <p className="register-form__message register-form__message--error">{error}</p>
          ) : null}
          {info ? (
            <p className="register-form__message register-form__message--info">{info}</p>
          ) : null}

          <button type="submit" className="register-form__submit" disabled={!canSubmit}>
            {submitting ? "注册中..." : "注册"}
          </button>
        </form>

        <button type="button" className="register-screen__link" onClick={() => onLogin?.()}>
          已有账号？去登录
        </button>
      </div>
    </div>
  );
}

export default Register;


