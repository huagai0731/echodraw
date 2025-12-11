import { useEffect, useState, useCallback } from "react";
import TopNav from "@/components/TopNav";
import api from "@/services/api";
import "./WechatPayment.css";

type WechatPaymentProps = {
  codeUrl: string;
  orderId: number;
  onBack: () => void;
  onSuccess: () => void;
};

function WechatPayment({ codeUrl, orderId, onBack, onSuccess }: WechatPaymentProps) {
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "success" | "timeout">("pending");

  // 轮询检查支付状态
  useEffect(() => {
    if (checkingPayment || paymentStatus !== "pending") {
      return;
    }

    setCheckingPayment(true);
    let pollCount = 0;
    const maxPolls = 120; // 最多轮询120次（约10分钟）
    const pollInterval = 5000; // 每5秒轮询一次

    const checkOrderStatus = async () => {
      try {
        const response = await api.get<{
          order_id: number;
          order_number: string;
          status: string;
          amount: string;
          payment_method: string;
          paid_at: string | null;
          created_at: string;
        }>(`/payments/orders/${orderId}/status/`);

        if (response.data.status === "paid") {
          // 支付成功
          setPaymentStatus("success");
          setCheckingPayment(false);
          
          // 延迟一下再调用成功回调，让用户看到成功提示
          setTimeout(() => {
            onSuccess();
          }, 1500);
          return;
        }

        // 如果还没支付，继续轮询
        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(checkOrderStatus, pollInterval);
        } else {
          // 轮询超时
          setPaymentStatus("timeout");
          setCheckingPayment(false);
          console.warn("[Echo] Order status polling timeout");
        }
      } catch (error: any) {
        console.error("[Echo] Failed to check order status:", error);
        // 如果订单不存在或出错，停止轮询
        if (error?.response?.status === 404) {
          setCheckingPayment(false);
        } else {
          // 其他错误，继续重试几次
          pollCount++;
          if (pollCount < maxPolls) {
            setTimeout(checkOrderStatus, pollInterval);
          } else {
            setCheckingPayment(false);
          }
        }
      }
    };

    // 延迟2秒后开始第一次检查（给页面一些时间加载）
    const timeoutId = setTimeout(checkOrderStatus, 2000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [orderId, checkingPayment, paymentStatus, onSuccess]);

  const handleBack = useCallback(() => {
    onBack();
  }, [onBack]);

  // 生成二维码图片URL（使用在线二维码生成服务）
  const qrcodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(codeUrl)}`;

  return (
    <div className="wechat-payment">
      <div className="wechat-payment__bg">
        <span className="wechat-payment__glow wechat-payment__glow--one" />
        <span className="wechat-payment__glow wechat-payment__glow--two" />
      </div>
      <TopNav
        className="top-nav--fixed top-nav--flush wechat-payment__nav"
        title="微信支付"
        leadingAction={{
          icon: "arrow_back",
          label: "返回",
          onClick: handleBack,
        }}
      />

      <main className="wechat-payment__content">
        {paymentStatus === "success" ? (
          <div className="wechat-payment__success">
            <div className="wechat-payment__success-icon">✓</div>
            <h2>支付成功！</h2>
            <p>您的会员已激活</p>
          </div>
        ) : paymentStatus === "timeout" ? (
          <div className="wechat-payment__timeout">
            <div className="wechat-payment__timeout-icon">!</div>
            <h2>支付超时</h2>
            <p>请返回重新发起支付</p>
            <button className="wechat-payment__retry-btn" onClick={handleBack}>
              返回
            </button>
          </div>
        ) : (
          <>
            <div className="wechat-payment__instructions">
              <h2>请使用微信扫码支付</h2>
              <p>打开微信扫一扫，扫描下方二维码完成支付</p>
            </div>

            <div className="wechat-payment__qrcode-container">
              <div className="wechat-payment__qrcode-wrapper">
                <img
                  src={qrcodeImageUrl}
                  alt="微信支付二维码"
                  className="wechat-payment__qrcode"
                  onError={(e) => {
                    // 如果在线服务失败，尝试使用另一个服务
                    const target = e.currentTarget;
                    target.src = `https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(codeUrl)}`;
                  }}
                />
                {checkingPayment && (
                  <div className="wechat-payment__checking">
                    <span>正在检查支付状态...</span>
                  </div>
                )}
              </div>
            </div>

            <div className="wechat-payment__tips">
              <p>• 请确保微信已安装并登录</p>
              <p>• 支付完成后，页面将自动跳转</p>
              <p>• 如遇问题，请联系客服</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default WechatPayment;

