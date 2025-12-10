import { useMemo, useState, useCallback, memo, useRef, useEffect } from "react";
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
    quantity: number;
    totalAmount: number;
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
  quantity: number;
  totalAmount: number;
  onConfirm: (payload: {
    tier: MembershipTier;
    expiresAt: string;
    paymentMethod: PaymentMethod;
    quantity: number;
    totalAmount: number;
  }) => void;
};

const ConfirmButton = memo(function ConfirmButton({
  planId,
  expiresAt,
  paymentMethod,
  quantity,
  totalAmount,
  onConfirm,
}: ConfirmButtonProps) {
  const [submitting, setSubmitting] = useState(false);

  // 检查是否从支付宝返回，如果是则重置按钮状态
  useEffect(() => {
    const checkReturnFromPayment = () => {
      // 如果当前不在支付宝页面，但之前可能跳转过，重置状态
      if (!window.location.href.includes("alipay.com") && 
          !window.location.href.includes("alipaydev.com") &&
          submitting) {
        // 延迟重置，给页面一些时间处理
        const timer = setTimeout(() => {
          setSubmitting(false);
        }, 1000);
        return () => clearTimeout(timer);
      }
    };
    
    checkReturnFromPayment();
  }, [submitting]);

  const handleClick = useCallback(() => {
    if (submitting) {
      return; // 防止重复点击
    }
    setSubmitting(true);
    try {
      onConfirm({
        tier: planId,
        expiresAt,
        paymentMethod,
        quantity,
        totalAmount,
      });
      // 注意：如果跳转到支付宝，这个组件会被卸载，所以不需要重置状态
    } catch (error) {
      setSubmitting(false);
    }
  }, [planId, expiresAt, paymentMethod, quantity, totalAmount, onConfirm, submitting]);

  return (
    <button
      type="button"
      className="payment-confirmation__confirm"
      onClick={handleClick}
      disabled={submitting}
    >
      {submitting ? "处理中..." : "确认支付"}
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
            quantity={quantity}
            totalAmount={totalAmount}
            onConfirm={onConfirm}
          />
        </footer>
      </div>
    </div>
  );
}

export default PaymentConfirmation;














