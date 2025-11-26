import { useEffect, useMemo, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import { listAdminUsers, getAdminUserMonthlyReport, type AdminUser, type AdminMonthlyReportData } from "@/admin/api";
import FullMonthlyReport from "@/pages/reports/FullMonthlyReport";
import LightweightMonthlyReport from "@/pages/reports/LightweightMonthlyReport";

import "../styles/MonthlyReportViewer.css";

type ReportVersion = "full" | "lightweight";

function MonthlyReportViewer() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [reportVersion, setReportVersion] = useState<ReportVersion>("full");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<AdminMonthlyReportData | null>(null);
  const [showReport, setShowReport] = useState(false);

  // 加载用户列表
  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      try {
        const data = await listAdminUsers();
        if (!cancelled) {
          setUsers(data);
          if (data.length > 0 && !selectedUserId) {
            setSelectedUserId(data[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (isAxiosError(err)) {
            setError(err.response?.data?.detail || "加载用户列表失败");
          } else {
            setError("加载用户列表失败");
          }
        }
      }
    };

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, [selectedUserId]);

  // 生成年份选项（最近3年）
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 3 }, (_, i) => currentYear - i);
  }, []);

  // 月份选项
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: `${i + 1}月`,
  }));

  // 加载月报数据
  const handleLoadReport = async () => {
    if (!selectedUserId) {
      setError("请选择用户");
      return;
    }

    setLoading(true);
    setError(null);
    setReportData(null);

    try {
      const data = await getAdminUserMonthlyReport(selectedUserId, selectedYear, selectedMonth);
      setReportData(data);
      setShowReport(true);
    } catch (err) {
      if (isAxiosError(err)) {
        setError(err.response?.data?.detail || "加载月报失败");
      } else {
        setError("加载月报失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="admin-monthly-report-viewer">
      <header className="admin-monthly-report-viewer__header">
        <h2>实时月报查看器</h2>
        <p>选择用户和月份，查看实时计算的月报数据（用于调试）</p>
      </header>

      <div className="admin-monthly-report-viewer__controls">
        <div className="admin-monthly-report-viewer__control-group">
          <label htmlFor="user-select">选择用户</label>
          <select
            id="user-select"
            value={selectedUserId || ""}
            onChange={(e) => setSelectedUserId(Number(e.target.value) || null)}
            className="admin-monthly-report-viewer__select"
          >
            <option value="">-- 请选择用户 --</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email} {user.first_name || user.last_name ? `(${user.first_name || ""} ${user.last_name || ""})`.trim() : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-monthly-report-viewer__control-group">
          <label htmlFor="year-select">年份</label>
          <select
            id="year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="admin-monthly-report-viewer__select"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}年
              </option>
            ))}
          </select>
        </div>

        <div className="admin-monthly-report-viewer__control-group">
          <label htmlFor="month-select">月份</label>
          <select
            id="month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="admin-monthly-report-viewer__select"
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-monthly-report-viewer__control-group">
          <label htmlFor="version-select">月报版本</label>
          <select
            id="version-select"
            value={reportVersion}
            onChange={(e) => setReportVersion(e.target.value as ReportVersion)}
            className="admin-monthly-report-viewer__select"
          >
            <option value="full">完整版月报</option>
            <option value="lightweight">轻量版月报</option>
          </select>
        </div>

        <button
          type="button"
          onClick={handleLoadReport}
          disabled={loading || !selectedUserId}
          className="admin-monthly-report-viewer__load-button"
        >
          {loading ? "加载中..." : "查看月报"}
        </button>
      </div>

      {error && (
        <div className="admin-monthly-report-viewer__error">
          <MaterialIcon name="error" />
          <span>{error}</span>
        </div>
      )}

      {reportData && reportData.exists && (
        <div className="admin-monthly-report-viewer__info">
          <p>
            <strong>用户:</strong> {reportData.user?.email || selectedUser?.email}
          </p>
          <p>
            <strong>月份:</strong> {reportData.year}年{reportData.month}月
          </p>
          {reportData.stats && (
            <div className="admin-monthly-report-viewer__stats-preview">
              <div className="admin-monthly-report-viewer__stat-item">
                <span className="admin-monthly-report-viewer__stat-label">总上传数:</span>
                <span className="admin-monthly-report-viewer__stat-value">{reportData.stats.totalUploads}</span>
              </div>
              <div className="admin-monthly-report-viewer__stat-item">
                <span className="admin-monthly-report-viewer__stat-label">总时长:</span>
                <span className="admin-monthly-report-viewer__stat-value">{reportData.stats.totalHours.toFixed(1)} 小时</span>
              </div>
              <div className="admin-monthly-report-viewer__stat-item">
                <span className="admin-monthly-report-viewer__stat-label">平均时长:</span>
                <span className="admin-monthly-report-viewer__stat-value">{reportData.stats.avgHoursPerUpload.toFixed(1)} 小时/张</span>
              </div>
              <div className="admin-monthly-report-viewer__stat-item">
                <span className="admin-monthly-report-viewer__stat-label">平均评分:</span>
                <span className="admin-monthly-report-viewer__stat-value">{reportData.stats.avgRating.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {showReport && reportData && reportData.exists && selectedUserId && (
        <>
          {reportVersion === "full" ? (
            <FullMonthlyReport
              open={showReport}
              onClose={() => setShowReport(false)}
              targetMonth={`${reportData.year}-${String(reportData.month).padStart(2, "0")}`}
              adminUserId={selectedUserId}
            />
          ) : (
            <LightweightMonthlyReport
              open={showReport}
              onClose={() => setShowReport(false)}
              targetMonth={`${reportData.year}-${String(reportData.month).padStart(2, "0")}`}
              adminUserId={selectedUserId}
            />
          )}
        </>
      )}
    </div>
  );
}

export default MonthlyReportViewer;

