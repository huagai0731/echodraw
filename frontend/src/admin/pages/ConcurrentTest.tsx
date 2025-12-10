import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { isAxiosError } from "axios";
import MaterialIcon from "@/components/MaterialIcon";
import { API_BASE_URL } from "@/services/api";
import type { UserUploadRecord } from "@/services/api";

import "../styles/ConcurrentTest.css";

type Account = {
  id: string;
  email: string;
  password: string;
  token: string | null;
  status: "idle" | "logging-in" | "logged-in" | "error";
  error?: string;
};

type TestOperation = "upload" | "visual-analysis";

type TaskStatus = {
  accountId: string;
  status: "pending" | "running" | "success" | "error";
  progress: number;
  error?: string;
  result?: any;
  startTime?: number;
  endTime?: number;
};

const STORAGE_KEY = "concurrent-test-accounts";

function ConcurrentTestPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [operation, setOperation] = useState<TestOperation>("upload");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [tasks, setTasks] = useState<Map<string, TaskStatus>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(3); // 最大并发数
  const [requestDelay, setRequestDelay] = useState(200); // 请求间隔（毫秒）

  // 加载保存的账号
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Account[];
        setAccounts(parsed);
      }
    } catch (err) {
      console.error("Failed to load saved accounts:", err);
    }
  }, []);

  // 保存账号到localStorage
  const saveAccounts = useCallback((newAccounts: Account[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newAccounts));
    } catch (err) {
      console.error("Failed to save accounts:", err);
    }
  }, []);

  // 创建带token的axios实例
  const createApiInstance = useCallback((token: string) => {
    const instance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Token ${token}`,
      },
      withCredentials: true,
      timeout: 300000, // 5分钟超时
    });

    // 设置请求拦截器，只在非FormData请求时设置Content-Type
    instance.interceptors.request.use((config) => {
      // 如果是FormData，不设置Content-Type（让浏览器自动设置boundary）
      // 否则设置为application/json
      if (!(config.data instanceof FormData)) {
        config.headers["Content-Type"] = "application/json";
      }
      return config;
    });

    return instance;
  }, []);

  // 登录账号获取token
  const loginAccount = useCallback(async (account: Account): Promise<string> => {
    try {
      const response = await axios.post<{ token: string; user: { email: string } }>(
        `${API_BASE_URL}/auth/login/`,
        {
          email: account.email,
          password: account.password,
        },
        {
          withCredentials: true,
        }
      );
      return response.data.token;
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail || err.response?.data?.error || "登录失败";
        throw new Error(detail);
      }
      throw new Error("登录失败，请检查网络连接");
    }
  }, []);

  // 添加账号
  const handleAddAccount = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!formEmail.trim() || !formPassword.trim()) {
        return;
      }

      const newAccount: Account = {
        id: `${Date.now()}-${Math.random()}`,
        email: formEmail.trim(),
        password: formPassword,
        token: null,
        status: "idle",
      };

      setAccounts((prev) => {
        const updated = [...prev, newAccount];
        saveAccounts(updated);
        return updated;
      });

      setFormEmail("");
      setFormPassword("");

      // 自动登录
      setAccounts((prev) => {
        const account = prev.find((a) => a.id === newAccount.id);
        if (account) {
          account.status = "logging-in";
          return [...prev];
        }
        return prev;
      });

      try {
        const token = await loginAccount(newAccount);
        setAccounts((prev) => {
          const updated = prev.map((a) =>
            a.id === newAccount.id
              ? { ...a, token, status: "logged-in" as const }
              : a
          );
          saveAccounts(updated);
          return updated;
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "登录失败";
        setAccounts((prev) => {
          const updated = prev.map((a) =>
            a.id === newAccount.id
              ? { ...a, status: "error" as const, error: errorMessage }
              : a
          );
          saveAccounts(updated);
          return updated;
        });
      }
    },
    [formEmail, formPassword, loginAccount, saveAccounts]
  );

  // 重新登录账号
  const handleRelogin = useCallback(
    async (accountId: string) => {
      setAccounts((prev) => {
        const updated = prev.map((a) =>
          a.id === accountId ? { ...a, status: "logging-in" as const, error: undefined } : a
        );
        return updated;
      });

      const account = accounts.find((a) => a.id === accountId);
      if (!account) return;

      try {
        const token = await loginAccount(account);
        setAccounts((prev) => {
          const updated = prev.map((a) =>
            a.id === accountId ? { ...a, token, status: "logged-in" as const } : a
          );
          saveAccounts(updated);
          return updated;
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "登录失败";
        setAccounts((prev) => {
          const updated = prev.map((a) =>
            a.id === accountId
              ? { ...a, status: "error" as const, error: errorMessage }
              : a
          );
          saveAccounts(updated);
          return updated;
        });
      }
    },
    [accounts, loginAccount, saveAccounts]
  );

  // 删除账号
  const handleDeleteAccount = useCallback(
    (accountId: string) => {
      setAccounts((prev) => {
        const updated = prev.filter((a) => a.id !== accountId);
        saveAccounts(updated);
        return updated;
      });
      setSelectedAccounts((prev) => {
        const updated = new Set(prev);
        updated.delete(accountId);
        return updated;
      });
    },
    [saveAccounts]
  );

  // 切换账号选择
  const handleToggleAccount = useCallback((accountId: string) => {
    setSelectedAccounts((prev) => {
      const updated = new Set(prev);
      if (updated.has(accountId)) {
        updated.delete(accountId);
      } else {
        updated.add(accountId);
      }
      return updated;
    });
  }, []);

  // 全选/取消全选
  const handleToggleAll = useCallback(() => {
    const loggedInAccounts = accounts.filter((a) => a.status === "logged-in");
    const allSelected = loggedInAccounts.every((a) => selectedAccounts.has(a.id));
    
    setSelectedAccounts(
      allSelected
        ? new Set()
        : new Set(loggedInAccounts.map((a) => a.id))
    );
  }, [accounts, selectedAccounts]);

  // 上传图片
  const uploadImage = useCallback(
    async (account: Account, file: File): Promise<UserUploadRecord> => {
      if (!account.token) {
        throw new Error("账号未登录");
      }

      // 验证文件类型
      if (!file.type.startsWith("image/")) {
        throw new Error("只能上传图片文件");
      }

      // 验证文件大小（最大10MB）
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("文件大小不能超过10MB");
      }

      const apiInstance = createApiInstance(account.token);
      const formData = new FormData();
      formData.append("image", file);
      formData.append("title", `并发测试 - ${new Date().toLocaleString()}`);
      formData.append("description", "");
      formData.append("self_rating", "5");
      formData.append("duration_minutes", "30");

      // 不要手动设置 Content-Type，让浏览器自动设置（包含 boundary）
      // 如果手动设置，会缺少 boundary 参数，导致服务器无法解析
      const response = await apiInstance.post<UserUploadRecord>("/uploads/", formData, {
        timeout: 120000,
      });

      return response.data;
    },
    [createApiInstance]
  );

  // 视觉分析
  const performVisualAnalysis = useCallback(
    async (account: Account, file: File) => {
      if (!account.token) {
        throw new Error("账号未登录");
      }

      const apiInstance = createApiInstance(account.token);
      const formData = new FormData();
      formData.append("image", file);
      formData.append("binary_threshold", "128");

      // 不要手动设置 Content-Type，让浏览器自动设置（包含 boundary）
      const response = await apiInstance.post("/visual-analysis/comprehensive/", formData);

      return response.data;
    },
    [createApiInstance]
  );

  // 执行单个任务
  const executeTask = useCallback(
    async (account: Account, file: File) => {
      const taskId = account.id;
      const startTime = Date.now();

      setTasks((prev) => {
        const updated = new Map(prev);
        updated.set(taskId, {
          accountId: account.id,
          status: "running",
          progress: 0,
          startTime,
        });
        return updated;
      });

      try {
        let result;
        if (operation === "upload") {
          result = await uploadImage(account, file);
        } else {
          result = await performVisualAnalysis(account, file);
        }

        const endTime = Date.now();
        setTasks((prev) => {
          const updated = new Map(prev);
          updated.set(taskId, {
            accountId: account.id,
            status: "success",
            progress: 100,
            result,
            startTime,
            endTime,
          });
          return updated;
        });
      } catch (err) {
        const errorMessage =
          isAxiosError(err) && err.response?.data?.detail
            ? err.response.data.detail
            : err instanceof Error
            ? err.message
            : "操作失败";
        
        const endTime = Date.now();
        setTasks((prev) => {
          const updated = new Map(prev);
          updated.set(taskId, {
            accountId: account.id,
            status: "error",
            progress: 0,
            error: errorMessage,
            startTime,
            endTime,
          });
          return updated;
        });
      }
    },
    [operation, uploadImage, performVisualAnalysis]
  );

  // 控制并发执行的辅助函数
  const executeWithConcurrency = useCallback(
    async <T,>(
      items: T[],
      executor: (item: T, index: number) => Promise<void>,
      concurrency: number,
      delay: number
    ) => {
      if (items.length === 0) return;

      const queue = [...items];
      const running = new Set<Promise<void>>();
      let taskIndex = 0;

      // 处理下一个任务
      const startNext = async (): Promise<void> => {
        while (queue.length > 0) {
          // 等待直到有可用槽位
          while (running.size >= concurrency) {
            await Promise.race(Array.from(running));
          }

          const item = queue.shift();
          if (!item) break;

          const currentIndex = taskIndex++;
          
          // 添加延迟（第一个任务不延迟）
          if (currentIndex > 0 && delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          // 执行任务
          const promise = executor(item, currentIndex)
            .catch((err) => {
              console.error(`Task ${currentIndex} failed:`, err);
            })
            .finally(() => {
              running.delete(promise);
            });

          running.add(promise);
        }
      };

      // 启动多个worker同时处理队列
      const workers: Promise<void>[] = [];
      const workerCount = Math.min(concurrency, items.length);
      for (let i = 0; i < workerCount; i++) {
        workers.push(startNext());
      }

      // 等待所有worker完成
      await Promise.all(workers);
      // 等待所有剩余任务完成
      if (running.size > 0) {
        await Promise.all(Array.from(running));
      }
    },
    []
  );

  // 开始并发测试
  const handleStartTest = useCallback(async () => {
    if (!imageFile || selectedAccounts.size === 0) {
      return;
    }

    setIsRunning(true);
    setTasks(new Map());

    const selectedAccountList = accounts.filter(
      (a) => selectedAccounts.has(a.id) && a.status === "logged-in" && a.token
    );

    try {
      // 使用并发控制和延迟执行
      await executeWithConcurrency(
        selectedAccountList,
        (account) => executeTask(account, imageFile),
        maxConcurrent,
        requestDelay
      );
    } finally {
      setIsRunning(false);
    }
  }, [imageFile, selectedAccounts, accounts, executeTask, maxConcurrent, requestDelay, executeWithConcurrency]);

  // 清空结果
  const handleClearResults = useCallback(() => {
    setTasks(new Map());
  }, []);

  // 统计数据
  const stats = useMemo(() => {
    const taskList = Array.from(tasks.values());
    const success = taskList.filter((t) => t.status === "success").length;
    const error = taskList.filter((t) => t.status === "error").length;
    const running = taskList.filter((t) => t.status === "running").length;
    const durations = taskList
      .filter((t) => t.startTime && t.endTime)
      .map((t) => (t.endTime! - t.startTime!) / 1000);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return { success, error, running, avgDuration, total: taskList.length };
  }, [tasks]);

  const canStart = !isRunning && imageFile && selectedAccounts.size > 0;
  const loggedInAccounts = accounts.filter((a) => a.status === "logged-in");

  return (
    <div className="concurrent-test-page">
      <div className="concurrent-test-page__header">
        <h1>并发测试工具</h1>
        <p className="concurrent-test-page__subtitle">
          同时控制多个账号进行真实的上传或视觉分析操作
        </p>
      </div>

      <div className="concurrent-test-page__content">
        {/* 账号管理区域 */}
        <section className="concurrent-test-section">
          <h2>账号管理</h2>
          <form onSubmit={handleAddAccount} className="concurrent-test-form">
            <div className="concurrent-test-form__row">
              <input
                type="email"
                placeholder="邮箱"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="concurrent-test-input"
              />
              <input
                type="password"
                placeholder="密码"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="concurrent-test-input"
              />
              <button type="submit" className="concurrent-test-button concurrent-test-button--primary">
                添加账号
              </button>
            </div>
          </form>

          <div className="concurrent-test-accounts">
            {accounts.length === 0 ? (
              <p className="concurrent-test-empty">暂无账号，请添加账号</p>
            ) : (
              <>
                <div className="concurrent-test-accounts__header">
                  <label className="concurrent-test-checkbox">
                    <input
                      type="checkbox"
                      checked={
                        loggedInAccounts.length > 0 &&
                        loggedInAccounts.every((a) => selectedAccounts.has(a.id))
                      }
                      onChange={handleToggleAll}
                    />
                    <span>全选已登录账号</span>
                  </label>
                  <span className="concurrent-test-accounts__count">
                    {accounts.length} 个账号 ({loggedInAccounts.length} 个已登录)
                  </span>
                </div>
                <div className="concurrent-test-accounts__list">
                  {accounts.map((account) => {
                    const task = tasks.get(account.id);
                    return (
                      <div
                        key={account.id}
                        className={`concurrent-test-account ${
                          selectedAccounts.has(account.id) ? "concurrent-test-account--selected" : ""
                        }`}
                      >
                        <label className="concurrent-test-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedAccounts.has(account.id)}
                            onChange={() => handleToggleAccount(account.id)}
                            disabled={account.status !== "logged-in"}
                          />
                          <span>{account.email}</span>
                        </label>
                        <div className="concurrent-test-account__status">
                          {account.status === "logging-in" && (
                            <span className="concurrent-test-status concurrent-test-status--loading">
                              登录中...
                            </span>
                          )}
                          {account.status === "logged-in" && (
                            <span className="concurrent-test-status concurrent-test-status--success">
                              已登录
                            </span>
                          )}
                          {account.status === "error" && (
                            <span className="concurrent-test-status concurrent-test-status--error">
                              {account.error || "登录失败"}
                            </span>
                          )}
                          {account.status === "idle" && (
                            <span className="concurrent-test-status">未登录</span>
                          )}
                          {task && (
                            <span
                              className={`concurrent-test-task-status concurrent-test-task-status--${task.status}`}
                            >
                              {task.status === "running" && "执行中"}
                              {task.status === "success" && "成功"}
                              {task.status === "error" && "失败"}
                              {task.startTime && task.endTime && (
                                <span className="concurrent-test-duration">
                                  ({(task.endTime - task.startTime) / 1000}s)
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="concurrent-test-account__actions">
                          {account.status === "error" && (
                            <button
                              onClick={() => handleRelogin(account.id)}
                              className="concurrent-test-button concurrent-test-button--small"
                            >
                              重试登录
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteAccount(account.id)}
                            className="concurrent-test-button concurrent-test-button--small concurrent-test-button--danger"
                          >
                            <MaterialIcon name="delete" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        {/* 操作配置区域 */}
        <section className="concurrent-test-section">
          <h2>操作配置</h2>
          <div className="concurrent-test-operation">
            <label className="concurrent-test-radio-group">
              <input
                type="radio"
                name="operation"
                value="upload"
                checked={operation === "upload"}
                onChange={(e) => setOperation(e.target.value as TestOperation)}
              />
              <span>上传图片</span>
            </label>
            <label className="concurrent-test-radio-group">
              <input
                type="radio"
                name="operation"
                value="visual-analysis"
                checked={operation === "visual-analysis"}
                onChange={(e) => setOperation(e.target.value as TestOperation)}
              />
              <span>视觉分析</span>
            </label>
          </div>

          <div className="concurrent-test-file-selector">
            <label className="concurrent-test-file-label">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                className="concurrent-test-file-input"
              />
              <span className="concurrent-test-file-button">
                {imageFile ? imageFile.name : "选择图片文件"}
              </span>
            </label>
            {imageFile && (
              <button
                onClick={() => setImageFile(null)}
                className="concurrent-test-button concurrent-test-button--small"
              >
                清除
              </button>
            )}
          </div>

          <div className="concurrent-test-concurrency-settings">
            <div className="concurrent-test-setting">
              <label className="concurrent-test-setting__label">
                最大并发数
                <span className="concurrent-test-setting__hint">
                  （SQLite建议1-3，MySQL/PostgreSQL可更高）
                </span>
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                className="concurrent-test-input concurrent-test-input--number"
                disabled={isRunning}
              />
            </div>
            <div className="concurrent-test-setting">
              <label className="concurrent-test-setting__label">
                请求间隔（毫秒）
                <span className="concurrent-test-setting__hint">
                  （避免数据库锁定，建议200-500ms）
                </span>
              </label>
              <input
                type="number"
                min="0"
                max="5000"
                step="100"
                value={requestDelay}
                onChange={(e) => setRequestDelay(Math.max(0, Math.min(5000, parseInt(e.target.value) || 0)))}
                className="concurrent-test-input concurrent-test-input--number"
                disabled={isRunning}
              />
            </div>
          </div>

          <div className="concurrent-test-actions">
            <button
              onClick={handleStartTest}
              disabled={!canStart}
              className="concurrent-test-button concurrent-test-button--primary concurrent-test-button--large"
            >
              {isRunning ? "执行中..." : `开始测试 (${selectedAccounts.size} 个账号)`}
            </button>
            {tasks.size > 0 && (
              <button
                onClick={handleClearResults}
                className="concurrent-test-button"
              >
                清空结果
              </button>
            )}
          </div>
        </section>

        {/* 统计和结果区域 */}
        {(tasks.size > 0 || isRunning) && (
          <section className="concurrent-test-section">
            <h2>测试结果</h2>
            <div className="concurrent-test-stats">
              <div className="concurrent-test-stat">
                <span className="concurrent-test-stat__label">总计</span>
                <span className="concurrent-test-stat__value">{stats.total}</span>
              </div>
              <div className="concurrent-test-stat">
                <span className="concurrent-test-stat__label">成功</span>
                <span className="concurrent-test-stat__value concurrent-test-stat__value--success">
                  {stats.success}
                </span>
              </div>
              <div className="concurrent-test-stat">
                <span className="concurrent-test-stat__label">失败</span>
                <span className="concurrent-test-stat__value concurrent-test-stat__value--error">
                  {stats.error}
                </span>
              </div>
              <div className="concurrent-test-stat">
                <span className="concurrent-test-stat__label">进行中</span>
                <span className="concurrent-test-stat__value concurrent-test-stat__value--running">
                  {stats.running}
                </span>
              </div>
              {stats.avgDuration > 0 && (
                <div className="concurrent-test-stat">
                  <span className="concurrent-test-stat__label">平均耗时</span>
                  <span className="concurrent-test-stat__value">
                    {stats.avgDuration.toFixed(2)}s
                  </span>
                </div>
              )}
            </div>

            <div className="concurrent-test-results">
              {Array.from(tasks.entries()).map(([accountId, task]) => {
                const account = accounts.find((a) => a.id === accountId);
                if (!account) return null;

                return (
                  <div
                    key={accountId}
                    className={`concurrent-test-result concurrent-test-result--${task.status}`}
                  >
                    <div className="concurrent-test-result__header">
                      <span className="concurrent-test-result__email">{account.email}</span>
                      <span
                        className={`concurrent-test-result__status concurrent-test-result__status--${task.status}`}
                      >
                        {task.status === "pending" && "等待中"}
                        {task.status === "running" && "执行中"}
                        {task.status === "success" && "成功"}
                        {task.status === "error" && "失败"}
                      </span>
                    </div>
                    {task.error && (
                      <div className="concurrent-test-result__error">{task.error}</div>
                    )}
                    {task.startTime && task.endTime && (
                      <div className="concurrent-test-result__time">
                        耗时: {((task.endTime - task.startTime) / 1000).toFixed(2)}s
                      </div>
                    )}
                    {task.result && (
                      <details className="concurrent-test-result__details">
                        <summary>查看结果</summary>
                        <pre className="concurrent-test-result__json">
                          {JSON.stringify(task.result, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default ConcurrentTestPage;

