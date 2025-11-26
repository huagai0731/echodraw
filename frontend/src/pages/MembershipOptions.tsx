import { useState, useRef, useEffect } from "react";
import clsx from "clsx";

import TopNav from "@/components/TopNav";
import MaterialIcon from "@/components/MaterialIcon";
import { getHighFiveCount, incrementHighFiveCount, hasHighFiveClicked } from "@/services/api";
import "./MembershipOptions.css";

export type MembershipTier = "pending" | "basic" | "premium" | "premiumQuarter";

type MembershipOptionsProps = {
  onBack: () => void;
  currentTier: MembershipTier;
  onSelectTier: (tier: MembershipTier) => void;
};

export type MembershipPlan = {
  id: Exclude<MembershipTier, "pending">;
  name: string;
  amount: number;
  cycle: string;
  billingCycleInMonths: number;
  tagline: string;
  description: string;
  features: { label: string; highlight?: boolean }[];
  badge?: string;
  disabled?: boolean;
};

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    id: "basic",
    name: "Lite",
    amount: 2.9,
    cycle: "/ 月",
    billingCycleInMonths: 1,
    tagline: "长期主义轻量版",
    description: "有时候你不会天天画；但你愿意保留一条细细的线，让这段兴趣别断掉。Lite 就是为这种节奏准备的。以最低的门槛，把每一次想起画画的时刻都留下来。",
    features: [
      { label: "个人作品库与绘画数据统计" },
      { label: "每日色感小测" },
      { label: "短期/长期计划：让练习不再迷失，清晰的成长记录" },
      { label: "基础模版库：用干净模板把作品呈现得更完整。" },
      { label: "Lite月报：每月一章简明的小结，看到过去 30 天完整的自己" },
    ],
  },
  {
    id: "premium",
    name: "Plus",
    amount: 6.9,
    cycle: "/ 月",
    billingCycleInMonths: 1,
    tagline: "进阶专业版",
    description: "不论你是略感迷茫，还是已有所成就，Plus 希望帮你发现那些，你自己还没注意到的进步与变化。",
    badge: "推荐",
    features: [
      { label: "Plus周报：每周一次的方向感，让你的节奏不会迷失。", highlight: true },
      { label: "Plus深度月报：七大维度分析，完整呈现习惯波动、时长峰值与创作能量的变化", highlight: true },
      { label: "成就标记：以更精细的方式记录突破点，让成长留下明确坐标。", highlight: true },
      { label: "高级模板库：包括对比、系列、成就等模板，更多层次地展示和对比作品" },
    ],
  },
  {
    id: "premiumQuarter",
    name: "Plus · 季度版",
    amount: 5.9,
    cycle: "/ 月",
    billingCycleInMonths: 3,
    tagline: "季度超值版",
    description: "功能与 Plus 相同，并额外提供季度积分礼包。折合 ¥5.2 每月，相当于每个月为坚持古法手作画画的自己奖励一瓶魔法可乐。",
    badge: "节省",
    features: [
      { label: "季度积分礼包（200 积分）：用于短期任务与测试", highlight: true },
      { label: "折合 ¥6.9 → ¥5.2 每月：更低的月均成本", highlight: true },
    ],
  },
];

function formatPrice(amount: number): string {
  const hasFraction = Math.round(amount * 10) % 10 !== 0;
  return hasFraction ? amount.toFixed(1) : amount.toFixed(0);
}

function formatClickDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}

