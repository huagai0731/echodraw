from __future__ import annotations

import random
import secrets
import calendar
import mimetypes
import os
import logging
from datetime import date, timedelta, datetime, timezone as dt_timezone

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction, IntegrityError, models
from django.db.models import Max
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status, serializers
from rest_framework.decorators import api_view, permission_classes, authentication_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from core.email_utils import send_mail_async
from core.achievement_evaluator import get_evaluator
from core.achievement_unlock import evaluate_or_unlock

# 配置日志记录器
logger = logging.getLogger(__name__)

# 跟踪已警告的未知成就指标，避免重复警告
_warned_unknown_metrics: set[str] = set()

# 尝试导入时区库，优先使用 zoneinfo（Python 3.9+），否则使用 pytz
try:
    from zoneinfo import ZoneInfo
    SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
except ImportError:
    try:
        import pytz
        SHANGHAI_TZ = pytz.timezone("Asia/Shanghai")
    except ImportError:
        # 如果都没有，使用 Django 的时区设置
        SHANGHAI_TZ = None


def get_today_shanghai() -> date:
    """
    获取中国时区（Asia/Shanghai）的今天日期。
    确保无论服务器系统时区如何，都能正确获取中国时区的日期。
    """
    # 如果有时区库，使用明确的时区转换
    if SHANGHAI_TZ is not None:
        # timezone.now() 在 USE_TZ=True 时返回 UTC 时间
        now_utc = timezone.now()
        if timezone.is_naive(now_utc):
            # 如果 USE_TZ=False，需要手动转换为 UTC
            now_utc = timezone.make_aware(now_utc)
        shanghai_time = now_utc.astimezone(SHANGHAI_TZ)
        return shanghai_time.date()
    else:
        # 回退：使用 Django 的 timezone.localtime()
        # 这依赖于 settings.TIME_ZONE = "Asia/Shanghai"
        # 但为了确保正确，我们手动计算
        now = timezone.now()
        if timezone.is_naive(now):
            now = timezone.make_aware(now)
        
        # 如果 USE_TZ=True，now 是 UTC 时间，需要转换为中国时区（UTC+8）
        # 如果 USE_TZ=False，now 已经是本地时间，但我们需要确保它是中国时区
        if settings.USE_TZ:
            # 手动计算 UTC+8
            from datetime import timedelta
            shanghai_offset = timedelta(hours=8)
            shanghai_time = now + shanghai_offset
        else:
            # USE_TZ=False 时，now 已经是本地时间
            # 如果 TIME_ZONE = "Asia/Shanghai"，应该已经是正确的
            # 但为了安全，我们使用 timezone.localtime()
            shanghai_time = timezone.localtime(now)
        return shanghai_time.date()

from core.models import (
    Achievement,
    AuthToken,
    ConditionalMessage,
    DailyHistoryMessage,
    DailyCheckIn,
    EmailVerification,
    EncouragementMessage,
    HolidayMessage,
    LoginAttempt,
    LongTermGoal,
    VisualAnalysisResult,
    LongTermPlanCopy,
    Mood,
    MonthlyReport,
    Notification,
    ShortTermGoal,
    ShortTermGoalTaskCompletion,
    ShortTermTaskPreset,
    Tag,
    Test,
    TestQuestion,
    TestOptionText,
    TestOption,
    TestDimension,
    UserAchievement,
    UserTestResult,
    UploadConditionalMessage,
    UserProfile,
    UserTaskPreset,
    UserUpload,
)
from core.serializers import (
    LongTermGoalSerializer,
    LongTermGoalSetupSerializer,
    LongTermPlanCopyPublicSerializer,
    NotificationPublicSerializer,
    ShortTermGoalSerializer,
    ShortTermTaskPresetPublicSerializer,
    MoodSerializer,
    TagSerializer,
    UserTaskPresetPublicSerializer,
    UserTaskPresetSerializer,
    UserUploadSerializer,
    UserProfileSerializer,
    VisualAnalysisResultSerializer,
)

CODE_EXPIRY_MINUTES = 10
RESEND_INTERVAL_SECONDS = 60
# IP级别限流：每个IP每小时最多发送10次
IP_RATE_LIMIT_PER_HOUR = 10
# 邮箱级别限流：每个邮箱每天最多发送20次
EMAIL_DAILY_LIMIT = 20
ALLOWED_CODE_PURPOSES = {
    EmailVerification.PURPOSE_REGISTER,
    EmailVerification.PURPOSE_RESET_PASSWORD,
}


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _normalize_code(value: str) -> str:
    if not isinstance(value, str):
        return ""
    # 移除所有空白字符，避免复制验证码时带入空格或换行
    return "".join(value.split())


def _extract_error_message(exc: Exception, default_message: str) -> str:
    return getattr(exc, "message", None) or str(exc) or default_message


