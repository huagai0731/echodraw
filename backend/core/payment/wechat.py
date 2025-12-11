"""
微信支付工具类
"""
import os
import logging
import time
from decimal import Decimal
from wechatpayv3 import WeChatPay, WeChatPayType
from django.conf import settings

logger = logging.getLogger(__name__)


def get_wechatpay_client():
    """
    获取微信支付客户端实例（只使用公钥模式，JSAPI支付）
    
    Returns:
        WeChatPay: 微信支付客户端实例（JSAPI类型，公钥模式）
    """
    # 直接使用 JSAPI 客户端，因为只支持 JSAPI 支付和公钥模式
    return get_wechatpay_client_jsapi()


def verify_wechatpay_notify(headers: dict, body: str) -> dict:
    """
    验证微信支付回调签名并解析数据（只使用公钥模式）
    
    Args:
        headers: HTTP请求头（包含签名信息）
        body: 请求体（JSON字符串）
    
    Returns:
        dict: 解析后的回调数据，如果验证失败则返回None
    """
    try:
        # 使用 JSAPI 客户端（公钥模式），确保与创建订单时使用相同的配置
        wechatpay = get_wechatpay_client_jsapi()
        
        # 从请求头获取签名信息
        signature = headers.get('Wechatpay-Signature', '')
        timestamp = headers.get('Wechatpay-Timestamp', '')
        nonce = headers.get('Wechatpay-Nonce', '')
        serial = headers.get('Wechatpay-Serial', '')
        
        if not all([signature, timestamp, nonce, serial]):
            logger.warning("微信支付回调缺少必要的签名信息")
            return None
        
        # 验证签名
        result = wechatpay.callback(headers, body)
        
        if result:
            # 验证成功，返回解析后的数据
            return result
        else:
            logger.warning("微信支付回调签名验证失败")
            return None
    except Exception as e:
        logger.exception(f"验证微信支付回调失败: {e}")
        return None


