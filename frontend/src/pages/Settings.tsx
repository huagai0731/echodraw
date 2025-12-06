import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import {
  getDefaultTagPreferences,
  loadTagPreferences,
  TAG_PREFERENCES_CHANGED_EVENT,
  type TagPreferences,
} from "@/services/tagPreferences";
import { fetchCurrentUser } from "@/services/api";
import { handleInstallClick, isPWAInstalled } from "@/utils/pwaInstall";

import "./Settings.css";

type SettingsProps = {
  onBack: () => void;
  displayName: string;
  signature: string;
  userEmail: string | null;
  onUpdateDisplayName: (value: string) => Promise<void> | void;
  onUpdateSignature: (value: string) => Promise<void> | void;
  onOpenTagManager: () => void;
  onLogout: () => void;
};

type SettingsItem = {
  id: string;
  title: string;
  subtitleDefault: string;
  dialog?: SettingsDialog;
};

type SettingsDialog = "display-name" | "signature" | "tag-preferences" | null;

const NAME_MAX_LENGTH = 24;
const SIGNATURE_MAX_LENGTH = 80;

const SETTINGS_ITEMS: SettingsItem[] = [
  {
    id: "display-name",
    title: "修改名字",
    subtitleDefault: "更新你的公开展示名称",
    dialog: "display-name",
  },
  {
    id: "signature",
    title: "修改签名",
    subtitleDefault: "刷新你的个人签名与态度",
    dialog: "signature",
  },
  {
    id: "custom-tags",
    title: "修改自定义标签",
    subtitleDefault: "管理你专属的创作标签",
  },
  {
    id: "install-app",
    title: "添加到主屏幕",
    subtitleDefault: "将 Echo 安装为应用",
  },
];

