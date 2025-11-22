import { useEffect, useState } from "react";
import type { AxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import { fetchNotificationDetail, type Notification } from "@/services/api";

import "./NotificationDetail.css";

type NotificationDetailProps = {
  notification: Notification;
  onBack: () => void;
};

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${year}年${month}月${day}日 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  } catch {
    return dateString;
  }
}

function NotificationDetail({ notification: initialNotification, onBack }: NotificationDetailProps) {
  const [notification, setNotification] = useState<Notification | null>(initialNotification);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 如果已经有完整数据，就不需要重新加载
    if (initialNotification.content) {
      return;
    }

    let isMounted = true;

    async function loadDetail() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchNotificationDetail(initialNotification.id);
        if (isMounted) {
          setNotification(data);
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const status = (err as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setError("请登录后查看通知详情。");
        } else {
          setError("加载通知详情失败，请稍后重试。");
          console.warn("Failed to load notification detail", err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      isMounted = false;
    };
  }, [initialNotification]);

  const displayNotification = notification || initialNotification;

  return (
    <div className="notification-detail">
      <TopNav
        title="通知详情"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onBack,
        }}
        className="top-nav--fixed top-nav--flush"
      />

      <main className="notification-detail__content">
        {loading && (
          <div className="notification-detail__loading">
            <p>正在加载...</p>
          </div>
        )}

        {error && !loading && (
          <div className="notification-detail__error">
            <MaterialIcon name="error_outline" className="notification-detail__error-icon" />
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && displayNotification && (
          <>
            <header className="notification-detail__header">
              <h1 className="notification-detail__title">{displayNotification.title}</h1>
              <time className="notification-detail__date">{formatDate(displayNotification.created_at)}</time>
            </header>

            <div className="notification-detail__body">
              <div className="notification-detail__text">
                {displayNotification.content.split("\n").map((paragraph, index) => (
                  <p key={index}>{paragraph || "\u00A0"}</p>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default NotificationDetail;







