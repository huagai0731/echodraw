import "./Welcome.css";

type WelcomeProps = {
  onLogin: () => void;
  onRegister?: () => void;
};

function Welcome({ onLogin, onRegister }: WelcomeProps) {
  return (
    <div className="welcome-screen">
      <div className="welcome-screen__background">
        <div className="welcome-screen__glow welcome-screen__glow--primary" />
        <div className="welcome-screen__glow welcome-screen__glow--secondary" />
        <div className="welcome-screen__glow welcome-screen__glow--center" />
      </div>

      <div className="welcome-screen__content">
        <header className="welcome-screen__header">
          <h1 className="welcome-screen__title">EchoDraw</h1>
        </header>

        <main className="welcome-screen__body">
          <p>记录你的创作过程。</p>
          <p>设定艺术目标与里程碑。</p>
          <p>追踪创作时长与创作心情。</p>
          <p>画画，是一生的冲动。</p>
        </main>

        <footer className="welcome-screen__actions">
          <button
            type="button"
            className="welcome-screen__button welcome-screen__button--primary"
            onClick={() => onRegister?.()}
          >
            注册
          </button>
          <button type="button" className="welcome-screen__button" onClick={onLogin}>
            登录
          </button>
        </footer>
        <div className="welcome-screen__beian">
          <a href="https://beian.miit.gov.cn" target="_blank" rel="noopener noreferrer">
            沪ICP备2025153645号
          </a>
        </div>
      </div>
    </div>
  );
}

export default Welcome;

