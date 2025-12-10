import { useState } from "react";
import clsx from "clsx";

import TopNav from "@/components/TopNav";
import MaterialIcon from "@/components/MaterialIcon";
import "./MembershipOptions.css";

export type MembershipTier = "pending" | "premium";

type MembershipOptionsProps = {
  onBack: () => void;
  currentTier: MembershipTier;
  membershipExpires?: string | null;
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
    id: "premium",
    name: "EchoDraw PLUS",
    amount: 5,
    cycle: "/ 月",
    billingCycleInMonths: 1,
    tagline: "长期主义绘画记录",
    description: "",
    features: [
      { label: "视觉分析：看清画面问题，让练习不再盲目" },
      { label: "画集管理：作品被好好整理，成长路径一眼可见" },
      { label: "长期目标：按时长累积，让坚持真正被量化" },
      { label: "短期目标：让\"好好练基本功\"的愿望不再难以攀登" },
      { label: "月度报告：把这个月的变化总结成趋势，让你看到自己正在变好" },
    ],
  },
];

function formatPrice(amount: number): string {
  const hasFraction = Math.round(amount * 10) % 10 !== 0;
  return hasFraction ? amount.toFixed(1) : amount.toFixed(0);
}

function MembershipOptions({ onBack, currentTier, membershipExpires, onSelectTier }: MembershipOptionsProps) {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const handleSelectTier = (tier: MembershipTier) => {
    // 允许会员继续购买（叠加购买）
    onSelectTier(tier);
  };

  const formatExpiresDate = (expires: string | null | undefined): string => {
    if (!expires) return "";
    try {
      const date = new Date(expires);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return "";
    }
  };

  const handleToggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const faqItems = [
    {
      question: "我上传的作品会被看到或拿去训练 AI 吗？",
      answer: "不会。EchoDraw承诺你的图片只存在于你的账号里，不会被团队查看，也不会被用于ai模型训练或任何二次用途，只为你的记录、分析和目标服务。",
    },
    {
      question: "如果我不想再练了、或之后不续费会怎样？",
      answer: "随时可以停。已经上传的内容、目标、记录不会被删。EchoDraw开发的初衷就是希望为你保留你努力过的痕迹，即使暂时放下，等你回来的时候也不会感到从零开始的迷茫。",
    },
    {
      question: "会员只有一个档位吗？",
      answer: "是的。我们只做一个简单透明的档位，希望能帮你把心力留给创作。且保证不开展任何限时优惠活动，或永久会员。",
    },
  ];

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
                  {plan.tagline ? <p className="membership-card__tagline">{plan.tagline}</p> : null}
                  {plan.description ? <p className="membership-card__description">{plan.description}</p> : null}
                </header>

                <ul className="membership-card__features">
                  {plan.features.map((feature) => {
                    const [title, ...descriptionParts] = feature.label.split("：");
                    const description = descriptionParts.join("：");
                    return (
                      <li
                        key={feature.label}
                        className={clsx(
                          "membership-card__feature",
                          feature.highlight && "membership-card__feature--highlight",
                        )}
                      >
                        <MaterialIcon name="star" filled />
                        <span>
                          <strong className="membership-card__feature-title">{title}：</strong>
                          {description}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <footer className="membership-card__footer">
                  <button
                    type="button"
                    className={clsx(
                      "membership-card__cta",
                      currentTier === plan.id && "membership-card__cta--active",
                    )}
                    onClick={() => handleSelectTier(plan.id)}
                  >
                    <span className="membership-card__cta-price">
                      <strong>¥{formatPrice(plan.amount)}</strong>
                      <span>{plan.cycle}</span>
                    </span>
                    <span className="membership-card__cta-text">
                      {currentTier === plan.id ? "叠加购买" : "立即开通"}
                    </span>
                  </button>
                  {currentTier === plan.id && membershipExpires && (
                    <p className="membership-card__expires">
                      您的EchoDraw PLUS时效：{formatExpiresDate(membershipExpires)}
                    </p>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="membership-options__faq">
          <h3>常见问题</h3>
          <div className="membership-options__faq-list">
            {faqItems.map((item, index) => (
              <div
                key={index}
                className={clsx(
                  "membership-options__faq-item",
                  expandedFaq === index && "membership-options__faq-item--expanded"
                )}
              >
                <button
                  type="button"
                  className="membership-options__faq-question"
                  onClick={() => handleToggleFaq(index)}
                >
                  <h4>{item.question}</h4>
                  <MaterialIcon
                    name={expandedFaq === index ? "expand_less" : "expand_more"}
                    className="membership-options__faq-icon"
                  />
                </button>
                {expandedFaq === index && (
                  <div className="membership-options__faq-answer">
                    <p>{item.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default MembershipOptions;
