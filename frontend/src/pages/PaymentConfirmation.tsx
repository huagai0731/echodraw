import { useMemo, useState } from "react";
import clsx from "clsx";

import MaterialIcon from "@/components/MaterialIcon";
import type { MembershipPlan, MembershipTier } from "./MembershipOptions";

import "./PaymentConfirmation.css";

type PaymentMethod = "wechat" | "alipay";

type PaymentConfirmationProps = {
  plan: MembershipPlan;
  onBack: () => void;
  onConfirm: (payload: {
    tier: MembershipTier;
    expiresAt: string;
    paymentMethod: PaymentMethod;
  }) => void;
};

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; icon: string }> = [
  { id: "wechat", label: "微信支付", icon: "qr_code_2" },
  { id: "alipay", label: "支付宝", icon: "account_balance_wallet" },
];

function formatPrice(amount: number): string {
  const hasFraction = Math.round(amount * 10) % 10 !== 0;
  return hasFraction ? amount.toFixed(1) : amount.toFixed(0);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getMonth() + months;
  result.setMonth(targetMonth);

  // 处理月底溢出
  if (result.getDate() !== date.getDate()) {
    result.setDate(0);
  }

  return result;
}

function formatDate(date: Date): { label: string; iso: string } {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return {
    label: `${year}-${month}-${day}`,
    iso: `${year}-${month}-${day}`,
  };
}

function PaymentConfirmation({ plan, onBack, onConfirm }: PaymentConfirmationProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wechat");

  const expirationInfo = useMemo(() => {
    const base = new Date();
    const expires = addMonths(base, plan.billingCycleInMonths);
    return formatDate(expires);
  }, [plan.billingCycleInMonths]);

  return (
    <div className="payment-confirmation">
      <div className="payment-confirmation__bg">
        <span className="payment-confirmation__glow payment-confirmation__glow--one" />
        <span className="payment-confirmation__glow payment-confirmation__glow--two" />
        <span className="payment-confirmation__glow payment-confirmation__glow--three" />
      </div>
      <div className="payment-confirmation__shell">
        <header className="payment-confirmation__header">
          <button type="button" className="payment-confirmation__header-action" onClick={onBack}>
            <MaterialIcon name="arrow_back" />
          </button>
          <div className="payment-confirmation__header-title">确认订单</div>
          <span className="payment-confirmation__header-spacer" aria-hidden="true" />
        </header>

        <main className="payment-confirmation__content">
          <section className="payment-card">
            <div className="payment-card__row">
              <p>购买会员版本</p>
              <strong>{plan.name}</strong>
            </div>
            <div className="payment-card__divider" />
            <div className="payment-card__row">
              <p>金额</p>
              <strong>¥{formatPrice(plan.amount)}</strong>
            </div>
          </section>

          <section className="payment-card payment-card--features">
            <ul>
              {plan.features.map((feature) => (
                <li key={feature.label}>
                  <MaterialIcon name="check_circle" className="payment-card__feature-icon" />
                  <span>{feature.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="payment-card payment-card--methods">
            <p className="payment-card__label">支付方式</p>
            <div className="payment-card__methods">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  className={clsx(
                    "payment-method",
                    paymentMethod === method.id && "payment-method--active",
                  )}
                  onClick={() => setPaymentMethod(method.id)}
                >
                  <span className="payment-method__icon">
                    <MaterialIcon name={method.icon} />
                  </span>
                  <span className="payment-method__label">{method.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="payment-confirmation__meta">
            <p>支付后的会员到期时间：{expirationInfo.label}</p>
            <p>你的创作之旅将更加精彩！</p>
          </section>
        </main>

        <footer className="payment-confirmation__footer">
          <button
            type="button"
            className="payment-confirmation__confirm"
            onClick={() =>
              onConfirm({
                tier: plan.id,
                expiresAt: expirationInfo.iso,
                paymentMethod,
              })
            }
          >
            确认支付
          </button>
        </footer>
      </div>
    </div>
  );
}

export default PaymentConfirmation;