function MembershipOptions({ onBack, currentTier, onSelectTier }: MembershipOptionsProps) {
  const [isMessageExpanded, setIsMessageExpanded] = useState(false);
  const [showFireworks, setShowFireworks] = useState<false | { x: number; y: number }>(false);
  const [highFiveCount, setHighFiveCount] = useState<number | null>(null);
  const [hasClicked, setHasClicked] = useState<boolean>(false);
  const [clickedAt, setClickedAt] = useState<string | null>(null);
  const messageButtonRef = useRef<HTMLButtonElement>(null);
  const fireworksContainerRef = useRef<HTMLDivElement>(null);

  // 加载击掌计数和点击状态
  useEffect(() => {
    if (isMessageExpanded) {
      Promise.all([
        getHighFiveCount(),
        hasHighFiveClicked().catch(() => ({ has_clicked: false })),
      ])
        .then(([count, result]) => {
          setHighFiveCount(count);
          setHasClicked(result.has_clicked || false);
          setClickedAt("clicked_at" in result ? result.clicked_at || null : null);
        })
        .catch((error) => {
          console.warn("Failed to load high-five data", error);
          setHighFiveCount(0);
          setHasClicked(false);
          setClickedAt(null);
        });
    }
  }, [isMessageExpanded]);

  const handleSelectTier = (tier: MembershipTier) => {
    if (tier === currentTier) {
      return;
    }
    onSelectTier(tier);
  };

  const toggleMessage = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 保存当前滚动位置
    const scrollY = window.scrollY;
    
    setIsMessageExpanded(!isMessageExpanded);
    
    // 恢复滚动位置，防止页面跳转
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
      // 再次确保，因为 React 的状态更新可能导致延迟
      setTimeout(() => {
        window.scrollTo(0, scrollY);
        if (messageButtonRef.current) {
          messageButtonRef.current.blur();
        }
      }, 0);
    });
  };

  return (
    <div className="membership-options">
      <div className="membership-options__bg">
        <span className="membership-options__glow membership-options__glow--one" />
        <span className="membership-options__glow membership-options__glow--two" />
        <span className="membership-options__grid-line membership-options__grid-line--left" />
        <span className="membership-options__grid-line membership-options__grid-line--right" />
      </div>

      <TopNav
        className="top-nav--fixed top-nav--flush membership-options__nav"
        title="加入EchoDraw"
        subtitle="Membership"
        leadingAction={{
          icon: "arrow_back",
          label: "返回个人页",
          onClick: onBack,
        }}
      />

      <main className="membership-options__content">
        <section className="membership-options__hero">
          <h1>
            选择最适合你的
            <br />
            创作成长路径
          </h1>
          <p>
            无论你是跃跃欲试的新手，还是坚持不懈的创作者，EchoDraw 的会员服务都为你的创作旅程注入源源不断的灵感与动力。
          </p>
        </section>

        <section className="membership-options__carousel">
          <div className="membership-options__cards">
            {MEMBERSHIP_PLANS.map((plan) => (
              <article
                key={plan.id}
                className={clsx(
                  "membership-card",
                  `membership-card--${plan.id}`,
                  currentTier === plan.id && "membership-card--active",
                )}
                onClick={() => handleSelectTier(plan.id)}
              >
                {plan.badge ? <span className="membership-card__badge">{plan.badge}</span> : null}
                <header className="membership-card__header">
                  <h2>{plan.name}</h2>
                  <p className="membership-card__tagline">{plan.tagline}</p>
                  <div className="membership-card__price">
                    <strong>¥{formatPrice(plan.amount)}</strong>
                    <span>{plan.cycle}</span>
                  </div>
                  <p className="membership-card__description">{plan.description}</p>
                </header>

                <ul className="membership-card__features">
                  {plan.features.map((feature) => (
                    <li
                      key={feature.label}
                      className={clsx(
                        "membership-card__feature",
                        feature.highlight && "membership-card__feature--highlight",
                      )}
                    >
                      <MaterialIcon name={feature.highlight ? "auto_awesome" : "check_circle"} filled />
                      <span>{feature.label}</span>
                    </li>
                  ))}
                </ul>

                <footer className="membership-card__footer">
                  <button
                    type="button"
                    className={clsx(
                      "membership-card__cta",
                      currentTier === plan.id && "membership-card__cta--active",
                    )}
                    onClick={() => handleSelectTier(plan.id)}
                    disabled={currentTier === plan.id}
                  >
                    {currentTier === plan.id ? "当前版本" : "立即开通"}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="membership-options__faq">
          <h3>常见问题</h3>
          <div className="membership-options__faq-grid">
            <div>
              <h4>可以随时升级或取消吗？</h4>
              <p>可以。升级后会立即生效，剩余的周期费用将按比例抵扣。取消将在当前周期结束后停止自动续费。</p>
            </div>
            <div>
              <h4>导出额度如何计算？</h4>
              <p>基础版每月赠送 5 次高清导出（次月重置），高级版无次数限制，同时支持 4K 与海报级输出。</p>
            </div>
            <div>
              <h4>团队合作功能何时上线？</h4>
              <p>我们正在内测全新的协作模式，欢迎留意站内公告或关注我们的官方社区获取首发体验资格。</p>
            </div>
          </div>
        </section>

        <section className="membership-options__message">
          <div className="membership-options__divider" />
          <button
            ref={messageButtonRef}
            type="button"
            className="membership-options__message-header"
            onClick={toggleMessage}
          >
            <h3>致每一位走到这里的小画师</h3>
            <MaterialIcon
              name={isMessageExpanded ? "expand_less" : "expand_more"}
              className="membership-options__message-icon"
            />
          </button>
          {isMessageExpanded && (
            <div className="membership-options__message-content">
            <p>
              我10岁开始鼠绘，经历了无数次半途而废，每一次都确信与画画再无缘分，但最后，我在25岁的时候意识到：
            </p>
            <p className="membership-options__message-emphasis">我还是想画。</p>
            <p className="membership-options__message-emphasis">画画是一种永远的灵魂冲动。</p>
            <p>
              也就是在不断放弃又回头的循环里，我终于发现：
            </p>
            <p>
              就算这些年加起来画的很少，可我依然留下了不少基础。
            </p>
            <p>
              如果每一次的我，都不是只看到"眼前画得好差"，从而放弃。
            </p>
            <p>
              而是能看到现在的自己，和一个月前、画100h前、画十张之前的进步，甚至能给我列个表格看到我每个阶段的变化——
            </p>
            <p className="membership-options__message-emphasis">那我……！</p>
            <p>
              或许就不会放弃，或许就不会焦虑又嫉妒，或许。
            </p>
            <p>
              EchoDraw就是在这样的心境里诞生的。
            </p>
            <p>
              开悟飞升玄而又玄，那就把它量化。
            </p>
            <p>
              状态手感忽高忽低，那就用稳定理性的分析来对抗。
            </p>
            <p>
              我们都相信坚持画就能进步，但坚持也需要正反馈。
            </p>
            <p>
              说得宏伟一点，我希望不再有人和我一样在绘画中沮丧、嫉妒、焦虑，最后心灰意冷自我贬低。
            </p>
            <p>
              我希望EchoDraw像一个时空银行，给未来可能迷茫的小画师，存下一大笔自豪和勇气。
            </p>
            <p>
              出于服务器、图片长期存储与维护的成本，
            </p>
            <p>
              EchoDraw不会免费或降价运营；
            </p>
            <p>
              但每一位愿意加入的朋友，
            </p>
            <p>
              都在让这个平台得以继续陪伴更多创作者。
            </p>
            <p className="membership-options__message-emphasis">
              真诚感激每一位支持 EchoDraw 的小画师。
            </p>
            <p>
              不论你是否已经成为会员，
            </p>
            <p>
              愿意找到这里、愿意停下来看，
            </p>
            <p>
              就已经说明一件事：
            </p>
            <p className="membership-options__message-emphasis">
              你依然想用自己的笔，画出心中所想。
            </p>
            <p className="membership-options__message-emphasis">
              向你表达敬意。
            </p>
            <p>
              愿你在接下来的日子里，
            </p>
            <p>
              无论产量多少、风格如何、节奏快慢，
            </p>
            <p>
              都能继续画你想画的东西，
            </p>
            <p>
              也愿 EchoDraw 能在你需要的时候陪伴你。
            </p>
            <p>
              让你在未来的某一天回头时能说：
            </p>
            <p className="membership-options__message-emphasis">
              原来我一直在前进，
            </p>
            <p className="membership-options__message-emphasis">
              只是那时候的我还没察觉到。
            </p>
            
            <div className="membership-options__high-five">
              <span className="membership-options__high-five-text">
                没有什么意义，但是击掌，庆祝画画的我们相聚于此
              </span>
              <button
                type="button"
                className={clsx(
                  "membership-options__high-five-button",
                  hasClicked && "membership-options__high-five-button--clicked"
                )}
                disabled={hasClicked}
                onClick={async (e) => {
                  const buttonRect = e.currentTarget.getBoundingClientRect();
                  const messageSection = e.currentTarget.closest('.membership-options__message');
                  
                  if (messageSection) {
                    const sectionRect = messageSection.getBoundingClientRect();
                    const relativeX = ((buttonRect.left + buttonRect.width / 2 - sectionRect.left) / sectionRect.width) * 100;
                    const relativeY = ((buttonRect.top + buttonRect.height / 2 - sectionRect.top) / sectionRect.height) * 100;
                    
                    setShowFireworks({ x: relativeX, y: relativeY });
                    setTimeout(() => setShowFireworks(false), 2000);
                    
                    // 如果已经点击过，不执行任何操作
                    if (hasClicked) {
                      return;
                    }
                    
                    // 增加计数
                    try {
                      // 调用API更新服务器
                      const result = await incrementHighFiveCount();
                      // 使用服务器返回的实际值更新状态
                      setHighFiveCount(result.count);
                      
                      if (result.success) {
                        setHasClicked(true);
                        if (result.clicked_at) {
                          setClickedAt(result.clicked_at);
                        }
                      } else {
                        // 如果已经点击过，更新状态
                        setHasClicked(true);
                        if (result.clicked_at) {
                          setClickedAt(result.clicked_at);
                        }
                        // 可以显示提示信息
                        console.log(result.message || "您已经点击过了");
                      }
                    } catch (error) {
                      console.error("Failed to increment high-five count", error);
                      // 如果API调用失败，尝试重新加载当前计数和状态
                      Promise.all([
                        getHighFiveCount(),
                        hasHighFiveClicked().catch(() => ({ has_clicked: false })),
                      ])
                        .then(([count, result]) => {
                          setHighFiveCount(count);
                          setHasClicked(result.has_clicked || false);
                          setClickedAt("clicked_at" in result ? result.clicked_at || null : null);
                        })
                        .catch(() => {});
                    }
                  }
                }}
                aria-label="击掌"
              >
                <MaterialIcon name="celebration" className="membership-options__high-five-icon" />
              </button>
            </div>
            {highFiveCount !== null && (
              <div className="membership-options__high-five-counter">
                已有 <strong>{highFiveCount.toLocaleString()}</strong> 位小画师击掌
              </div>
            )}
            {hasClicked && clickedAt && (
              <div className="membership-options__high-five-message">
                于{formatClickDate(clickedAt)}，听见你的回声
              </div>
            )}
            </div>
          )}
          
          {showFireworks && (
            <div ref={fireworksContainerRef} className="membership-options__fireworks">
              {Array.from({ length: 30 }).map((_, i) => {
                const angle = (i / 30) * Math.PI * 2;
                const distance = 15 + Math.random() * 25;
                const x = Math.cos(angle) * distance;
                const y = Math.sin(angle) * distance;
                const colorHue = Math.random() * 60 + 150;
                
                return (
                  <div
                    key={i}
                    className="membership-options__firework"
                    style={{
                      left: `${showFireworks.x}%`,
                      top: `${showFireworks.y}%`,
                      animationDelay: `${Math.random() * 0.2}s`,
                      '--firework-x': `${x}px`,
                      '--firework-y': `${y}px`,
                      '--firework-color': `hsl(${colorHue}, 70%, ${Math.random() * 20 + 60}%)`,
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default MembershipOptions;
