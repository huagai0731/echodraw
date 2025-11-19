import { useEffect, useState } from "react";
import { isAxiosError } from "axios";

import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";
import { fetchUserTests } from "@/services/api";

import testCardImage1 from "@/assets/test-card-1.jpg";
import testCardImage2 from "@/assets/test-card-2.jpg";
import testCardImage3 from "@/assets/test-card-3.jpg";

import "./TestList.css";

type TestListProps = {
  onBack: () => void;
  onSelectTest?: (testId: number) => void;
  onOpenPointsRecharge?: () => void;
};

type TestItem = {
  id: string | number;
  title: string;
  description: string;
  points: number;
  resultCount: string;
  imageUrl: string;
  isBackendTest?: boolean;
  backendTestId?: number;
};

const FALLBACK_TEST_ITEMS: TestItem[] = [
  {
    id: "color-palette",
    title: "Color Palette Harmony",
    description: "Find out which color palettes resonate most with your artistic senses.",
    points: 50,
    resultCount: "8 种可能结果",
    imageUrl: testCardImage2,
  },
  {
    id: "artistic-mood",
    title: "Artistic Mood Board",
    description: "A test to determine your current creative mood and suggest inspirational themes.",
    points: 30,
    resultCount: "6 种可能结果",
    imageUrl: testCardImage3,
  },
];

const TOTAL_POINTS = 150;

function TestList({ onBack, onSelectTest, onOpenPointsRecharge }: TestListProps) {
  const [tests, setTests] = useState<TestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTests = async () => {
      try {
        setLoading(true);
        setError(null);
        const backendTests = await fetchUserTests();
        
        // 将后台测试转换为TestItem格式，第一个使用后台测试
        const testItems: TestItem[] = [];
        
        if (backendTests.length > 0) {
          const firstTest = backendTests[0];
          testItems.push({
            id: firstTest.id,
            title: firstTest.name,
            description: firstTest.description || "完成测试以了解你的各个维度得分",
            points: 0,
            resultCount: `${firstTest.dimensions.length} 个维度`,
            imageUrl: testCardImage1,
            isBackendTest: true,
            backendTestId: firstTest.id,
          });
        }
        
        // 添加其他fallback测试
        testItems.push(...FALLBACK_TEST_ITEMS);
        
        setTests(testItems);
        setError(null);
      } catch (err) {
        console.warn("[TestList] Failed to load tests:", err);
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

    loadTests();
  }, []);

  const handleTestClick = (test: TestItem) => {
    if (test.isBackendTest && test.backendTestId) {
      onSelectTest?.(test.backendTestId);
    } else {
      // 对于非后台测试，使用原来的逻辑
      onSelectTest?.(test.id as number);
    }
  };

  const handlePointsClick = () => {
    onOpenPointsRecharge?.();
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
        trailingSlot={
          <button
            type="button"
            className="test-list__points-button"
            onClick={handlePointsClick}
            aria-label="积分充值"
          >
            <MaterialIcon name="auto_awesome" className="test-list__points-icon" />
            <span className="test-list__points-value">{TOTAL_POINTS}</span>
          </button>
        }
      />

      <main className="test-list__content">
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
                  {test.points > 0 && (
                    <div className="test-list__card-points">
                      <MaterialIcon name="auto_awesome" className="test-list__card-points-icon" />
                      <span className="test-list__card-points-value">{test.points}</span>
                    </div>
                  )}
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

