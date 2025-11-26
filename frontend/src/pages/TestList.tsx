import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import { fetchUserTests } from "@/services/api";

// Removed unused import: testCardImage1
import drawtypeImage from "@/assets/drawtype.jpg";
import colortestImage from "@/assets/colortest.jpg";
import ideacardImage from "@/assets/ideacard.jpg";

import "./TestList.css";

type TestListProps = {
  onBack: () => void;
  onSelectTest?: (testId: number) => void;
  onOpenColorPerceptionTest?: () => void;
};

type TestItem = {
  id: string | number;
  title: string;
  description: string;
  resultCount: string;
  imageUrl: string;
  isBackendTest?: boolean;
  backendTestId?: number;
};

const FALLBACK_TEST_ITEMS: TestItem[] = [];

function TestList({ onBack, onSelectTest, onOpenColorPerceptionTest }: TestListProps) {
  const [tests, setTests] = useState<TestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 加载测试列表
        const backendTests = await fetchUserTests().catch(() => []);
        
        // 将后台测试转换为TestItem格式，第一个使用后台测试
        const testItems: TestItem[] = [];
        
        if (backendTests.length > 0) {
          const firstTest = backendTests[0];
          testItems.push({
            id: firstTest.id,
            title: firstTest.name,
            description: firstTest.description || "完成测试以了解你的各个维度得分",
            resultCount: `${firstTest.dimensions.length} 个维度`,
            imageUrl: drawtypeImage,
            isBackendTest: true,
            backendTestId: firstTest.id,
          });
        }
        
        // 添加其他fallback测试
        testItems.push(...FALLBACK_TEST_ITEMS);
        
        setTests(testItems);
        setError(null);
      } catch (err) {
        console.warn("[TestList] Failed to load data:", err);
        if (isAxiosError(err)) {
          const status = err.response?.status;
          if (status === 401 || status === 403) {
            setError("请登录后查看测试列表");
          } else {
            setError("加载测试列表失败，请稍后重试");
          }
        } else {
          setError("加载测试列表失败，请稍后重试");
        }
        // 如果加载失败，使用fallback测试
        setTests(FALLBACK_TEST_ITEMS);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleTestClick = (test: TestItem) => {
    if (test.isBackendTest && test.backendTestId) {
      onSelectTest?.(test.backendTestId);
    } else {
      // 对于非后台测试，使用原来的逻辑
      onSelectTest?.(test.id as number);
    }
  };

  return (
    <div className="test-list">
      <div className="test-list__background">
        <div className="test-list__shape test-list__shape--1" />
        <div className="test-list__shape test-list__shape--2" />
      </div>

      <TopNav
        className="top-nav--fixed top-nav--flush"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onBack,
        }}
        title="测试"
        subtitle="Test"
      />

      <main className="test-list__content">
        <div className="test-list__fixed-cards">
          <button
            type="button"
            className="test-list__fixed-card test-list__fixed-card--vertical"
            onClick={() => onOpenColorPerceptionTest?.()}
          >
            <img
              alt="今日色感小测背景"
              className="test-list__fixed-card-image"
              src={colortestImage}
            />
            <div className="test-list__fixed-card-gradient" />
            <MaterialIcon name="palette" className="test-list__fixed-card-icon" />
            <div className="test-list__fixed-card-text">
              <h3 className="test-list__fixed-card-title">今日色感小测</h3>
            </div>
          </button>
          <button
            type="button"
            className="test-list__fixed-card test-list__fixed-card--vertical"
            onClick={() => {
              // TODO: 打开今日灵感卡片页面
            }}
          >
            <img
              alt="今日灵感卡片背景"
              className="test-list__fixed-card-image"
              src={ideacardImage}
            />
            <div className="test-list__fixed-card-gradient" />
            <MaterialIcon name="lightbulb" className="test-list__fixed-card-icon" />
            <div className="test-list__fixed-card-text">
              <h3 className="test-list__fixed-card-title">今日灵感卡片</h3>
            </div>
          </button>
        </div>
        <div className="test-list__divider" />
        {loading ? (
          <div className="test-list__loading">加载中...</div>
        ) : error ? (
          <div className="test-list__error">{error}</div>
        ) : (
          tests.map((test) => (
            <div key={test.id} className="test-list__card">
              <img
                alt={`Illustrative image for ${test.title} test`}
                className="test-list__card-image"
                src={test.imageUrl}
              />
              <div className="test-list__card-gradient" />
              <div className="test-list__card-content">
                <div className="test-list__card-header">
                  <h2 className="test-list__card-title">{test.title}</h2>
                </div>
                <p className="test-list__card-description">{test.description}</p>
                <p className="test-list__card-result-count">{test.resultCount}</p>
              </div>
              <button
                type="button"
                className="test-list__card-button"
                onClick={() => handleTestClick(test)}
              >
                开始测试
              </button>
            </div>
          ))
        )}
      </main>
    </div>
  );
}

export default TestList;

