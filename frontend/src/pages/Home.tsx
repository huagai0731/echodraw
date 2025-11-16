import clsx from "clsx";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import {
  AUTH_CHANGED_EVENT,
  CHECK_IN_STATUS_CHANGED_EVENT,
  fetchCheckInStatus,
  fetchHomeMessages,
  hasAuthToken,
  submitCheckIn,
  type CheckInStatus,
  type HomeMessagesResponse,
} from "@/services/api";

import "./HomeScreen.css";

const LOCAL_LAST_CHECKIN_KEY = "echo-last-checkin-date";
const LOCAL_CHECKIN_STATUS_KEY = "echo-last-checkin-status";

type HomeProps = {
  onOpenUpload?: () => void;
  onOpenMentalStateAssessment?: () => void;
  onOpenColorPerceptionTest?: () => void;
};

type HomeCopy = {
  historyHeadline: string;
  historyText: string;
  conditional: string;
  encouragement: string;
};

const EMPTY_COPY: HomeCopy = {
  historyHeadline: "",
  historyText: "",
  conditional: "",
  encouragement: "",
};

function sanitize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeMessages(payload: HomeMessagesResponse | null): HomeCopy | null {
  if (!payload) {
    return null;
  }

  // 后端现有返回字段为：general/conditional/holiday/history
  // 为兼容老字段，将 general 作为 encouragement 兜底，holiday/history 合并为历史区块
  const historyHeadline = sanitize(payload.history?.headline) || sanitize(payload.holiday?.headline);
  const historyText = sanitize(payload.history?.text) || sanitize(payload.holiday?.text);
  const conditional = sanitize(payload.conditional);
  const encouragement = sanitize(payload.encouragement) || sanitize((payload as any).general);

  const normalized: HomeCopy = {
    historyHeadline,
    historyText,
    conditional,
    encouragement,
  };

  const hasContent = Object.values(normalized).some(Boolean);
  return hasContent ? normalized : null;
}

