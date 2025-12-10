import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import MaterialIcon from "@/components/MaterialIcon";
import { AUTH_CHANGED_EVENT, AUTH_STORAGE_KEY, fetchCurrentUser, setAuthToken } from "@/services/api";

import "./AdminLayout.css";

type AdminUser = {
  email: string;
  first_name: string | null;
  last_name: string | null;
};

const NAV_ITEMS = [
  { to: "home-content", label: "首页文案", description: "历史上的今天、用户行为文案、通用文案" },
  { to: "monthly-report-templates", label: "月报文案模板", description: "管理月报各部分的个性化文案模板" },
  { to: "monthly-report-viewer", label: "实时月报查看器", description: "查看任意用户的实时月报数据（调试用）" },
  { to: "task-presets", label: "短期任务预设", description: "维护短期目标的任务模板库" },
  { to: "long-term-copy", label: "长期计划文案", description: "管理时间区间对应的提示文案" },
  { to: "test-management", label: "测试管理", description: "管理测试、题目和选项" },
  { to: "daily-quiz", label: "每日小测", description: "管理每日小测题目和选项" },
  { to: "test-accounts", label: "测试账号", description: "管理测试账号与历史数据" },
  { to: "concurrent-test", label: "并发测试", description: "多账号并发测试工具（上传、视觉分析）" },
  { to: "orders", label: "订单管理", description: "查看所有支付订单，包括金额、时间、状态等信息" },
];

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const logoutTimerRef = useRef<number | null>(null);

  const scheduleRedirectToLogin = useCallback(() => {
    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current);
    }
    logoutTimerRef.current = window.setTimeout(() => {
      navigate("/admin/login", { replace: true });
      logoutTimerRef.current = null;
    }, 400);
  }, [navigate]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        setLoading(true);
        const profile = await fetchCurrentUser();
        if (!profile.is_staff) {
          throw new Error("该账号没有后台权限。");
        }
        if (!mounted) {
          return;
        }
        setUser({
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
        });
        setError(null);
      } catch (err) {
        if (!mounted) {
          return;
        }
        setError("需要重新登录后台系统。");
        scheduleRedirectToLogin();
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [navigate, scheduleRedirectToLogin]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ hasToken: boolean }>).detail;
      if (detail?.hasToken) {
        return;
      }
      setUser(null);
      setError("需要重新登录后台系统。");
      setLoading(false);
      scheduleRedirectToLogin();
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged as EventListener);
    };
  }, [scheduleRedirectToLogin]);

  useEffect(() => {
    return () => {
      if (logoutTimerRef.current !== null) {
        window.clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    };
  }, []);

  const activeNav = useMemo(() => {
    const path = location.pathname.replace("/admin/", "");
    if (!path) {
      return "home-content";
    }
    const [first] = path.split("/");
    return NAV_ITEMS.some((item) => item.to === first) ? first : "home-content";
  }, [location.pathname]);

  const activeTitle = useMemo(() => {
    const item = NAV_ITEMS.find((entry) => entry.to === activeNav);
    return item ? item.label : "后台管理";
  }, [activeNav]);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    setAuthToken(null);
    navigate("/admin/login", { replace: true });
  };

  if (loading) {
    return (
      <div className="admin-shell admin-shell--loading">
        <div className="admin-shell__loader">
          <div className="admin-shell__spinner" />
          <p>正在加载后台资源...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-shell admin-shell--loading">
        <div className="admin-shell__loader">
          <MaterialIcon name="lock" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside
        className={`admin-shell__sidebar ${sidebarCollapsed ? "admin-shell__sidebar--collapsed" : ""}`}
      >
        <div className="admin-shell__brand">
          <MaterialIcon name="palette" />
          <div>
            <strong>Echo Admin</strong>
            <span>内容与数据管理</span>
          </div>
        </div>

        <nav className="admin-shell__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `admin-shell__nav-item ${isActive || activeNav === item.to ? "admin-shell__nav-item--active" : ""}`
              }
            >
              <div className="admin-shell__nav-title">{item.label}</div>
              <div className="admin-shell__nav-desc">{item.description}</div>
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="admin-shell__collapse"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
        >
          <MaterialIcon name={sidebarCollapsed ? "chevron_right" : "chevron_left"} />
        </button>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-shell__header">
          <div>
            <h1>{activeTitle}</h1>
            <p>Echo 创作平台内部管理系统</p>
          </div>
          <div className="admin-shell__user">
            <div className="admin-shell__avatar">
              {user?.first_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "A"}
            </div>
            <div className="admin-shell__user-info">
              <strong>{user?.email}</strong>
              <span>后台管理员</span>
            </div>
            <button type="button" className="admin-shell__logout" onClick={handleLogout}>
              <MaterialIcon name="logout" />
              退出
            </button>
          </div>
        </header>

        <main className="admin-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;

