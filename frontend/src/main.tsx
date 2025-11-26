// StrictMode 已注释，不需要导入
import { createRoot } from "react-dom/client";
import "@fontsource/manrope/200.css";
import "@fontsource/manrope/300.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/material-symbols-outlined/index.css";
import "./index.css";
import App from "./App.tsx";

// 开发模式下检查 PWA 配置
if (import.meta.env.DEV) {
  import("./utils/pwaCheck").then(({ logPWADiagnostics }) => {
    // 等待 Service Worker 注册完成后再检查
    setTimeout(async () => {
      await logPWADiagnostics();
    }, 3000);
  });
}

createRoot(document.getElementById("root")!).render(
  // 暂时禁用 StrictMode，避免开发环境双重渲染导致频繁请求
  // <StrictMode>
    <App />
  // </StrictMode>,
);
