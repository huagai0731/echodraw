import { useCallback, useMemo, useState } from "react";
import type { FormEvent, ChangeEvent } from "react";

import TopNav from "@/components/TopNav";
import api from "@/services/api";
import { useAsyncOperation } from "@/hooks/useAsyncOperation";
import { useCountdown } from "@/hooks/useCountdown";
import { extractApiError, extractRetryAfter } from "@/hooks/useApiError";

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
  const [info, setInfo] = useState<string | null>(null);

  // 使用倒计时 Hook
  const { countdown, start: startCountdown, isActive: isCountdownActive } = useCountdown({
    onComplete: () => {
      // 倒计时完成时的回调（如果需要）
    },
  });

  // 发送验证码状态（需要特殊处理 retryAfter，所以不使用 useAsyncOperation）
  const [sendingCode, setSendingCode] = useState(false);
  const [sendCodeError, setSendCodeError] = useState<string | null>(null);

  // 使用异步操作 Hook - 提交注册
  const {
    loading: submitting,
    error: submitError,
    execute: executeSubmit,
  } = useAsyncOperation<AuthSuccessPayload>({
    onSuccess: (data) => {
      setInfo("注册成功，正在为您登录...");
      onSuccess?.(data);
    },
    defaultError: "注册失败，请检查输入信息",
  });

  // 合并错误显示
  const error = sendCodeError || submitError;

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
    return email.trim().length > 0 && !sendingCode && !isCountdownActive;
  }, [email, sendingCode, isCountdownActive]);

  const handleEmailChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
  }, []);

  const handlePasswordChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  }, []);

  const handleConfirmPasswordChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(event.target.value);
  }, []);

  const handleCodeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCode(event.target.value);
  }, []);

  const handleSendCode = useCallback(async () => {
    if (!canSendCode) {
      return;
    }

    setSendingCode(true);
    setInfo(null);
    setSendCodeError(null);

    try {
      await api.post("/auth/send-code/", {
        email: email.trim(),
        purpose: "register",
      });

      // 发送成功，启动倒计时
      startCountdown(60); // 默认 60 秒
      setInfo("验证码已发送，请检查邮箱");
      onRequestCode?.();
    } catch (err) {
      // 从错误中提取重试等待时间
      const retryAfter = extractRetryAfter(err);
      if (retryAfter) {
        startCountdown(retryAfter);
      }

      // 提取并设置错误消息
      const errorMessage = extractApiError(err, "验证码发送失败，请稍后再试");
      setSendCodeError(errorMessage);
    } finally {
      setSendingCode(false);
    }
  }, [canSendCode, email, startCountdown, onRequestCode]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (!canSubmit) {
        return;
      }

      setInfo(null);

      await executeSubmit(async () => {
        if (password !== confirmPassword) {
          throw new Error("两次输入的密码不一致");
        }

        const response = await api.post<AuthSuccessPayload>("/auth/register/", {
          email: email.trim(),
          password,
          confirm_password: confirmPassword,
          code: code.trim(),
        });

        return response.data;
      });
    },
    [canSubmit, password, confirmPassword, email, code, executeSubmit]
  );

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
              onChange={handleEmailChange}
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
              onChange={handlePasswordChange}
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
              onChange={handleConfirmPasswordChange}
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
                onChange={handleCodeChange}
                disabled={submitting}
                required
              />
              <button
                type="button"
                className="register-form__get-code"
                onClick={handleSendCode}
                disabled={!canSendCode}
              >
                {isCountdownActive
                  ? `重新发送 (${countdown} 秒)`
                  : sendingCode
                    ? "发送中..."
                    : "获取验证码"}
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


