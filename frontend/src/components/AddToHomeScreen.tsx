import { useEffect, useState } from "react";
import MaterialIcon from "@/components/MaterialIcon";
import { 
  handleInstallClick as triggerInstall, 
  isPWAInstalled, 
  autoInstallPWA,
  getDeferredPrompt 
} from "@/utils/pwaInstall";
import "./AddToHomeScreen.css";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function AddToHomeScreen() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 检查是否已经安装
    if (isPWAInstalled()) {
      setIsInstalled(true);
      return;
    }

    // 检查是否已经关闭过提示
    const dismissedKey = "echo-pwa-install-dismissed";
    const wasDismissed = localStorage.getItem(dismissedKey) === "true";
    if (wasDismissed) {
      setDismissed(true);
    }

    // 检查是否已经有可用的安装提示（工具函数中已经捕获）
    const checkAndAutoInstall = () => {
      const prompt = getDeferredPrompt();
      if (prompt) {
        setDeferredPrompt(prompt);
        
        // 如果用户没有关闭过提示，自动触发安装
        if (!wasDismissed) {
          // 延迟一小段时间，确保页面已经加载完成
          setTimeout(async () => {
            const installed = await autoInstallPWA();
            if (installed) {
              console.log("自动安装成功");
              setIsInstalled(true);
              setShowPrompt(false);
            } else {
              // 如果自动安装失败或用户取消，显示横幅让用户手动点击
              setShowPrompt(true);
            }
          }, 1000); // 1秒后自动触发
        } else {
          // 如果用户之前关闭过，只显示横幅
          setShowPrompt(true);
        }
      }
    };

    // 立即检查一次（可能事件已经触发）
    checkAndAutoInstall();

    // 监听 beforeinstallprompt 事件（作为备用，工具函数中已经处理了）
    const handleBeforeInstallPrompt = () => {
      checkAndAutoInstall();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 监听 appinstalled 事件
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    // 如果没有 beforeinstallprompt 事件，但在移动设备上，也显示提示
    // 这主要针对 iOS Safari，它不支持 beforeinstallprompt
    const timer = setTimeout(() => {
      if (!deferredPrompt && !isInstalled && !wasDismissed) {
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobile = /iphone|ipad|ipod|android/.test(userAgent);
        if (isMobile) {
          setShowPrompt(true);
        }
      }
    }, 3000); // 3秒后显示，给 beforeinstallprompt 事件足够的时间

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      clearTimeout(timer);
    };
  }, [deferredPrompt, isInstalled]);

  const handleInstallClick = async () => {
    await triggerInstall();
    setShowPrompt(false);
  };

  if (isInstalled || (!showPrompt && dismissed)) {
    return null;
  }

  return (
    <div className="add-to-home-screen-banner">
      <div className="add-to-home-screen-content">
        <MaterialIcon name="download" className="add-to-home-screen-icon" />
        <div className="add-to-home-screen-text">
          <div className="add-to-home-screen-title">添加到主屏幕</div>
          <div className="add-to-home-screen-subtitle">像应用一样使用 Echo</div>
        </div>
      </div>
      <button
        type="button"
        className="add-to-home-screen-button"
        onClick={handleInstallClick}
      >
        安装
      </button>
      <button
        type="button"
        className="add-to-home-screen-close"
        onClick={() => {
          setShowPrompt(false);
          setDismissed(true);
          localStorage.setItem("echo-pwa-install-dismissed", "true");
        }}
        aria-label="关闭"
      >
        <MaterialIcon name="close" />
      </button>
    </div>
  );
}

export default AddToHomeScreen;

