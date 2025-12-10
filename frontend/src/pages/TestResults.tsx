import { useEffect, useState, useCallback, useMemo } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav, { type TopNavAction } from "@/components/TopNav";
import { fetchUserTestResult, fetchUserTestDetail, deleteUserTestResult, type UserTestResult, type UserTestDetail } from "@/services/api";

import "./TestResults.css";
import "./ArtworkDetails.css";

type TestResultsProps = {
  resultId: number;
  onBack: () => void;
};

function TestResults({ resultId, onBack }: TestResultsProps) {
  const [result, setResult] = useState<UserTestResult | null>(null);
  const [test, setTest] = useState<UserTestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const loadResult = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const resultData = await fetchUserTestResult(resultId);
        setResult(resultData);
        
        // 尝试通过test_id获取测试详情
        if (resultData && resultData.test_id) {
          try {
            const testDetail = await fetchUserTestDetail(resultData.test_id);
            setTest(testDetail);
          } catch (err) {
            console.warn("[TestResults] Failed to load test detail:", err);
          }
        }
      } catch (err) {
        console.error("[TestResults] Failed to load result:", err);
        if (isAxiosError(err)) {
          setError("加载测试结果失败，请稍后重试");
        } else {
          setError("加载测试结果失败");
        }
      } finally {
        setLoading(false);
      }
    };

    loadResult();
  }, [resultId]);

  // 格式化日期
  const formatDate = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch {
      return dateString;
    }
  }, []);

  const handleToggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!result || isDeleting) return;
    
    setIsDeleting(true);
    try {
      await deleteUserTestResult(resultId);
      setShowDeleteConfirm(false);
      onBack(); // 删除成功后返回
    } catch (err) {
      console.error("[TestResults] Failed to delete result:", err);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert("删除失败，请稍后重试");
      }
    } finally {
      setIsDeleting(false);
    }
  }, [result, resultId, isDeleting, onBack]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        target.closest(".test-results-menu") ||
        target.closest(".test-results-menu__trigger")
      ) {
        return;
      }
      setMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!showDeleteConfirm) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDeleteConfirm(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [showDeleteConfirm]);

  const topNavActions = useMemo<TopNavAction[]>(
    () => [
      {
        icon: "more_vert",
        label: "更多操作",
        onClick: handleToggleMenu,
        className: "test-results-menu__trigger",
      },
    ],
    [handleToggleMenu],
  );

  // 获取维度信息
  const dimensions = test?.dimensions || [];
  const dimensionScores = result?.dimension_scores || {};

  if (loading) {
    return (
      <div className="test-results">
        <TopNav
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onBack,
          }}
          title="测试结果"
        />
        <div className="test-results__loading">加载中...</div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="test-results">
        <TopNav
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onBack,
          }}
          title="测试结果"
        />
        <div className="test-results__error">{error || "未找到测试结果"}</div>
      </div>
    );
  }

  return (
    <div className="test-results">
      <div className="test-results__topbar">
        <TopNav
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onBack,
          }}
          title="测试结果"
          trailingActions={topNavActions}
        />
        {menuOpen ? (
          <div className="test-results-menu artwork-details-menu" role="menu">
            <button
              type="button"
              className="artwork-details-menu__item"
              onClick={() => {
                setMenuOpen(false);
                setShowDeleteConfirm(true);
              }}
            >
              <MaterialIcon name="delete" className="artwork-details-menu__icon artwork-details-menu__icon--danger" />
              删除报告
            </button>
          </div>
        ) : null}
      </div>

      <div className="test-results__content">
        <div className="test-results__header">
          <h1 className="test-results__title">{result.test_name}</h1>
          <p className="test-results__date">完成时间：{formatDate(result.completed_at)}</p>
        </div>

        <div className="test-results__dimensions">
          <h2 className="test-results__dimensions-title">各维度得分</h2>
          
          {dimensions.length > 0 ? (
            <div className="test-results__dimensions-list">
              {dimensions.map((dimension) => {
                // 从dimension_scores中获取两个端点的得分
                const endpointAScore = dimensionScores[dimension.endpoint_a_code] || 0;
                const endpointBScore = dimensionScores[dimension.endpoint_b_code] || 0;
                
                // 计算维度总分（两个端点得分之和）
                const totalScore = endpointAScore + endpointBScore;
                
                // 计算百分比：根据两个端点的得分比例
                // 如果总分为0，则显示50%（中间）
                const total = endpointAScore + endpointBScore;
                let percentage = 50; // 默认中间
                if (total !== 0) {
                  // 端点A得分占总分的比例，映射到0-100%
                  percentage = (endpointAScore / total) * 100;
                } else if (endpointAScore > endpointBScore) {
                  percentage = 100; // 只有A有得分
                } else if (endpointBScore > endpointAScore) {
                  percentage = 0; // 只有B有得分
                }
                
                // 判断偏向哪个端点（端点A得分高偏向A，端点B得分高偏向B）
                const isEndpointA = endpointAScore >= endpointBScore;
                const endpoint = isEndpointA ? dimension.endpoint_a_name : dimension.endpoint_b_name;
                const endpointCode = isEndpointA ? dimension.endpoint_a_code : dimension.endpoint_b_code;
                
                return (
                  <div key={dimension.id} className="test-results__dimension-card">
                    <div className="test-results__dimension-header">
                      <h3 className="test-results__dimension-name">{dimension.name}</h3>
                      <div className="test-results__dimension-score">
                        <span className="test-results__dimension-score-value">{totalScore}</span>
                        <span className="test-results__dimension-score-label">分</span>
                      </div>
                    </div>
                    
                    <div className="test-results__dimension-scores-detail">
                      <span className="test-results__dimension-score-item">
                        {dimension.endpoint_a_name} ({dimension.endpoint_a_code}): {endpointAScore}分
                      </span>
                      <span className="test-results__dimension-score-item">
                        {dimension.endpoint_b_name} ({dimension.endpoint_b_code}): {endpointBScore}分
                      </span>
                    </div>
                    
                    {dimension.description && (
                      <p className="test-results__dimension-description">{dimension.description}</p>
                    )}
                    
                    <div className="test-results__dimension-scale">
                      <div className="test-results__dimension-scale-labels">
                        <span className="test-results__dimension-scale-label">
                          {dimension.endpoint_a_name} ({dimension.endpoint_a_code})
                        </span>
                        <span className="test-results__dimension-scale-label">
                          {dimension.endpoint_b_name} ({dimension.endpoint_b_code})
                        </span>
                      </div>
                      
                      <div className="test-results__dimension-scale-bar">
                        <div
                          className="test-results__dimension-scale-fill"
                          style={{ left: `${percentage}%` }}
                        />
                        <div
                          className="test-results__dimension-scale-indicator"
                          style={{ left: `${percentage}%` }}
                        />
                      </div>
                      
                      <div className="test-results__dimension-result">
                        <span className="test-results__dimension-result-label">偏向：</span>
                        <span className="test-results__dimension-result-value">
                          {endpoint} ({endpointCode})
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="test-results__no-dimensions">
              <p>暂无维度信息</p>
            </div>
          )}
        </div>

        <div className="test-results__actions">
          <button
            type="button"
            className="test-results__button test-results__button--primary"
            onClick={onBack}
          >
            返回测试列表
          </button>
        </div>
      </div>

      {showDeleteConfirm ? (
        <div className="artwork-delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="artwork-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="artwork-delete-confirm-title">要删除这份报告吗？</h2>
            <div className="artwork-delete-confirm-content">
              <p className="artwork-delete-confirm-text">
                删除后，这份测试结果将无法恢复。
              </p>
              <p className="artwork-delete-confirm-text artwork-delete-confirm-text--highlight">
                确认要删除吗？
              </p>
            </div>
            <div className="artwork-delete-confirm-actions">
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                type="button"
                className="artwork-delete-confirm-button artwork-delete-confirm-button--confirm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TestResults;

