import clsx from "clsx";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import {
  AUTH_CHANGED_EVENT,
  fetchCheckInStatus,
  fetchHomeMessages,
  hasAuthToken,
  submitCheckIn,
  type CheckInStatus,
  type HomeMessagesResponse,
} from "@/services/api";

import "./HomeScreen.css";

type HomeProps = {
  onOpenUpload?: () => void;
};

type HomeCopy = {
  historyHeadline: string;
  historyText: string;
  conditional: string;
  encouragement: string;
};

const FALLBACK_COPY: HomeCopy = {
  historyHeadline: "历史上的今天",
  historyText: "1901 年的今天，巴黎的清晨薄雾被一位年轻画家捕捉在画布上，唤起整个工作室的灵感回响。",
  conditional:
    "你上次上传时留下一句“自评分 72 分，心情是心如止水”，那份沉静的力量依旧在作品里流动。",
  encouragement: "再向前一步吧，灵感就在下一笔。保持节奏，你的故事值得被看见。",
};

function sanitize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeMessages(payload: HomeMessagesResponse | null): HomeCopy | null {
  if (!payload) {
    return null;
  }

  const normalized: HomeCopy = {
    historyHeadline: sanitize(payload.history?.headline),
    historyText: sanitize(payload.history?.text),
    conditional: sanitize(payload.conditional),
    encouragement: sanitize(payload.encouragement),
  };

  const hasContent = Object.values(normalized).some(Boolean);
  return hasContent ? normalized : null;
}

function Home({ onOpenUpload }: HomeProps) {
  const [copy, setCopy] = useState<HomeCopy>(FALLBACK_COPY);
  const [loadingCopy, setLoadingCopy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [checkInStatusRequested, setCheckInStatusRequested] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthChange = () => {
      setAuthVersion((prev) => prev + 1);
      setCopy(FALLBACK_COPY);
      setCopyError(null);
      setCheckInStatus(null);
      setCheckInStatusRequested(false);
      setCheckInError(null);
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCopy() {
      setLoadingCopy(true);
      try {
        if (!hasAuthToken()) {
          if (isMounted) {
            setCopy(FALLBACK_COPY);
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
          setCopy(FALLBACK_COPY);
          setCopyError("暂时没有匹配的专属文案，已展示备用内容。");
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const status = (error as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setCopyError("请登录后查看今日专属文案。");
        } else {
          setCopyError("获取今日文案失败，已展示备用内容。");
          console.warn("Failed to load home copy", error);
        }
        setCopy(FALLBACK_COPY);
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

  useEffect(() => {
    if (checkInStatus || checkInStatusRequested) {
      return;
    }

    let isMounted = true;
    setCheckInStatusRequested(true);

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
    } catch (error) {
      console.warn("Failed to submit check-in", error);
      setCheckInError("打卡失败，请稍后再试。");
    } finally {
      setCheckInLoading(false);
    }
  };

  const checkedIn = checkInStatus?.checked_today ?? false;
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
            disabled={checkInLoading}
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
              onClick={() => onOpenUpload?.()}
            >
              <MaterialIcon name="add_photo_alternate" className="home-screen__card-icon" />
              <div className="home-screen__card-text">
                <h2 className="home-screen__card-title">上传新作品</h2>
                <p className="home-screen__card-description">+ 添加创作</p>
              </div>
            </button>
            <div className="home-screen__card">
              <MaterialIcon name="task_alt" className="home-screen__card-icon" />
              <div className="home-screen__card-text">
                <h2 className="home-screen__card-title">任务提醒</h2>
                <p className="home-screen__card-description">今日 3 个目标</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Home;