function Home({ onOpenMentalStateAssessment, onOpenColorPerceptionTest }: HomeProps) {
  const [copy, setCopy] = useState<HomeCopy>(EMPTY_COPY);
  const [loadingCopy, setLoadingCopy] = useState(true);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [checkInStatusRequested, setCheckInStatusRequested] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);

  function getTodayIso(): string {
    // 始终以中国时区（Asia/Shanghai）计算“今天”，避免用户本地时区影响
    try {
      const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(new Date());
      const y = parts.find((p) => p.type === "year")?.value ?? "0000";
      const m = parts.find((p) => p.type === "month")?.value ?? "01";
      const d = parts.find((p) => p.type === "day")?.value ?? "01";
      return `${y}-${m}-${d}`;
    } catch {
      // 兜底：若 Intl 不可用，退回本地时区
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthChange = () => {
      setAuthVersion((prev) => prev + 1);
      setCopy(EMPTY_COPY);
      setCopyError(null);
      setCheckInStatus(null);
      setCheckInStatusRequested(false);
      setCheckInError(null);
      setLoadingCopy(true);
      // 清除 localStorage 中的打卡缓存
      try {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(LOCAL_CHECKIN_STATUS_KEY);
          window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
        }
      } catch {
        // ignore storage errors
      }
    };

    const handleCheckInStatusChange = async () => {
      // 刷新打卡状态
      setCheckInStatusRequested(true);
      try {
        if (hasAuthToken()) {
          const status = await fetchCheckInStatus();
          setCheckInStatus(status);
          setCheckInError(null);
          try {
            if (typeof window !== "undefined") {
              window.localStorage.setItem(LOCAL_CHECKIN_STATUS_KEY, JSON.stringify(status));
            }
          } catch {
            // ignore storage errors
          }
        } else {
          setCheckInStatusRequested(false);
        }
      } catch (error) {
        setCheckInStatusRequested(false);
        const status = (error as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setCheckInError("请登录后查看打卡状态。");
        } else {
          console.warn("Failed to refresh check-in status", error);
          setCheckInError("获取打卡状态失败，请稍后重试。");
        }
      }
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    window.addEventListener(CHECK_IN_STATUS_CHANGED_EVENT, handleCheckInStatusChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener(CHECK_IN_STATUS_CHANGED_EVENT, handleCheckInStatusChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCopy() {
      setLoadingCopy(true);
      try {
        if (!hasAuthToken()) {
          if (isMounted) {
            setCopy(EMPTY_COPY);
            setCopyError("请登录后查看今日专属文案。");
            setCheckInStatus(null);
            setCheckInStatusRequested(false);
          }
          return;
        }

        const data = await fetchHomeMessages();
        if (!isMounted) {
          return;
        }

        if (data?.check_in) {
          setCheckInStatus(data.check_in);
          setCheckInStatusRequested(true);
        }

        const normalized = normalizeMessages(data);
        if (normalized) {
          setCopy(normalized);
          setCopyError(null);
        } else {
          // 后端暂未返回匹配文案时，保持为空，不提示错误、也不展示备用文案
          setCopy(EMPTY_COPY);
          setCopyError(null);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const status = (error as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setCopyError("请登录后查看今日专属文案。");
        } else {
          setCopyError("获取今日文案失败。");
          console.warn("Failed to load home copy", error);
        }
        setCopy(EMPTY_COPY);
      } finally {
        if (isMounted) {
          setLoadingCopy(false);
        }
      }
    }

    loadCopy();

    return () => {
      isMounted = false;
    };
  }, [authVersion]);

  // 添加每天0点自动刷新打卡状态的机制
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function getNextMidnightShanghai(): number {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const parts = formatter.formatToParts(now);
      const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
      const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "0", 10) - 1;
      const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "0", 10);
      
      // 创建上海时区的今天0点
      const midnightShanghai = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
      // 计算UTC时间差（上海是UTC+8）
      const shanghaiOffset = 8 * 60 * 60 * 1000;
      const midnightLocal = new Date(midnightShanghai.getTime() - shanghaiOffset);
      
      // 如果已经过了今天0点，则设置为明天0点
      if (midnightLocal <= now) {
        midnightLocal.setDate(midnightLocal.getDate() + 1);
      }
      
      return midnightLocal.getTime();
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const scheduleNextRefresh = () => {
      const nextMidnight = getNextMidnightShanghai();
      const delay = nextMidnight - Date.now();

      const timeoutId = setTimeout(() => {
        // 触发打卡状态刷新事件
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(CHECK_IN_STATUS_CHANGED_EVENT));
        }
        // 设置定时器，每24小时刷新一次
        intervalId = setInterval(() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(CHECK_IN_STATUS_CHANGED_EVENT));
          }
        }, 24 * 60 * 60 * 1000);
      }, delay);

      return timeoutId;
    };

    const timeoutId = scheduleNextRefresh();

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    if (checkInStatus || checkInStatusRequested) {
      return;
    }

    let isMounted = true;
    setCheckInStatusRequested(true);

    // 乐观：如果本地记录了当天已打卡，则先行置位，避免刷新后短暂可点击
    try {
      if (typeof window !== "undefined") {
        // 先读取缓存的打卡统计，避免请求期间显示为 0
        const cached = window.localStorage.getItem(LOCAL_CHECKIN_STATUS_KEY);
        if (cached && isMounted) {
          try {
            const parsed = JSON.parse(cached) as CheckInStatus;
            if (parsed && typeof parsed.total_checkins === "number") {
              setCheckInStatus(parsed);
            }
          } catch {
            // ignore bad cache
          }
        }
        const local = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
        if (local && local === getTodayIso()) {
          // 不修改累计与连击，仅用于后续渲染时本地判断“今日已打卡”
        }
      }
    } catch {
      // ignore storage errors
    }

    async function loadStatus() {
      try {
        if (!hasAuthToken()) {
          if (!isMounted) {
            return;
          }
          setCheckInStatusRequested(false);
          setCheckInStatus(null);
          setCheckInError("请登录后查看打卡状态。");
          return;
        }

        const status = await fetchCheckInStatus();
        if (!isMounted) {
          return;
        }
        setCheckInStatus(status);
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(LOCAL_CHECKIN_STATUS_KEY, JSON.stringify(status));
          }
        } catch {
          // ignore storage errors
        }
        setCheckInError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const status = (error as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setCheckInError("请登录后查看打卡状态。");
        } else {
          console.warn("Failed to load check-in status", error);
          setCheckInError("获取打卡状态失败，请稍后重试。");
        }
      }
    }

    loadStatus();

    return () => {
      isMounted = false;
    };
  }, [checkInStatus, checkInStatusRequested, authVersion]);

  const messageLines = useMemo(
    () =>
      [copy.historyText, copy.conditional, copy.encouragement].filter(
        (line): line is string => Boolean(line),
      ),
    [copy],
  );

  const handleCheckIn = async () => {
    if (checkInLoading) {
      return;
    }

    if (checkInStatus?.checked_today) {
      return;
    }

    setCheckInLoading(true);
    try {
      const result = await submitCheckIn({ source: "app" });
      const { created: _created, checked_date: _checkedDate, ...status } = result;
      setCheckInStatus(status);
      setCheckInError(null);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_LAST_CHECKIN_KEY, getTodayIso());
          window.localStorage.setItem(LOCAL_CHECKIN_STATUS_KEY, JSON.stringify(status));
        }
      } catch {
        // ignore storage errors
      }
    } catch (error) {
      console.warn("Failed to submit check-in", error);
      setCheckInError("打卡失败，请稍后再试。");
    } finally {
      setCheckInLoading(false);
    }
  };

  const checkedIn = (() => {
    const serverChecked = checkInStatus?.checked_today ?? false;
    // 优先使用服务器返回的状态
    if (serverChecked) {
      return true;
    }
    // 如果服务器明确说今天没打卡，清除本地存储的打卡日期，避免缓存干扰
    if (checkInStatus !== null && !serverChecked) {
      try {
        if (typeof window !== "undefined") {
          const local = window.localStorage.getItem(LOCAL_LAST_CHECKIN_KEY);
          const today = getTodayIso();
          // 如果本地存储的日期是今天，但服务器说今天没打卡，清除本地存储
          if (local === today) {
            window.localStorage.removeItem(LOCAL_LAST_CHECKIN_KEY);
          }
        }
      } catch {
        // ignore storage errors
      }
    }
    // 服务器状态优先，如果服务器说没打卡，就返回 false
    return false;
  })();
  const totalCheckins = checkInStatus?.total_checkins ?? 0;
  const currentStreak = checkInStatus?.current_streak ?? 0;

  return (
    <div className="home-screen">
      <div className="home-screen__background">
        <div className="home-screen__glow home-screen__glow--primary" />
        <div className="home-screen__glow home-screen__glow--secondary" />
      </div>

      <TopNav
        title="EchoDraw"
        subtitle="Home"
        className="top-nav--fixed"
        trailingActions={[{ icon: "notifications", label: "通知" }]}
      />

      <main className="home-screen__content">
        <header className="home-screen__header">
          <h1 className="home-screen__title">欢迎回来，创作者</h1>
          {copy.historyHeadline && (
            <p className="home-screen__subtitle home-screen__subtitle--headline">
              {copy.historyHeadline}
            </p>
          )}
          {messageLines.map((line, index) => (
            <p key={line + index} className="home-screen__subtitle">
              {line}
            </p>
          ))}
          {loadingCopy && (
            <p className="home-screen__subtitle home-screen__subtitle--hint">正在获取今日文案…</p>
          )}
          {copyError && !loadingCopy && (
            <p className="home-screen__subtitle home-screen__subtitle--hint">{copyError}</p>
          )}
        </header>

        <section className="home-screen__cards">
          <button
            type="button"
            className={clsx(
              "home-screen__card",
              "home-screen__card--checkin",
              checkedIn && "home-screen__card--checked",
            )}
            onClick={handleCheckIn}
            disabled={checkInLoading || checkedIn}
            aria-busy={checkInLoading ? "true" : undefined}
          >
            <MaterialIcon
              name={checkedIn ? "check_circle" : "sentiment_satisfied"}
              className="home-screen__card-icon"
              filled={checkedIn}
            />
            <div className="home-screen__card-text">
              <h2 className="home-screen__card-title">
                {checkedIn ? "今日已打卡！" : "每日打卡"}
              </h2>
              <p className="home-screen__card-description">
                {checkedIn
                  ? `累计打卡 ${totalCheckins} 天${
                      currentStreak > 0 ? ` · 连续 ${currentStreak} 天` : ""
                    }`
                  : "记录今日情绪与时长"}
              </p>
            </div>
          </button>
          {checkInError && (
            <p className="home-screen__subtitle home-screen__subtitle--hint">{checkInError}</p>
          )}

          <div className="home-screen__grid">
            <button
              type="button"
              className="home-screen__card home-screen__card--link"
              onClick={() => onOpenColorPerceptionTest?.()}
            >
              <MaterialIcon name="palette" className="home-screen__card-icon" />
              <div className="home-screen__card-text">
                <h2 className="home-screen__card-title">每日色感测试</h2>
                <p className="home-screen__card-description">测试你的色彩感知</p>
              </div>
            </button>
            <button
              type="button"
              className="home-screen__card home-screen__card--link"
              onClick={() => onOpenMentalStateAssessment?.()}
            >
              <MaterialIcon name="task_alt" className="home-screen__card-icon" />
              <div className="home-screen__card-text">
                <h2 className="home-screen__card-title">今日目标</h2>
                <p className="home-screen__card-description">心境评估</p>
              </div>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Home;

