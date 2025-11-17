import { useEffect, useState } from "react";
import clsx from "clsx";
import type { AxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import {
  enrichNotificationsWithReadStatus,
  fetchNotifications,
  fetchNotificationDetail,
  markNotificationAsRead,
  type Notification,
} from "@/services/api";

import "./NotificationModal.css";

type NotificationModalProps = {
  open: boolean;
  onClose: () => void;
  onNotificationClick?: (notification: Notification) => void;
};

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return "今天";
    } else if (days === 1) {
      return "昨天";
    } else if (days < 7) {
      return `${days} 天前`;
    } else {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}月${day}日`;
    }
  } catch {
    return dateString;
  }
}

function NotificationModal({ open, onClose, onNotificationClick }: NotificationModalProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // 关闭弹窗时重置状态
      setSelectedNotification(null);
      setDetailError(null);
      return;
    }

    let isMounted = true;

    async function loadNotifications() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchNotifications();
        if (isMounted) {
          // 为通知添加已读状态
          const enrichedData = enrichNotificationsWithReadStatus(data);
          setNotifications(enrichedData);
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const status = (err as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setError("请登录后查看通知。");
        } else {
          setError("加载通知失败，请稍后重试。");
          console.warn("Failed to load notifications", err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadNotifications();

    return () => {
      isMounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (!selectedNotification) {
      return;
    }

    // 标记为已读（无论是否有完整内容）
    if (!selectedNotification.read) {
      markNotificationAsRead(selectedNotification.id);
      // 更新本地状态
      setNotifications((prev) =>
        prev.map((n) => (n.id === selectedNotification.id ? { ...n, read: true } : n)),
      );
      setSelectedNotification({ ...selectedNotification, read: true });
    }

    // 如果已经有完整的content，就不需要重新加载
    if (selectedNotification.content && selectedNotification.content.trim().length > 0) {
      return;
    }

    let isMounted = true;

    async function loadDetail() {
      if (!selectedNotification) {
        return;
      }
      
      try {
        setDetailLoading(true);
        setDetailError(null);
        const data = await fetchNotificationDetail(selectedNotification.id);
        if (isMounted) {
          setSelectedNotification({ ...data, read: true });
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const status = (err as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          setDetailError("请登录后查看通知详情。");
        } else {
          setDetailError("加载通知详情失败，请稍后重试。");
          console.warn("Failed to load notification detail", err);
        }
      } finally {
        if (isMounted) {
          setDetailLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      isMounted = false;
    };
  }, [selectedNotification]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // 标记为已读
    if (!notification.read) {
      markNotificationAsRead(notification.id);
      // 更新本地状态
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
      );
    }
    setSelectedNotification(notification);
    onNotificationClick?.(notification);
  };

  const handleBackToList = () => {
    setSelectedNotification(null);
    setDetailError(null);
  };

  function formatDetailDate(dateString: string): string {
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

  return (
    <div className={clsx("notification-modal", open && "notification-modal--open")}>
      <button
        type="button"
        className="notification-modal__backdrop"
        onClick={handleBackdropClick}
        aria-label="关闭"
      />
      <div className="notification-modal__sheet">
        <header className="notification-modal__header">
          {selectedNotification ? (
            <>
              <button
                type="button"
                className="notification-modal__back-button"
                onClick={handleBackToList}
                aria-label="返回"
              >
                <MaterialIcon name="arrow_back" />
              </button>
              <h2>通知详情</h2>
            </>
          ) : (
            <h2>通知</h2>
          )}
          <button
            type="button"
            className="notification-modal__close-button"
            onClick={onClose}
            aria-label="关闭"
          >
            <MaterialIcon name="close" />
          </button>
        </header>

        <div className="notification-modal__content">
          {selectedNotification ? (
            // 详情视图
            <>
              {detailLoading && (
                <div className="notification-modal__empty">
                  <p>正在加载...</p>
                </div>
              )}

              {detailError && !detailLoading && (
                <div className="notification-modal__empty">
                  <MaterialIcon name="error_outline" className="notification-modal__error-icon" />
                  <p>{detailError}</p>
                </div>
              )}

              {!detailLoading && !detailError && (
                <>
                  <header className="notification-modal__detail-header">
                    <h1 className="notification-modal__detail-title">{selectedNotification.title}</h1>
                    <time className="notification-modal__detail-date">
                      {formatDetailDate(selectedNotification.created_at)}
                    </time>
                  </header>

                  <div className="notification-modal__detail-body">
                    <div className="notification-modal__detail-text">
                      {(selectedNotification.content || selectedNotification.summary || "")
                        .split("\n")
                        .map((paragraph, index) => (
                          <p key={index}>{paragraph || "\u00A0"}</p>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            // 列表视图
            <>
              {loading && (
                <div className="notification-modal__empty">
                  <p>正在加载通知...</p>
                </div>
              )}

              {error && !loading && (
                <div className="notification-modal__empty">
                  <MaterialIcon name="error_outline" className="notification-modal__error-icon" />
                  <p>{error}</p>
                </div>
              )}

              {!loading && !error && notifications.length === 0 && (
                <div className="notification-modal__empty">
                  <MaterialIcon name="notifications_none" className="notification-modal__empty-icon" />
                  <p>暂无通知</p>
                </div>
              )}

              {!loading && !error && notifications.length > 0 && (
                <div className="notification-modal__list">
                  {notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={clsx(
                        "notification-modal__item",
                        !notification.read && "notification-modal__item--unread",
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="notification-modal__item-header">
                        <div className="notification-modal__item-title-wrapper">
                          <h3 className="notification-modal__item-title">{notification.title}</h3>
                          {!notification.read && (
                            <span className="notification-modal__item-badge" aria-hidden="true" />
                          )}
                        </div>
                        <span className="notification-modal__item-date">
                          {formatDate(notification.created_at)}
                        </span>
                      </div>
                      <p className="notification-modal__item-summary">{notification.summary}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationModal;

