"""
微信支付工具类
"""
import os
import logging
from decimal import Decimal
from wechatpayv3 import WeChatPay, WeChatPayType
from django.conf import settings

logger = logging.getLogger(__name__)


def get_wechatpay_client():
    """
    获取微信支付客户端实例
    
    Returns:
        WeChatPay: 微信支付客户端实例
    """
    appid = os.getenv("WECHAT_APPID")
    mchid = os.getenv("WECHAT_MCHID")
    private_key_path = os.getenv("WECHAT_PRIVATE_KEY_PATH")
    cert_serial_no = os.getenv("WECHAT_CERT_SERIAL_NO")
    app_notify_url = os.getenv("WECHAT_NOTIFY_URL")
    apiv3_key = os.getenv("WECHAT_APIV3_KEY")
    wechatpay_public_key_path = os.getenv("WECHAT_PUBLIC_KEY_PATH")
    
    # 支持从环境变量直接读取私钥内容（用于容器化部署）
    private_key_string = os.getenv("WECHAT_PRIVATE_KEY")
    
    # 支持从环境变量直接读取平台公钥内容（用于容器化部署）
    wechatpay_public_key_string = os.getenv("WECHAT_PUBLIC_KEY")
    
    if not appid:
        raise ValueError("WECHAT_APPID 环境变量未设置")
    if not mchid:
        raise ValueError("WECHAT_MCHID 环境变量未设置")
    if not apiv3_key:
        raise ValueError("WECHAT_APIV3_KEY 环境变量未设置（在微信支付商户平台 -> API安全 -> API密钥中设置）")
    if not cert_serial_no:
        raise ValueError("WECHAT_CERT_SERIAL_NO 环境变量未设置")
    
    # 处理商户私钥：优先使用文件路径，如果没有则使用字符串
    private_key = None
    if private_key_path and os.path.exists(private_key_path):
        # 从文件读取私钥
        with open(private_key_path, 'r', encoding='utf-8') as f:
            private_key = f.read().strip()
    elif private_key_string:
        # 使用私钥字符串
        private_key = private_key_string.strip()
        
        # 检查私钥长度（完整的 RSA 私钥通常需要 1000+ 字符）
        if len(private_key) < 500 and '-----BEGIN' not in private_key:
            raise ValueError(
                f"商户私钥内容不完整（只有 {len(private_key)} 字符，完整私钥通常需要 1000+ 字符）。\n"
                "请确保从 apiclient_key.pem 文件中复制完整的私钥内容（包括所有行）。"
            )
        
        # 如果没有 BEGIN/END 标记，尝试添加（类似支付宝的方式）
        if '-----BEGIN' not in private_key and '-----END' not in private_key:
            # 只有 base64 内容，尝试添加 PRIVATE KEY 标记
            private_key = f"-----BEGIN PRIVATE KEY-----\n{private_key}\n-----END PRIVATE KEY-----"
            logger.info("自动为商户私钥添加了 PRIVATE KEY 标记")
    else:
        raise ValueError("必须设置 WECHAT_PRIVATE_KEY_PATH 或 WECHAT_PRIVATE_KEY 环境变量")
    
    # 处理平台公钥：优先使用文件路径，如果没有则使用字符串
    public_key = None
    cert_dir = None
    
    # 检查是否有 cert_dir 配置（用于存放证书的目录）
    # 注意：cert_dir 方式需要 CERTIFICATE 格式的证书，不是 PUBLIC KEY
    wechat_cert_dir = os.getenv("WECHAT_CERT_DIR")
    if wechat_cert_dir and os.path.isdir(wechat_cert_dir):
        # 检查目录中是否有有效的证书文件
        has_valid_cert = False
        for file_name in os.listdir(wechat_cert_dir):
            if file_name.lower().endswith('.pem'):
                cert_file_path = os.path.join(wechat_cert_dir, file_name)
                try:
                    with open(cert_file_path, 'r', encoding='utf-8') as f:
                        cert_content = f.read()
                        if '-----BEGIN CERTIFICATE-----' in cert_content:
                            has_valid_cert = True
                            break
                except:
                    pass
        
        if has_valid_cert:
            cert_dir = wechat_cert_dir
            logger.info(f"使用证书目录: {cert_dir}")
            # 如果使用 cert_dir，就不需要 public_key 了
            public_key = None
        else:
            logger.warning(f"证书目录 {wechat_cert_dir} 中没有找到有效的 CERTIFICATE 格式证书，将切换到平台证书模式（自动获取）")
            # 不设置 cert_dir，让后续逻辑处理（切换到平台证书模式）
    
    # 切换到平台证书模式（推荐用于生产环境）
    # 微信支付公钥（PUBLIC KEY）可以用于验证签名，但 wechatpayv3 库需要 CERTIFICATE 格式
    # 解决方案：使用 cert_dir 模式，让库自动从微信支付 API 获取证书
    
    # 如果还没有设置 cert_dir，检查是否有 PUBLIC KEY 格式的文件，如果有则切换到平台证书模式
    # 注意：微信支付公钥（PUBLIC KEY）可以用于验证签名，但 wechatpayv3 库需要 CERTIFICATE 格式
    # 所以我们需要切换到平台证书模式，让库自动获取 CERTIFICATE 格式的证书
    if not cert_dir:
        # 如果配置了 WECHAT_PUBLIC_KEY_PATH，检查文件格式
        if wechatpay_public_key_path and os.path.exists(wechatpay_public_key_path):
            if os.path.isdir(wechatpay_public_key_path):
                cert_dir = wechatpay_public_key_path
                logger.info(f"使用证书目录: {cert_dir}")
            else:
                # 检查文件格式
                with open(wechatpay_public_key_path, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                
                if '-----BEGIN CERTIFICATE-----' in content:
                    # 是 CERTIFICATE 格式，可以使用 cert_dir
                    from pathlib import Path
                    BASE_DIR = Path(__file__).resolve().parent.parent.parent
                    cert_dir_path = BASE_DIR / "wechatpay_certs_auto"
                    cert_dir_path.mkdir(exist_ok=True)
                    import shutil
                    shutil.copy(wechatpay_public_key_path, cert_dir_path / "wechatpay_cert.pem")
                    cert_dir = str(cert_dir_path.resolve())
                    logger.info(f"检测到 CERTIFICATE 格式证书，使用证书目录: {cert_dir}")
                elif '-----BEGIN PUBLIC KEY-----' in content:
                    # 是 PUBLIC KEY 格式，切换到平台证书模式
                    logger.info("✅ 检测到 PUBLIC KEY 格式，切换到平台证书模式（库将自动获取证书）")
                    from pathlib import Path
                    BASE_DIR = Path(__file__).resolve().parent.parent.parent
                    auto_cert_dir = BASE_DIR / "wechatpay_certs_auto"
                    auto_cert_dir.mkdir(exist_ok=True)
                    cert_dir = str(auto_cert_dir.resolve())
                    public_key = None  # 不使用 public_key，改用 cert_dir
                    logger.info(f"✅ 已切换到平台证书模式，证书目录: {cert_dir}")
                else:
                    # 未知格式，也切换到平台证书模式
                    logger.warning(f"未知的证书格式，切换到平台证书模式")
                    from pathlib import Path
                    BASE_DIR = Path(__file__).resolve().parent.parent.parent
                    auto_cert_dir = BASE_DIR / "wechatpay_certs_auto"
                    auto_cert_dir.mkdir(exist_ok=True)
                    cert_dir = str(auto_cert_dir.resolve())
                    public_key = None
        
        # 如果还没有设置 cert_dir，检查环境变量中的 public_key_string
        if not cert_dir:
            if wechatpay_public_key_string:
                # 使用平台公钥字符串
                public_key = wechatpay_public_key_string.strip()
                
                # 如果没有 BEGIN/END 标记，尝试添加（类似支付宝的方式）
                if '-----BEGIN' not in public_key and '-----END' not in public_key:
                    # 只有 base64 内容，尝试添加 PUBLIC KEY 标记（wechatpayv3 需要 PUBLIC KEY 格式）
                    public_key = f"-----BEGIN PUBLIC KEY-----\n{public_key}\n-----END PUBLIC KEY-----"
                    logger.info("自动为平台公钥添加了 PUBLIC KEY 标记")
                
                # 如果已经是 PUBLIC KEY 格式，切换到平台证书模式
                # 因为 wechatpayv3 库需要 CERTIFICATE 格式来验证响应签名
                if '-----BEGIN PUBLIC KEY-----' in public_key:
                    logger.info("检测到 PUBLIC KEY 格式，切换到平台证书模式（库将自动获取证书）")
                    # 不使用 public_key，改用 cert_dir 模式
                    from pathlib import Path
                    BASE_DIR = Path(__file__).resolve().parent.parent.parent
                    auto_cert_dir = BASE_DIR / "wechatpay_certs_auto"
                    auto_cert_dir.mkdir(exist_ok=True)
                    cert_dir = str(auto_cert_dir.resolve())
                    public_key = None  # 不使用 public_key
                # 如果公钥是 CERTIFICATE 格式，使用 cert_dir 模式
                elif '-----BEGIN CERTIFICATE-----' in public_key:
                    logger.info("检测到 CERTIFICATE 格式，使用证书目录模式")
                    from pathlib import Path
                    BASE_DIR = Path(__file__).resolve().parent.parent.parent
                    cert_dir_path = BASE_DIR / "wechatpay_certs_auto"
                    cert_dir_path.mkdir(exist_ok=True)
                    # 将证书内容保存到文件
                    cert_file = cert_dir_path / "wechatpay_cert.pem"
                    with open(cert_file, 'w', encoding='utf-8') as f:
                        f.write(public_key)
                    cert_dir = str(cert_dir_path.resolve())
                    public_key = None  # 不使用 public_key，改用 cert_dir
        
        # 如果既没有 cert_dir 也没有 public_key，创建自动证书目录
        if not cert_dir and not public_key:
            from pathlib import Path
            BASE_DIR = Path(__file__).resolve().parent.parent.parent
            auto_cert_dir = BASE_DIR / "wechatpay_certs_auto"
            auto_cert_dir.mkdir(exist_ok=True)
            cert_dir = str(auto_cert_dir.resolve())
            logger.info(f"切换到平台证书模式：使用自动证书目录（库将自动获取证书）: {cert_dir}")
    
    # 创建微信支付客户端
    # 如果使用 cert_dir，就不传 public_key；反之亦然
    init_params = {
        'wechatpay_type': WeChatPayType.NATIVE,
        'mchid': mchid,
        'private_key': private_key,
        'cert_serial_no': cert_serial_no,
        'appid': appid,
        'apiv3_key': apiv3_key,
        'notify_url': app_notify_url,
    }
    
    logger.info(f"准备创建客户端: cert_dir={cert_dir}, public_key={'已设置' if public_key else 'None'}")
    
    if cert_dir:
        init_params['cert_dir'] = cert_dir
        logger.info(f"使用证书目录模式（平台证书模式）: {cert_dir}")
        logger.info("注意：如果证书目录为空，库会在首次调用 API 时自动获取证书")
        
        # 使用 monkey patch 绕过库的初始化检查，让库在首次调用时自动获取证书
        # 因为库在初始化时检查证书，如果 cert_dir 为空会报错
        # 但库的 _update_certificates() 使用 skip_verify=True，可以在没有证书时获取证书
        try:
            from wechatpayv3.core import Core
            original_init_certificates = Core._init_certificates
            
            def patched_init_certificates(self):
                """修改后的 _init_certificates，允许 cert_dir 为空时继续"""
                if self._cert_dir and os.path.exists(self._cert_dir):
                    # 检查目录中是否有证书文件
                    has_cert = False
                    try:
                        for file_name in os.listdir(self._cert_dir):
                            if file_name.lower().endswith('.pem'):
                                has_cert = True
                                break
                    except:
                        pass
                    
                    if has_cert:
                        # 有证书文件，使用原始逻辑
                        return original_init_certificates(self)
                    else:
                        # 证书目录为空，不报错，让库在首次调用时自动获取
                        logger.info("证书目录为空，将在首次调用 API 时自动获取证书")
                        self._certificates = []  # 设置为空列表，不报错
                        return
                else:
                    # 没有 cert_dir，使用原始逻辑
                    return original_init_certificates(self)
            
            # 应用 monkey patch
            Core._init_certificates = patched_init_certificates
            logger.info("已应用 monkey patch，允许证书目录为空")
        except Exception as e:
            logger.warning(f"应用 monkey patch 失败: {e}")
    elif public_key:
        # 注意：wechatpayv3 库的检查逻辑有 bug：
        # 检查条件是: if (public_key is None) != (public_key_id is None)
        # 这意味着如果只传递 public_key 不传递 public_key_id，会报错
        # 解决方案：传递 public_key_id=""（空字符串）来绕过检查
        init_params['public_key'] = public_key
        init_params['public_key_id'] = ""  # 传递空字符串而不是 None，绕过库的检查
        logger.info(f"使用公钥字符串模式，公钥长度: {len(public_key)} 字符")
    else:
        logger.error(f"cert_dir={cert_dir}, public_key={'已设置' if public_key else 'None'}")
        raise ValueError("必须提供 cert_dir 或 public_key")
    
    wechatpay = WeChatPay(**init_params)
    
    # 如果使用 cert_dir 模式但证书目录为空，库会在首次调用时自动获取证书
    # 但库在初始化时检查证书，如果为空会报错
    # 解决方案：在初始化后立即尝试获取证书（使用 skip_verify）
    if cert_dir and not wechatpay._core._certificates:
        try:
            logger.info("证书目录为空，尝试自动获取平台证书...")
            wechatpay._core._update_certificates()
            logger.info(f"成功获取平台证书，证书数量: {len(wechatpay._core._certificates)}")
        except Exception as e:
            logger.warning(f"自动获取证书失败（将在首次调用时重试）: {e}")
            # 不抛出异常，让库在首次调用时重试
    
    return wechatpay


def create_wechatpay_qrcode(order_number: str, amount: str, description: str) -> str:
    """
    创建微信支付二维码（Native支付）
    
    Args:
        order_number: 订单号
        amount: 金额（字符串，单位：元）
        description: 商品描述
    
    Returns:
        str: 支付二维码URL（code_url）
    """
    wechatpay = get_wechatpay_client()
    
    # 将金额转换为分（微信支付使用分为单位）
    amount_yuan = Decimal(str(amount))
    amount_fen = int(amount_yuan * 100)
    
    # 调用统一下单接口
    # 使用平台证书模式：库会自动获取证书并验证签名（生产环境推荐）
    # 如果证书列表为空，先获取证书
    if not wechatpay._core._certificates:
        logger.info("证书列表为空，先获取平台证书...")
        try:
            wechatpay._core._update_certificates()
            logger.info(f"成功获取平台证书，证书数量: {len(wechatpay._core._certificates)}")
            if wechatpay._core._certificates:
                for i, cert in enumerate(wechatpay._core._certificates):
                    logger.info(f"证书 {i+1}: 序列号={cert.serial_number}, 有效期={cert.not_valid_before} 到 {cert.not_valid_after}")
        except Exception as e:
            logger.warning(f"获取证书失败: {e}，继续尝试调用 API（库会在调用时自动获取）")
            import traceback
            logger.debug(traceback.format_exc())
    
    # 调用 API，如果签名验证失败，可能是证书还未获取，重试一次
    try:
        code, message = wechatpay.pay(
            description=description,
            out_trade_no=order_number,
            amount={"total": amount_fen, "currency": "CNY"},
        )
    except Exception as e:
        if "failed to verify the signature" in str(e):
            # 签名验证失败，可能是证书还未获取，尝试再次获取证书并重试
            logger.warning("签名验证失败，尝试重新获取证书...")
            try:
                wechatpay._core._update_certificates()
                logger.info(f"重新获取证书成功，证书数量: {len(wechatpay._core._certificates)}")
                # 重试
                code, message = wechatpay.pay(
                    description=description,
                    out_trade_no=order_number,
                    amount={"total": amount_fen, "currency": "CNY"},
                )
            except Exception as e2:
                logger.error(f"重新获取证书后仍然失败: {e2}")
                raise ValueError(f"微信支付调用失败: {e2}")
        else:
            raise
    
    # 解析返回数据（可能是字符串或字典）
    if isinstance(message, str):
        import json
        try:
            message = json.loads(message)
        except json.JSONDecodeError:
            pass
    
    if code in range(200, 300):
        # 成功，返回二维码URL
        if isinstance(message, dict):
            code_url = message.get('code_url')
            if not code_url:
                raise ValueError("微信支付返回数据中缺少code_url")
            return code_url
        else:
            raise ValueError(f"微信支付返回数据格式错误: {message}")
    else:
        # 失败
        error_msg = message.get('message', '未知错误') if isinstance(message, dict) else str(message)
        raise ValueError(f"创建微信支付订单失败: {error_msg}")


def verify_wechatpay_notify(headers: dict, body: str) -> dict:
    """
    验证微信支付回调签名并解析数据
    
    Args:
        headers: HTTP请求头（包含签名信息）
        body: 请求体（JSON字符串）
    
    Returns:
        dict: 解析后的回调数据，如果验证失败则返回None
    """
    try:
        wechatpay = get_wechatpay_client()
        
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


def query_wechatpay_order_status(order_number: str) -> dict:
    """
    查询微信支付订单状态
    
    Args:
        order_number: 商户订单号
    
    Returns:
        dict: 订单信息，包含 trade_state, transaction_id 等
    """
    try:
        wechatpay = get_wechatpay_client()
        
        # 调用查询订单接口
        # 使用平台证书模式：库会自动验证签名
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