def get_wechatpay_client_jsapi():
    """
    获取微信支付客户端实例（JSAPI支付专用）
    
    Returns:
        WeChatPay: 微信支付客户端实例（JSAPI类型）
    """
    # 复用 get_wechatpay_client 的逻辑，但使用 JSAPI 类型
    appid = os.getenv("WECHAT_APPID")
    mchid = os.getenv("WECHAT_MCHID")
    private_key_path = os.getenv("WECHAT_PRIVATE_KEY_PATH")
    cert_serial_no = os.getenv("WECHAT_CERT_SERIAL_NO")
    app_notify_url = os.getenv("WECHAT_NOTIFY_URL")
    apiv3_key = os.getenv("WECHAT_APIV3_KEY")
    wechatpay_public_key_path = os.getenv("WECHAT_PUBLIC_KEY_PATH")
    private_key_string = os.getenv("WECHAT_PRIVATE_KEY")
    wechatpay_public_key_string = os.getenv("WECHAT_PUBLIC_KEY")
    wechatpay_public_key_id = os.getenv("WECHAT_PUBLIC_KEY_ID")
    wechat_cert_dir = os.getenv("WECHAT_CERT_DIR")
    
    if not appid or not mchid or not apiv3_key or not cert_serial_no:
        raise ValueError("微信支付配置不完整")
    
    # 处理私钥
    private_key = None
    if private_key_path and os.path.exists(private_key_path):
        with open(private_key_path, 'r', encoding='utf-8') as f:
            private_key = f.read().strip()
    elif private_key_string:
        private_key = private_key_string.strip()
        if '-----BEGIN' not in private_key:
            private_key = f"-----BEGIN PRIVATE KEY-----\n{private_key}\n-----END PRIVATE KEY-----"
    else:
        raise ValueError("必须设置 WECHAT_PRIVATE_KEY_PATH 或 WECHAT_PRIVATE_KEY")
    
    # 处理公钥（JSAPI支付只使用公钥模式，不使用证书模式）
    public_key = None
    cert_dir = None
    
    # 优先使用公钥文件路径
    if wechatpay_public_key_path and os.path.exists(wechatpay_public_key_path):
        if not os.path.isdir(wechatpay_public_key_path):
            with open(wechatpay_public_key_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
            if '-----BEGIN PUBLIC KEY-----' in content:
                public_key = content
                logger.info("✅ 使用公钥文件模式")
            elif '-----BEGIN CERTIFICATE-----' in content:
                # 如果是证书格式，忽略，只使用公钥模式
                logger.warning(f"文件 {wechatpay_public_key_path} 是证书格式，但JSAPI支付只使用公钥模式，将忽略此文件")
    # 其次使用公钥字符串
    elif wechatpay_public_key_string:
        public_key = wechatpay_public_key_string.strip()
        if '-----BEGIN' not in public_key:
            public_key = f"-----BEGIN PUBLIC KEY-----\n{public_key}\n-----END PUBLIC KEY-----"
        logger.info("✅ 使用公钥字符串模式")
    
    # 如果没有配置公钥，报错
    if not public_key:
        raise ValueError(
            "JSAPI支付必须配置公钥模式。请设置 WECHAT_PUBLIC_KEY_PATH 或 WECHAT_PUBLIC_KEY 环境变量，"
            "并确保 WECHAT_PUBLIC_KEY_ID 也已设置。"
        )
    
    # 创建 JSAPI 类型的客户端（只使用公钥模式，不使用证书模式）
    # wechatpay_type 是初始化时的必需参数，用于指定支付类型
    if not wechatpay_public_key_id:
        raise ValueError("使用公钥模式必须设置 WECHAT_PUBLIC_KEY_ID 环境变量")
    
    init_params = {
        'wechatpay_type': WeChatPayType.JSAPI,  # JSAPI 支付（公众号内支付）
        'mchid': mchid,
        'private_key': private_key,
        'cert_serial_no': cert_serial_no,
        'appid': appid,
        'apiv3_key': apiv3_key,
        'notify_url': app_notify_url,
        'public_key': public_key,  # 使用公钥模式
        'public_key_id': wechatpay_public_key_id,  # 公钥ID是必需的
    }
    
    logger.info(f"✅ JSAPI支付使用公钥模式，公钥ID: {wechatpay_public_key_id}")
    logger.info(f"公钥长度: {len(public_key)} 字符")
    
    wechatpay = WeChatPay(**init_params)
    
    return wechatpay


def create_wechatpay_jsapi(order_number: str, amount: str, description: str, openid: str) -> dict:
    """
    创建微信支付JSAPI订单（公众号内支付）
    
    Args:
        order_number: 订单号
        amount: 金额（字符串，单位：元）
        description: 商品描述
        openid: 用户的openid（从公众号授权获取）
    
    Returns:
        dict: 包含支付参数的字典，用于前端调起支付
        {
            "appId": "wx...",
            "timeStamp": "1234567890",
            "nonceStr": "abc123",
            "package": "prepay_id=wx...",
            "signType": "RSA",
            "paySign": "..."
        }
    """
    wechatpay = get_wechatpay_client_jsapi()
    
    # 将金额转换为分（微信支付使用分为单位）
    amount_yuan = Decimal(str(amount))
    amount_fen = int(amount_yuan * 100)
    
    # 调用JSAPI支付接口（使用公钥模式，不需要证书）
    try:
        code, message = wechatpay.pay(
            description=description,
            out_trade_no=order_number,
            amount={"total": amount_fen, "currency": "CNY"},
            payer={"openid": openid},
        )
    except Exception as e:
        logger.error(f"创建微信支付JSAPI订单失败: {e}")
        raise ValueError(f"创建微信支付JSAPI订单失败: {e}")
    
    # 解析返回数据
    if isinstance(message, str):
        import json
        try:
            message = json.loads(message)
        except json.JSONDecodeError:
            pass
    
    if code in range(200, 300):
        # 成功，获取prepay_id
        if isinstance(message, dict):
            prepay_id = message.get('prepay_id')
            if not prepay_id:
                raise ValueError("微信支付返回数据中缺少prepay_id")
            
            # 生成前端调起支付所需的参数
            appid = os.getenv("WECHAT_APPID")
            timestamp = str(int(time.time()))
            nonce_str = message.get('nonce_str', '') or os.urandom(16).hex()
            
            # 生成签名
            # 签名串格式：appId\n时间戳\n随机字符串\nprepay_id=xxx\n
            sign_str = f"{appid}\n{timestamp}\n{nonce_str}\nprepay_id={prepay_id}\n"
            
            # 使用wechatpayv3库的签名方法（如果可用）
            try:
                # 尝试使用库的签名方法
                if hasattr(wechatpay._core, 'sign'):
                    pay_sign = wechatpay._core.sign(sign_str)
                else:
                    # 如果库没有提供签名方法，使用cryptography手动签名
                    from cryptography.hazmat.primitives import hashes, serialization
                    from cryptography.hazmat.primitives.asymmetric import padding
                    from cryptography.hazmat.backends import default_backend
                    
                    # 获取私钥
                    private_key_path = os.getenv("WECHAT_PRIVATE_KEY_PATH")
                    private_key_string = os.getenv("WECHAT_PRIVATE_KEY")
                    
                    private_key_content = None
                    if private_key_path and os.path.exists(private_key_path):
                        with open(private_key_path, 'r', encoding='utf-8') as f:
                            private_key_content = f.read().strip()
                    elif private_key_string:
                        private_key_content = private_key_string.strip()
                        if '-----BEGIN' not in private_key_content:
                            private_key_content = f"-----BEGIN PRIVATE KEY-----\n{private_key_content}\n-----END PRIVATE KEY-----"
                    
                    if not private_key_content:
                        raise ValueError("无法获取商户私钥用于签名")
                    
                    # 加载私钥并签名
                    private_key = serialization.load_pem_private_key(
                        private_key_content.encode('utf-8'),
                        password=None,
                        backend=default_backend()
                    )
                    
                    signature = private_key.sign(
                        sign_str.encode('utf-8'),
                        padding.PKCS1v15(),
                        hashes.SHA256()
                    )
                    
                    # Base64编码签名
                    import base64
                    pay_sign = base64.b64encode(signature).decode('utf-8')
            except Exception as sign_error:
                logger.exception(f"生成JSAPI支付签名失败: {sign_error}")
                # 如果签名失败，尝试使用库的私钥对象
                try:
                    # 尝试从wechatpay对象获取私钥
                    if hasattr(wechatpay._core, '_private_key'):
                        from cryptography.hazmat.primitives import hashes
                        from cryptography.hazmat.primitives.asymmetric import padding
                        import base64
                        
                        private_key = wechatpay._core._private_key
                        signature = private_key.sign(
                            sign_str.encode('utf-8'),
                            padding.PKCS1v15(),
                            hashes.SHA256()
                        )
                        pay_sign = base64.b64encode(signature).decode('utf-8')
                    else:
                        raise ValueError(f"无法生成JSAPI支付签名: {sign_error}")
                except Exception as e2:
                    logger.exception(f"使用库的私钥签名也失败: {e2}")
                    raise ValueError(f"无法生成JSAPI支付签名: {sign_error}")
            
            return {
                "appId": appid,
                "timeStamp": timestamp,
                "nonceStr": nonce_str,
                "package": f"prepay_id={prepay_id}",
                "signType": "RSA",
                "paySign": pay_sign,
            }
        else:
            raise ValueError(f"微信支付返回数据格式错误: {message}")
    else:
        # 失败
        error_msg = message.get('message', '未知错误') if isinstance(message, dict) else str(message)
        raise ValueError(f"创建微信支付JSAPI订单失败: {error_msg}")


def query_wechatpay_order_status(order_number: str) -> dict:
    """
    查询微信支付订单状态（使用公钥模式）
    
    Args:
        order_number: 商户订单号
    
    Returns:
        dict: 订单信息，包含 trade_state, transaction_id 等
    """
    try:
        # 使用JSAPI客户端（公钥模式）查询订单
        wechatpay = get_wechatpay_client_jsapi()
        
        # 调用查询订单接口
        code, message = wechatpay.query(out_trade_no=order_number)
        
        # 解析返回数据（可能是字符串或字典）
        if isinstance(message, str):
            import json
            try:
                message = json.loads(message)
            except json.JSONDecodeError:
                pass
        
        if code in range(200, 300):
            # 查询成功
            if isinstance(message, dict):
                return {
                    "success": True,
                    "trade_state": message.get("trade_state"),
                    "transaction_id": message.get("transaction_id"),
                    "amount": message.get("amount", {}).get("total") if isinstance(message.get("amount"), dict) else None,  # 分为单位
                "payer": message.get("payer", {}).get("openid"),
                "success_time": message.get("success_time"),
            }
        else:
            # 查询失败
            error_msg = message.get('message', '未知错误') if isinstance(message, dict) else str(message)
            logger.warning(f"查询微信支付订单失败: {error_msg}")
            return {
                "success": False,
                "msg": error_msg,
            }
    except Exception as e:
        logger.exception(f"查询微信支付订单异常: {e}")
        return {
            "success": False,
            "msg": str(e),
        }

