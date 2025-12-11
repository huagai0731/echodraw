/**
 * 微信相关工具函数
 */

/**
 * 检测是否在微信浏览器中
 */
export function isWechatBrowser(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const ua = window.navigator.userAgent.toLowerCase();
  return /micromessenger/i.test(ua);
}

/**
 * 获取微信授权URL
 * @param redirectUri 授权后重定向的URI（不需要预先编码）
 * @param state 可选的状态参数，用于保持请求前后状态一致
 * @returns 微信授权URL
 */
export function getWechatOAuthUrl(redirectUri: string, state?: string): string {
  const appid = import.meta.env.VITE_WECHAT_APPID || "";
  if (!appid) {
    console.warn("[Wechat] VITE_WECHAT_APPID not configured");
    return "";
  }
  
  // 微信要求 redirect_uri 必须使用 encodeURIComponent 编码
  // 注意：不能使用 URLSearchParams，因为它会对已编码的URL再次编码
  // 所以手动构建URL参数
  const encodedRedirectUri = encodeURIComponent(redirectUri);
  const encodedState = state ? encodeURIComponent(state) : "";
  
  // 调试信息：输出实际使用的 redirect_uri（仅在开发环境）
  if (import.meta.env.DEV) {
    console.log("[Wechat OAuth] redirect_uri 信息:", {
      original: redirectUri,
      encoded: encodedRedirectUri,
      domain: new URL(redirectUri).hostname,
    });
  }
  
  const baseUrl = "https://open.weixin.qq.com/connect/oauth2/authorize";
  // 手动构建URL参数，避免双重编码
  const params = [
    `appid=${encodeURIComponent(appid)}`,
    `redirect_uri=${encodedRedirectUri}`, // 已经用 encodeURIComponent 编码过了
    `response_type=code`,
    `scope=snsapi_base`, // 静默授权，不需要用户确认
    encodedState ? `state=${encodedState}` : "",
  ].filter(Boolean).join("&");
  
  return `${baseUrl}?${params}#wechat_redirect`;
}

/**
 * 调起微信JSAPI支付
 * @param jsapiParams 从后端获取的JSAPI支付参数
 * @returns Promise，成功时resolve，失败时reject
 */
export function invokeWechatPay(jsapiParams: {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: string;
  paySign: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    // 检查是否在微信浏览器中
    if (!isWechatBrowser()) {
      reject(new Error("请在微信中打开此页面"));
      return;
    }

    // 检查微信JS-SDK是否可用
    if (typeof window === "undefined" || !(window as any).WeixinJSBridge) {
      // 如果WeixinJSBridge未加载，尝试等待
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          waitForWeixinJSBridge(jsapiParams, resolve, reject);
        });
      } else {
        waitForWeixinJSBridge(jsapiParams, resolve, reject);
      }
    } else {
      callWechatPay(jsapiParams, resolve, reject);
    }
  });
}

/**
 * 等待微信JS-SDK加载完成
 */
function waitForWeixinJSBridge(
  jsapiParams: {
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
  },
  resolve: () => void,
  reject: (error: Error) => void,
  retries = 10
): void {
  if (typeof window === "undefined") {
    reject(new Error("Window object not available"));
    return;
  }

  const wx = (window as any).WeixinJSBridge;
  if (wx) {
    callWechatPay(jsapiParams, resolve, reject);
  } else if (retries > 0) {
    setTimeout(() => {
      waitForWeixinJSBridge(jsapiParams, resolve, reject, retries - 1);
    }, 200);
  } else {
    // 尝试使用document.addEventListener方式
    if (typeof document !== "undefined") {
      document.addEventListener("WeixinJSBridgeReady", () => {
        callWechatPay(jsapiParams, resolve, reject);
      });
      // 如果3秒后还没加载，则失败
      setTimeout(() => {
        if (!(window as any).WeixinJSBridge) {
          reject(new Error("微信JS-SDK加载超时，请刷新页面重试"));
        }
      }, 3000);
    } else {
      reject(new Error("微信JS-SDK未加载，请刷新页面重试"));
    }
  }
}

/**
 * 调用微信支付
 */
function callWechatPay(
  jsapiParams: {
    appId: string;
    timeStamp: string;
    nonceStr: string;
    package: string;
    signType: string;
    paySign: string;
  },
  resolve: () => void,
  reject: (error: Error) => void
): void {
  if (typeof window === "undefined") {
    reject(new Error("Window object not available"));
    return;
  }

  const wx = (window as any).WeixinJSBridge;
  if (!wx) {
    reject(new Error("微信JS-SDK未加载"));
    return;
  }

  // 记录支付参数（不包含paySign，避免泄露）
  console.log("[WeChat Pay] 调起支付，参数:", {
    appId: jsapiParams.appId,
    timeStamp: jsapiParams.timeStamp,
    nonceStr: jsapiParams.nonceStr,
    package: jsapiParams.package,
    signType: jsapiParams.signType,
    paySignLength: jsapiParams.paySign?.length || 0,
  });

  wx.invoke(
    "getBrandWCPayRequest",
    {
      appId: jsapiParams.appId,
      timeStamp: jsapiParams.timeStamp,
      nonceStr: jsapiParams.nonceStr,
      package: jsapiParams.package,
      signType: jsapiParams.signType,
      paySign: jsapiParams.paySign,
    },
    (res: any) => {
      console.log("[WeChat Pay] 支付回调:", res);
      if (res.err_msg === "get_brand_wcpay_request:ok") {
        // 支付成功
        resolve();
      } else if (res.err_msg === "get_brand_wcpay_request:cancel") {
        // 用户取消支付
        reject(new Error("用户取消支付"));
      } else {
        // 支付失败，提供更详细的错误信息
        const errorMsg = res.err_msg || "支付失败";
        console.error("[WeChat Pay] 支付失败:", errorMsg, res);
        // 如果是签名验证失败，提供更明确的提示
        if (errorMsg.includes("sign") || errorMsg.includes("签名")) {
          reject(new Error("支付签名验证失败，请刷新页面重试"));
        } else {
          reject(new Error(errorMsg));
        }
      }
    }
  );
}

/**
 * 获取当前页面的完整URL（用于微信授权回调）
 * 注意：微信要求redirect_uri的域名必须与配置的网页授权域名完全一致
 * 返回格式：https://domain.com/（使用根路径，确保域名匹配）
 */
export function getCurrentUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  // 返回当前页面的完整 URL（包括路径和查询参数）
  // 这样授权回调后会回到原来的页面，而不是总是回到首页
  // 注意：需要移除可能存在的 code 和 state 参数，避免重复授权
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  return url.toString();
}

