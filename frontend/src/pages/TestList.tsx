import MaterialIcon from "@/components/MaterialIcon";
import TopNav from "@/components/TopNav";

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
    imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCok7zoVr0FqDn2i-YzoEjl67OjCzoKFiWN0OzUAbghXWUjgNBDQA52_LUftDwy_gbepZKLJ6cO1AGwR-yoWRcCRzblYq_ZAvOLnmgMNZct5qho3D9Zq6USPm_25_Vh14xS7VZSK5YKM2cS5B9SRKjmL_ARac6_1VNcEfFPTOdJgY4oJFvlg8UAiDnUhV22OqbOOb6fLLYHn_KRpf9lFCBH3JwKxEFK1zUDW_oIbEIVvzMQlGC9IcGxy_HSym3U1oQkVXylHxeyKUSi",
  },
  {
    id: "color-palette",
    title: "Color Palette Harmony",
    description: "Find out which color palettes resonate most with your artistic senses.",
    points: 50,
    resultCount: "8 种可能结果",
    imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuDleTxrkJY5EXTpE2pk-4lOUTtTtBtxMaaCMbkaxOj1c2_MhdbLkLNAKh7Ha3R4L3uiOJ0cdDAQYcNj-UoXL9K8GqhSAZb0tlNSt9d4v4X-v1t_LT4ISp73xN7cT0U2ZzmXIGb5UaYMwthOr9APk58L2Xp28yWSWPND2vTaZMC8mnlbINfjUCG0Ebo46rU-dcq2tthysgmW1IVqsFonydPLLOrUqE5NcRiwR6O65yFFnVy356hKePOoujcBucd7RyRwdE6Y6hZDA_t7",
  },
  {
    id: "artistic-mood",
    title: "Artistic Mood Board",
    description: "A test to determine your current creative mood and suggest inspirational themes.",
    points: 30,
    resultCount: "6 种可能结果",
    imageUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuCRUuNwJ40AbnC44BGw76pdCpdR7rCtxMy35jaNAbGrMykZS4xFaDE47_b7ey6ZXsTezpeRkjJmRNyLNDntkAbQUSoU5jOlVXvV1HjbhI14Noz0pbe2PljuyrfwrUZ9lfm7_4otgl47L0dIifw8kGt1QBksNn2ENe0yyP2t4rOmz5XiVVlEcP_bKZW5ca5FulVD31mcb7G4LZuCVUzdlk79sfgYPKbUhPJR6ER05KbXC5r8YLFGwC22JTYO-Vza5G5_-2M6gpcyIrVP",
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
        className="top-nav--fixed"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: onBack,
        }}
        title="所有测试"
        trailingSlot={
          <button
            type="button"
            className="test-list__points-button"
            onClick={handlePointsClick}
            aria-label="积分充值"
          >
            <MaterialIcon name="toll" className="test-list__points-icon" />
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
                  <MaterialIcon name="toll" className="test-list__card-points-icon" />
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

