import { useState } from "react";

import TopNav from "@/components/TopNav";

import "./PointsRecharge.css";

type PointsRechargeProps = {
  onBack: () => void;
};

type PricingOption = {
  id: string;
  points: number;
  price: number;
  description: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  iconUrl: string;
};

const PRICING_OPTIONS: PricingOption[] = [
  {
    id: "1",
    points: 1,
    price: 1,
    description: "A small boost.",
  },
  {
    id: "5",
    points: 5,
    price: 5,
    description: "Unlock your potential.",
  },
  {
    id: "20",
    points: 20,
    price: 20,
    description: "For deep creative investment.",
  },
];

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "wechat",
    name: "微信支付",
    iconUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuC3IqOGVvLWq0UoepXNsS4uAvjEh0f1wjh0rop3KZgfOZkMraruxJgyeY2-SMqCYndRiUplzZQ6xWO6fWp_qdNs9ydz1KlGqQnQJVdVgO2hZnt3gujtjrmqDpqJf7eglwCdP_ofd9jqQcBtgzjHEynaJKbu6RmliIfHFOOrojlObKUv0czvuVAQx_OIQ43kTc25zi56A1hIZiSqzSIGMG9n7axnMS-f5fhUWs4c9tnNHhJxLhxkAe59C7WU60NoFSWX6ziRxNz8IZAo",
  },
  {
    id: "alipay",
    name: "支付宝",
    iconUrl: "https://lh3.googleusercontent.com/aida-public/AB6AXuBhMorT3L3R8y12nzuQFifkKJwlPi7bIORrolmPbXN0Vo7KpT2DL_SUskdEaJHTFbAwRYIxgHVpr9eyhejVOfBw_pSzomELsY07OUwJCN9YEtNKHGthP3Y6jXJcj9nS4YjaziIqIEJgccAgMrXEOoW45sY3rk-n7vncK_hi1_e0CFgLxRnEefh9LdCFDPOMU2ARIpjGBoPY0YEXhavEpri9Ykw89KoYFyaakBVSEvESh41ns8Cdif7T2J-BFi00kmJ5v6OU1lqk_L_P",
  },
];

function PointsRecharge({ onBack }: PointsRechargeProps) {
  const [selectedPricing, setSelectedPricing] = useState<string>("5");
  const [selectedPayment, setSelectedPayment] = useState<string>("wechat");

  const selectedPricingOption = PRICING_OPTIONS.find((option) => option.id === selectedPricing);

  const handlePay = () => {
    if (selectedPricingOption) {
      // TODO: 实现支付逻辑
      console.log("支付", selectedPricingOption.price, "元，使用", selectedPayment);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`支付功能即将上线，敬请期待。\n\n选择：${selectedPricingOption.points}点 - ¥${selectedPricingOption.price}\n支付方式：${PAYMENT_METHODS.find((m) => m.id === selectedPayment)?.name}`);
      }
    }
  };

  return (
    <div className="points-recharge">
      <div className="points-recharge__background" />

      <div className="points-recharge__content">
        <TopNav
          className="top-nav--fixed"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onBack,
          }}
          title="充值中心"
        />

        <div className="points-recharge__headline">
          <h2 className="points-recharge__headline-title">为你的创作注入新的能量</h2>
          <p className="points-recharge__headline-subtitle">发现更多可能！</p>
        </div>

        <div className="points-recharge__pricing">
          {PRICING_OPTIONS.map((option) => {
            const isSelected = selectedPricing === option.id;
            return (
              <div
                key={option.id}
                className={`points-recharge__pricing-card ${isSelected ? "points-recharge__pricing-card--selected" : ""}`}
                onClick={() => setSelectedPricing(option.id)}
              >
                <div className="points-recharge__pricing-header">
                  <h1 className="points-recharge__pricing-points">{option.points}点</h1>
                  <p className="points-recharge__pricing-price">¥{option.price}</p>
                </div>
                <p className="points-recharge__pricing-description">{option.description}</p>
              </div>
            );
          })}
        </div>

        <div className="points-recharge__payment-section">
          <h3 className="points-recharge__payment-title">支付方式</h3>
          <div className="points-recharge__payment-methods">
            {PAYMENT_METHODS.map((method) => {
              const isSelected = selectedPayment === method.id;
              return (
                <div
                  key={method.id}
                  className={`points-recharge__payment-method ${isSelected ? "points-recharge__payment-method--selected" : ""}`}
                  onClick={() => setSelectedPayment(method.id)}
                >
                  <img
                    alt={`${method.name} Icon`}
                    className="points-recharge__payment-icon"
                    src={method.iconUrl}
                  />
                  <span className="points-recharge__payment-name">{method.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="points-recharge__spacer-grow" />

        <div className="points-recharge__footer">
          <button
            type="button"
            className="points-recharge__pay-button"
            onClick={handlePay}
            disabled={!selectedPricingOption}
          >
            <span className="points-recharge__pay-button-text">
              立即支付 ¥{selectedPricingOption?.price || 0}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default PointsRecharge;