def _validate_password_strength(password: str) -> tuple[bool, str]:
    """
    验证密码强度。
    
    要求：
    - 至少8个字符
    - 至少包含一个数字
    - 至少包含一个字母（大小写均可）
    
    Returns:
        (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "密码长度至少 8 位"
    
    has_digit = any(c.isdigit() for c in password)
    has_letter = any(c.isalpha() for c in password)
    
    if not has_digit:
        return False, "密码必须包含至少一个数字"
    
    if not has_letter:
        return False, "密码必须包含至少一个字母"
    
    return True, ""


def _user_payload(user):
    # 获取用户资料，包括注册编号
    profile = None
    registration_number = None
    try:
        profile = user.profile
        registration_number = profile.registration_number
    except UserProfile.DoesNotExist:
        pass
    
    return {
        "id": user.id,
        "email": user.email,
        "is_staff": bool(user.is_staff),
        "is_active": bool(user.is_active),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "date_joined": user.date_joined.isoformat() if user.date_joined else None,
        "registration_number": registration_number,
    }


@api_view(["GET"])
def health_check(_request):
    """Simple endpoint to verify the service is running."""

    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])  # 允许不认证访问，方便调试
def debug_timezone(request):
    """
    调试端点：检查时区计算是否正确
    
    安全注意：此端点仅应在开发/调试环境中使用。
    生产环境应通过环境变量控制访问或完全禁用。
    """
    # 生产环境安全检查：如果不在DEBUG模式，限制访问
    if not settings.DEBUG:
        # 生产环境可以完全禁用此端点，或要求管理员权限
        # 这里选择返回最小信息，不暴露敏感数据
        return Response({
            "error": "此调试端点在生产环境中已禁用",
            "note": "如需调试时区问题，请联系管理员"
        }, status=status.HTTP_403_FORBIDDEN)
    
    import datetime
    now_utc = timezone.now()
    today_shanghai = get_today_shanghai()
    
    # 计算各种时区的当前时间（仅返回非敏感信息）
    info = {
        "today_shanghai": today_shanghai.isoformat() if today_shanghai else None,
        "django_timezone": str(settings.TIME_ZONE),
        "django_use_tz": settings.USE_TZ,
        "shanghai_tz_available": SHANGHAI_TZ is not None,
    }
    
    # 如果有时区库，显示转换后的时间
    if SHANGHAI_TZ is not None:
        try:
            shanghai_time = now_utc.astimezone(SHANGHAI_TZ)
            info["shanghai_time"] = shanghai_time.isoformat()
            info["shanghai_date"] = shanghai_time.date().isoformat()
        except Exception as e:
            # 不暴露详细错误信息
            info["shanghai_time_error"] = "时区转换失败"
            logger.warning(f"时区转换失败: {e}", exc_info=True)
    
    # 如果用户已登录，显示用户打卡状态（但不暴露邮箱）
    if request.user.is_authenticated:
        user = request.user
        stats = _get_check_in_stats(user)
        info["user_checkin_stats"] = stats
        # 不暴露用户邮箱，只显示用户ID（已脱敏）
        info["user_id"] = user.id
    else:
        info["user_checkin_stats"] = None
        info["note"] = "未登录，无法显示用户打卡状态。请登录后访问或使用前端应用访问 /api/goals/check-in/"
    
    return Response(info)


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def send_verification_code(request):
    email = request.data.get("email", "")
    purpose = request.data.get("purpose", EmailVerification.PURPOSE_REGISTER)

    if not email:
        return Response(
            {"detail": "邮箱不能为空"}, status=status.HTTP_400_BAD_REQUEST
        )

    email = _normalize_email(email)

    try:
        validate_email(email)
    except DjangoValidationError:
        return Response(
            {"detail": "邮箱格式不正确"}, status=status.HTTP_400_BAD_REQUEST
        )

    if purpose not in ALLOWED_CODE_PURPOSES:
        return Response(
            {"detail": "暂不支持该验证类型"}, status=status.HTTP_400_BAD_REQUEST
        )

    user_model = get_user_model()
    user_exists = user_model.objects.filter(email__iexact=email).exists()

    if purpose == EmailVerification.PURPOSE_REGISTER:
        if user_exists:
            return Response(
                {"detail": "该邮箱已注册"}, status=status.HTTP_400_BAD_REQUEST
            )
        email_subject = "EchoDraw 注册验证码"
        email_message_template = (
            "感谢注册 EchoDraw！\n"
            "您的验证码是 {code}，有效期 {minutes} 分钟。"
            "如果这不是您的操作，请忽略此邮件。"
        )
    else:
        if not user_exists:
            return Response(
                {"detail": "该邮箱尚未注册"}, status=status.HTTP_400_BAD_REQUEST
            )
        email_subject = "EchoDraw 重置密码验证码"
        email_message_template = (
            "我们收到您重置 EchoDraw 密码的请求。\n"
            "验证码：{code}（有效期 {minutes} 分钟）。\n"
            "如果这不是您的操作，请忽略此邮件。"
        )

    # 获取客户端IP地址（安全地处理X-Forwarded-For头）
    def get_client_ip(request):
        # 优先使用REMOTE_ADDR，这是最可靠的
        ip = request.META.get('REMOTE_ADDR', 'unknown')
        
        # 如果存在X-Forwarded-For头，取第一个IP（可能是代理链）
        # 但要注意：X-Forwarded-For可以被伪造，所以只作为参考
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # 取第一个IP，并清理空白字符
            first_ip = x_forwarded_for.split(',')[0].strip()
            # 基本验证：确保是有效的IP格式（简单检查）
            if first_ip and len(first_ip) <= 45:  # IPv6最长45字符
                # 在生产环境中，应该验证IP是否在可信代理列表中
                # 这里为了安全，优先使用REMOTE_ADDR
                pass
        
        return ip
    
    client_ip = get_client_ip(request)
    now = timezone.now()
    
    # 1. 检查邮箱级别的发送频率限制（60秒间隔）
    latest_record = (
        EmailVerification.objects.filter(email__iexact=email, purpose=purpose)
        .order_by("-created_at")
        .first()
    )

    if latest_record and (now - latest_record.created_at).total_seconds() < RESEND_INTERVAL_SECONDS:
        remaining = RESEND_INTERVAL_SECONDS - int(
            (now - latest_record.created_at).total_seconds()
        )
        return Response(
            {
                "detail": f"请求过于频繁，请 {remaining} 秒后再试",
                "retry_after": max(remaining, 0),
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    
    # 2. 检查IP级别的发送频率限制（每小时最多10次）
    # 增强：同时检查IP和邮箱的组合，防止通过多个邮箱绕过IP限流
    one_hour_ago = now - timedelta(hours=1)
    ip_send_count = EmailVerification.objects.filter(
        metadata__ip=client_ip,
        created_at__gte=one_hour_ago
    ).count()
    
    # 检查该IP是否使用了过多不同的邮箱（可能是自动化攻击）
    unique_emails_from_ip = EmailVerification.objects.filter(
        metadata__ip=client_ip,
        created_at__gte=one_hour_ago
    ).values('email').distinct().count()
    
    # 如果同一IP使用了超过5个不同邮箱，可能是攻击行为
    MAX_UNIQUE_EMAILS_PER_IP_PER_HOUR = 5
    if unique_emails_from_ip > MAX_UNIQUE_EMAILS_PER_IP_PER_HOUR:
        logger.warning(
            f"检测到可疑行为：IP {client_ip} 在1小时内使用了 {unique_emails_from_ip} 个不同邮箱",
            extra={"ip": client_ip, "unique_emails": unique_emails_from_ip}
        )
        return Response(
            {
                "detail": "检测到异常行为，请稍后再试",
                "retry_after": 3600,  # 1小时后重试
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    
    if ip_send_count >= IP_RATE_LIMIT_PER_HOUR:
        # 计算下次可用的时间
        oldest_in_hour = EmailVerification.objects.filter(
            metadata__ip=client_ip,
            created_at__gte=one_hour_ago
        ).order_by('created_at').first()
        if oldest_in_hour:
            next_available = oldest_in_hour.created_at + timedelta(hours=1)
            remaining_seconds = int((next_available - now).total_seconds())
            return Response(
                {
                    "detail": f"该IP地址发送验证码过于频繁，请 {max(remaining_seconds // 60, 1)} 分钟后再试",
                    "retry_after": max(remaining_seconds, 0),
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return Response(
            {
                "detail": f"该IP地址发送验证码过于频繁，请1小时后再试",
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
    
    # 3. 检查邮箱每日发送上限（每天最多20次）
    from datetime import datetime
    today_start = get_today_shanghai()
    today_start_dt = timezone.make_aware(
        datetime.combine(today_start, datetime.min.time())
    )
    email_send_count_today = EmailVerification.objects.filter(
        email__iexact=email,
        created_at__gte=today_start_dt
    ).count()
    
    if email_send_count_today >= EMAIL_DAILY_LIMIT:
        return Response(
            {
                "detail": f"该邮箱今日发送验证码次数已达上限（{EMAIL_DAILY_LIMIT}次），请明天再试",
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = now + timedelta(minutes=CODE_EXPIRY_MINUTES)

    # 在metadata中记录IP地址，用于IP级别限流
    verification = EmailVerification.objects.create(
        email=email,
        purpose=purpose,
        code=code,
        expires_at=expires_at,
        metadata={"ip": client_ip},
    )

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", None) or getattr(
        settings, "EMAIL_HOST_USER", None
    )

    if not from_email:
        verification.delete()
        return Response(
            {"detail": "邮件服务未配置，请联系管理员"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    subject = email_subject
    message = email_message_template.format(
        code=code, minutes=CODE_EXPIRY_MINUTES
    )

    # 异步发送邮件，避免阻塞请求
    try:
        send_mail_async(subject, message, from_email, [email])
    except Exception as exc:  # 极少数情况下线程池提交失败
        verification.delete()
        # 记录详细错误到日志，但不返回给客户端
        logger.error(
            f"验证码发送失败: {_extract_error_message(exc, '邮件发送失败')}",
            extra={"email": email, "purpose": purpose},
            exc_info=True
        )
        # 生产环境不返回详细错误信息
        payload = {"detail": "验证码发送失败，请检查网络连接后重试。如果问题持续，请联系客服。"}
        return Response(payload, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return Response({"detail": "验证码已发送"}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def register(request):
    raw_email = request.data.get("email", "")
    password = request.data.get("password", "")
    confirm_password = request.data.get("confirm_password") or request.data.get(
        "confirmPassword", ""
    )
    raw_code = request.data.get("code", "")

    email = _normalize_email(raw_email)
    code = _normalize_code(raw_code)

    if not email or not password or not confirm_password or not code:
        return Response(
            {"detail": "请完整填写邮箱、密码、确认密码和验证码"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_email(email)
    except DjangoValidationError:
        return Response(
            {"detail": "邮箱格式不正确"}, status=status.HTTP_400_BAD_REQUEST
        )

    if password != confirm_password:
        return Response(
            {"detail": "两次输入的密码不一致"}, status=status.HTTP_400_BAD_REQUEST
        )

    # 验证密码强度
    is_valid, error_msg = _validate_password_strength(password)
    if not is_valid:
        return Response(
            {"detail": error_msg}, status=status.HTTP_400_BAD_REQUEST
        )

    user_model = get_user_model()
    if user_model.objects.filter(email__iexact=email).exists():
        return Response(
            {"detail": "该邮箱已注册"}, status=status.HTTP_400_BAD_REQUEST
        )

    if len(code) != 6 or not code.isdigit():
        return Response(
            {"detail": "验证码格式不正确，请重新输入"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    verification = (
        EmailVerification.objects.filter(
            email__iexact=email,
            purpose=EmailVerification.PURPOSE_REGISTER,
            code=code,
            is_used=False,
        )
        .order_by("-created_at")
        .first()
    )

    if not verification:
        return Response(
            {"detail": "验证码不正确，请检查后重新输入。验证码有效期为10分钟，如已过期请重新获取。"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if verification.is_expired:
        return Response(
            {"detail": "验证码已过期，请重新获取"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        user = user_model.objects.create_user(
            username=email,
            email=email,
            password=password,
        )
        verification.mark_used()
        
        # 分配注册编号：使用select_for_update锁定，防止并发竞态条件
        # 获取当前最大注册编号，然后+1
        max_profile = UserProfile.objects.filter(
            registration_number__isnull=False
        ).order_by('-registration_number').select_for_update().first()
        
        max_reg_number = max_profile.registration_number if max_profile else 0
        
        # 创建用户资料并分配注册编号
        # 如果发生唯一性约束冲突（极少数情况），重试
        max_retries = 3
        for attempt in range(max_retries):
            try:
                UserProfile.objects.create(
                    user=user,
                    registration_number=max_reg_number + 1,
                )
                break  # 成功创建，退出循环
            except IntegrityError:
                # 如果因为并发导致唯一性冲突，重新获取最大编号
                if attempt < max_retries - 1:
                    max_profile = UserProfile.objects.filter(
                        registration_number__isnull=False
                    ).order_by('-registration_number').select_for_update().first()
                    max_reg_number = max_profile.registration_number if max_profile else 0
                else:
                    # 最后一次尝试失败，记录错误并抛出
                    logger.error(
                        f"注册编号分配失败，已重试{max_retries}次",
                        extra={"user_id": user.id, "email": user.email},
                        exc_info=True
                    )
                    raise

    token_key = AuthToken.issue_for_user(user)

    return Response(
        {"token": token_key, "user": _user_payload(user)},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def reset_password(request):
    raw_email = request.data.get("email", "")
    password = request.data.get("password", "")
    confirm_password = request.data.get("confirm_password") or request.data.get(
        "confirmPassword", ""
    )
    raw_code = request.data.get("code", "")

    email = _normalize_email(raw_email)
    code = _normalize_code(raw_code)

    if not email or not password or not confirm_password or not code:
        return Response(
            {"detail": "请完整填写邮箱、密码、确认密码和验证码"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        validate_email(email)
    except DjangoValidationError:
        return Response(
            {"detail": "邮箱格式不正确"}, status=status.HTTP_400_BAD_REQUEST
        )

    if password != confirm_password:
        return Response(
            {"detail": "两次输入的密码不一致"}, status=status.HTTP_400_BAD_REQUEST
        )

    # 验证密码强度
    is_valid, error_msg = _validate_password_strength(password)
    if not is_valid:
        return Response(
            {"detail": error_msg}, status=status.HTTP_400_BAD_REQUEST
        )

    user_model = get_user_model()
    user_qs = user_model.objects.filter(email__iexact=email).order_by("id")
    if not user_qs.exists():
        return Response(
            {"detail": "该邮箱尚未注册"}, status=status.HTTP_400_BAD_REQUEST
        )
    users = list(user_qs)

    if len(code) != 6 or not code.isdigit():
        return Response(
            {"detail": "验证码格式不正确，请重新输入"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    verification = (
        EmailVerification.objects.filter(
            email__iexact=email,
            purpose=EmailVerification.PURPOSE_RESET_PASSWORD,
            code=code,
            is_used=False,
        )
        .order_by("-created_at")
        .first()
    )

    if not verification:
        return Response(
            {"detail": "验证码不正确，请检查后重新输入。验证码有效期为10分钟，如已过期请重新获取。"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if verification.is_expired:
        return Response(
            {"detail": "验证码已过期，请重新获取"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        for user in users:
            user.set_password(password)
            user.save(update_fields=["password"])
        verification.mark_used()

    primary_user = users[0]
    token_key = AuthToken.issue_for_user(primary_user)

    return Response({"token": token_key, "user": _user_payload(primary_user)})


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
@throttle_classes([])  # 禁用默认节流，因为登录视图已有自己的失败次数限制逻辑
def login(request):
    email = _normalize_email(request.data.get("email", ""))
    password = request.data.get("password", "")

    if not email or not password:
        return Response(
            {"detail": "请输入邮箱和密码"}, status=status.HTTP_400_BAD_REQUEST
        )

    try:
        validate_email(email)
    except DjangoValidationError:
        return Response(
            {"detail": "邮箱格式不正确"}, status=status.HTTP_400_BAD_REQUEST
        )

    # 登录失败次数限制（防止暴力破解）
    # 检查IP和邮箱的组合，防止通过多个邮箱绕过IP限流
    client_ip = request.META.get('REMOTE_ADDR', 'unknown')
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        first_ip = x_forwarded_for.split(',')[0].strip()
        # 基本验证IP格式（防止X-Forwarded-For被伪造）
        if first_ip and len(first_ip) <= 45:
            client_ip = first_ip
    
    # 检查最近15分钟内的登录失败次数（同一IP或同一邮箱）
    fifteen_minutes_ago = timezone.now() - timedelta(minutes=15)
    
    # 使用专门的LoginAttempt模型记录登录尝试
    recent_failures = LoginAttempt.objects.filter(
        success=False,
        created_at__gte=fifteen_minutes_ago
    ).filter(
        models.Q(email__iexact=email) | models.Q(ip_address=client_ip)
    ).count()
    
    # 限制：15分钟内最多5次失败尝试
    MAX_LOGIN_FAILURES = 5
    if recent_failures >= MAX_LOGIN_FAILURES:
        return Response(
            {
                "detail": "登录失败次数过多，请15分钟后再试。如忘记密码，可使用\"忘记密码\"功能重置。",
                "retry_after": 900,  # 15分钟（秒）
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    user_model = get_user_model()

    try:
        user = user_model.objects.get(email__iexact=email)
    except user_model.DoesNotExist:
        # 记录登录失败尝试
        LoginAttempt.objects.create(
            email=email,
            ip_address=client_ip,
            success=False,
        )
        return Response(
            {"detail": "邮箱或密码错误，请检查后重试。如忘记密码，可使用\"忘记密码\"功能重置。"}, status=status.HTTP_400_BAD_REQUEST
        )

    if not user.check_password(password):
        # 记录登录失败尝试
        LoginAttempt.objects.create(
            email=email,
            ip_address=client_ip,
            success=False,
        )
        return Response(
            {"detail": "邮箱或密码错误，请检查后重试。如忘记密码，可使用\"忘记密码\"功能重置。"}, status=status.HTTP_400_BAD_REQUEST
        )

    # 记录登录成功
    LoginAttempt.objects.create(
        email=email,
        ip_address=client_ip,
        success=True,
    )

    token_key = AuthToken.issue_for_user(user)

    return Response({"token": token_key, "user": _user_payload(user)})


@api_view(["GET"])
def current_user(request):
    user = request.user
    return Response(_user_payload(user))


class ProfilePreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = self._get_profile(request.user)
        serializer = UserProfileSerializer(profile)
        payload = self._augment_payload(serializer.data, request.user)
        return Response(payload)

    def patch(self, request):
        profile = self._get_profile(request.user)
        serializer = UserProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        payload = self._augment_payload(serializer.data, request.user)
        return Response(payload)

    def put(self, request):
        return self.patch(request)

    @staticmethod
    def _get_profile(user):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return profile

    def _augment_payload(self, data: dict, user):
        display_name = (data.get("display_name") or "").strip()
        signature = (data.get("signature") or "").strip()
        return {
            "display_name": display_name,
            "signature": signature,
            "default_display_name": self._resolve_default_display_name(user),
            "updated_at": data.get("updated_at"),
        }

    @staticmethod
    def _resolve_default_display_name(user) -> str:
        email = (user.email or user.get_username() or "").strip()
        local_part = email.split("@")[0] if email else ""
        if not local_part:
            return "回声艺术家"
        return local_part[:1].upper() + local_part[1:]


def _build_achievement_payload(
    achievement: Achievement, 
    *, 
    unlocked_at=None, 
    user_achievement: Optional[UserAchievement] = None,
    user: Optional[Any] = None,
) -> dict:
    """
    构建成就响应数据。
    
    Args:
        achievement: 成就对象
        unlocked_at: 解锁时间（ISO格式字符串）
        user_achievement: 用户成就记录（如果存在），用于获取解锁时的元数据
        user: 用户对象（用于补充缺失的图片信息）
    """
    metadata = achievement.metadata or {}
    condition = achievement.condition or {}
    
    # 合并 UserAchievement 的元数据（包含触发图片信息）
    merged_metadata = metadata.copy() if isinstance(metadata, dict) else {}
    
    if user_achievement:
        logger.debug(
            f"Building payload for achievement {achievement.slug}, user_achievement exists",
            extra={
                "achievement_slug": achievement.slug,
                "has_meta": bool(user_achievement.meta),
                "meta_type": type(user_achievement.meta).__name__ if user_achievement.meta else None,
            }
        )
        if user_achievement.meta and isinstance(user_achievement.meta, dict):
            user_meta = user_achievement.meta
            # 将 UserAchievement.meta 中的信息合并到 metadata 中
            logger.debug(
                f"Merging user_achievement.meta for achievement {achievement.slug}",
                extra={
                    "achievement_slug": achievement.slug,
                    "original_metadata_keys": list(metadata.keys()) if isinstance(metadata, dict) else [],
                    "user_meta_keys": list(user_meta.keys()),
                }
            )
            merged_metadata.update(user_meta)
    else:
        logger.debug(
            f"Building payload for achievement {achievement.slug}, no user_achievement",
            extra={"achievement_slug": achievement.slug}
        )
    
    # 无论是否有 user_achievement，都检查并补充图片信息（如果缺少）
    has_image_info = any(
        key in merged_metadata for key in 
        ["artwork_id", "upload_id", "artwork_url", "unlock_image_url", "image_url"]
    )
    if not has_image_info and user:
        from core.achievement_unlock import _get_trigger_upload_info
        trigger_info = _get_trigger_upload_info(user, achievement)
        if trigger_info:
            merged_metadata.update(trigger_info)
            logger.info(
                f"Supplemented image info for achievement {achievement.slug} in response",
                extra={
                    "achievement_slug": achievement.slug,
                    "artwork_id": trigger_info.get("artwork_id"),
                    "has_image_url": bool(trigger_info.get("artwork_url") or trigger_info.get("unlock_image_url")),
                }
            )
        else:
            logger.debug(
                f"Could not supplement image info for achievement {achievement.slug}",
                extra={
                    "achievement_slug": achievement.slug,
                    "condition_metric": achievement.condition.get("metric") if isinstance(achievement.condition, dict) else None,
                }
            )
    
    metadata = merged_metadata
    # 调试日志：记录合并后的元数据中的图片信息
    image_keys = [k for k in merged_metadata.keys() if any(img_key in k.lower() for img_key in ["artwork", "upload", "image", "unlock"])]
    logger.info(
        f"Final metadata for achievement {achievement.slug}",
        extra={
            "achievement_slug": achievement.slug,
            "all_metadata_keys": list(merged_metadata.keys()),
            "image_keys": image_keys,
            "has_artwork_id": "artwork_id" in merged_metadata or "upload_id" in merged_metadata,
            "has_image_url": any(k in merged_metadata for k in ["artwork_url", "unlock_image_url", "image_url"]),
        }
    )
    
    return {
        "id": achievement.id,
        "slug": achievement.slug,
        "name": achievement.name,
        "description": achievement.description,
        "category": achievement.category,
        "icon": achievement.icon,
        "level": int(achievement.level) if achievement.level is not None else 0,  # 确保类型正确
        "metadata": metadata.copy() if isinstance(metadata, dict) else {},
        "condition": condition.copy() if isinstance(condition, dict) else {},
        "unlocked_at": unlocked_at,
    }


def _evaluate_achievement_condition(user, condition: dict, user_stats: dict | None = None) -> bool:
    """
    评估成就条件是否满足。
    
    Args:
        user: 用户对象
        condition: 成就条件字典，格式如 {"metric": "total_uploads", "operator": ">=", "threshold": 10}
        user_stats: 用户统计数据缓存，如果为 None 则实时计算
    
    Returns:
        bool: 条件是否满足
    """
    if not isinstance(condition, dict) or not condition:
        return False
    
    metric = condition.get("metric", "").strip()
    operator = condition.get("operator", ">=").strip()
    threshold = condition.get("threshold", 0)
    
    if not metric:
        return False
    
    try:
        threshold = float(threshold)
    except (ValueError, TypeError):
        return False
    
    # 如果提供了缓存统计，优先使用
    if user_stats is not None:
        user_value = user_stats.get(metric)
        if user_value is not None:
            return _compare_values(user_value, operator, threshold)
    
    # 否则实时计算
    if metric == "total_uploads":
        user_value = UserUpload.objects.filter(user=user).count()
    elif metric == "total_checkins":
        # 使用打卡统计函数
        stats = _get_check_in_stats(user)
        user_value = stats.get("total_checkins", 0)
    elif metric == "current_streak":
        stats = _get_check_in_stats(user)
        user_value = stats.get("current_streak", 0)
    elif metric == "checked_today":
        stats = _get_check_in_stats(user)
        user_value = 1 if stats.get("checked_today", False) else 0
    else:
        # 只对每个未知指标警告一次，避免日志刷屏
        if metric not in _warned_unknown_metrics:
            logger.debug(f"Unknown achievement metric (will only log once): {metric}", extra={"metric": metric})
            _warned_unknown_metrics.add(metric)
        return False
    
    return _compare_values(user_value, operator, threshold)


def _compare_values(actual_value, operator: str, threshold: float) -> bool:
    """
    比较实际值与阈值。
    
    Args:
        actual_value: 实际值（数字）
        operator: 操作符（">=", ">", "<=", "<", "==", "!="）
        threshold: 阈值（数字）
    
    Returns:
        bool: 比较结果
    """
    try:
        actual_value = float(actual_value)
        threshold = float(threshold)
    except (ValueError, TypeError):
        return False
    
    if operator == ">=":
        return actual_value >= threshold
    elif operator == ">":
        return actual_value > threshold
    elif operator == "<=":
        return actual_value <= threshold
    elif operator == "<":
        return actual_value < threshold
    elif operator == "==":
        return abs(actual_value - threshold) < 1e-6  # 浮点数比较
    elif operator == "!=":
        return abs(actual_value - threshold) >= 1e-6
    else:
        logger.warning(f"Unknown operator: {operator}", extra={"operator": operator})
        return False


def _get_user_achievement_stats(user) -> dict:
    """
    获取用户的成就判定所需的统计数据。
    
    返回字典，键为指标名称，值为对应的统计值。
    
    优先使用缓存或物化表，避免重复计算。
    """
    try:
        from core.user_stats_cache import get_user_stats, UserStats
        
        # 尝试使用缓存
        try:
            return get_user_stats(user)
        except Exception:
            # 缓存失败，尝试使用物化表
            try:
                stats = UserStats.get_or_update_for_user(user)
                return stats.to_dict()
            except Exception:
                # 物化表也失败，回退到实时计算
                pass
    except ImportError:
        # 如果模块不存在，回退到原始实现
        pass
    
    # 回退到实时计算
    check_in_stats = _get_check_in_stats(user)
    total_uploads = UserUpload.objects.filter(user=user).count()
    
    return {
        "total_uploads": total_uploads,
        "total_checkins": check_in_stats.get("total_checkins", 0),
        "current_streak": check_in_stats.get("current_streak", 0),
        "checked_today": 1 if check_in_stats.get("checked_today", False) else 0,
    }


def _infer_achievement_unlock_date(user, achievement: Achievement) -> datetime | None:
    """
    根据成就条件推断合理的解锁日期。
    
    对于已经解锁但之前没有记录的成就，尝试根据条件推断一个合理的解锁日期。
    
    Returns:
        推断的解锁日期，如果无法推断则返回 None
    """
    condition = achievement.condition or {}
    if not isinstance(condition, dict):
        return None
    
    metric = condition.get("metric", "").strip()
    operator = condition.get("operator", ">=").strip()
    threshold = condition.get("threshold", 0)
    
    if not metric:
        return None
    
    try:
        threshold = int(float(threshold))
    except (ValueError, TypeError):
        return None
    
    # 根据不同的指标类型推断解锁日期
    if metric == "total_uploads":
        # 查找用户第 threshold 次上传的时间
        if operator in (">=", ">"):
            # 对于 >= 或 >，查找第 threshold 次上传
            uploads = UserUpload.objects.filter(user=user).order_by("uploaded_at", "id")[:threshold]
            if uploads.count() >= threshold:
                # 获取第 threshold 次上传的时间
                target_upload = list(uploads)[threshold - 1]
                return target_upload.uploaded_at
        elif operator == "==":
            # 对于 ==，查找第 threshold 次上传
            uploads = UserUpload.objects.filter(user=user).order_by("uploaded_at", "id")[:threshold]
            if uploads.count() >= threshold:
                target_upload = list(uploads)[threshold - 1]
                return target_upload.uploaded_at
    
    elif metric == "total_checkins":
        # 查找用户第 threshold 次打卡的时间
        # 使用 date 字段排序，因为 checked_at 是 auto_now 会变化
        if operator in (">=", ">"):
            checkins = DailyCheckIn.objects.filter(user=user).order_by("date", "id")[:threshold]
            if checkins.count() >= threshold:
                target_checkin = list(checkins)[threshold - 1]
                # 将日期转换为 datetime（使用当天的开始时间）
                from datetime import datetime, time as dt_time
                if SHANGHAI_TZ is not None:
                    date_obj = target_checkin.date
                    dt = datetime.combine(date_obj, dt_time.min)
                    return timezone.make_aware(dt, timezone=SHANGHAI_TZ)
                else:
                    date_obj = target_checkin.date
                    dt = datetime.combine(date_obj, dt_time.min)
                    return timezone.make_aware(dt)
        elif operator == "==":
            checkins = DailyCheckIn.objects.filter(user=user).order_by("date", "id")[:threshold]
            if checkins.count() >= threshold:
                target_checkin = list(checkins)[threshold - 1]
                from datetime import datetime, time as dt_time
                if SHANGHAI_TZ is not None:
                    date_obj = target_checkin.date
                    dt = datetime.combine(date_obj, dt_time.min)
                    return timezone.make_aware(dt, timezone=SHANGHAI_TZ)
                else:
                    date_obj = target_checkin.date
                    dt = datetime.combine(date_obj, dt_time.min)
                    return timezone.make_aware(dt)
    
    # 对于其他类型的指标，无法推断，返回 None
    return None


@api_view(["GET"])
@permission_classes([AllowAny])
def profile_achievements(request):
    """
    返回当前用户的成就概览。
    
    根据成就条件计算用户已解锁的成就等级。
    
    注意：不使用缓存，因为成就数据是用户特定的，每个用户应该看到不同的结果。
    """
    trace_id = getattr(request, "trace_id", "unknown")
    user = getattr(request, "user", None)
    user_id = user.id if user and user.is_authenticated else None
    
    logger.info(
        f"profile_achievements request started",
        extra={"trace_id": trace_id, "user_id": user_id}
    )

    try:
        # 性能优化：使用select_related避免N+1查询
        achievements = (
            Achievement.objects.filter(is_active=True)
            .select_related("group")
            .order_by(
                "group__display_order",
                "group__id",
                "display_order",
                "level",
                "slug",
            )
        )

        # 如果用户已登录，获取统计数据并评估成就
        user_stats = None
        if user and user.is_authenticated:
            user_stats = _get_user_achievement_stats(user)
            logger.debug(
                f"user_stats: {user_stats}",
                extra={"trace_id": trace_id, "user_id": user_id}
            )

        group_map: dict[int, dict] = {}
        standalone: list[dict] = []
        
        # 如果用户已登录，预先加载所有已解锁的成就记录
        user_achievements_map: dict[int, UserAchievement] = {}
        if user and user.is_authenticated:
            user_achievements = UserAchievement.objects.filter(
                user=user,
                achievement__in=achievements
            ).select_related("achievement")
            user_achievements_map = {
                ua.achievement_id: ua for ua in user_achievements
            }

        for achievement in achievements:
            unlocked_at = None
            
            # 如果用户已登录，评估成就条件并解锁
            user_achievement_record = None
            if user and user.is_authenticated:
                # 检查是否已有解锁记录
                existing_record = user_achievements_map.get(achievement.id)
                if existing_record:
                    # 使用已存在的解锁时间
                    unlocked_at = existing_record.unlocked_at.isoformat()
                    user_achievement_record = existing_record
                else:
                    # 使用新的评估和解锁逻辑
                    unlock_result = evaluate_or_unlock(
                        user,
                        achievement,
                        user_stats=user_stats,
                        provenance=UserAchievement.PROVENANCE_AUTO,
                    )
                    
                    if unlock_result.unlocked:
                        unlocked_at = unlock_result.unlocked_at.isoformat() if unlock_result.unlocked_at else None
                        # 更新缓存
                        if unlock_result.user_achievement:
                            user_achievements_map[achievement.id] = unlock_result.user_achievement
                            user_achievement_record = unlock_result.user_achievement
                        logger.debug(
                            f"achievement evaluated: {achievement.slug} (level {achievement.level}), unlocked: {unlock_result.is_new}",
                            extra={"trace_id": trace_id, "user_id": user_id, "achievement_slug": achievement.slug}
                        )
            
            # 调试：记录传递给 _build_achievement_payload 的参数
            logger.debug(
                f"Calling _build_achievement_payload for achievement {achievement.slug}",
                extra={
                    "trace_id": trace_id,
                    "user_id": user_id,
                    "achievement_slug": achievement.slug,
                    "has_user_achievement": bool(user_achievement_record),
                    "has_user": bool(user and user.is_authenticated),
                    "user_achievement_meta_keys": list(user_achievement_record.meta.keys()) if user_achievement_record and user_achievement_record.meta and isinstance(user_achievement_record.meta, dict) else [],
                }
            )
            payload = _build_achievement_payload(
                achievement, 
                unlocked_at=unlocked_at,
                user_achievement=user_achievement_record,
                user=user if user and user.is_authenticated else None,
            )
            
            if achievement.group_id:
                group = achievement.group
                group_payload = group_map.get(group.id)
                if not group_payload:
                    group_payload = {
                        "id": group.id,
                        "slug": group.slug,
                        "name": group.name,
                        "description": group.description,
                        "category": group.category,
                        "icon": group.icon,
                        "display_order": group.display_order,
                        "metadata": group.metadata if isinstance(group.metadata, dict) else {},
                        "levels": [],
                        "summary": {
                            "level_count": 0,
                            "highest_unlocked_level": 0,
                            "unlocked_levels": [],
                        },
                    }
                    group_map[group.id] = group_payload
                group_payload["levels"].append(payload)
                group_payload["summary"]["level_count"] += 1
                
                # 如果成就已解锁，更新组的统计信息
                if unlocked_at:
                    # 确保类型正确（防止从数据库读取时是字符串）
                    level = int(achievement.level) if achievement.level is not None else 0
                    group_payload["summary"]["unlocked_levels"].append(level)
                    current_highest = group_payload["summary"]["highest_unlocked_level"]
                    if level > current_highest:
                        group_payload["summary"]["highest_unlocked_level"] = level
            else:
                standalone.append(payload)

        groups: list[dict] = []
        for group_payload in group_map.values():
            levels = group_payload.get("levels") or []
            if len(levels) <= 1:
                if levels:
                    standalone.append(levels[0])
                continue
            group_payload["summary"]["level_count"] = len(levels)
            # 对已解锁的等级进行排序（确保都是整数）
            group_payload["summary"]["unlocked_levels"] = [
                int(level) if not isinstance(level, int) else level 
                for level in group_payload["summary"]["unlocked_levels"]
            ]
            group_payload["summary"]["unlocked_levels"].sort()
            groups.append(group_payload)

        summary = {
            "group_count": len(groups),
            "standalone_count": len(standalone),
            "achievement_count": len(standalone) + sum(
                group["summary"]["level_count"] for group in groups
            ),
        }

        logger.info(
            f"profile_achievements request completed successfully",
            extra={"trace_id": trace_id, "user_id": user_id}
        )

        return Response({"summary": summary, "groups": groups, "standalone": standalone})
    except Exception as exc:
        logger.error(
            f"profile_achievements request failed: {exc}",
            extra={"trace_id": trace_id, "user_id": user_id},
            exc_info=True
        )
        raise


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def evaluate_or_unlock_achievement(request):
    """
    评估并解锁成就（幂等 API）。
    
    如果成就条件满足且尚未解锁，则创建解锁记录。
    如果已解锁，则返回现有记录。
    
    Query params:
        achievement_id: 成就 ID（可选，如果不提供则评估所有活跃成就）
        user_id: 用户 ID（可选，默认使用当前用户，仅管理员可指定其他用户）
    
    Returns:
        {
            "unlocked": bool,
            "is_new": bool,
            "unlocked_at": str (ISO format) or null,
            "reason": str,
            "achievement": {...} (if unlocked)
        }
    """
    User = get_user_model()
    user = request.user
    achievement_id = request.query_params.get("achievement_id")
    target_user_id = request.query_params.get("user_id")
    
    # 管理员可以指定其他用户
    if target_user_id and user.is_staff:
        try:
            target_user = User.objects.get(id=int(target_user_id))
        except (ValueError, User.DoesNotExist):
            return Response(
                {"error": "无效的用户 ID"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        target_user = user
    
    # 获取用户统计数据
    user_stats = _get_user_achievement_stats(target_user)
    
    if achievement_id:
        # 评估单个成就
        try:
            achievement = Achievement.objects.get(id=int(achievement_id), is_active=True)
        except (ValueError, Achievement.DoesNotExist):
            return Response(
                {"error": "无效的成就 ID"},
                status=status.HTTP_404_NOT_FOUND,
            )
        
        unlock_result = evaluate_or_unlock(
            target_user,
            achievement,
            user_stats=user_stats,
            provenance=UserAchievement.PROVENANCE_AUTO,
        )
        
        if unlock_result.unlocked:
            payload = _build_achievement_payload(
                achievement,
                unlocked_at=unlock_result.unlocked_at.isoformat() if unlock_result.unlocked_at else None,
                user_achievement=unlock_result.user_achievement,
                user=request.user if request.user.is_authenticated else None,
            )
            return Response({
                **unlock_result.to_dict(),
                "achievement": payload,
            })
        else:
            return Response({
                **unlock_result.to_dict(),
                "achievement": _build_achievement_payload(achievement),
            })
    else:
        # 批量评估所有活跃成就
        achievements = Achievement.objects.filter(is_active=True).select_related("group")
        results = []
        unlocked_count = 0
        
        for achievement in achievements:
            unlock_result = evaluate_or_unlock(
                target_user,
                achievement,
                user_stats=user_stats,
                provenance=UserAchievement.PROVENANCE_AUTO,
            )
            
            if unlock_result.unlocked:
                unlocked_count += 1
                if unlock_result.is_new:
                    results.append({
                        "achievement_id": achievement.id,
                        "achievement_slug": achievement.slug,
                        "unlocked": True,
                        "is_new": True,
                    })
        
        return Response({
            "unlocked_count": unlocked_count,
            "total_evaluated": len(achievements),
            "new_unlocks": results,
        })


class UserUploadListCreateView(generics.ListCreateAPIView):
    serializer_class = UserUploadSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None  # 保持前端期望的数组响应，不受全局分页影响
    # 开发模式下禁用限流，生产模式下使用自定义限流作用域
    throttle_scope = None if settings.DEBUG else "uploads_get"

    def get_queryset(self):
        return (
            UserUpload.objects.filter(user=self.request.user)
            .only(
                "id",
                "title",
                "notes",
                "uploaded_at",
                "self_rating",
                "mood",
                "mood_label",
                "tags",
                "duration_minutes",
                "image",
                "created_at",
                "updated_at",
            )
            .order_by("-uploaded_at")
        )

    @transaction.atomic
    def perform_create(self, serializer: UserUploadSerializer):
        # 检查每日上传限制（10张）
        # 使用 created_at 字段检查今天实际上传的数量，而不是 uploaded_at（用户可能设置为过去的日期）
        today = get_today_shanghai()
        today_uploads_count = UserUpload.objects.filter(
            user=self.request.user,
            created_at__date=today
        ).count()
        
        MAX_DAILY_UPLOADS = 10
        if today_uploads_count >= MAX_DAILY_UPLOADS:
            raise serializers.ValidationError(
                f"今日已上传 {today_uploads_count} 张图片，已达到每日上限 {MAX_DAILY_UPLOADS} 张。"
            )
        
        try:
            upload = serializer.save(user=self.request.user)
            # 记录上传成功信息，包括图片URL和存储位置
            image_url = None
            storage_backend = None
            image_exists = False
            image_name = None
            
            if upload.image:
                image_name = upload.image.name
                image_url = upload.image.url
                # 检查存储后端类型
                if hasattr(upload.image, 'storage'):
                    storage_backend = type(upload.image.storage).__name__
                    # 检查文件是否真的存在
                    try:
                        image_exists = upload.image.storage.exists(image_name)
                    except Exception as check_error:
                        logger.warning(f"Failed to check if image exists: {check_error}")
                        image_exists = False
                
                # 验证文件是否真的保存到TOS（而不是本地）
                if hasattr(upload.image.storage, 'bucket_name'):
                    bucket_name = upload.image.storage.bucket_name
                    logger.info(
                        f"User upload created - checking TOS storage",
                        extra={
                            "user_id": self.request.user.id,
                            "upload_id": upload.id,
                            "image_name": image_name,
                            "image_url": image_url,
                            "bucket_name": bucket_name,
                            "storage_backend": storage_backend,
                            "image_exists": image_exists,
                        }
                    )
                    if not image_exists:
                        logger.error(
                            f"User upload created but image file does not exist in TOS!",
                            extra={
                                "user_id": self.request.user.id,
                                "upload_id": upload.id,
                                "image_name": image_name,
                                "bucket_name": bucket_name,
                            }
                        )
                else:
                    # 如果使用本地存储，记录警告
                    logger.warning(
                        f"User upload created but file may be saved locally instead of TOS",
                        extra={
                            "user_id": self.request.user.id,
                            "upload_id": upload.id,
                            "image_name": image_name,
                            "image_url": image_url,
                            "storage_backend": storage_backend,
                            "image_exists": image_exists,
                        }
                    )
            else:
                logger.info(
                    f"User upload created successfully (no image)",
                    extra={
                        "user_id": self.request.user.id,
                        "upload_id": upload.id,
                    }
                )
        except Exception as e:
            # 记录上传失败的错误
            logger.error(
                f"Failed to create user upload",
                extra={
                    "user_id": self.request.user.id,
                    "error": str(e),
                },
                exc_info=True
            )
            raise

        # 确保 uploaded_at 有时区信息，如果没有则使用当前时间
        uploaded_at = upload.uploaded_at
        if uploaded_at is None:
            uploaded_at = timezone.now()
        # 确保是时区感知的 datetime
        elif timezone.is_naive(uploaded_at):
            uploaded_at = timezone.make_aware(uploaded_at)

        # 明确转换为中国时区，确保日期计算正确
        # 安全修复：检查 SHANGHAI_TZ 是否为 None
        if SHANGHAI_TZ is None:
            logger.warning(
                f"SHANGHAI_TZ 未配置，使用时区回退方案",
                extra={"user_id": self.request.user.id}
            )
            # 回退方案：直接使用本地日期
            checkin_date = uploaded_at.date()
        else:
            shanghai_time = uploaded_at.astimezone(SHANGHAI_TZ)
            checkin_date = shanghai_time.date()

        # 使用事务和异常处理防止并发竞态条件
        try:
            checkin, created = DailyCheckIn.objects.get_or_create(
                user=self.request.user,
                date=checkin_date,
                defaults={"source": "upload"},
            )
            if not created and not checkin.source:
                checkin.source = "upload"
                checkin.save(update_fields=["source"])
        except IntegrityError:
            # 处理并发情况下的唯一性约束冲突
            try:
                checkin = DailyCheckIn.objects.get(user=self.request.user, date=checkin_date)
                if not checkin.source:
                    checkin.source = "upload"
                    checkin.save(update_fields=["source"])
            except DailyCheckIn.DoesNotExist:
                # 如果仍然不存在，记录错误并重新抛出
                logger.error(
                    f"上传作品时打卡记录并发冲突后无法获取记录",
                    extra={"user_id": self.request.user.id, "date": checkin_date.isoformat()},
                    exc_info=True
                )
                raise


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def check_upload_limit(request):
    """
    检查用户当天上传数量限制
    返回：{
        "today_count": 今天已上传数量,
        "max_daily_uploads": 每日最大上传数,
        "remaining": 剩余可上传数量,
        "can_upload": 是否可以继续上传
    }
    """
    # 使用 created_at 字段检查今天实际上传的数量，而不是 uploaded_at（用户可能设置为过去的日期）
    today = get_today_shanghai()
    today_uploads_count = UserUpload.objects.filter(
        user=request.user,
        created_at__date=today
    ).count()
    
    MAX_DAILY_UPLOADS = 10
    remaining = max(0, MAX_DAILY_UPLOADS - today_uploads_count)
    can_upload = today_uploads_count < MAX_DAILY_UPLOADS
    
    return Response({
        "today_count": today_uploads_count,
        "max_daily_uploads": MAX_DAILY_UPLOADS,
        "remaining": remaining,
        "can_upload": can_upload,
    })


class UserUploadDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserUploadSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return (
            UserUpload.objects.filter(user=self.request.user)
            .only(
                "id",
                "title",
                "notes",
                "uploaded_at",
                "self_rating",
                "mood",
                "mood_label",
                "tags",
                "duration_minutes",
                "image",
                "created_at",
                "updated_at",
            )
            .order_by("-uploaded_at")
        )


class UserUploadImageView(APIView):
    permission_classes = [AllowAny]

    @staticmethod
    def _resolve_authenticated_user(request):
        user = getattr(request, "user", None)
        if getattr(user, "is_authenticated", False):
            return user

        token_value = request.query_params.get("token", "").strip()
        if not token_value:
            return None

        try:
            token = AuthToken.objects.select_related("user").get(key=token_value)
            # 安全修复：检查token是否过期
            if token.is_expired:
                return None
        except AuthToken.DoesNotExist:
            return None

        # 使用update避免竞态条件
        AuthToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        return token.user

    def options(self, request, pk: int):
        """处理 CORS 预检请求"""
        response = Response()
        origin = request.headers.get("Origin")
        if origin:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Credentials"] = "true"
        else:
            response["Access-Control-Allow-Origin"] = "*"
        response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Origin, X-Requested-With, Content-Type, Accept, Authorization"
        response["Access-Control-Max-Age"] = "86400"
        response["Vary"] = "Origin"
        return response

    def get(self, request, pk: int):
        user = self._resolve_authenticated_user(request)
        if user is None:
            return Response(
                {"detail": "未登录或令牌无效"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        upload = get_object_or_404(UserUpload, pk=pk, user=user)
        if not upload.image:
            raise Http404("图片不存在")

        try:
            file_handle = upload.image.open("rb")
        except FileNotFoundError as exc:
            raise Http404("图片文件已丢失") from exc

        content_type, _ = mimetypes.guess_type(upload.image.name)
        response = FileResponse(file_handle, content_type=content_type or "application/octet-stream")
        filename = os.path.basename(upload.image.name)
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        response["Cache-Control"] = "public, max-age=86400"
        response["Cross-Origin-Resource-Policy"] = "cross-origin"

        # 设置 CORS 头以支持跨域访问
        origin = request.headers.get("Origin")
        auth_token = request.query_params.get("token")
        if origin:
            if auth_token:
                response["Access-Control-Allow-Origin"] = origin
                response["Access-Control-Allow-Credentials"] = "true"
            else:
                response["Access-Control-Allow-Origin"] = "*"
            response["Vary"] = "Origin"
        else:
            response["Access-Control-Allow-Origin"] = "*"
        
        # 添加额外的 CORS 头以支持更多场景
        response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Origin, X-Requested-With, Content-Type, Accept, Authorization"
        response["Access-Control-Expose-Headers"] = "Content-Type, Content-Disposition, Cache-Control"

        return response


class ShortTermGoalListCreateView(generics.ListCreateAPIView):
    serializer_class = ShortTermGoalSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return (
            ShortTermGoal.objects.filter(user=self.request.user)
            .only("id", "title", "duration_days", "plan_type", "schedule", "status", "created_at", "updated_at")
            .order_by("-created_at", "-id")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class ShortTermGoalDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ShortTermGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ShortTermGoal.objects.filter(user=self.request.user).only(
            "id", "title", "duration_days", "plan_type", "schedule", "status", "created_at", "updated_at", "user"
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@transaction.atomic
def start_short_term_goal(request, goal_id):
    """
    启动短期目标：将状态从saved改为active。
    """
    from core.models import ShortTermGoal
    
    try:
        goal = ShortTermGoal.objects.select_for_update().get(pk=goal_id, user=request.user)
    except ShortTermGoal.DoesNotExist:
        return Response(
            {"detail": "指定的短期目标不存在或不属于当前用户。"},
            status=status.HTTP_404_NOT_FOUND,
        )
    
    # 检查当前状态
    if goal.status == ShortTermGoal.STATUS_ACTIVE:
        return Response(
            {"detail": "该目标已经启动。"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    if goal.status == ShortTermGoal.STATUS_COMPLETED:
        return Response(
            {"detail": "已完成的目标无法重新启动。"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # 更新状态为active
    goal.status = ShortTermGoal.STATUS_ACTIVE
    goal.save(update_fields=["status"])
    
    # 序列化并返回
    serializer = ShortTermGoalSerializer(goal)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def short_term_goal_task_completions(request, goal_id):
    """
    获取短期目标的任务完成记录（任务图片关联）和打卡时间。
    
    安全修复：确保用户只能访问自己的目标数据。
    """
    user = request.user
    try:
        goal = ShortTermGoal.objects.select_related('user').get(pk=goal_id, user=user)
    except ShortTermGoal.DoesNotExist:
        # 使用统一错误消息，不泄露是否存在该目标
        return Response(
            {"detail": "指定的短期目标不存在或不属于当前用户。"},
            status=status.HTTP_404_NOT_FOUND,
        )
    
    # 获取所有任务完成记录
    # 性能优化：使用select_related避免N+1查询
    completions = ShortTermGoalTaskCompletion.objects.filter(
        goal=goal
    ).select_related("upload", "goal").order_by("date", "task_id")
    
    # 构建返回数据：按日期和任务ID组织
    # 使用任务完成记录的创建时间作为该目标的完成时间（而不是DailyCheckIn的时间）
    result = {}
    checkin_times = {}
    for completion in completions:
        date_key = completion.date.isoformat()
        if date_key not in result:
            result[date_key] = {}
        
        # 使用任务完成记录的创建时间作为该目标的完成时间
        # 对于同一天，使用最早的任务完成时间（第一次完成的时间）
        if date_key not in checkin_times:
            checkin_times[date_key] = completion.created_at.isoformat()
        else:
            # 如果已有时间，使用更早的时间（第一次完成的时间）
            try:
                # 解析已有的ISO格式时间字符串
                existing_time_str = checkin_times[date_key]
                if isinstance(existing_time_str, str):
                    # 使用datetime.fromisoformat（Python 3.7+）
                    existing_time = datetime.fromisoformat(existing_time_str.replace('Z', '+00:00'))
                    if completion.created_at < existing_time:
                        checkin_times[date_key] = completion.created_at.isoformat()
                else:
                    checkin_times[date_key] = completion.created_at.isoformat()
            except (ValueError, TypeError, AttributeError):
                # 如果解析失败，使用当前记录的时间
                checkin_times[date_key] = completion.created_at.isoformat()
        
        # 构建上传记录信息
        upload_data = {
            "id": completion.upload.id,
            "title": completion.upload.title,
            "image": completion.upload.image.url if completion.upload.image else None,
            "uploaded_at": completion.upload.uploaded_at.isoformat(),
        }
        result[date_key][completion.task_id] = upload_data
    
    return Response({
        "completions": result,
        "checkin_times": checkin_times,
    })


class UserTaskPresetListCreateView(generics.ListCreateAPIView):
    serializer_class = UserTaskPresetSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return (
            UserTaskPreset.objects.filter(user=self.request.user)
            .only("id", "slug", "title", "description", "metadata", "is_active", "created_at", "updated_at", "user")
            .order_by("-updated_at", "-id")
        )

    def perform_create(self, serializer: UserTaskPresetSerializer):
        serializer.save(
            user=self.request.user,
            category=UserTaskPreset.DEFAULT_CATEGORY,
        )


class UserTaskPresetDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserTaskPresetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            UserTaskPreset.objects.filter(user=self.request.user)
            .only("id", "slug", "title", "description", "metadata", "is_active", "created_at", "updated_at", "user")
            .order_by("-updated_at", "-id")
        )

    def perform_update(self, serializer: UserTaskPresetSerializer):
        serializer.save(category=UserTaskPreset.DEFAULT_CATEGORY)


@api_view(["GET"])
@permission_classes([AllowAny])
def homepage_messages(request):
    """
    返回首页三大块文案：
    1. 通用文案 - 随机展示一句（当不是特殊打卡日期时显示）
    2. 条件文案 - 当用户达成某些条件时显示（如打卡满7天）
    3. 节日文案 - 特定日期显示特定文案
    """
    trace_id = getattr(request, "trace_id", "unknown")
    user = request.user
    today = get_today_shanghai()
    is_authenticated = user.is_authenticated
    user_id = user.id if is_authenticated else None
    
    logger.info(
        f"homepage_messages request started for user_id={user_id}, today={today.isoformat()}",
        extra={"trace_id": trace_id, "user_id": user_id}
    )

    try:
        conditional_text = None
        # 第二块：条件文案（基于用户条件，优先检查）- 仅登录用户
        if is_authenticated:
            check_in_stats = _get_check_in_stats(user)
            total_uploads = UserUpload.objects.filter(user=user).count()
            last_upload = UserUpload.objects.filter(user=user).order_by("-uploaded_at").first()
            
            logger.debug(
                f"check_in_stats: {check_in_stats}, total_uploads: {total_uploads}",
                extra={"trace_id": trace_id, "user_id": user_id}
            )
            
            conditional_text = _resolve_conditional_message(
                user,
                check_in_stats=check_in_stats,
                total_uploads=total_uploads,
                last_upload=last_upload,
            )
            
            if conditional_text:
                logger.debug(
                    f"matched conditional message: {conditional_text[:50]}...",
                    extra={"trace_id": trace_id, "user_id": user_id}
                )

        # 第一块：通用文案（随机展示，仅在不是特殊打卡日期时显示）
        # 如果匹配到条件文案（特殊打卡日期），则不显示通用文案
        general_text = None
        if not conditional_text:
            general_text = _resolve_general_message()
            if general_text:
                logger.debug(
                    f"selected general message: {general_text[:50]}...",
                    extra={"trace_id": trace_id, "user_id": user_id}
                )

        # 第三块：节日文案和历史文案（基于日期）
        holiday_message = HolidayMessage.get_for_date(today)
        holiday_payload = None
        if holiday_message:
            holiday_payload = {
                "headline": holiday_message.headline or None,
                "text": holiday_message.text,
            }
            logger.debug(
                f"matched holiday message for date {today.isoformat()}",
                extra={"trace_id": trace_id, "user_id": user_id}
            )
        
        # 历史文案（历史上的今天）
        history_message = DailyHistoryMessage.get_for_date(today)
        history_payload = None
        if history_message:
            history_payload = {
                "headline": history_message.headline or None,
                "text": history_message.text,
            }
            logger.debug(
                f"matched history message for date {today.isoformat()}",
                extra={"trace_id": trace_id, "user_id": user_id}
            )

        response_payload = {
            "general": general_text,  # 通用文案（当不是特殊打卡日期时）
            "conditional": conditional_text,  # 条件文案（特殊打卡日期等）
            "holiday": holiday_payload,  # 节日文案
            "history": history_payload,  # 历史文案（历史上的今天）
        }
        
        logger.info(
            f"homepage_messages request completed successfully",
            extra={"trace_id": trace_id, "user_id": user_id}
        )
        
        return Response(response_payload)
    except Exception as exc:
        logger.error(
            f"homepage_messages request failed: {exc}",
            extra={"trace_id": trace_id, "user_id": user_id},
            exc_info=True
        )
        raise


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def short_term_task_presets(request):
    user = request.user
    presets = list(
        ShortTermTaskPreset.objects.filter(is_active=True).order_by(
            "display_order", "code"
        )
    )
    serializer = ShortTermTaskPresetPublicSerializer(presets, many=True)
    user_presets_qs = UserTaskPreset.objects.filter(
        user=user, is_active=True
    ).order_by("-updated_at", "-id")
    user_serializer = UserTaskPresetPublicSerializer(user_presets_qs, many=True)

    categories: list[dict[str, str]] = []
    seen_categories: set[str] = set()
    for preset in presets:
        category = (preset.category or "").strip()
        if not category:
            continue
        if category not in seen_categories:
            seen_categories.add(category)
            categories.append({"id": category, "name": category})

    my_category = UserTaskPreset.DEFAULT_CATEGORY
    if my_category not in seen_categories:
        categories.append({"id": my_category, "name": my_category})
        seen_categories.add(my_category)

    tasks: list[dict[str, object]] = []
    for item in serializer.data:
        data = dict(item)
        tasks.append(
            {
                "code": data.get("code"),
                "category": data.get("category") or "",
                "title": data.get("title"),
                "description": data.get("description") or "",
                "metadata": data.get("metadata") or {},
                "origin": "global",
                "preset_id": None,
            }
        )

    for item in user_serializer.data:
        data = dict(item)
        tasks.append(
            {
                "code": f"user-{data.get('slug')}",
                "category": my_category,
                "title": data.get("title"),
                "description": data.get("description") or "",
                "metadata": data.get("metadata") or {},
                "origin": "custom",
                "preset_id": data.get("id"),
            }
        )

    return Response(
        {
            "categories": categories,
            "tasks": tasks,
            "user_presets": user_serializer.data,
        }
    )


class LongTermPlanCopyListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = LongTermPlanCopyPublicSerializer

    def get_queryset(self):
        queryset = (
            LongTermPlanCopy.objects.filter(is_active=True)
            .order_by("min_hours", "max_hours", "id")
        )
        return queryset

    @method_decorator(cache_page(300))
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def goals_calendar(request):
    user = request.user
    today = get_today_shanghai()

    year_param = request.query_params.get("year")
    month_param = request.query_params.get("month")

    try:
        year = int(year_param) if year_param is not None else today.year
        month = int(month_param) if month_param is not None else today.month
    except (TypeError, ValueError):
        return Response(
            {"detail": "年月参数格式不正确，应为数字。"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if month < 1 or month > 12:
        return Response(
            {"detail": "月份应在 1 到 12 之间。"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        month_start = date(year, month, 1)
    except ValueError:
        return Response(
            {"detail": "提供的年月不合法。"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    _, month_days = calendar.monthrange(year, month)
    month_end = date(year, month, month_days)

    start_offset = (month_start.weekday() + 1) % 7
    display_start = month_start - timedelta(days=start_offset)

    end_offset = (6 - ((month_end.weekday() + 1) % 7)) % 7
    display_end = month_end + timedelta(days=end_offset)

    checkins = set(
        DailyCheckIn.objects.filter(
            user=user, date__range=(display_start, display_end)
        ).values_list("date", flat=True)
    )

    # 优化：批量查询上传记录，避免循环中的多次时区转换
    uploads = set()
    uploaded_at_list = list(
        UserUpload.objects.filter(
            user=user, uploaded_at__date__range=(display_start, display_end)
        ).values_list("uploaded_at", flat=True)
    )
    for uploaded_at in uploaded_at_list:
        # 明确转换为中国时区，确保日期计算正确
        if timezone.is_naive(uploaded_at):
            uploaded_at = timezone.make_aware(uploaded_at)
        # 安全修复：检查 SHANGHAI_TZ 是否为 None
        if SHANGHAI_TZ is not None:
            shanghai_time = uploaded_at.astimezone(SHANGHAI_TZ)
            uploads.add(shanghai_time.date())
        else:
            # 回退方案：直接使用本地日期
            uploads.add(uploaded_at.date())

    days_payload = []
    cursor = display_start
    while cursor <= display_end:
        status_key = "none"
        if cursor in uploads:
            status_key = "upload"
        elif cursor in checkins:
            status_key = "check"

        days_payload.append(
            {
                "date": cursor.isoformat(),
                "day": cursor.day,
                "in_month": cursor.month == month,
                "status": status_key,
            }
        )
        cursor += timedelta(days=1)

    summary = {
        "total_days": len(days_payload),
        "checkin_days": sum(1 for day in days_payload if day["status"] == "check"),
        "upload_days": sum(1 for day in days_payload if day["status"] == "upload"),
    }

    return Response(
        {
            "year": year,
            "month": month,
            "start": display_start.isoformat(),
            "end": display_end.isoformat(),
            "days": days_payload,
            "summary": summary,
        }
    )




@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def check_in(request):
    user = request.user
    today = get_today_shanghai()

    if request.method == "POST":
        date_str = request.data.get("date")
        source = (request.data.get("source") or "").strip() or "app"
        task_images = request.data.get("task_images")  # 新增：任务图片关联信息
        notes = request.data.get("notes", "").strip()  # 新增：用户备注

        if date_str:
            if not isinstance(date_str, str):
                return Response(
                    {"detail": "日期参数必须是字符串格式。"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                target_date = date.fromisoformat(date_str.strip())
            except (ValueError, AttributeError) as e:
                # 生产环境不暴露原始输入，防止信息泄露
                logger.debug(f"日期解析失败: {date_str!r}", extra={"error": str(e)})
                return Response(
                    {"detail": "日期格式不正确，应为 YYYY-MM-DD 格式（如：2024-01-01）"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            target_date = today

        if target_date > today:
            # 生产环境不暴露具体日期，只提示错误
            logger.debug(
                f"尝试为未来日期打卡: {target_date.isoformat()}, 今天: {today.isoformat()}",
                extra={"target_date": target_date.isoformat(), "today": today.isoformat()}
            )
            return Response(
                {"detail": "不能为未来日期打卡，请选择今天或之前的日期"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        # 频率限制：检查用户是否在短时间内重复打卡（防止恶意刷打卡）
        # 检查最近30秒内是否有打卡记录（针对同一日期）
        thirty_seconds_ago = timezone.now() - timedelta(seconds=30)
        recent_checkin = DailyCheckIn.objects.filter(
            user=user,
            date=target_date,
            checked_at__gte=thirty_seconds_ago
        ).first()
        
        if recent_checkin:
            # 如果最近30秒内已经为这个日期打卡过，返回友好提示
            stats = _get_check_in_stats(user)
            return Response(
                {
                    **stats,
                    "created": False,
                    "checked_date": target_date.isoformat(),
                    "checked_at": recent_checkin.checked_at.isoformat() if hasattr(recent_checkin, 'checked_at') else timezone.now().isoformat(),
                    "detail": "您刚刚已经打卡过了，请稍后再试。",
                },
                status=status.HTTP_200_OK,
            )

        # 验证任务图片关联信息（如果提供）
        goal_id = None
        if task_images:
            if not isinstance(task_images, dict):
                return Response(
                    {"detail": "task_images 参数必须是对象格式。"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # 从task_images中提取goal_id（如果存在）
            goal_id = request.data.get("goal_id")
            if goal_id:
                try:
                    goal_id = int(goal_id)
                except (ValueError, TypeError):
                    return Response(
                        {"detail": "goal_id 参数必须是整数。"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                # 验证目标是否存在且属于当前用户
                try:
                    goal = ShortTermGoal.objects.get(pk=goal_id, user=user)
                except ShortTermGoal.DoesNotExist:
                    return Response(
                        {"detail": "指定的短期目标不存在或不属于当前用户。"},
                        status=status.HTTP_404_NOT_FOUND,
                    )

        with transaction.atomic():
            # 使用select_for_update锁定，防止并发问题
            # 先尝试获取并锁定记录
            try:
                checkin = DailyCheckIn.objects.select_for_update().get(
                    user=user, date=target_date
                )
                created = False
                update_fields = []
                if source and not checkin.source:
                    checkin.source = source
                    update_fields.append("source")
                if notes is not None:
                    checkin.notes = notes
                    update_fields.append("notes")
                # 每次打卡都更新完成时间（无论是否有其他字段更新）
                checkin.checked_at = timezone.now()
                update_fields.append("checked_at")
                checkin.save(update_fields=update_fields)
            except DailyCheckIn.DoesNotExist:
                # 记录不存在，创建新记录
                try:
                    checkin = DailyCheckIn.objects.create(
                        user=user, date=target_date, source=source, notes=notes or "", checked_at=timezone.now()
                    )
                    created = True
                except IntegrityError:
                    # 并发情况下，可能在创建时记录已存在，重新获取
                    try:
                        checkin = DailyCheckIn.objects.get(user=user, date=target_date)
                        created = False
                        update_fields = []
                        if source and not checkin.source:
                            checkin.source = source
                            update_fields.append("source")
                        if notes is not None:
                            checkin.notes = notes
                            update_fields.append("notes")
                        # 每次打卡都更新完成时间（无论是否有其他字段更新）
                        checkin.checked_at = timezone.now()
                        update_fields.append("checked_at")
                        checkin.save(update_fields=update_fields)
                    except DailyCheckIn.DoesNotExist:
                        # 如果仍然不存在，记录错误并重新抛出
                        logger.error(
                            f"打卡记录并发冲突后无法获取记录",
                            extra={"user_id": user.id, "date": target_date.isoformat()},
                            exc_info=True
                        )
                        raise

            # 保存任务图片关联（如果提供）
            if task_images and goal_id:
                goal = ShortTermGoal.objects.get(pk=goal_id, user=user)
                for task_id, upload_id in task_images.items():
                    if not isinstance(task_id, str) or not task_id.strip():
                        continue
                    try:
                        upload_id_int = int(upload_id)
                    except (ValueError, TypeError):
                        logger.warning(
                            f"无效的上传ID: {upload_id}",
                            extra={"user_id": user.id, "task_id": task_id}
                        )
                        continue
                    
                    # 验证上传记录是否存在且属于当前用户
                    try:
                        upload = UserUpload.objects.get(pk=upload_id_int, user=user)
                    except UserUpload.DoesNotExist:
                        logger.warning(
                            f"上传记录不存在或不属于当前用户: {upload_id_int}",
                            extra={"user_id": user.id, "task_id": task_id}
                        )
                        continue
                    
                    # 创建或更新任务完成记录
                    # 如果是新创建，created_at会自动设置为当前时间
                    # 如果是更新，保持原有的created_at不变
                    completion, created = ShortTermGoalTaskCompletion.objects.get_or_create(
                        goal=goal,
                        task_id=task_id.strip(),
                        date=target_date,
                        defaults={"upload": upload}
                    )
                    # 如果是更新，更新upload字段
                    if not created:
                        completion.upload = upload
                        completion.save(update_fields=["upload", "updated_at"])

        stats = _get_check_in_stats(user)
        payload = {
            **stats,
            "created": created,
            "checked_date": target_date.isoformat(),
        }
        # 确保checkin对象存在且checked_at字段存在
        if checkin and hasattr(checkin, 'checked_at'):
            payload["checked_at"] = checkin.checked_at.isoformat()
        else:
            # 如果没有checked_at字段，使用当前时间
            payload["checked_at"] = timezone.now().isoformat()
        
        return Response(
            payload,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    stats = _get_check_in_stats(user)
    return Response(stats)


def _get_check_in_stats(user):
    """
    统计规则（与日历一致）：
    - 打卡天数 = "打卡记录日期" 与 "上传记录日期（按中国时区）" 的并集（去重）天数
    - 今日是否已打卡 = 并集中是否包含今天
    - 连续天数 = 以最近一天为起点，向前按日连续命中的天数
    """
    today = get_today_shanghai()
    # 1) 收集 DailyCheckIn 日期
    checkin_dates = set(
        DailyCheckIn.objects.filter(user=user).values_list("date", flat=True)
    )
    # 2) 收集上传记录日期（本地化为上海时区的"日"）
    # 优化：批量查询所有上传时间，避免循环中的多次时区转换
    upload_dates = set()
    uploaded_at_list = list(
        UserUpload.objects.filter(user=user, uploaded_at__isnull=False)
        .values_list("uploaded_at", flat=True)
    )
    for uploaded_at in uploaded_at_list:
        # 明确转换为中国时区，确保日期计算正确
        if timezone.is_naive(uploaded_at):
            uploaded_at = timezone.make_aware(uploaded_at)
        # 安全修复：检查 SHANGHAI_TZ 是否为 None
        if SHANGHAI_TZ is not None:
            shanghai_time = uploaded_at.astimezone(SHANGHAI_TZ)
            upload_dates.add(shanghai_time.date())
        else:
            # 回退方案：直接使用本地日期
            upload_dates.add(uploaded_at.date())
    # 3) 合并为并集
    union_dates = checkin_dates | upload_dates
    if not union_dates:
        return {
            "checked_today": False,
            "current_streak": 0,
            "total_checkins": 0,
            "latest_checkin": None,
        }
    total = len(union_dates)
    latest_date = max(union_dates)
    checked_today = today in union_dates
    # 4) 计算连续天数：从最近一天开始，向前逐天查找连续
    streak = 0
    cursor = latest_date
    while cursor in union_dates:
        streak += 1
        cursor = cursor - timedelta(days=1)
    return {
        "checked_today": checked_today,
        "current_streak": streak,
        "total_checkins": total,
        "latest_checkin": latest_date.isoformat(),
    }


def _resolve_general_message():
    """解析通用文案：随机展示一句。"""
    messages = list(
        EncouragementMessage.objects.filter(is_active=True).only("text", "weight")
    )
    if not messages:
        return None

    # 确保类型正确（防止从数据库读取时是字符串）
    weights = [max(int(message.weight) if message.weight is not None else 1, 1) for message in messages]
    selected = random.choices(messages, weights=weights, k=1)[0]
    return selected.text


def _resolve_conditional_message(
    user, *, check_in_stats=None, total_uploads=None, last_upload=None
):
    """
    解析条件文案：当用户达成某些条件时显示特定语句。
    例如：打卡满7天、连续打卡30天、上传达到10张、上一次上传的心情等。
    """
    queryset = ConditionalMessage.objects.filter(is_active=True).order_by(
        "priority", "id"
    )

    for message in queryset:
        if message.matches_user(
            user,
            check_in_stats=check_in_stats,
            total_uploads=total_uploads,
            last_upload=last_upload,
        ):
            return message.text

    return None


def _resolve_upload_conditional_message(last_upload: UserUpload | None, *, now):
    """
    解析基于上传记录的条件文案（保留原有功能，用于其他场景）。
    """
    queryset = UploadConditionalMessage.objects.filter(is_active=True).order_by(
        "priority", "id"
    )

    for message in queryset:
        if message.matches_upload(last_upload, reference_time=now):
            return message.text

    return None


class LongTermGoalView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            goal = request.user.long_term_goal
        except LongTermGoal.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        uploads = self._fetch_uploads(request.user, goal.started_at)
        serializer = LongTermGoalSerializer(
            goal,
            context={
                "request": request,
                "uploads": uploads,
            },
        )
        return Response(serializer.data)

    def post(self, request):
        payload_serializer = LongTermGoalSetupSerializer(data=request.data)
        payload_serializer.is_valid(raise_exception=True)
        data = payload_serializer.validated_data

        # 修复：使用上海时区设置started_at，确保时区一致
        # 获取上海时区的当前时间
        if SHANGHAI_TZ is not None:
            now_utc = timezone.now()
            if timezone.is_naive(now_utc):
                now_utc = timezone.make_aware(now_utc)
            started_at_shanghai = now_utc.astimezone(SHANGHAI_TZ)
        else:
            # 回退：使用timezone.now()，但确保时区正确
            started_at_shanghai = timezone.now()
            if timezone.is_naive(started_at_shanghai):
                started_at_shanghai = timezone.make_aware(started_at_shanghai)

        defaults = {
            "title": data["title"],
            "description": data.get("description", ""),
            "target_hours": data["target_hours"],
            "checkpoint_count": data["checkpoint_count"],
            "started_at": started_at_shanghai,
        }

        goal, created = LongTermGoal.objects.get_or_create(
            user=request.user,
            defaults=defaults,
        )

        should_reset = data.get("reset_progress", False)

        if not created:
            hours_changed = goal.target_hours != data["target_hours"]
            checkpoints_changed = goal.checkpoint_count != data["checkpoint_count"]

            goal.title = data["title"]
            goal.description = data.get("description", "")
            goal.target_hours = data["target_hours"]
            goal.checkpoint_count = data["checkpoint_count"]

            # 修复：只有在用户明确选择"重置进度"时才重置started_at
            # 修改目标参数时，保持started_at不变，只更新目标值
            if should_reset:
                # 用户明确选择重置，使用上海时区
                if SHANGHAI_TZ is not None:
                    now_utc = timezone.now()
                    if timezone.is_naive(now_utc):
                        now_utc = timezone.make_aware(now_utc)
                    goal.started_at = now_utc.astimezone(SHANGHAI_TZ)
                else:
                    goal.started_at = timezone.now()
            # 注意：不再因为hours_changed或checkpoints_changed而重置started_at
            # 这样用户可以修改目标而不丢失进度

            goal.save()

        uploads = self._fetch_uploads(request.user, goal.started_at)
        serializer = LongTermGoalSerializer(
            goal,
            context={
                "request": request,
                "uploads": uploads,
            },
        )
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(serializer.data, status=status_code)

    def delete(self, request):
        try:
            goal = request.user.long_term_goal
        except LongTermGoal.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)

        goal.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @staticmethod
    def _fetch_uploads(user, started_at):
        """
        获取用户在长期目标开始后的所有上传记录。
        
        修复：使用日期范围查询，确保时区一致，避免遗漏边界时间点的上传。
        """
        # 确保started_at是aware datetime
        if timezone.is_naive(started_at):
            started_at = timezone.make_aware(started_at)
        
        # 获取started_at的日期（上海时区），用于更准确的查询
        if SHANGHAI_TZ is not None:
            started_at_shanghai = started_at.astimezone(SHANGHAI_TZ)
            # 使用当天的开始时间（00:00:00）作为查询起点，确保包含当天所有上传
            start_date = started_at_shanghai.date()
            start_datetime = timezone.make_aware(
                datetime.combine(start_date, datetime.min.time()),
                timezone=SHANGHAI_TZ
            )
            # 转换为UTC用于数据库查询
            if settings.USE_TZ:
                start_datetime = start_datetime.astimezone(dt_timezone.utc)
        else:
            # 回退：使用原始started_at，但确保时区正确
            start_datetime = started_at
        
        return list(
            UserUpload.objects.filter(
                user=user, 
                uploaded_at__gte=start_datetime
            ).order_by("uploaded_at", "id")
        )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_checkpoint(request):
    """更新checkpoint的showcase和completionNote"""
    try:
        goal = request.user.long_term_goal
    except LongTermGoal.DoesNotExist:
        return Response(
            {"detail": "长期目标不存在"},
            status=status.HTTP_404_NOT_FOUND,
        )
    
    checkpoint_index = request.data.get("checkpoint_index")
    if checkpoint_index is None:
        return Response(
            {"detail": "checkpoint_index是必需的"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # 使用metadata字段存储checkpoint的自定义数据
    try:
        if not hasattr(goal, "metadata") or goal.metadata is None:
            goal.metadata = {}
        elif not isinstance(goal.metadata, dict):
            goal.metadata = {}
    except (AttributeError, TypeError):
        goal.metadata = {}
    
    checkpoint_key = f"checkpoint_{checkpoint_index}"
    if not isinstance(goal.metadata, dict):
        goal.metadata = {}
    if checkpoint_key not in goal.metadata:
        goal.metadata[checkpoint_key] = {}
    
    if "upload_id" in request.data:
        goal.metadata[checkpoint_key]["upload_id"] = request.data["upload_id"]
    
    if "completion_note" in request.data:
        completion_note = request.data["completion_note"]
        # 限制最多500字
        if completion_note and len(completion_note) > 500:
            return Response(
                {"detail": "留言内容不能超过500字"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        goal.metadata[checkpoint_key]["completion_note"] = completion_note
    
    # 只更新metadata字段
    goal.save(update_fields=["metadata", "updated_at"])
    
    # 重新获取并序列化goal
    uploads = LongTermGoalView._fetch_uploads(request.user, goal.started_at)
    serializer = LongTermGoalSerializer(
        goal,
        context={
            "request": request,
            "uploads": uploads,
        },
    )
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    """获取通知列表"""
    notifications = Notification.objects.filter(is_active=True).order_by("-created_at")
    serializer = NotificationPublicSerializer(notifications, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_detail(request, notification_id):
    """获取通知详情"""
    notification = get_object_or_404(Notification, id=notification_id, is_active=True)
    serializer = NotificationPublicSerializer(notification)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
@authentication_classes([])
def high_five_count(request):
    """获取击掌按钮点击总数"""
    from core.models import HighFiveCounter
    count = HighFiveCounter.get_count()
    return Response({"count": count})


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def high_five_increment(request):
    """增加击掌按钮点击计数（每个用户只能点击一次）"""
    from core.models import HighFiveCounter
    
    user = request.user if request.user.is_authenticated else None
    session_key = request.session.session_key
    
    # 如果没有session key，创建一个
    if not session_key and not user:
        request.session.create()
        session_key = request.session.session_key
    
    count, success, clicked_at = HighFiveCounter.increment(user=user, session_key=session_key)
    
    response_data = {
        "count": count,
        "success": success,
    }
    
    if clicked_at:
        response_data["clicked_at"] = clicked_at.isoformat()
    
    if success:
        return Response(response_data)
    else:
        response_data["message"] = "您已经点击过了"
        return Response(
            response_data,
            status=status.HTTP_200_OK
        )


@api_view(["GET"])
@permission_classes([AllowAny])
@authentication_classes([])
def high_five_has_clicked(request):
    """检查当前用户是否已经点击过"""
    from core.models import HighFiveCounter
    
    user = request.user if request.user.is_authenticated else None
    session_key = request.session.session_key
    
    has_clicked, clicked_at = HighFiveCounter.has_clicked(user=user, session_key=session_key)
    response_data = {"has_clicked": has_clicked}
    
    if clicked_at:
        response_data["clicked_at"] = clicked_at.isoformat()
    
    return Response(response_data)


# ==================== 用户测试 API ====================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_tests_list(request):
    """获取可用的测试列表（只返回激活的测试）"""
    # 性能优化：使用prefetch_related避免N+1查询
    tests = Test.objects.filter(is_active=True).prefetch_related(
        "dimensions", "questions"
    ).order_by("display_order", "id")
    
    # 使用简化的序列化器，只返回必要字段
    from core.serializers import TestDimensionSerializer
    
    result = []
    for test in tests:
        # 使用已预加载的关系
        dimensions = list(test.dimensions.all().order_by("display_order", "id"))
        # 统计激活的题目数量（使用已预加载的关系）
        question_count = sum(1 for q in test.questions.all() if q.is_active)
        result.append({
            "id": test.id,
            "slug": test.slug,
            "name": test.name,
            "description": test.description or "",
            "test_type": test.test_type,
            "question_count": question_count,
            "dimensions": TestDimensionSerializer(dimensions, many=True).data,
        })
    
    return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_test_detail(request, test_id):
    """获取测试详情（包含题目）"""
    test = get_object_or_404(Test, id=test_id, is_active=True)
    
    # 获取所有激活的题目
    # 性能优化：使用prefetch_related避免N+1查询
    questions = test.questions.filter(is_active=True).select_related("dimension").prefetch_related(
        "option_texts__options__dimension"
    ).order_by("display_order", "id")
    
    from core.serializers import TestQuestionSerializer, TestDimensionSerializer
    
    # 序列化题目
    questions_data = []
    for question in questions:
        question_data = {
            "id": question.id,
            "question_text": question.question_text,
            "dimension_id": question.dimension.id if question.dimension else None,
            "dimension_name": question.dimension.name if question.dimension else None,
            "endpoint_code": question.endpoint_code or None,
            "score_config": question.score_config or None,
        }
        
        # 如果是类型2，需要包含选项文本
        if test.test_type == Test.TYPE_2:
            # 使用已预加载的关系，避免额外查询
            option_texts = [opt for opt in question.option_texts.all() if opt.is_active]
            option_texts.sort(key=lambda x: (x.display_order, x.id))
            question_data["option_texts"] = []
            for option_text in option_texts:
                option_data = {
                    "id": option_text.id,
                    "text": option_text.text,
                    "options": [],
                }
                # 获取该选项文本对应的所有选项（已预加载）
                options = [opt for opt in option_text.options.all() if opt.is_active]
                for option in options:
                    option_data["options"].append({
                        "endpoint_code": option.endpoint_code,
                        "score_config": option.score_config or {},
                    })
                question_data["option_texts"].append(option_data)
        else:
            question_data["option_texts"] = []
        
        questions_data.append(question_data)
    
    # 获取维度（已通过ManyToMany关系预加载）
    dimensions = list(test.dimensions.all().order_by("display_order", "id"))
    
    result = {
        "id": test.id,
        "slug": test.slug,
        "name": test.name,
        "description": test.description or "",
        "test_type": test.test_type,
        "questions": questions_data,
        "dimensions": TestDimensionSerializer(dimensions, many=True).data,
    }
    
    return Response(result)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def user_test_submit(request):
    """提交测试答案"""
    user = request.user
    test_id = request.data.get("test_id")
    answers = request.data.get("answers", {})
    
    if not test_id:
        return Response(
            {"detail": "test_id 不能为空"}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not isinstance(answers, dict):
        return Response(
            {"detail": "answers 必须是字典格式"}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    test = get_object_or_404(Test, id=test_id, is_active=True)
    
    # 获取所有激活的题目
    # 性能优化：使用prefetch_related避免N+1查询
    questions = test.questions.filter(is_active=True).select_related("dimension").prefetch_related(
        "option_texts__options"
    ).order_by("display_order", "id")
    
    # 验证答案完整性
    question_ids = {str(q.id) for q in questions}
    answer_ids = set(answers.keys())
    
    if question_ids != answer_ids:
        missing = question_ids - answer_ids
        return Response(
            {"detail": f"缺少以下题目的答案: {', '.join(missing)}"}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # 计算维度得分
    dimension_scores = {}
    
    if test.test_type == Test.TYPE_1:
        # 类型1：根据选择强度和score_config计算得分
        for question in questions:
            answer_value = answers.get(str(question.id))
            if answer_value is None:
                continue
            
            try:
                intensity = int(answer_value)
            except (ValueError, TypeError):
                continue
            
            if question.dimension and question.endpoint_code:
                endpoint_code = question.endpoint_code
                score_config = question.score_config or {}
                score = score_config.get(str(intensity), 0)
                
                if endpoint_code not in dimension_scores:
                    dimension_scores[endpoint_code] = 0
                dimension_scores[endpoint_code] += score
    else:
        # 类型2：根据选择的选项计算得分
        for question in questions:
            answer_value = answers.get(str(question.id))
            if answer_value is None:
                continue
            
            try:
                option_text_id = int(answer_value)
            except (ValueError, TypeError):
                continue
            
            # 查找对应的选项文本（使用已预加载的关系）
            option_text = None
            for opt_text in question.option_texts.all():
                if opt_text.id == option_text_id and opt_text.is_active:
                    option_text = opt_text
                    break
            
            if not option_text:
                continue
            
            # 获取该选项文本对应的所有选项，累加得分（使用已预加载的关系）
            options = [opt for opt in option_text.options.all() if opt.is_active]
            for option in options:
                endpoint_code = option.endpoint_code
                score = option.get_score()
                
                if endpoint_code not in dimension_scores:
                    dimension_scores[endpoint_code] = 0
                dimension_scores[endpoint_code] += score
    
    # 创建测试结果
    result = UserTestResult.objects.create(
        user=user,
        test=test,
        dimension_scores=dimension_scores,
        answers=answers,
        completed_at=timezone.now(),
    )
    
    from core.serializers import UserTestResultSerializer
    
    serializer = UserTestResultSerializer(result)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_test_results_list(request):
    """获取当前用户的测试结果列表（轻量级，只返回列表需要的字段）"""
    user = request.user
    results = UserTestResult.objects.filter(user=user).select_related('test').order_by('-created_at')
    
    from core.serializers import UserTestResultListSerializer
    serializer = UserTestResultListSerializer(results, many=True)
    return Response(serializer.data)


def user_test_result(request, result_id):
    """获取测试结果"""
    user = request.user
    # 安全修复：确保用户只能访问自己的测试结果
    result = get_object_or_404(UserTestResult.objects.select_related('user', 'test'), id=result_id, user=user)
    
    from core.serializers import UserTestResultSerializer
    
    serializer = UserTestResultSerializer(result)
    return Response(serializer.data)


# ==================== 标签管理 API ====================

class TagListCreateView(generics.ListCreateAPIView):
    """标签列表和创建视图"""
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        # 返回预设标签和用户自定义标签
        return Tag.objects.filter(
            models.Q(is_preset=True, user__isnull=True) | models.Q(user=user, is_preset=False)
        ).order_by("is_preset", "display_order", "name")
    
    def perform_create(self, serializer):
        # 创建时自动设置用户
        serializer.save(user=self.request.user, is_preset=False)


class TagDetailView(generics.RetrieveUpdateDestroyAPIView):
    """标签详情、更新、删除视图"""
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        # 用户只能管理自己的自定义标签，不能修改预设标签
        return Tag.objects.filter(user=user, is_preset=False)
    
    def perform_update(self, serializer):
        instance = serializer.instance
        # 确保不能修改预设标签
        if instance.is_preset or instance.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("不能修改预设标签或其他用户的标签。")
        serializer.save()
    
    def perform_destroy(self, instance):
        # 确保不能删除预设标签
        if instance.is_preset or instance.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("不能删除预设标签或其他用户的标签。")
        
        # 检查是否有画作使用此标签
        upload_count = instance.uploads.count()
        if upload_count > 0:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                f"无法删除标签：仍有 {upload_count} 个画作使用此标签。请先移除画作上的标签。"
            )
        
        instance.delete()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tags_list(request):
    """获取所有可用标签（预设+用户自定义）"""
    user = request.user
    
    # 获取预设标签
    preset_tags = Tag.objects.filter(is_preset=True, user__isnull=True).order_by("display_order", "name")
    
    # 获取用户自定义标签
    custom_tags = Tag.objects.filter(user=user, is_preset=False).order_by("display_order", "name")
    
    serializer = TagSerializer(preset_tags, many=True, context={"request": request})
    custom_serializer = TagSerializer(custom_tags, many=True, context={"request": request})
    
    return Response({
        "preset_tags": serializer.data,
        "custom_tags": custom_serializer.data,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def moods_list(request):
    """获取所有可用的创作状态"""
    moods = Mood.objects.filter(is_active=True).order_by("display_order", "name")
    serializer = MoodSerializer(moods, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def monthly_report(request):
    """获取固定月报数据"""
    year = request.query_params.get("year")
    month = request.query_params.get("month")
    
    if not year or not month:
        return Response(
            {"detail": "需要提供 year 和 month 参数（格式：YYYY-MM）"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    try:
        year = int(year)
        month = int(month)
        if not (1 <= month <= 12):
            raise ValueError("月份必须在1-12之间")
    except ValueError as e:
        return Response(
            {"detail": f"无效的年份或月份: {e}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # 查找固定月报
    try:
        report = MonthlyReport.objects.get(
            user=request.user,
            year=year,
            month=month,
        )
        
        # 返回月报数据
        return Response({
            "exists": True,
            "year": report.year,
            "month": report.month,
            "stats": {
                "totalUploads": report.total_uploads,
                "totalHours": report.total_hours,
                "avgHoursPerUpload": report.avg_hours_per_upload,
                "avgRating": report.avg_rating,
                "mostUploadDay": {
                    "date": report.most_upload_day_date.isoformat() if report.most_upload_day_date else None,
                    "count": report.most_upload_day_count,
                } if report.most_upload_day_date else None,
                "currentStreak": report.current_streak,
                "longestStreak": report.longest_streak,
            },
            "timeDistribution": report.time_distribution,
            "weeklyDistribution": report.weekly_distribution,
            "tagStats": report.tag_stats,
            "heatmapCalendar": report.heatmap_calendar,
            "uploadIds": report.upload_ids,
            "reportTexts": report.report_texts,
            "createdAt": report.created_at.isoformat(),
        })
    except MonthlyReport.DoesNotExist:
        # 如果没有固定月报，返回不存在
        return Response({
            "exists": False,
            "year": year,
            "month": month,
        })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_users_list(request):
    """获取用户列表（仅管理员）"""
    if not request.user.is_staff:
        return Response(
            {"detail": "需要管理员权限"},
            status=status.HTTP_403_FORBIDDEN,
        )
    
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    users = User.objects.filter(is_active=True).order_by("-date_joined")[:100]  # 限制返回100个用户
    
    return Response([
        {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "date_joined": user.date_joined.isoformat() if user.date_joined else None,
        }
        for user in users
    ])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_user_uploads(request):
    """获取指定用户的上传数据（仅管理员）"""
    if not request.user.is_staff:
        return Response(
            {"detail": "需要管理员权限"},
            status=status.HTTP_403_FORBIDDEN,
        )
    
    user_id = request.query_params.get("user_id")
    if not user_id:
        return Response(
            {"detail": "需要提供 user_id 参数"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(id=int(user_id), is_active=True)
    except (ValueError, User.DoesNotExist) as e:
        return Response(
            {"detail": f"无效的用户ID: {e}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # 获取用户的上传记录
    uploads = UserUpload.objects.filter(user=user).order_by("-uploaded_at")
    serializer = UserUploadSerializer(uploads, many=True, context={"request": request})
    
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_user_monthly_report(request):
    """获取指定用户的实时月报数据（仅管理员，用于调试）"""
    if not request.user.is_staff:
        return Response(
            {"detail": "需要管理员权限"},
            status=status.HTTP_403_FORBIDDEN,
        )
    
    user_id = request.query_params.get("user_id")
    year = request.query_params.get("year")
    month = request.query_params.get("month")
    
    if not user_id or not year or not month:
        return Response(
            {"detail": "需要提供 user_id, year 和 month 参数"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    try:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = User.objects.get(id=int(user_id), is_active=True)
        year = int(year)
        month = int(month)
        if not (1 <= month <= 12):
            raise ValueError("月份必须在1-12之间")
    except (ValueError, User.DoesNotExist) as e:
        return Response(
            {"detail": f"无效的参数: {e}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # 调用管理命令的逻辑来生成实时月报数据
    from core.management.commands.generate_monthly_report import Command
    cmd = Command()
    
    try:
        report_data = cmd._generate_report_data(user, year, month)
        
        # 转换为前端需要的格式
        return Response({
            "exists": True,
            "year": year,
            "month": month,
            "user": {
                "id": user.id,
                "email": user.email,
            },
            "stats": {
                "totalUploads": report_data["total_uploads"],
                "totalHours": report_data["total_hours"],
                "avgHoursPerUpload": report_data["avg_hours_per_upload"],
                "avgRating": report_data["avg_rating"],
                "mostUploadDay": {
                    "date": report_data["most_upload_day_date"].isoformat() if report_data["most_upload_day_date"] else None,
                    "count": report_data["most_upload_day_count"],
                } if report_data["most_upload_day_date"] else None,
                "currentStreak": report_data["current_streak"],
                "longestStreak": report_data["longest_streak"],
            },
            "timeDistribution": report_data["time_distribution"],
            "weeklyDistribution": report_data["weekly_distribution"],
            "tagStats": report_data["tag_stats"],
            "heatmapCalendar": report_data["heatmap_calendar"],
            "uploadIds": report_data["upload_ids"],
            "reportTexts": report_data["report_texts"],
        })
    except Exception as e:
        logger.exception("生成实时月报失败")
        return Response(
            {"detail": f"生成月报失败: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class VisualAnalysisResultListCreateView(generics.ListCreateAPIView):
    """视觉分析结果列表和创建视图"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]  # 支持文件上传和JSON
    
    def get_serializer_class(self):
        """列表时使用轻量级序列化器，创建时使用完整序列化器"""
        from core.serializers import VisualAnalysisResultListSerializer, VisualAnalysisResultSerializer
        if self.request.method == 'GET':
            return VisualAnalysisResultListSerializer
        return VisualAnalysisResultSerializer
    
    def get_queryset(self):
        return VisualAnalysisResult.objects.filter(user=self.request.user).order_by("-created_at")
    
    def get_serializer_context(self):
        """确保序列化器有request上下文，用于构建绝对URL"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_image_comprehensive(request):
    """
    专业绘画分析API（异步任务）
    接收图片，创建异步任务，立即返回任务ID
    """
    try:
        from core.tasks import analyze_image_comprehensive_task
        from core.models import ImageAnalysisTask
        from django.conf import settings
        
        image_data = request.data.get('image_data')
        if not image_data:
            return Response(
                {"detail": "缺少 image_data 参数"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        # 检查 Celery 是否启用
        if not getattr(settings, 'CELERY_ENABLED', False):
            # 如果 Celery 未启用，使用同步处理（向后兼容）
            from core.image_analysis import analyze_image_comprehensive
            results = analyze_image_comprehensive(image_data)
            return Response(results, status=status.HTTP_200_OK)
        
        # 创建异步任务
        task = analyze_image_comprehensive_task.delay(
            image_data=image_data,
            user_id=request.user.id
        )
        
        # 创建任务状态记录
        task_obj = ImageAnalysisTask.objects.create(
            user=request.user,
            task_id=task.id,
            status=ImageAnalysisTask.STATUS_PENDING,
            progress=0,
        )
        
        return Response(
            {
                "task_id": task.id,
                "status": task_obj.status,
                "progress": task_obj.progress,
                "message": "任务已创建，正在处理中",
            },
            status=status.HTTP_202_ACCEPTED,  # 202 Accepted
        )
        
    except Exception as e:
        logger.exception("创建图像分析任务失败")
        return Response(
            {"detail": f"创建任务失败: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_image_analysis_task_status(request, task_id):
    """
    查询图像分析任务状态
    """
    try:
        from core.models import ImageAnalysisTask
        
        task_obj = ImageAnalysisTask.objects.get(
            task_id=task_id,
            user=request.user  # 确保只能查询自己的任务
        )
        
        response_data = {
            "task_id": task_obj.task_id,
            "status": task_obj.status,
            "progress": task_obj.progress,
            "created_at": task_obj.created_at.isoformat(),
            "updated_at": task_obj.updated_at.isoformat(),
        }
        
        if task_obj.completed_at:
            response_data["completed_at"] = task_obj.completed_at.isoformat()
        
        if task_obj.status == ImageAnalysisTask.STATUS_SUCCESS:
            # 任务成功，返回结果
            response_data["result"] = task_obj.result_data
        elif task_obj.status == ImageAnalysisTask.STATUS_FAILURE:
            # 任务失败，返回错误信息
            response_data["error"] = task_obj.error_message
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except ImageAnalysisTask.DoesNotExist:
        return Response(
            {"detail": "任务不存在"},
            status=status.HTTP_404_NOT_FOUND,
        )
    except Exception as e:
        logger.exception("查询任务状态失败")
        return Response(
            {"detail": f"查询失败: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


class VisualAnalysisResultDetailView(generics.RetrieveDestroyAPIView):
    """视觉分析结果详情和删除视图"""
    serializer_class = VisualAnalysisResultSerializer
    
    def get_serializer_context(self):
        """确保序列化器有request上下文，用于构建绝对URL"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return VisualAnalysisResult.objects.filter(user=self.request.user)
