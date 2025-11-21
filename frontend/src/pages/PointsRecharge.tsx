import { useState } from "react";
import { isAxiosError } from "axios";

import TopNav from "@/components/TopNav";
import { createPointsOrder, completePointsOrder } from "@/services/api";

import "./PointsRecharge.css";

type PointsRechargeProps = {
  onBack: () => void;
  onRechargeSuccess?: () => void; // 充值成功后的回调，用于刷新点数
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
    points: 100,
    price: 1,
    description: "A small boost.",
  },
  {
    id: "5",
    points: 500,
    price: 5,
    description: "Unlock your potential.",
  },
  {
    id: "20",
    points: 2000,
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

function PointsRecharge({ onBack, onRechargeSuccess }: PointsRechargeProps) {
  const [selectedPricing, setSelectedPricing] = useState<string>("5");
  const [selectedPayment, setSelectedPayment] = useState<string>("wechat");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPricingOption = PRICING_OPTIONS.find((option) => option.id === selectedPricing);

  const handlePay = async () => {
    if (!selectedPricingOption) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      // 1. 创建订单
      const order = await createPointsOrder({
        points: selectedPricingOption.points,
        amount: selectedPricingOption.price,
        payment_method: selectedPayment as "wechat" | "alipay",
      });

      // 2. 模拟支付流程（实际项目中这里应该调用真实的支付接口）
      // 这里我们直接完成订单，实际项目中应该等待支付回调
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 模拟支付延迟

      // 3. 完成订单（增加点数）
      const result = await completePointsOrder(order.order_id, {
        payment_transaction_id: `MOCK_${order.order_number}`, // 模拟交易号
      });

      // 4. 充值成功，触发事件通知其他组件刷新点数
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("points-updated", { detail: { balance: result.balance_after } }));
      }
      if (onRechargeSuccess) {
        onRechargeSuccess();
      }

      // 5. 显示成功消息
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(
          `充值成功！\n\n获得点数：${result.points_added}点\n当前余额：${result.balance_after}点`
        );
      }

      // 6. 返回上一页
      onBack();
    } catch (err) {
      console.error("[PointsRecharge] Failed to process payment:", err);
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "充值失败，请稍后重试");
      } else {
        setError("充值失败，请稍后重试");
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="points-recharge">
      <div className="points-recharge__background" />

      <div className="points-recharge__content">
        <TopNav
          className="top-nav--fixed top-nav--flush"
          leadingAction={{
            icon: "arrow_back",
            label: "返回",
            onClick: onBack,
          }}
          title="充值中心"
          subtitle="Recharge"
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
                  <span className="points-recharge__payment-name">{method.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div style={{ color: "#ff6b6b", padding: "1rem", textAlign: "center" }}>
            {error}
          </div>
        )}

        <div className="points-recharge__spacer-grow" />

        <div className="points-recharge__footer">
          <button
            type="button"
            className="points-recharge__pay-button"
            onClick={handlePay}
            disabled={!selectedPricingOption || processing}
          >
            <span className="points-recharge__pay-button-text">
              {processing ? "处理中..." : `立即支付 ¥${selectedPricingOption?.price || 0}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default PointsRecharge;

