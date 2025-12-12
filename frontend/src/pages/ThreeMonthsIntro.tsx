import MaterialIcon from "@/components/MaterialIcon";
import "./ThreeMonthsIntro.css";

type ThreeMonthsIntroProps = {
  onNext: () => void;
  onClose: () => void;
};

function ThreeMonthsIntro({ onNext, onClose }: ThreeMonthsIntroProps) {
  return (
    <div className="three-months-intro">
      <div className="three-months-intro__background">
        <div className="three-months-intro__glow three-months-intro__glow--mint" />
        <div className="three-months-intro__glow three-months-intro__glow--brown" />
      </div>

      <div className="three-months-intro__shell">
        <header className="three-months-intro__header">
          <button
            type="button"
            className="three-months-intro__icon-button"
            onClick={onClose}
            aria-label="返回"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="three-months-intro__title">3个月学习法</h1>
          <span className="three-months-intro__header-placeholder" />
        </header>

        <main className="three-months-intro__main">
          <section className="three-months-intro__section">
            <div className="three-months-intro__icon-wrapper">
              <MaterialIcon name="loop" />
            </div>
            <h2 className="three-months-intro__section-title">斋藤直葵老师的三个月学习法</h2>
            <div className="three-months-intro__content">
              <p>
                斋藤直葵老师提出的三个月学习法，是一种系统性的绘画练习方法。
                通过持续三个月的循环练习，帮助画师建立稳定的创作节奏和进步轨迹。
              </p>
              <p>
                这个方法强调的不是速度，而是持续性和系统性。
                每天坚持练习，三个月后你会看到明显的进步。
              </p>
            </div>
          </section>

          <section className="three-months-intro__section">
            <div className="three-months-intro__icon-wrapper">
              <MaterialIcon name="autorenew" />
            </div>
            <h2 className="three-months-intro__section-title">戴明环理论（PDCA）</h2>
            <div className="three-months-intro__content">
              <p>
                3个月学习法基于戴明环（PDCA循环）理论：
              </p>
              <ul className="three-months-intro__list">
                <li>
                  <strong>PLAN（计划）</strong>：制定练习计划，明确要练习的内容和目标
                </li>
                <li>
                  <strong>DO（执行）</strong>：按照计划进行练习，完成作品
                </li>
                <li>
                  <strong>CHECK（检查）</strong>：对比计划与实际，找出差异和问题
                </li>
                <li>
                  <strong>ACTION（改进）</strong>：总结经验教训，改进下一轮练习
                </li>
              </ul>
              <p>
                通过不断循环这四个步骤，你的绘画技能会在三个月内得到系统性的提升。
              </p>
            </div>
          </section>
        </main>

        <footer className="three-months-intro__footer">
          <button
            type="button"
            className="three-months-intro__primary"
            onClick={onNext}
          >
            下一步
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ThreeMonthsIntro;
