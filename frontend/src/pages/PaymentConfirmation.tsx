import { useMemo, useState, useCallback, memo } from "react";
import clsx from "clsx";

import TopNav from "@/components/TopNav";
import MaterialIcon from "@/components/MaterialIcon";
import type { MembershipPlan, MembershipTier } from "./MembershipOptions";

import "./PaymentConfirmation.css";

type PaymentMethod = "wechat" | "alipay";

type PaymentConfirmationProps = {
  plan: MembershipPlan;
  currentMembershipExpires?: string | null;
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

type PaymentMethodButtonProps = {
  method: PaymentMethod;
  label: string;
  isActive: boolean;
  onClick: (method: PaymentMethod) => void;
};

const PaymentMethodButton = memo(function PaymentMethodButton({
  method,
  label,
  isActive,
  onClick,
}: PaymentMethodButtonProps) {
  const handleClick = useCallback(() => {
    onClick(method);
  }, [method, onClick]);

  return (
    <button
      type="button"
      className={clsx("payment-method", isActive && "payment-method--active")}
      onClick={handleClick}
    >
      <span className="payment-method__label">{label}</span>
    </button>
  );
});

type ConfirmButtonProps = {
  planId: MembershipTier;
  expiresAt: string;
  paymentMethod: PaymentMethod;
  onConfirm: (payload: {
    tier: MembershipTier;
    expiresAt: string;
    paymentMethod: PaymentMethod;
  }) => void;
};

const ConfirmButton = memo(function ConfirmButton({
  planId,
  expiresAt,
  paymentMethod,
  onConfirm,
}: ConfirmButtonProps) {
  const handleClick = useCallback(() => {
    onConfirm({
      tier: planId,
      expiresAt,
      paymentMethod,
    });
  }, [planId, expiresAt, paymentMethod, onConfirm]);

  return (
    <button
      type="button"
      className="payment-confirmation__confirm"
      onClick={handleClick}
    >
      确认支付
    </button>
  );
});

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

function PaymentConfirmation({ plan, currentMembershipExpires, onBack, onConfirm }: PaymentConfirmationProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wechat");
  const [quantity, setQuantity] = useState<number>(1);

  const handlePaymentMethodChange = useCallback((method: PaymentMethod) => {
    // 使用 flushSync 确保立即更新，避免延迟
    setPaymentMethod(method);
  }, []);

  const handleQuantityDecrease = useCallback(() => {
    setQuantity((prev) => Math.max(1, prev - 1));
  }, []);

  const handleQuantityIncrease = useCallback(() => {
    setQuantity((prev) => Math.min(12, prev + 1));
  }, []);

  const totalAmount = useMemo(() => {
    return plan.amount * quantity;
  }, [plan.amount, quantity]);

  const expirationInfo = useMemo(() => {
    // 如果有当前会员到期时间且未过期，基于到期时间计算；否则从今天开始计算
    let baseDate: Date;
    if (currentMembershipExpires) {
      try {
        const expiresDate = new Date(currentMembershipExpires);
        const now = new Date();
        // 如果会员未过期，基于到期时间计算；如果已过期，从今天开始计算
        if (expiresDate > now) {
          baseDate = expiresDate;
        } else {
          baseDate = now;
        }
      } catch {
        baseDate = new Date();
      }
    } else {
      baseDate = new Date();
    }
    
    const totalMonths = plan.billingCycleInMonths * quantity;
    const expires = addMonths(baseDate, totalMonths);
    return formatDate(expires);
  }, [plan.billingCycleInMonths, quantity, currentMembershipExpires]);

  const handleBack = useCallback(() => {
    onBack();
  }, [onBack]);

  return (
    <div className="payment-confirmation">
      <div className="payment-confirmation__bg">
        <span className="payment-confirmation__glow payment-confirmation__glow--one" />
        <span className="payment-confirmation__glow payment-confirmation__glow--two" />
        <span className="payment-confirmation__glow payment-confirmation__glow--three" />
      </div>
      <TopNav
        className="top-nav--fixed top-nav--flush payment-confirmation__nav"
        title="确认订单"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: handleBack,
        }}
      />

      <div className="payment-confirmation__shell">
        <main className="payment-confirmation__content">
          <div className="payment-confirmation__main-info">
            <div className="payment-confirmation__expiration">
              <p className="payment-confirmation__expiration-label">会员到期时间</p>
              <strong className="payment-confirmation__expiration-date">{expirationInfo.label}</strong>
            </div>

            <div className="payment-confirmation__order-details">
              <div className="payment-confirmation__order-row">
                <span>购买会员版本</span>
                <strong>{plan.name}</strong>
              </div>
              <div className="payment-confirmation__order-row">
                <span>购买时长</span>
                <div className="payment-confirmation__quantity-control">
                  <button
                    type="button"
                    className="payment-confirmation__quantity-btn"
                    onClick={handleQuantityDecrease}
                    disabled={quantity <= 1}
                  >
                    <MaterialIcon name="remove" />
                  </button>
                  <span className="payment-confirmation__quantity-value">{quantity} 个月</span>
                  <button
                    type="button"
                    className="payment-confirmation__quantity-btn"
                    onClick={handleQuantityIncrease}
                    disabled={quantity >= 12}
                  >
                    <MaterialIcon name="add" />
                  </button>
                </div>
              </div>
              <div className="payment-confirmation__order-row">
                <span>单价</span>
                <strong>¥{formatPrice(plan.amount)} / 月</strong>
              </div>
              <div className="payment-confirmation__order-row payment-confirmation__order-row--total">
                <span>总金额</span>
                <strong>¥{formatPrice(totalAmount)}</strong>
              </div>
            </div>

            <div className="payment-confirmation__methods">
              <p className="payment-confirmation__methods-label">支付方式</p>
              <div className="payment-confirmation__methods-list">
                {PAYMENT_METHODS.map((method) => (
                  <PaymentMethodButton
                    key={method.id}
                    method={method.id}
                    label={method.label}
                    isActive={paymentMethod === method.id}
                    onClick={handlePaymentMethodChange}
                  />
                ))}
              </div>
            </div>
          </div>
        </main>

        <footer className="payment-confirmation__footer">
          <p className="payment-confirmation__meta">你的创作之旅将更加精彩！</p>
          <ConfirmButton
            planId={plan.id}
            expiresAt={expirationInfo.iso}
            paymentMethod={paymentMethod}
            onConfirm={onConfirm}
          />
        </footer>
      </div>
    </div>
  );
}

export default PaymentConfirmation;














