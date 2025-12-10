"""
支付宝支付工具类
"""
import os
import logging
from alipay import AliPay
from django.conf import settings

logger = logging.getLogger(__name__)


def get_alipay_client():
    """
    获取支付宝客户端实例
    
    Returns:
        AliPay: 支付宝客户端实例
    """
    appid = os.getenv("ALIPAY_APPID")
    app_notify_url = os.getenv("ALIPAY_NOTIFY_URL")
    app_private_key = os.getenv("ALIPAY_PRIVATE_KEY")
    alipay_public_key = os.getenv("ALIPAY_PUBLIC_KEY")
    sign_type = os.getenv("ALIPAY_SIGN_TYPE", "RSA2")
    debug = os.getenv("ALIPAY_DEBUG", "False").lower() == "true"
    
    if not appid:
        raise ValueError("ALIPAY_APPID 环境变量未设置")
    if not app_private_key:
        raise ValueError("ALIPAY_PRIVATE_KEY 环境变量未设置")
    if not alipay_public_key:
        raise ValueError("ALIPAY_PUBLIC_KEY 环境变量未设置")
    
    # 处理私钥格式：如果已经包含头尾，直接使用；否则添加头尾
    if "-----BEGIN" not in app_private_key:
        # 如果没有头尾，添加RSA私钥头尾
        app_private_key = app_private_key.strip()
        # 每64个字符换行（RSA密钥的标准格式）
        formatted_key = "\n".join([app_private_key[i:i+64] for i in range(0, len(app_private_key), 64)])
        app_private_key = f"-----BEGIN RSA PRIVATE KEY-----\n{formatted_key}\n-----END RSA PRIVATE KEY-----"
    else:
        # 如果已有头尾，确保格式正确（每64字符换行）
        lines = app_private_key.split("\n")
        key_lines = [line for line in lines if line and not line.startswith("-----")]
        if key_lines:
            key_content = "".join(key_lines)
            formatted_key = "\n".join([key_content[i:i+64] for i in range(0, len(key_content), 64)])
            app_private_key = f"-----BEGIN RSA PRIVATE KEY-----\n{formatted_key}\n-----END RSA PRIVATE KEY-----"
    
    # 处理支付宝公钥格式
    if "-----BEGIN" not in alipay_public_key:
        # 如果没有头尾，添加公钥头尾
        alipay_public_key = alipay_public_key.strip()
        # 每64个字符换行
        formatted_key = "\n".join([alipay_public_key[i:i+64] for i in range(0, len(alipay_public_key), 64)])
        alipay_public_key = f"-----BEGIN PUBLIC KEY-----\n{formatted_key}\n-----END PUBLIC KEY-----"
    else:
        # 如果已有头尾，确保格式正确
        lines = alipay_public_key.split("\n")
        key_lines = [line for line in lines if line and not line.startswith("-----")]
        if key_lines:
            key_content = "".join(key_lines)
            formatted_key = "\n".join([key_content[i:i+64] for i in range(0, len(key_content), 64)])
            alipay_public_key = f"-----BEGIN PUBLIC KEY-----\n{formatted_key}\n-----END PUBLIC KEY-----"
    
    alipay = AliPay(
        appid=appid,
        app_notify_url=app_notify_url,
        app_private_key_string=app_private_key,
        alipay_public_key_string=alipay_public_key,
        sign_type=sign_type,
        debug=debug,
    )
    
    return alipay


def create_alipay_payment_url(order_number: str, amount: str, subject: str, return_url: str = None) -> str:
    """
    创建支付宝支付URL（手机网站支付）
    
    Args:
        order_number: 订单号
        amount: 金额（字符串，单位：元）
        subject: 订单标题
        return_url: 支付成功后的跳转URL（可选）
    
    Returns:
        str: 支付URL
    """
    alipay = get_alipay_client()
    
    notify_url = os.getenv("ALIPAY_NOTIFY_URL")
    if not return_url:
        return_url = os.getenv("ALIPAY_RETURN_URL", "")
    
    # 使用手机网站支付接口
    order_string = alipay.api_alipay_trade_wap_pay(
        out_trade_no=order_number,
        total_amount=amount,
        subject=subject,
        return_url=return_url,
        notify_url=notify_url,
    )
    
    # 生成支付URL
    gateway = os.getenv("ALIPAY_GATEWAY", "https://openapi.alipay.com/gateway.do")
    pay_url = f"{gateway}?{order_string}"
    
    return pay_url


def verify_alipay_notify(data: dict, sign: str) -> bool:
    """
    验证支付宝回调签名
    
    Args:
        data: 回调数据（字典，不包含sign）
        sign: 签名
    
    Returns:
        bool: 验证是否通过
    """
    try:
        alipay = get_alipay_client()
        return alipay.verify(data, sign)
    except Exception as e:
        logger.error(f"支付宝签名验证失败: {e}")
        return False


def query_alipay_order_status(order_number: str) -> dict:
    """
    查询支付宝订单状态
    
    Args:
        order_number: 商户订单号
    
    Returns:
        dict: 订单信息，包含 trade_status, trade_no 等
    """
    try:
        alipay = get_alipay_client()
        response = alipay.api_alipay_trade_query(out_trade_no=order_number)
        
        if response.get("code") == "10000":  # 查询成功
            return {
                "success": True,
                "trade_status": response.get("trade_status"),
                "trade_no": response.get("trade_no"),
                "total_amount": response.get("total_amount"),
                "buyer_logon_id": response.get("buyer_logon_id"),
                "gmt_payment": response.get("gmt_payment"),
            }
        else:
            logger.warning(f"查询支付宝订单失败: {response.get('msg')}")
            return {
                "success": False,
                "msg": response.get("msg", "查询失败"),
            }
    except Exception as e:
        logger.exception(f"查询支付宝订单异常: {e}")
        return {
            "success": False,
            "msg": str(e),
        }