function Settings({
  onBack,
  displayName,
  signature,
  userEmail,
  onUpdateDisplayName,
  onUpdateSignature,
  onOpenTagManager,
  onLogout,
}: SettingsProps) {
  const [activeDialog, setActiveDialog] = useState<SettingsDialog>(null);
  const [draftValue, setDraftValue] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [tagPreferences, setTagPreferences] = useState<TagPreferences>(getDefaultTagPreferences);
  const [pwaInstalled, setPwaInstalled] = useState(isPWAInstalled());
  const [userInfo, setUserInfo] = useState<{
    email: string | null;
    dateJoined: string | null;
  }>({
    email: userEmail,
    dateJoined: null,
  });

  const currentItem = useMemo(() => {
    if (!activeDialog) {
      return null;
    }
    return SETTINGS_ITEMS.find((item) => item.id === activeDialog) ?? null;
  }, [activeDialog]);

  const handleCloseDialog = useCallback(() => {
    setActiveDialog(null);
    setDraftValue("");
    setValidationMessage("");
    setSaving(false);
  }, []);

  const handleOpenDialog = useCallback(
    (dialog: SettingsDialog) => {
      if (!dialog) {
        return;
      }

      if (dialog === "display-name") {
        setDraftValue(displayName);
        setValidationMessage("");
      } else if (dialog === "signature") {
        setDraftValue(signature);
        setValidationMessage("");
      }
      setActiveDialog(dialog);
    },
    [displayName, signature],
  );

  const handleSaveDialog = useCallback(async () => {
    if (!activeDialog) {
      return;
    }

    const trimmed = draftValue.trim();
    if (trimmed.length === 0) {
      setValidationMessage("内容不能为空");
      return;
    }

    try {
      setSaving(true);
      if (activeDialog === "display-name") {
        await onUpdateDisplayName(trimmed);
      } else if (activeDialog === "signature") {
        await onUpdateSignature(trimmed);
      }
      handleCloseDialog();
    } catch (error) {
      console.warn("[Echo] Failed to update settings:", error);
      setValidationMessage("保存失败，请稍后再试。");
      setSaving(false);
    }
  }, [activeDialog, draftValue, handleCloseDialog, onUpdateDisplayName, onUpdateSignature]);

  const handleItemClick = useCallback(
    (item: SettingsItem) => {
      if (item.id === "custom-tags") {
        onOpenTagManager();
        return;
      }
      if (item.id === "install-app") {
        handleInstallClick()
          .then(() => {
            // 检查安装状态
            setTimeout(() => {
              setPwaInstalled(isPWAInstalled());
            }, 500);
          })
          .catch((error) => {
            console.warn("[Echo] Failed to handle install click:", error);
          });
        return;
      }
      if (item.dialog) {
        handleOpenDialog(item.dialog);
        return;
      }

      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`"${item.title}" 功能即将上线，敬请期待。`);
      } else {
        console.info("[Echo] Settings action requested:", item.id);
      }
    },
    [handleOpenDialog, onOpenTagManager],
  );

  const dialogMaxLength = activeDialog === "signature" ? SIGNATURE_MAX_LENGTH : NAME_MAX_LENGTH;

  const items = useMemo(() => {
    return SETTINGS_ITEMS.map((item) => {
      if (item.id === "display-name") {
        return {
          ...item,
          subtitle: displayName ? `当前：${displayName}` : item.subtitleDefault,
        };
      }
      if (item.id === "signature") {
        return {
          ...item,
          subtitle: signature ? `当前：${signature}` : item.subtitleDefault,
        };
      }
      if (item.id === "custom-tags") {
        const totalCount = tagPreferences.customTags.length;
        let subtitle = `共有 ${totalCount} 个标签`;
        if (totalCount === 0) {
          subtitle = "暂无标签，请先添加";
        }

        return {
          ...item,
          subtitle,
        };
      }
      if (item.id === "install-app") {
        return {
          ...item,
          subtitle: pwaInstalled ? "已安装到主屏幕" : item.subtitleDefault,
        };
      }
      return { ...item, subtitle: item.subtitleDefault };
    });
  }, [displayName, signature, tagPreferences, pwaInstalled]);

  useEffect(() => {
    const refresh = () => {
      const latest = loadTagPreferences(userEmail);
      setTagPreferences(latest);
    };

    refresh();

    if (typeof window === "undefined") {
      return;
    }

    const handleTagChange = () => {
      refresh();
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith("echo.tag-preferences.")) {
        return;
      }
      refresh();
    };

    window.addEventListener(TAG_PREFERENCES_CHANGED_EVENT, handleTagChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(TAG_PREFERENCES_CHANGED_EVENT, handleTagChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [userEmail]);

  useEffect(() => {
    async function loadUserInfo() {
      try {
        const user = await fetchCurrentUser();
        setUserInfo({
          email: user.email,
          dateJoined: user.date_joined,
        });
      } catch (error) {
        console.warn("[Echo] Failed to fetch user info:", error);
      }
    }
    loadUserInfo();
  }, []);

  const dialogFooter = useMemo(() => {
    return (
      <footer className="settings-dialog__footer">
        <button
          type="button"
          className="settings-dialog__button settings-dialog__button--ghost"
          onClick={handleCloseDialog}
        >
          取消
        </button>
        <button
          type="button"
          className="settings-dialog__button settings-dialog__button--primary"
          onClick={handleSaveDialog}
          disabled={saving}
        >
          确认
        </button>
      </footer>
    );
  }, [handleCloseDialog, handleSaveDialog, saving]);

  return (
    <div className="settings-page">
      <div className="settings-page__bg">
        <div className="settings-page__glow settings-page__glow--mint" />
        <div className="settings-page__glow settings-page__glow--amber" />
        <div className="settings-page__line settings-page__line--left" />
        <div className="settings-page__line settings-page__line--right" />
      </div>

      <TopNav
        title="设置"
        subtitle="Settings"
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: "arrow_back_ios_new",
          label: "返回",
          onClick: onBack,
        }}
      />

      <main className="settings-page__content">
        <section className="settings-page__section">
          <header className="settings-page__section-header">
            <h2>账户与个性化</h2>
            <p>在这里调整个人资料的展示方式</p>
          </header>
          <div className="settings-page__card">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="settings-page__item"
                onClick={() => handleItemClick(item)}
              >
                <div className="settings-page__item-text">
                  <span className="settings-page__item-title">{item.title}</span>
                  <span className="settings-page__item-subtitle">{item.subtitle}</span>
                </div>
                <MaterialIcon name="arrow_forward_ios" className="settings-page__item-icon" />
              </button>
            ))}
          </div>
        </section>

        <section className="settings-page__section">
          <header className="settings-page__section-header">
            <h2>账户信息</h2>
            <p>查看您的账户基本信息</p>
          </header>
          <div className="settings-page__card">
            <div className="settings-page__item">
              <div className="settings-page__item-text">
                <span className="settings-page__item-title">注册邮箱</span>
                <span className="settings-page__item-subtitle">
                  {userInfo.email || "加载中..."}
                </span>
              </div>
            </div>
            <div className="settings-page__item">
              <div className="settings-page__item-text">
                <span className="settings-page__item-title">注册日期</span>
                <span className="settings-page__item-subtitle">
                  {userInfo.dateJoined
                    ? new Date(userInfo.dateJoined).toLocaleDateString("zh-CN", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "加载中..."}
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="settings-page__footer">
        <button type="button" className="settings-page__logout" onClick={onLogout}>
          退出登录
        </button>
      </footer>

      <div className={clsx("settings-dialog", activeDialog && "settings-dialog--open")}>
        <button type="button" className="settings-dialog__backdrop" onClick={handleCloseDialog} />
        <div className="settings-dialog__panel" role="dialog" aria-modal="true">
          <header className="settings-dialog__header">
            <div>
              <h3>{currentItem?.title ?? "编辑"}</h3>
              <p>{currentItem?.subtitleDefault ?? "自定义你的个人资料信息。"}</p>
            </div>
            <button
              type="button"
              className="settings-dialog__icon-button"
              onClick={handleCloseDialog}
              aria-label="关闭"
            >
              <MaterialIcon name="close" className="settings-dialog__icon" />
            </button>
          </header>

          <div className="settings-dialog__body">
            {activeDialog === "signature" ? (
              <>
                <textarea
                  value={draftValue}
                  onChange={(event) => {
                    setDraftValue(event.target.value);
                    if (validationMessage) {
                      setValidationMessage("");
                    }
                  }}
                  maxLength={dialogMaxLength}
                  placeholder="写下你的灵感与座右铭..."
                  className="settings-dialog__textarea"
                />
                <div className="settings-dialog__meta">
                  <span className={validationMessage ? "settings-dialog__error" : undefined}>
                    {validationMessage || "字符长度限制内即可保存。"}
                  </span>
                  <span className="settings-dialog__counter">
                    {draftValue.length}/{dialogMaxLength}
                  </span>
                </div>
              </>
            ) : activeDialog === "display-name" ? (
              <>
                <input
                  value={draftValue}
                  onChange={(event) => {
                    setDraftValue(event.target.value);
                    if (validationMessage) {
                      setValidationMessage("");
                    }
                  }}
                  maxLength={dialogMaxLength}
                  placeholder="输入新的名字"
                  className="settings-dialog__input"
                />
                <div className="settings-dialog__meta">
                  <span className={validationMessage ? "settings-dialog__error" : undefined}>
                    {validationMessage || "字符长度限制内即可保存。"}
                  </span>
                  <span className="settings-dialog__counter">
                    {draftValue.length}/{dialogMaxLength}
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {dialogFooter}
        </div>
      </div>
    </div>
  );
}

export default Settings;

