type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let autoInstallAttempted = false;

// 监听 beforeinstallprompt 事件
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    autoInstallAttempted = false;
  });

  // 安装后清除
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    autoInstallAttempted = false;
  });
}

export function isPWAInstalled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function canInstallPWA(): boolean {
  return deferredPrompt !== null;
}

export async function installPWA(): Promise<boolean> {
  if (!deferredPrompt) {
    return false;
  }

  try {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    autoInstallAttempted = false;
    return outcome === "accepted";
  } catch (error) {
    console.warn("[Echo] Failed to install PWA:", error);
    deferredPrompt = null;
    autoInstallAttempted = false;
    return false;
  }
}

export async function autoInstallPWA(): Promise<boolean> {
  if (!deferredPrompt || autoInstallAttempted) {
    return false;
  }

  autoInstallAttempted = true;
  return await installPWA();
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function showManualInstallInstructions(): void {
  const userAgent = navigator.userAgent.toLowerCase();
  let instructions = "";

  if (/iphone|ipad|ipod/.test(userAgent)) {
    instructions = 'iOS: 点击 Safari 底部的分享按钮，然后选择"添加到主屏幕"';
  } else if (/android/.test(userAgent)) {
    if (/chrome/.test(userAgent)) {
      instructions = 'Android Chrome: 点击浏览器菜单（三个点），选择"添加到主屏幕"';
    } else if (/samsungbrowser/.test(userAgent)) {
      instructions = 'Samsung Internet: 点击菜单，选择"添加到主屏幕"';
    } else if (/firefox/.test(userAgent)) {
      instructions = 'Firefox: 点击菜单，选择"页面" -> "添加到主屏幕"';
    } else {
      instructions = 'Android: 点击浏览器菜单，查找"添加到主屏幕"或"安装应用"选项';
    }
  } else {
    instructions = "请使用移动设备浏览器访问此页面";
  }

  alert(instructions);
}

export async function handleInstallClick(): Promise<void> {
  if (isPWAInstalled()) {
    alert("应用已经安装到主屏幕了！");
    return;
  }

  if (canInstallPWA()) {
    const installed = await installPWA();
    if (installed) {
      console.log("PWA 安装成功");
    } else {
      console.log("用户取消了安装");
    }
  } else {
    showManualInstallInstructions();
  }
}

