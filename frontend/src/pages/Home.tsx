import clsx from "clsx";
import { memo, useEffect, useMemo, useState, useCallback } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import CheckInCard from "@/components/CheckInCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import {
  AUTH_CHANGED_EVENT,
  hasAuthToken,
} from "@/services/api";
import { clearAllUserCache } from "@/utils/clearUserCache";
import { truncateName } from "@/utils/userUtils";
import { useHomeMessages } from "@/hooks/useHomeMessages";
import { useCheckIn } from "@/hooks/useCheckIn";
import { useUserPreferences } from "@/hooks/useUserPreferences";

import "./HomeScreen.css";

type HomeProps = {
  onOpenUpload?: () => void;
  onOpenMentalStateAssessment?: () => void;
  onOpenColorPerceptionTest?: () => void;
  onOpenVisualAnalysis?: () => void;
};

function Home({
  onOpenMentalStateAssessment,
  onOpenColorPerceptionTest: _onOpenColorPerceptionTest,
  onOpenVisualAnalysis,
}: HomeProps) {
  const [authVersion, setAuthVersion] = useState(0);

  // 使用自定义 Hooks
  const userName = useUserPreferences(authVersion);
  const { copy, loading: loadingCopy, error: copyError, retry: retryCopy } = useHomeMessages(authVersion);
  const {
    checkInStatus,
    checkedIn,
    loading: checkInLoading,
    error: checkInError,
    handleCheckIn,
    retry: retryCheckIn,
  } = useCheckIn(authVersion);

  // 监听认证变化
  useEffect(() => {
    const handleAuthChange = () => {
      setAuthVersion((prev) => prev + 1);
      clearAllUserCache();
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    };
  }, []);

  const messageLines = useMemo(
    () =>
      [copy.historyText, copy.conditional, copy.encouragement].filter(
        (line): line is string => Boolean(line),
      ),
    [copy],
  );

  const hasContent = copy.historyHeadline || messageLines.length > 0;

  return (
    <div className="home-screen">
      <div className="home-screen__background">
        <div className="home-screen__glow home-screen__glow--primary" />
        <div className="home-screen__glow home-screen__glow--secondary" />
      </div>

      <TopNav
        title="EchoDraw"
        subtitle="Home"
        className="top-nav--fixed top-nav--flush"
      />

      <main className="home-screen__content">
        <header className="home-screen__header">
          <h1 className="home-screen__title">
            {userName ? `欢迎回来，${truncateName(userName)}` : "欢迎回来，创作者"}
          </h1>
          
          {loadingCopy && !hasContent && (
            <LoadingSkeleton lines={3} className="home-screen__skeleton" />
          )}

          {!loadingCopy && copy.historyHeadline && (
            <p className="home-screen__subtitle home-screen__subtitle--headline">
              {copy.historyHeadline}
            </p>
          )}

          {!loadingCopy &&
            messageLines.map((line, index) => (
              <p key={`${line}-${index}`} className="home-screen__subtitle">
                {line}
              </p>
            ))}

          {!loadingCopy && hasContent && (
            <p className="home-screen__subtitle">画画是你万千灿烂人生中的一部分</p>
          )}

          {copyError && !loadingCopy && (
            <div className="home-screen__error" role="alert">
              <p className="home-screen__subtitle home-screen__subtitle--hint">{copyError}</p>
              <button
                type="button"
                className="home-screen__retry-button"
                onClick={retryCopy}
                aria-label="重试加载文案"
              >
                重试
              </button>
            </div>
          )}
        </header>

        <section className="home-screen__cards">
          <div className="home-screen__visual-analysis-wrapper">
            <button
              type="button"
              className="home-screen__card home-screen__card--link"
              onClick={() => onOpenVisualAnalysis?.()}
              aria-label="打开视觉分析页面"
            >
              <MaterialIcon name="auto_awesome" className="home-screen__card-icon" />
              <div className="home-screen__card-text">
                <h2 className="home-screen__card-title">视觉分析</h2>
                <p className="home-screen__card-description">分析图片视觉属性</p>
              </div>
            </button>
          </div>
          <div className="home-screen__checkin-wrapper">
            <CheckInCard
              checkedIn={checkedIn}
              checkInStatus={checkInStatus}
              loading={checkInLoading}
              error={checkInError}
              onCheckIn={handleCheckIn}
              onRetry={retryCheckIn}
            />
          </div>

          {/* 测试卡片 - 暂时隐藏，保留代码以便将来使用 */}
          {/* <button
            type="button"
            className="home-screen__card home-screen__card--link"
            onClick={() => onOpenMentalStateAssessment?.()}
            aria-label="打开测试页面"
          >
            <MaterialIcon name="palette" className="home-screen__card-icon" />
            <div className="home-screen__card-text">
              <h2 className="home-screen__card-title">测试</h2>
              <p className="home-screen__card-description">玩一下</p>
            </div>
          </button> */}
        </section>
      </main>
    </div>
  );
}

// 使用 React.memo 优化，避免不必要的重渲染
export default memo(Home);
