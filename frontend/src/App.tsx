import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import UserApp from "@/UserApp";
import AdminLayout from "@/admin/AdminLayout";
import AdminLogin from "@/admin/AdminLogin";
import AchievementsPage from "@/admin/pages/Achievements";
import AchievementGroupsPage from "@/admin/pages/AchievementGroups";
import HomeContentPage from "@/admin/pages/HomeContent";
import MonthlyReportTemplatesPage from "@/admin/pages/MonthlyReportTemplates";
import MonthlyReportViewerPage from "@/admin/pages/MonthlyReportViewer";
import NotificationsPage from "@/admin/pages/Notifications";
import TestAccountsPage from "@/admin/pages/TestAccounts";
import TestAccountDetailPage from "@/admin/pages/TestAccountDetail";
import ShortTermTaskPresetsPage from "@/admin/pages/ShortTermTaskPresets";
import TestManagementPage from "@/admin/pages/TestManagement";
import DailyQuizPage from "@/admin/pages/DailyQuiz";
import LongTermCopyPage from "@/admin/pages/LongTermCopy";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="home-content" replace />} />
          <Route path="home-content" element={<HomeContentPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="monthly-report-templates" element={<MonthlyReportTemplatesPage />} />
          <Route path="monthly-report-viewer" element={<MonthlyReportViewerPage />} />
          <Route path="achievement-groups" element={<AchievementGroupsPage />} />
          <Route path="achievements" element={<AchievementsPage />} />
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
    </BrowserRouter>
  );
}

export default App;
