import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";

import testCardImage1 from "@/assets/test-card-1.jpg";
import testCardImage2 from "@/assets/test-card-2.jpg";
import testCardImage3 from "@/assets/test-card-3.jpg";

import "./TestList.css";

type TestListProps = {
  onBack: () => void;
  onSelectTest?: (testId: string) => void;
  onOpenPointsRecharge?: () => void;
};

type TestItem = {
  id: string;
  title: string;
  description: string;
  points: number;
  resultCount: string;
  imageUrl: string;
};

const TEST_ITEMS: TestItem[] = [
  {
    id: "creative-style",
    title: "Creative Style Analysis",
    description: "Discover your dominant artistic style through a series of visual questions.",
    points: 25,
    resultCount: "12 种可能结果",
    imageUrl: testCardImage1,
  },
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
  const handleTestClick = (testId: string) => {
    onSelectTest?.(testId);
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
        {TEST_ITEMS.map((test) => (
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
                <div className="test-list__card-points">
                  <MaterialIcon name="auto_awesome" className="test-list__card-points-icon" />
                  <span className="test-list__card-points-value">{test.points}</span>
                </div>
              </div>
              <p className="test-list__card-description">{test.description}</p>
              <p className="test-list__card-result-count">{test.resultCount}</p>
            </div>
            <button
              type="button"
              className="test-list__card-button"
              onClick={() => handleTestClick(test.id)}
            >
              开始测试
            </button>
          </div>
        ))}
      </main>
    </div>
  );
}

export default TestList;

