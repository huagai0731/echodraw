import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import ErrorBoundary from "@/components/ErrorBoundary";
import MaterialIcon from "@/components/MaterialIcon";

// 懒加载用户应用
const UserApp = lazy(() => import("@/UserApp"));

// 懒加载管理后台组件
const AdminLayout = lazy(() => import("@/admin/AdminLayout"));
const AdminLogin = lazy(() => import("@/admin/AdminLogin"));
const HomeContentPage = lazy(() => import("@/admin/pages/HomeContent"));
const MonthlyReportTemplatesPage = lazy(() => import("@/admin/pages/MonthlyReportTemplates"));
const MonthlyReportViewerPage = lazy(() => import("@/admin/pages/MonthlyReportViewer"));
const NotificationsPage = lazy(() => import("@/admin/pages/Notifications"));
const TestAccountsPage = lazy(() => import("@/admin/pages/TestAccounts"));
const TestAccountDetailPage = lazy(() => import("@/admin/pages/TestAccountDetail"));
const ShortTermTaskPresetsPage = lazy(() => import("@/admin/pages/ShortTermTaskPresets"));
const TestManagementPage = lazy(() => import("@/admin/pages/TestManagement"));
const DailyQuizPage = lazy(() => import("@/admin/pages/DailyQuiz"));
const LongTermCopyPage = lazy(() => import("@/admin/pages/LongTermCopy"));

// 加载占位符组件
function LoadingFallback() {
  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center", 
      justifyContent: "center", 
      minHeight: "100vh",
      gap: "1rem"
    }}>
      <MaterialIcon name="hourglass_empty" style={{ fontSize: "3rem", animation: "spin 1s linear infinite" }} />
      <p>加载中...</p>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary
      fallback={
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h1>出现了一些问题</h1>
          <p>应用遇到了错误，请刷新页面重试。</p>
          <button onClick={() => window.location.reload()}>刷新页面</button>
        </div>
      }
    >
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="home-content" replace />} />
              <Route path="home-content" element={<HomeContentPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="monthly-report-templates" element={<MonthlyReportTemplatesPage />} />
              <Route path="monthly-report-viewer" element={<MonthlyReportViewerPage />} />
              <Route path="task-presets" element={<ShortTermTaskPresetsPage />} />
              <Route path="long-term-copy" element={<LongTermCopyPage />} />
              <Route path="test-management" element={<TestManagementPage />} />
              <Route path="daily-quiz" element={<DailyQuizPage />} />
              <Route path="test-accounts" element={<TestAccountsPage />} />
              <Route path="test-accounts/:profileId" element={<TestAccountDetailPage />} />
            </Route>
            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="/app/*" element={<UserApp />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
