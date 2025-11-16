import clsx from "clsx";

import TopNav from "@/components/TopNav";
import MaterialIcon from "@/components/MaterialIcon";
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
    name: "基础版",
    amount: 2.9,
    cycle: "/月",
    billingCycleInMonths: 1,
    tagline: "体验入门功能",
    description: "适合偶尔创作的你，解锁每日灵感与基础统计。",
    features: [
      { label: "每日灵感卡片与创作签到" },
      { label: "个人作品库与基础成就系统" },
      { label: "每月 5 次高清导出额度" },
      { label: "社区活动基础参与权限" },
    ],
  },
  {
    id: "premium",
    name: "高级版",
    amount: 6.9,
    cycle: "/月",
    billingCycleInMonths: 1,
    tagline: "全面进阶伙伴",
    description: "专为高频创作者设计，提供深度分析与动态模板。",
    badge: "热门",
    features: [
      { label: "无限量高清导出与多尺寸模版", highlight: true },
      { label: "创作效果仪表盘与成长报告", highlight: true },
      { label: "专属素材库与季度课程", highlight: true },
      { label: "1 对 1 创作顾问优先回复" },
    ],
  },
  {
    id: "premiumQuarter",
    name: "季度高级版",
    amount: 17.7,
    cycle: "/季度",
    billingCycleInMonths: 3,
    tagline: "季度卓越体验",
    description: "锁定整季灵感支持，享受专属线下活动名额与季度进阶课程优惠。",
    badge: "季选",
    features: [
      { label: "季度内无限高清导出 + 4K/海报模版", highlight: true },
      { label: "季度成长分析报告与阶段性目标建议", highlight: true },
      { label: "季度进阶课程礼包与线下沙龙优先位", highlight: true },
      { label: "创作顾问季度回访与方案升级" },
    ],
  },
];

function formatPrice(amount: number): string {
  const hasFraction = Math.round(amount * 10) % 10 !== 0;
  return hasFraction ? amount.toFixed(1) : amount.toFixed(0);
}

function MembershipOptions({ onBack, currentTier, onSelectTier }: MembershipOptionsProps) {
  const handleSelectTier = (tier: MembershipTier) => {
    if (tier === currentTier) {
      return;
    }
    onSelectTier(tier);
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
        title="会员服务"
        subtitle="Membership"
        leadingAction={{
          icon: "arrow_back",
          label: "返回个人页",
          onClick: onBack,
        }}
      />

      <main className="membership-options__content">
        <section className="membership-options__hero">
          <span className="membership-options__hero-badge">EchoDraw PLUS</span>
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
      </main>
    </div>
  );
}

export default MembershipOptions;
