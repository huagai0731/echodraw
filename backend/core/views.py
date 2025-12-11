from __future__ import annotations

import random
import secrets
import calendar
import mimetypes
import os
import logging
from datetime import date, timedelta, datetime, time as dt_time, timezone as dt_timezone

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction, IntegrityError, models
from django.db.models import Max
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status, serializers
from rest_framework.decorators import api_view, permission_classes, authentication_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.csrf import csrf_exempt
from core.email_utils import send_mail_async

# 配置日志记录器
logger = logging.getLogger(__name__)


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


def get_now_with_mock() -> datetime:
    """
    获取当前时间（datetime）。
    支持通过环境变量 MOCK_DATE 设置模拟日期（格式：YYYY-MM-DD），用于测试。
    如果设置了 MOCK_DATE，将返回该日期对应的 datetime（中午12点，上海时区）而不是真实时间。
    如果没有设置 MOCK_DATE，则使用真实时间。
    """
    # 检查是否有模拟日期设置（用于测试）
    mock_date_str = os.getenv("MOCK_DATE", "").strip()
    if mock_date_str:
        try:
            # 解析日期字符串（格式：YYYY-MM-DD）
            mock_date = datetime.strptime(mock_date_str, "%Y-%m-%d").date()
            # 创建该日期的中午12点的datetime（上海时区）
            mock_datetime = datetime.combine(mock_date, dt_time(12, 0, 0))
            if SHANGHAI_TZ is not None:
                # 设置为上海时区
                try:
                    # pytz 使用 localize
                    mock_datetime = SHANGHAI_TZ.localize(mock_datetime)
                except AttributeError:
                    # zoneinfo 使用 replace
                    mock_datetime = mock_datetime.replace(tzinfo=SHANGHAI_TZ)
                # 转换为UTC（如果USE_TZ=True）
                if settings.USE_TZ:
                    mock_datetime = mock_datetime.astimezone(dt_timezone.utc)
                return mock_datetime
            else:
                # 如果没有时区库，直接返回本地时间
                return timezone.make_aware(mock_datetime) if settings.USE_TZ else mock_datetime
        except ValueError:
            # 如果格式不正确，记录警告并使用真实时间
            logger.warning(f"无效的 MOCK_DATE 格式: {mock_date_str}，使用真实时间")
    
    # 返回真实时间
    return timezone.now()


def get_today_shanghai() -> date:
    """
    获取中国时区（Asia/Shanghai）的今天日期。
    确保无论服务器系统时区如何，都能正确获取中国时区的日期。
    
    支持通过环境变量 MOCK_DATE 设置模拟日期（格式：YYYY-MM-DD），用于测试。
    如果设置了 MOCK_DATE，将返回该日期而不是真实日期。
    如果没有设置 MOCK_DATE，则使用真实日期。
    """
    # 检查是否有模拟日期设置（用于测试）
    mock_date_str = os.getenv("MOCK_DATE", "").strip()
    if mock_date_str:
        try:
            # 解析日期字符串（格式：YYYY-MM-DD）
            mock_date = datetime.strptime(mock_date_str, "%Y-%m-%d").date()
            return mock_date
        except ValueError:
            # 如果格式不正确，记录警告并使用真实日期
            logger.warning(f"无效的 MOCK_DATE 格式: {mock_date_str}，使用真实日期")
    
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


def get_current_month_range_shanghai() -> tuple[date, date]:
    """
    获取中国时区（Asia/Shanghai）的当前月份的开始和结束日期。
    返回 (month_start, month_end) 元组。
    """
    today = get_today_shanghai()
    month_start = date(today.year, today.month, 1)
    # 获取当月最后一天
    if today.month == 12:
        month_end = date(today.year + 1, 1, 1) - timedelta(days=1)
    else:
        month_end = date(today.year, today.month + 1, 1) - timedelta(days=1)
    return (month_start, month_end)


def is_valid_member(profile) -> bool:
    """
    检查用户是否为有效会员。
    
    会员有效的条件：
    1. profile.is_member 为 True
    2. membership_expires 为 None（永久会员）或 membership_expires > 当前时间（未过期）
    
    Args:
        profile: UserProfile 实例，如果为 None 则返回 False
        
    Returns:
        bool: 如果用户是有效会员返回 True，否则返回 False
    """
    if not profile:
        return False
    
    if not profile.is_member:
        return False
    
    # 如果 membership_expires 为 None，表示永久会员
    if profile.membership_expires is None:
        return True
    
    # 检查会员是否过期
    now = timezone.now()
    return profile.membership_expires > now

from core.models import (
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
    PointsOrder,
    ShortTermGoal,
    ShortTermGoalTaskCompletion,
    ShortTermTaskPreset,
    Tag,
    Test,
    TestQuestion,
    TestOptionText,
    TestOption,
    TestDimension,
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
    if not isinstance(value, str):
        value = str(value) if value is not None else ""
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
    return {
        "id": user.id,
        "email": user.email,
        "is_staff": bool(user.is_staff),
        "is_active": bool(user.is_active),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "date_joined": user.date_joined.isoformat() if user.date_joined else None,
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
    # 性能优化：使用ip_address字段而不是metadata__ip，利用索引
    one_hour_ago = now - timedelta(hours=1)
    ip_send_count = EmailVerification.objects.filter(
        ip_address=client_ip,
        created_at__gte=one_hour_ago
    ).count()
    
    # 检查该IP是否使用了过多不同的邮箱（可能是自动化攻击）
    unique_emails_from_ip = EmailVerification.objects.filter(
        ip_address=client_ip,
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
        # 性能优化：使用ip_address字段而不是metadata__ip
        oldest_in_hour = EmailVerification.objects.filter(
            ip_address=client_ip,
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

    # 性能优化：将IP地址同时存储在独立字段和metadata中
    # 独立字段用于高效查询，metadata保留用于向后兼容
    verification = EmailVerification.objects.create(
        email=email,
        purpose=purpose,
        code=code,
        expires_at=expires_at,
        ip_address=client_ip,  # 性能优化：独立字段，有索引
        metadata={"ip": client_ip},  # 保留在metadata中用于向后兼容
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

    # 在事务内查询并锁定验证码记录，防止竞态条件
    # 同时限制查询时间范围（只查询最近15分钟），提升性能
    with transaction.atomic():
        now = timezone.now()
        verification = (
            EmailVerification.objects.filter(
                email__iexact=email,
                purpose=EmailVerification.PURPOSE_REGISTER,
                code=code,
                is_used=False,
                created_at__gte=now - timedelta(minutes=15),  # 性能优化：只查询最近15分钟
            )
            .select_for_update()  # 锁定记录，防止并发使用同一验证码
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

        # 双重检查：防止在查询和标记之间被其他请求使用
        if verification.is_used:
            return Response(
                {"detail": "验证码已被使用"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 立即标记为已使用，防止重复使用
        verification.is_used = True
        verification.save(update_fields=["is_used"])

        user = user_model.objects.create_user(
            username=email,
            email=email,
            password=password,
        )
        
        # 创建用户资料
        UserProfile.objects.create(user=user)
        
        # 创建视觉分析额度记录，赠送10次免费额度
        from core.models import VisualAnalysisQuota
        VisualAnalysisQuota.objects.create(
            user=user,
            free_quota=10,  # 新用户赠送10次
            used_free_quota=0,
        )

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

    # 在事务内查询并锁定验证码记录，防止竞态条件
    # 同时限制查询时间范围（只查询最近15分钟），提升性能
    with transaction.atomic():
        now = timezone.now()
        verification = (
            EmailVerification.objects.filter(
                email__iexact=email,
                purpose=EmailVerification.PURPOSE_RESET_PASSWORD,
                code=code,
                is_used=False,
                created_at__gte=now - timedelta(minutes=15),  # 性能优化：只查询最近15分钟
            )
            .select_for_update()  # 锁定记录，防止并发使用同一验证码
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

        # 双重检查：防止在查询和标记之间被其他请求使用
        if verification.is_used:
            return Response(
                {"detail": "验证码已被使用"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 立即标记为已使用，防止重复使用
        verification.is_used = True
        verification.save(update_fields=["is_used"])

        for user in users:
            user.set_password(password)
            user.save(update_fields=["password"])

    primary_user = users[0]
    token_key = AuthToken.issue_for_user(primary_user)

    return Response({"token": token_key, "user": _user_payload(primary_user)})


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
@throttle_classes([])  # 禁用默认节流，因为登录视图已有自己的失败次数限制逻辑
def login(request):
    # 添加调试日志（仅在DEBUG模式下）
    if settings.DEBUG:
        logger.debug(f"[Login] Request method: {request.method}")
        logger.debug(f"[Login] Content-Type: {request.content_type}")
        logger.debug(f"[Login] request.data type: {type(request.data)}")
        logger.debug(f"[Login] request.data: {request.data}")
    
    # 安全地获取email和password
    try:
        email_raw = request.data.get("email", "")
        password_raw = request.data.get("password", "")
    except Exception as e:
        logger.warning(f"[Login] Failed to parse request.data: {e}")
        return Response(
            {"detail": "请求格式错误，请检查请求体"}, status=status.HTTP_400_BAD_REQUEST
        )
    
    # 确保email是字符串
    if not isinstance(email_raw, str):
        email_raw = str(email_raw) if email_raw is not None else ""
    
    # 确保password是字符串
    if not isinstance(password_raw, str):
        password_raw = str(password_raw) if password_raw is not None else ""
    
    email = _normalize_email(email_raw)
    password = password_raw

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
    # 优化：分别查询邮箱和IP，利用索引，然后取最大值
    # 这样比OR查询更高效，特别是在高并发场景下
    fifteen_minutes_ago = timezone.now() - timedelta(minutes=15)
    
    # 使用专门的LoginAttempt模型记录登录尝试
    # 分别查询邮箱和IP的失败次数，利用各自的索引
    email_failures = LoginAttempt.objects.filter(
        email__iexact=email,
        success=False,
        created_at__gte=fifteen_minutes_ago
    ).count()
    
    ip_failures = LoginAttempt.objects.filter(
        ip_address=client_ip,
        success=False,
        created_at__gte=fifteen_minutes_ago
    ).count()
    
    # 取两者中的最大值（更严格的限制）
    recent_failures = max(email_failures, ip_failures)
    
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
        profile = self._get_profile(user)
        display_name = (data.get("display_name") or "").strip()
        signature = (data.get("signature") or "").strip()
        # 使用 is_valid_member 检查会员是否真的有效（包括检查是否过期）
        is_member = is_valid_member(profile)
        return {
            "display_name": display_name,
            "signature": signature,
            "default_display_name": self._resolve_default_display_name(user),
            "updated_at": data.get("updated_at"),
            "is_member": is_member,
            "membership_expires": profile.membership_expires.isoformat() if profile.membership_expires else None,
        }

    @staticmethod
    def _resolve_default_display_name(user) -> str:
        email = (user.email or user.get_username() or "").strip()
        local_part = email.split("@")[0] if email else ""
        if not local_part:
            return "回声艺术家"
        return local_part[:1].upper() + local_part[1:]


class MembershipSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        创建或更新会员订阅。
        请求体：
        {
            "tier": "premium",
            "expires_at": "2025-12-31"  # ISO格式日期字符串
        }
        """
        tier = request.data.get("tier")
        expires_at_str = request.data.get("expires_at")
        
        if not tier or tier not in ["premium"]:
            return Response(
                {"detail": "无效的会员等级"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not expires_at_str:
            return Response(
                {"detail": "必须提供到期时间"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # 解析日期字符串，支持 "YYYY-MM-DD" 格式
            expires_at = datetime.strptime(expires_at_str, "%Y-%m-%d").date()
            # 转换为 datetime，设置为当天的 23:59:59
            expires_at_datetime = timezone.make_aware(
                datetime.combine(expires_at, datetime.max.time())
            )
        except ValueError:
            return Response(
                {"detail": "日期格式无效，请使用 YYYY-MM-DD 格式"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        
        # 如果用户之前不是会员，或者会员已过期，记录新的开通时间
        was_member = profile.is_member and profile.membership_expires and profile.membership_expires > timezone.now()
        if not was_member:
            # 记录新的开通时间
            profile.membership_started_at = timezone.now()
            # 如果用户有视觉分析额度记录，需要重置月度额度周期
            # 因为开通时间变了，周期应该重新计算
            try:
                from core.models import VisualAnalysisQuota
                quota = VisualAnalysisQuota.objects.filter(user=request.user).first()
                if quota:
                    # 清空 current_month，让下次使用时基于新的开通时间重新计算
                    quota.current_month = ""
                    quota.save(update_fields=["current_month"])
            except Exception:
                # 如果出错，不影响会员开通流程
                pass
        
        profile.is_member = True
        profile.membership_expires = expires_at_datetime
        profile.save(update_fields=["is_member", "membership_expires", "membership_started_at", "updated_at"])
        
        return Response({
            "is_member": profile.is_member,
            "membership_expires": profile.membership_expires.isoformat() if profile.membership_expires else None,
        })


class FeaturedArtworksView(APIView):
    """管理用户个人页展示的作品列表"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """获取用户的展示作品ID列表"""
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        # 确保返回的是列表，且所有元素都是字符串
        featured_ids = profile.featured_artwork_ids or []
        if not isinstance(featured_ids, list):
            featured_ids = []
        # 过滤掉非字符串的元素
        featured_ids = [str(id) for id in featured_ids if id]
        return Response({"featured_artwork_ids": featured_ids})

    def put(self, request):
        """更新用户的展示作品ID列表"""
        featured_ids = request.data.get("featured_artwork_ids", [])
        
        # 验证输入
        if not isinstance(featured_ids, list):
            return Response(
                {"detail": "featured_artwork_ids 必须是数组"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 验证所有元素都是字符串或数字，并转换为字符串
        try:
            validated_ids = []
            for id_value in featured_ids:
                if id_value is None:
                    continue
                # 转换为字符串
                id_str = str(id_value).strip()
                if id_str:
                    validated_ids.append(id_str)
        except (TypeError, ValueError):
            return Response(
                {"detail": "featured_artwork_ids 中的元素格式不正确"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 保存到数据库
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.featured_artwork_ids = validated_ids
        profile.save(update_fields=["featured_artwork_ids", "updated_at"])
        
        return Response({"featured_artwork_ids": validated_ids})


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
        # 检查用户是否为有效会员（包括检查会员是否过期）
        user = self.request.user
        
        # 使用select_for_update锁定用户记录，防止并发上传时的竞态条件
        # 这样可以确保在检查限制和创建上传记录之间，其他请求无法同时通过检查
        try:
            # 锁定用户记录，防止并发问题
            locked_user = get_user_model().objects.select_for_update().get(pk=user.pk)
        except get_user_model().DoesNotExist:
            raise serializers.ValidationError("用户不存在")
        
        profile = getattr(locked_user, 'profile', None)
        is_member = is_valid_member(profile)
        
        # 非会员用户只能上传1张图片
        # 注意：这里检查的是总上传数量，不会删除已有图片
        # 在锁定用户记录后检查，确保并发安全
        if not is_member:
            total_uploads_count = UserUpload.objects.filter(user=locked_user).count()
            if total_uploads_count >= 1:
                raise serializers.ValidationError(
                    "非会员用户只能上传1张图片。加入EchoDraw会员可享受无限制上传。"
                )
        
        # 会员用户检查每月上传限制（150张）
        # 使用 created_at 字段检查本月实际上传的数量，而不是 uploaded_at（用户可能设置为过去的日期）
        month_start, month_end = get_current_month_range_shanghai()
        monthly_uploads_count = UserUpload.objects.filter(
            user=locked_user,
            created_at__date__gte=month_start,
            created_at__date__lte=month_end
        ).count()
        
        MAX_MONTHLY_UPLOADS = 150
        if is_member and monthly_uploads_count >= MAX_MONTHLY_UPLOADS:
            raise serializers.ValidationError(
                f"本月已上传 {monthly_uploads_count} 张图片，已达到每月上限 {MAX_MONTHLY_UPLOADS} 张。"
            )
        
        try:
            # 使用锁定的用户对象保存上传记录
            upload = serializer.save(user=locked_user)
            
            # 保存后再次验证限制（双重检查，防止在保存过程中出现并发问题）
            if not is_member:
                total_uploads_count_after = UserUpload.objects.filter(user=locked_user).count()
                if total_uploads_count_after > 1:
                    # 如果超过限制，删除刚创建的上传记录并抛出错误
                    upload.delete()
                    raise serializers.ValidationError(
                        "非会员用户只能上传1张图片。加入EchoDraw会员可享受无限制上传。"
                    )
            
            if is_member:
                monthly_uploads_count_after = UserUpload.objects.filter(
                    user=locked_user,
                    created_at__date__gte=month_start,
                    created_at__date__lte=month_end
                ).count()
                if monthly_uploads_count_after > MAX_MONTHLY_UPLOADS:
                    # 如果超过限制，删除刚创建的上传记录并抛出错误
                    upload.delete()
                    raise serializers.ValidationError(
                        f"本月已上传 {monthly_uploads_count_after} 张图片，已达到每月上限 {MAX_MONTHLY_UPLOADS} 张。"
                    )
            
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
        except IntegrityError as e:
            # 处理数据库完整性错误（可能是并发冲突）
            logger.error(
                f"Failed to create user upload due to integrity error (possibly concurrent request)",
                extra={
                    "user_id": self.request.user.id,
                    "error": str(e),
                },
                exc_info=True
            )
            # 将IntegrityError转换为ValidationError，返回400而不是500
            raise serializers.ValidationError(
                "上传失败，可能是由于并发请求冲突。请稍后重试。"
            )
        except Exception as e:
            # 记录上传失败的错误
            logger.error(
                f"Failed to create user upload",
                extra={
                    "user_id": self.request.user.id,
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
                exc_info=True
            )
            raise

        # 确保 uploaded_at 有时区信息，如果没有则使用当前时间（支持模拟日期）
        uploaded_at = upload.uploaded_at
        if uploaded_at is None:
            uploaded_at = get_now_with_mock()
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
                user=locked_user,
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
                    extra={"user_id": locked_user.id, "date": checkin_date.isoformat()},
                    exc_info=True
                )
                raise


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def check_upload_limit(request):
    """
    检查用户本月上传数量限制
    返回：{
        "monthly_count": 本月已上传数量,
        "max_monthly_uploads": 每月最大上传数,
        "remaining": 剩余可上传数量,
        "can_upload": 是否可以继续上传
    }
    """
    # 使用 created_at 字段检查本月实际上传的数量，而不是 uploaded_at（用户可能设置为过去的日期）
    month_start, month_end = get_current_month_range_shanghai()
    monthly_uploads_count = UserUpload.objects.filter(
        user=request.user,
        created_at__date__gte=month_start,
        created_at__date__lte=month_end
    ).count()
    
    MAX_MONTHLY_UPLOADS = 150
    remaining = max(0, MAX_MONTHLY_UPLOADS - monthly_uploads_count)
    can_upload = monthly_uploads_count < MAX_MONTHLY_UPLOADS
    
    return Response({
        "monthly_count": monthly_uploads_count,
        "max_monthly_uploads": MAX_MONTHLY_UPLOADS,
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

        # 只允许用户访问自己的图片
        try:
            upload = UserUpload.objects.get(pk=pk)
            if upload.user != user:
                logger.warning(
                    f"[UserUploadImageView] 用户 {user.id} 尝试访问用户 {upload.user.id} 的图片 (upload_id={pk})"
                )
                return Response(
                    {"detail": "无权访问此图片"},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except UserUpload.DoesNotExist:
            logger.warning(f"[UserUploadImageView] Upload不存在: pk={pk}, user_id={user.id}")
            raise Http404("图片不存在")
        
        if not upload.image:
            logger.warning(
                f"[UserUploadImageView] Upload存在但图片字段为空: pk={pk}, user_id={user.id}, "
                f"upload.user_id={upload.user.id}"
            )
            raise Http404("图片不存在")

        # 记录图片路径信息用于调试
        image_name = upload.image.name if upload.image else None
        logger.debug(
            f"[UserUploadImageView] 尝试打开图片: pk={pk}, image_name={image_name}, "
            f"storage={type(upload.image.storage).__name__}"
        )

        # 如果使用 TOS 存储，通过代理获取图片以支持 CORS
        # 这样可以避免 CORS 问题，同时保持权限控制
        if settings.USE_TOS_STORAGE:
            try:
                import requests
                # 获取 TOS 的公开 URL
                image_url = upload.image.url
                logger.debug(
                    f"[UserUploadImageView] 代理 TOS URL: pk={pk}, url={image_url}, "
                    f"custom_domain={settings.TOS_CUSTOM_DOMAIN or 'N/A'}"
                )
                
                # 从 TOS 获取图片
                response = requests.get(image_url, timeout=10, stream=True)
                response.raise_for_status()
                
                # 获取 Content-Type
                content_type = response.headers.get('Content-Type', 'image/png')
                
                # 创建 FileResponse
                file_response = FileResponse(
                    response.raw,
                    content_type=content_type,
                )
                
                # 设置缓存头
                file_response['Cache-Control'] = 'public, max-age=86400'
                file_response['Cross-Origin-Resource-Policy'] = 'cross-origin'
                
                # 设置 CORS 头
                origin = request.headers.get('Origin')
                auth_token = request.query_params.get("token")
                if origin:
                    if auth_token:
                        file_response['Access-Control-Allow-Origin'] = origin
                        file_response['Access-Control-Allow-Credentials'] = 'true'
                    else:
                        file_response['Access-Control-Allow-Origin'] = origin
                    file_response['Vary'] = 'Origin'
                else:
                    file_response['Access-Control-Allow-Origin'] = '*'
                
                file_response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                file_response['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization'
                
                return file_response
            except requests.RequestException as e:
                logger.error(f"[UserUploadImageView] 从 TOS 获取图片失败: {str(e)}, URL: {image_url}")
                return Response(
                    {"detail": f"获取图片失败: {str(e)}"},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            except Exception as exc:
                logger.warning(
                    f"[UserUploadImageView] 无法获取 TOS URL，回退到文件代理: pk={pk}, "
                    f"error={str(exc)}"
                )
                # 如果获取 URL 失败，继续使用文件代理方式

        # 通过 Django 代理文件（用于没有 CDN 域名或需要额外权限控制的情况）
        try:
            file_handle = upload.image.open("rb")
        except FileNotFoundError as exc:
            logger.error(
                f"[UserUploadImageView] 图片文件不存在: pk={pk}, image_name={image_name}, "
                f"user_id={user.id}, error={str(exc)}"
            )
            raise Http404("图片文件已丢失") from exc
        except Exception as exc:
            logger.error(
                f"[UserUploadImageView] 打开图片文件失败: pk={pk}, image_name={image_name}, "
                f"user_id={user.id}, error_type={type(exc).__name__}, error={str(exc)}"
            )
            raise Http404(f"无法访问图片文件: {str(exc)}") from exc

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


def _check_and_update_short_term_goal_status(goal: ShortTermGoal) -> bool:
    """
    检查短期目标是否已完成：
    1. 完成所有打卡天数
    2. 时间期限已到（创建日期 + 持续天数）
    如果满足任一条件，更新状态为completed。
    返回True表示状态已更新，False表示未更新。
    """
    # 只检查状态为active的目标
    if goal.status != ShortTermGoal.STATUS_ACTIVE:
        return False
    
    duration_days = goal.duration_days or 0
    if duration_days <= 0:
        return False
    
    # 检查1：获取该目标的所有任务完成记录，按日期去重
    completed_dates = set(
        ShortTermGoalTaskCompletion.objects.filter(goal=goal)
        .values_list("date", flat=True)
        .distinct()
    )
    
    # 如果已完成的天数达到目标天数，更新状态为completed
    if len(completed_dates) >= duration_days:
        goal.status = ShortTermGoal.STATUS_COMPLETED
        goal.save(update_fields=["status", "updated_at"])
        logger.info(
            f"短期目标自动完成（打卡完成）: goal_id={goal.id}, user_id={goal.user.id}, "
            f"completed_dates={len(completed_dates)}, duration_days={duration_days}"
        )
        return True
    
    # 检查2：时间期限是否已到
    # 计算目标的结束日期（创建日期 + 持续天数 - 1，因为第一天是创建日）
    if goal.created_at:
        # 确保created_at是aware datetime
        created_at = goal.created_at
        if timezone.is_naive(created_at):
            created_at = timezone.make_aware(created_at)
        
        # 转换为上海时区计算日期
        if SHANGHAI_TZ is not None:
            created_at_shanghai = created_at.astimezone(SHANGHAI_TZ)
            created_date = created_at_shanghai.date()
        else:
            # 回退：使用本地时区
            created_date = timezone.localdate(created_at)
        
        # 计算结束日期（创建日期 + 持续天数 - 1）
        from datetime import timedelta
        end_date = created_date + timedelta(days=duration_days - 1)
        
        # 获取今天的日期（上海时区）
        today = get_today_shanghai()
        
        # 如果今天已经超过结束日期，更新状态为completed
        if today > end_date:
            goal.status = ShortTermGoal.STATUS_COMPLETED
            goal.save(update_fields=["status", "updated_at"])
            logger.info(
                f"短期目标自动完成（期限已到）: goal_id={goal.id}, user_id={goal.user.id}, "
                f"created_date={created_date.isoformat()}, end_date={end_date.isoformat()}, "
                f"today={today.isoformat()}, duration_days={duration_days}"
            )
            return True
    
    return False


class ShortTermGoalListCreateView(generics.ListCreateAPIView):
    serializer_class = ShortTermGoalSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        queryset = (
            ShortTermGoal.objects.filter(user=self.request.user)
            .only("id", "title", "duration_days", "plan_type", "schedule", "status", "created_at", "updated_at")
            .order_by("-created_at", "-id")
        )
        
        # 检查并更新已完成但状态未更新的目标
        # 只检查状态为active的目标，避免不必要的查询
        active_goals = list(queryset.filter(status=ShortTermGoal.STATUS_ACTIVE))
        for goal in active_goals:
            try:
                _check_and_update_short_term_goal_status(goal)
            except Exception as e:
                # 如果检查失败，记录错误但不影响列表返回
                logger.warning(
                    f"检查短期目标完成状态失败: goal_id={goal.id}, error={str(e)}",
                    exc_info=True
                )
        
        # 重新获取queryset以确保状态已更新
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class ShortTermGoalDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ShortTermGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ShortTermGoal.objects.filter(user=self.request.user).only(
            "id", "title", "duration_days", "plan_type", "schedule", "status", "created_at", "updated_at", "user"
        )
        
        # 检查并更新已完成但状态未更新的目标
        # 只检查状态为active的目标，避免不必要的查询
        active_goals = list(queryset.filter(status=ShortTermGoal.STATUS_ACTIVE))
        for goal in active_goals:
            try:
                _check_and_update_short_term_goal_status(goal)
            except Exception as e:
                # 如果检查失败，记录错误但不影响详情返回
                logger.warning(
                    f"检查短期目标完成状态失败: goal_id={goal.id}, error={str(e)}",
                    exc_info=True
                )
        
        # 重新获取queryset以确保状态已更新
        return queryset


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
    
    # 更新状态为active，并记录启动时间
    goal.status = ShortTermGoal.STATUS_ACTIVE
    # 如果 started_at 为空，记录当前时间作为启动时间
    if goal.started_at is None:
        goal.started_at = timezone.now()
        goal.save(update_fields=["status", "started_at"])
    else:
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
                
                # 检查短期目标是否已完成所有天数
                # 使用辅助函数统一处理
                _check_and_update_short_term_goal_status(goal)

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
        goal = (
            LongTermGoal.objects.filter(
                user=request.user,
                is_archived=False,
                target_hours__isnull=False,
                checkpoint_count__isnull=False,
            )
            .order_by("-created_at", "-id")
            .first()
        )
        if goal is None:
            # 返回 200 状态码和 null，而不是 404
            # 这样更符合 RESTful 规范，避免控制台显示错误
            return Response(None, status=status.HTTP_200_OK)

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

        should_reset = data.get("reset_progress", False)

        # 只针对未归档的当前目标进行创建 / 更新，历史归档记录保留
        try:
            goal = LongTermGoal.objects.get(user=request.user)
            created = False
        except LongTermGoal.DoesNotExist:
            # 完全不存在，创建新记录
            goal = LongTermGoal.objects.create(
                user=request.user,
                title=data["title"],
                description=data.get("description", ""),
                target_hours=data["target_hours"],
                checkpoint_count=data["checkpoint_count"],
                started_at=started_at_shanghai,
                is_archived=False,
            )
            created = True

        if not created:
            # 检查目标是否不完整（target_hours 或 checkpoint_count 为 NULL 或 0）
            is_incomplete = (
                goal.target_hours is None 
                or goal.checkpoint_count is None
                or goal.target_hours == 0 
                or goal.checkpoint_count == 0
            )
            
            # 更新所有字段
            goal.title = data["title"]
            goal.description = data.get("description", "")
            goal.target_hours = data["target_hours"]
            goal.checkpoint_count = data["checkpoint_count"]
            goal.is_archived = False

            # 如果不完整或者是重置请求，更新 started_at
            if is_incomplete or should_reset:
                goal.started_at = started_at_shanghai
            # 否则保持原有的 started_at（不重置进度）
            
            try:
                goal.save()
            except Exception as e:
                # 记录错误以便调试
                logger.error(
                    f"保存长期目标失败: user_id={request.user.id}, "
                    f"target_hours={data['target_hours']}, "
                    f"checkpoint_count={data['checkpoint_count']}, "
                    f"error={str(e)}",
                    exc_info=True
                )
                raise

        # 确保 started_at 不为 None
        if goal.started_at is None:
            goal.started_at = started_at_shanghai
            goal.save(update_fields=["started_at"])

        try:
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
        except Exception as e:
            logger.error(
                f"序列化长期目标失败: user_id={request.user.id}, "
                f"goal_id={goal.id}, error={str(e)}",
                exc_info=True
            )
            raise

    def delete(self, request):
        # 将当前长期目标标记为归档，保留历史记录
        LongTermGoal.objects.filter(user=request.user, is_archived=False).update(
            is_archived=True
        )
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def completed_long_term_goals(request):
    """
    返回当前用户所有"已完成"的长期目标历史记录：
    - 包含已归档的历史记录（is_archived=True）
    - 也包含当前未归档但进度已达成的目标
    """
    goals_qs = (
        LongTermGoal.objects.filter(user=request.user)
        .order_by("-created_at", "-id")
    )
    
    # 为每个目标获取对应的uploads，并序列化
    completed_goals = []
    for goal in goals_qs:
        try:
            # 为每个目标获取对应的uploads
            uploads = LongTermGoalView._fetch_uploads(request.user, goal.started_at)
            serializer = LongTermGoalSerializer(
                goal,
                context={
                    "request": request,
                    "uploads": uploads,
                },
            )
            goal_data = serializer.data
            
            # 检查是否已完成
            progress = goal_data.get("progress") or {}
            checkpoints = goal_data.get("checkpoints") or []
            
            # 检查是否所有检查点都已完成
            all_checkpoints_completed = (
                len(checkpoints) > 0 and
                all(cp.get("status") == "completed" for cp in checkpoints)
            )
            
            try:
                progress_percent = int(progress.get("progressPercent") or 0)
            except (TypeError, ValueError):
                progress_percent = 0
            try:
                spent_hours = float(progress.get("spentHours") or 0)
            except (TypeError, ValueError):
                spent_hours = 0.0
            try:
                target_hours = float(progress.get("targetHours") or 0)
            except (TypeError, ValueError):
                target_hours = 0.0

            # 如果所有检查点都已完成，或者进度达到100%，或者时长达到目标，则认为已完成
            if all_checkpoints_completed:
                completed_goals.append(goal_data)
            elif progress_percent >= 100:
                completed_goals.append(goal_data)
            elif target_hours > 0 and spent_hours >= target_hours:
                completed_goals.append(goal_data)
        except Exception as e:
            # 如果某个目标序列化失败，记录错误但继续处理其他目标
            logger.error(
                f"序列化长期目标失败: goal_id={goal.id}, error={str(e)}",
                exc_info=True
            )
            continue
    
    return Response(completed_goals)


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
    
    # 如果提供了upload_id，验证该upload是否存在且在目标开始时间之后
    if "upload_id" in request.data and request.data["upload_id"] is not None:
        upload_id = request.data["upload_id"]
        try:
            upload = UserUpload.objects.get(id=upload_id, user=request.user)
            # 验证upload是否在目标开始时间之后
            if goal.started_at:
                if timezone.is_naive(goal.started_at):
                    started_at = timezone.make_aware(goal.started_at)
                else:
                    started_at = goal.started_at
                
                if upload.uploaded_at < started_at:
                    return Response(
                        {"detail": "选择的图片必须在目标开始时间之后"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        except UserUpload.DoesNotExist:
            return Response(
                {"detail": "指定的图片不存在"},
                status=status.HTTP_404_NOT_FOUND,
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
        # 返回用户的所有标签（统一为自定义标签）
        return Tag.objects.filter(user=user).order_by("display_order", "name")
    
    def perform_create(self, serializer):
        # 创建时自动设置用户
        serializer.save(user=self.request.user, is_preset=False, is_hidden=False)


class TagDetailView(generics.RetrieveUpdateDestroyAPIView):
    """标签详情、更新、删除视图"""
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        # 用户只能管理自己的标签
        return Tag.objects.filter(user=user)
    
    def perform_update(self, serializer):
        instance = serializer.instance
        # 确保只能修改自己的标签
        if instance.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("不能修改其他用户的标签。")
        # 更新时确保is_hidden为False（不再支持隐藏功能）
        serializer.save(is_hidden=False)
    
    def perform_destroy(self, instance):
        # 确保只能删除自己的标签
        if instance.user != self.request.user:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("不能删除其他用户的标签。")
        
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
    """获取所有可用标签（统一为自定义标签）"""
    user = request.user
    
    # 获取用户的所有标签
    tags = Tag.objects.filter(user=user).order_by("display_order", "name")
    
    serializer = TagSerializer(tags, many=True, context={"request": request})
    
    # 为了向后兼容，保留preset_tags和custom_tags字段，但都返回用户的标签
    return Response({
        "preset_tags": [],
        "custom_tags": serializer.data,
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
    """获取固定月报数据，如果不存在且已到可见日期，则按需生成"""
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
    
    # 检查月报是否可见（当前日期 >= 下个月1号）
    today = get_today_shanghai()
    if month == 12:
        visible_date = date(year + 1, 1, 1)
    else:
        visible_date = date(year, month + 1, 1)
    
    if today < visible_date:
        # 月报尚未可见，返回不存在
        return Response({
            "exists": False,
            "year": year,
            "month": month,
        })
    
    # 查找固定月报
    try:
        report = MonthlyReport.objects.get(
            user=request.user,
            year=year,
            month=month,
        )
    except MonthlyReport.DoesNotExist:
        # 如果不存在且已到可见日期，按需生成
        from core.management.commands.generate_monthly_report import Command
        
        try:
            cmd = Command()
            report_data = cmd._generate_report_data(request.user, year, month)
            
            # 保存到数据库
            with transaction.atomic():
                report = MonthlyReport.objects.create(
                    user=request.user,
                    year=year,
                    month=month,
                    **report_data,
                )
        except Exception as e:
            # 生成失败，返回不存在
            logger.warning(f"Failed to generate monthly report for user {request.user.id}, year {year}, month {month}: {e}")
            return Response({
                "exists": False,
                "year": year,
                "month": month,
            })
    
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


class StandardResultsSetPagination(PageNumberPagination):
    """标准分页配置"""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_user_uploads(request):
    """获取指定用户的上传数据（仅管理员，带分页）"""
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
    
    # 获取用户的上传记录（带分页）
    uploads = UserUpload.objects.filter(user=user).order_by("-uploaded_at")
    
    # 使用分页器
    paginator = StandardResultsSetPagination()
    paginated_uploads = paginator.paginate_queryset(uploads, request)
    serializer = UserUploadSerializer(paginated_uploads, many=True, context={"request": request})
    
    return paginator.get_paginated_response(serializer.data)


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
    """视觉分析结果列表和创建视图（带分页）"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]  # 支持文件上传和JSON
    pagination_class = StandardResultsSetPagination  # 使用标准分页，避免返回大量数据
    
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
        # 创建新报告前，删除用户的所有旧报告（确保只保留一个报告）
        old_results = list(VisualAnalysisResult.objects.filter(user=self.request.user))
        old_count = len(old_results)
        
        for old_result in old_results:
            try:
                # 删除旧报告的所有图片文件
                if old_result.original_image:
                    old_result.original_image.delete(save=False)
                if old_result.step1_binary:
                    old_result.step1_binary.delete(save=False)
                if old_result.step2_grayscale:
                    old_result.step2_grayscale.delete(save=False)
                if old_result.step3_lab_l:
                    old_result.step3_lab_l.delete(save=False)
                if old_result.step4_hsv_s:
                    old_result.step4_hsv_s.delete(save=False)
                if old_result.step4_hls_s:
                    old_result.step4_hls_s.delete(save=False)
                if old_result.step5_hue:
                    old_result.step5_hue.delete(save=False)
                if old_result.step2_grayscale_3_level:
                    old_result.step2_grayscale_3_level.delete(save=False)
                if old_result.step2_grayscale_4_level:
                    old_result.step2_grayscale_4_level.delete(save=False)
                if old_result.step4_hls_s_inverted:
                    old_result.step4_hls_s_inverted.delete(save=False)
                if old_result.kmeans_segmentation_image:
                    old_result.kmeans_segmentation_image.delete(save=False)
                logger.info(f"已删除旧报告 {old_result.id} 的所有图片文件")
            except Exception as e:
                logger.warning(f"删除旧报告 {old_result.id} 的图片文件时出错: {str(e)}")
            finally:
                # 删除旧报告
                old_result.delete()
        
        if old_count > 0:
            logger.info(f"用户 {self.request.user.id} 创建新报告前，已删除 {old_count} 个旧报告")
        
        # 创建新报告
        serializer.save(user=self.request.user)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_image_comprehensive(request):
    """
    图像分析API（固定5步流程，异步任务）
    接收图片文件，保存到TOS，创建异步任务，立即返回任务ID
    """
    try:
        from core.tasks import analyze_image_comprehensive_task
        from core.models import ImageAnalysisTask, VisualAnalysisResult, VisualAnalysisQuota
        from django.conf import settings
        
        # 检查用户视觉分析使用次数
        user = request.user
        profile = getattr(user, 'profile', None)
        is_member = is_valid_member(profile)
        
        # 获取或创建额度记录
        quota, created = VisualAnalysisQuota.objects.get_or_create(
            user=user,
            defaults={
                'free_quota': 10,  # 如果是新用户（没有记录），默认赠送10次
                'used_free_quota': 0,
            }
        )
        
        # 检查是否可以使用额度
        can_use, error_message = quota.can_use_quota(is_member)
        if not can_use:
            return Response(
                {"detail": error_message},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        # 接收图片文件
        image_file = request.FILES.get('image')
        if not image_file:
            return Response(
                {"detail": "缺少图片文件"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        # 获取二值化阈值（可选，默认140）
        binary_threshold = request.data.get('binary_threshold', 140)
        try:
            binary_threshold = int(binary_threshold)
        except (ValueError, TypeError):
            binary_threshold = 140
        
        # 创建新报告前，删除用户的所有旧报告（确保只保留一个报告，控制TOS存储成本）
        old_results = list(VisualAnalysisResult.objects.filter(user=request.user))
        old_count = len(old_results)
        
        for old_result in old_results:
            try:
                # 删除旧报告的所有图片文件
                if old_result.original_image:
                    old_result.original_image.delete(save=False)
                if old_result.step1_binary:
                    old_result.step1_binary.delete(save=False)
                if old_result.step2_grayscale:
                    old_result.step2_grayscale.delete(save=False)
                if old_result.step3_lab_l:
                    old_result.step3_lab_l.delete(save=False)
                if old_result.step4_hsv_s:
                    old_result.step4_hsv_s.delete(save=False)
                if old_result.step4_hls_s:
                    old_result.step4_hls_s.delete(save=False)
                if old_result.step5_hue:
                    old_result.step5_hue.delete(save=False)
                if old_result.step2_grayscale_3_level:
                    old_result.step2_grayscale_3_level.delete(save=False)
                if old_result.step2_grayscale_4_level:
                    old_result.step2_grayscale_4_level.delete(save=False)
                if old_result.step4_hls_s_inverted:
                    old_result.step4_hls_s_inverted.delete(save=False)
                if old_result.kmeans_segmentation_image:
                    old_result.kmeans_segmentation_image.delete(save=False)
                logger.info(f"已删除旧报告 {old_result.id} 的所有图片文件")
            except Exception as e:
                logger.warning(f"删除旧报告 {old_result.id} 的图片文件时出错: {str(e)}")
            finally:
                # 删除旧报告
                old_result.delete()
        
        if old_count > 0:
            logger.info(f"用户 {request.user.id} 创建新报告前，已删除 {old_count} 个旧报告")
        
        # 先创建 VisualAnalysisResult 记录，保存原图到 TOS
        result_obj = VisualAnalysisResult.objects.create(
            user=request.user,
            original_image=image_file,  # 直接保存文件到 TOS
            binary_threshold=binary_threshold,
            # 其他字段暂时为空，等待 Celery 任务填充
        )
        
        # 检查 Celery 是否启用
        if not getattr(settings, 'CELERY_ENABLED', False):
            # 如果 Celery 未启用，使用同步处理（向后兼容）
            from core.image_analysis import analyze_image_simplified_from_url
            # 从 TOS 读取图片并处理
            results = analyze_image_simplified_from_url(
                result_obj.original_image.url,
                result_obj.id,
                binary_threshold=binary_threshold
            )
            # 使用一次额度（同步模式下）
            quota.use_quota(is_member)
            return Response(results, status=status.HTTP_200_OK)
        
        # 创建异步任务，传递结果ID和图片URL
        task = analyze_image_comprehensive_task.delay(
            result_id=result_obj.id,
            image_url=result_obj.original_image.url,  # TOS URL
            user_id=request.user.id,
            binary_threshold=binary_threshold
        )
        
        # 创建任务状态记录
        task_obj = ImageAnalysisTask.objects.create(
            user=request.user,
            task_id=task.id,
            status=ImageAnalysisTask.STATUS_PENDING,
            progress=0,
        )
        
        # 使用一次额度
        quota.use_quota(is_member)
        
        return Response(
            {
                "task_id": task.id,
                "result_id": result_obj.id,
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
    注意：强制关闭并重新打开数据库连接，绕过 REPEATABLE-READ 隔离级别的限制
    这样可以立即看到 Celery worker 提交的更新（解决 MySQL 和 SQLite 差异问题）
    """
    try:
        from core.models import ImageAnalysisTask
        from django.db import connection
        
        # 关键：强制关闭当前数据库连接，确保使用新连接查询
        # 这可以绕过 REPEATABLE-READ 隔离级别的限制，立即看到其他事务的提交
        # 在 MySQL 中，REPEATABLE-READ 隔离级别会导致一个事务看不到另一个事务的提交
        # 关闭连接会结束当前事务，下次查询使用新连接，可以看到最新的已提交数据
        connection.close()
        
        # 从数据库重新查询（使用新连接，会看到最新的数据）
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_pending_image_analysis_task(request):
    """
    查询用户进行中的图像分析任务（pending或started状态）
    用于用户刷新页面后恢复任务状态
    """
    try:
        from core.models import ImageAnalysisTask
        
        # 查找用户进行中的任务（pending或started状态）
        pending_tasks = ImageAnalysisTask.objects.filter(
            user=request.user,
            status__in=[ImageAnalysisTask.STATUS_PENDING, ImageAnalysisTask.STATUS_STARTED]
        ).order_by("-created_at")
        
        if not pending_tasks.exists():
            return Response(
                {"task": None},
                status=status.HTTP_200_OK,
            )
        
        # 返回最新的进行中任务
        task_obj = pending_tasks[0]
        response_data = {
            "task": {
                "task_id": task_obj.task_id,
                "status": task_obj.status,
                "progress": task_obj.progress,
                "created_at": task_obj.created_at.isoformat(),
                "updated_at": task_obj.updated_at.isoformat(),
            }
        }
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.exception("查询进行中任务失败")
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
    
    def perform_destroy(self, instance):
        """删除视觉分析结果时，同时删除TOS中的所有关联图片文件"""
        import concurrent.futures
        
        # 收集所有需要删除的图片字段
        image_fields = [
            instance.original_image,
            instance.step1_binary,
            instance.step2_grayscale,
            instance.step3_lab_l,
            instance.step4_hsv_s,
            instance.step4_hls_s,
            instance.step5_hue,
            instance.step2_grayscale_3_level,
            instance.step2_grayscale_4_level,
            instance.step4_hls_s_inverted,
            instance.kmeans_segmentation_image,
            instance.kmeans_segmentation_image_12,
        ]
        
        # 过滤出实际存在的文件
        files_to_delete = [field for field in image_fields if field]
        
        if files_to_delete:
            # 使用线程池并行删除文件
            def delete_file(field):
                try:
                    field.delete(save=False)
                    return True
                except Exception as e:
                    logger.warning(f"删除文件 {field.name if hasattr(field, 'name') else 'unknown'} 时出错: {str(e)}")
                    return False
            
            # 使用线程池并发删除（最多4个线程）
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                futures = [executor.submit(delete_file, field) for field in files_to_delete]
                results = [f.result() for f in concurrent.futures.as_completed(futures)]
            
            deleted_count = sum(results)
            logger.info(f"已删除视觉分析结果 {instance.id} 的 {deleted_count}/{len(files_to_delete)} 个图片文件")
        else:
            logger.info(f"视觉分析结果 {instance.id} 没有需要删除的图片文件")
        
        # 删除模型实例（会级联删除）
        instance.delete()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_visual_analysis_quota(request):
    """
    获取用户视觉分析额度信息
    """
    try:
        from core.models import VisualAnalysisQuota
        
        user = request.user
        profile = getattr(user, 'profile', None)
        is_member = is_valid_member(profile)
        
        # 获取或创建额度记录
        quota, created = VisualAnalysisQuota.objects.get_or_create(
            user=user,
            defaults={
                'free_quota': 10,  # 如果是新用户（没有记录），默认赠送10次
                'used_free_quota': 0,
            }
        )
        
        # 如果是会员，检查并重置月度额度
        if is_member:
            quota.check_and_reset_monthly_quota()
        
        return Response({
            "is_member": is_member,
            "free_quota": quota.free_quota,
            "used_free_quota": quota.used_free_quota,
            "remaining_free_quota": quota.remaining_free_quota,
            "monthly_quota": quota.monthly_quota,
            "used_monthly_quota": quota.used_monthly_quota,
            "remaining_monthly_quota": quota.remaining_monthly_quota,
            "total_remaining_quota": quota.total_remaining_quota,
            "current_month": quota.current_month,
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.exception("获取视觉分析额度失败")
        return Response(
            {"detail": f"获取额度失败: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['GET', 'OPTIONS'])
@permission_classes([AllowAny])  # 允许公开访问，因为图片请求通常不带认证信息
def proxy_visual_analysis_image(request):
    """
    代理视觉分析图片请求，解决CORS问题
    通过后端服务器从TOS获取图片并返回给前端
    """
    import urllib.parse
    from django.http import FileResponse, Http404
    import mimetypes
    import requests
    from django.conf import settings
    
    # 处理OPTIONS请求（CORS预检）
    if request.method == 'OPTIONS':
        response = Response()
        origin = request.headers.get('Origin')
        if origin:
            response['Access-Control-Allow-Origin'] = origin
            response['Access-Control-Allow-Credentials'] = 'true'
            response['Vary'] = 'Origin'
        else:
            response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization'
        response['Access-Control-Max-Age'] = '86400'
        return response
    
    # 从查询参数获取图片URL
    image_url = request.query_params.get('url')
    if not image_url:
        return Response(
            {"detail": "缺少图片URL参数"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # 验证URL是否来自TOS存储桶（安全检查）
    allowed_domains = [
        getattr(settings, 'TOS_CUSTOM_DOMAIN', ''),
        'tos-cn-shanghai.volces.com',
        'tos.cn-shanghai.volces.com',
        'echobucket.tos-cn-shanghai.volces.com',
    ]
    allowed_domains = [d for d in allowed_domains if d]  # 移除空字符串
    
    # 记录详细信息用于调试
    logger.info(f"图片代理请求: URL={image_url}, allowed_domains={allowed_domains}")
    
    try:
        parsed_url = urllib.parse.urlparse(image_url)
        netloc = parsed_url.netloc.lower()  # 转换为小写进行比较
        
        logger.info(f"解析后的netloc: {netloc}")
        
        # 检查是否匹配允许的域名
        # 匹配逻辑：允许的域名应该完全匹配或作为后缀匹配（更安全的匹配方式）
        is_allowed = False
        matched_domain = None
        for domain in allowed_domains:
            if domain:
                domain_lower = domain.lower()
                # 完全匹配
                if netloc == domain_lower:
                    is_allowed = True
                    matched_domain = domain_lower
                    logger.info(f"域名完全匹配: {netloc} == {domain_lower}")
                    break
                # 作为后缀匹配（例如：echobucket.tos-cn-shanghai.volces.com 匹配 tos-cn-shanghai.volces.com）
                if netloc.endswith('.' + domain_lower):
                    is_allowed = True
                    matched_domain = domain_lower
                    logger.info(f"域名后缀匹配: {netloc} ends with .{domain_lower}")
                    break
        
        if not is_allowed:
            logger.error(f"图片代理请求被拒绝: URL={image_url}, netloc={netloc}, allowed_domains={allowed_domains}")
            return Response(
                {"detail": f"不允许的图片域名: {netloc}", "allowed_domains": allowed_domains},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        logger.info(f"图片代理请求通过验证: URL={image_url}, netloc={netloc}, matched_domain={matched_domain}")
    except Exception as e:
        logger.warning(f"解析图片URL失败: {str(e)}, URL={image_url}")
        return Response(
            {"detail": f"无效的图片URL: {str(e)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    try:
        # 从TOS获取图片
        response = requests.get(image_url, timeout=10, stream=True)
        response.raise_for_status()
        
        # 获取Content-Type
        content_type = response.headers.get('Content-Type', 'image/png')
        
        # 创建FileResponse
        file_response = FileResponse(
            response.raw,
            content_type=content_type,
        )
        
        # 设置缓存头
        file_response['Cache-Control'] = 'public, max-age=86400'
        file_response['Cross-Origin-Resource-Policy'] = 'cross-origin'
        
        # 设置CORS头
        origin = request.headers.get('Origin')
        if origin:
            file_response['Access-Control-Allow-Origin'] = origin
            file_response['Access-Control-Allow-Credentials'] = 'true'
            file_response['Vary'] = 'Origin'
        else:
            file_response['Access-Control-Allow-Origin'] = '*'
        
        file_response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        file_response['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization'
        
        return file_response
        
    except requests.RequestException as e:
        logger.error(f"从TOS获取图片失败: {str(e)}, URL: {image_url}")
        return Response(
            {"detail": f"获取图片失败: {str(e)}"},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except Exception as e:
        logger.exception(f"代理图片请求时出错: {str(e)}")
        return Response(
            {"detail": "服务器内部错误"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


# ==================== 支付相关接口 ====================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_payment_order(request):
    """
    创建支付订单
    
    请求体：
    {
        "payment_method": "alipay",  # 或 "wechat"
        "amount": 99.00,
        "tier": "premium",
        "expires_at": "2025-12-31"
    }
    """
    from decimal import Decimal
    from core.payment.alipay import create_alipay_payment_url
    
    user = request.user
    payment_method = request.data.get('payment_method')
    amount_str = request.data.get('amount')
    tier = request.data.get('tier')
    expires_at = request.data.get('expires_at')
    
    # 验证参数
    if not payment_method or payment_method not in [PointsOrder.PAYMENT_METHOD_ALIPAY, PointsOrder.PAYMENT_METHOD_WECHAT]:
        return Response(
            {"detail": "无效的支付方式"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not amount_str:
        return Response(
            {"detail": "必须提供订单金额"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        amount = Decimal(str(amount_str))
        if amount <= 0:
            raise ValueError("金额必须大于0")
    except (ValueError, TypeError):
        return Response(
            {"detail": "无效的金额格式"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not tier:
        return Response(
            {"detail": "必须提供会员等级"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not expires_at:
        return Response(
            {"detail": "必须提供到期时间"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # 检查用户是否有未支付的相同订单（防止重复创建）
    # 检查最近5分钟内是否有相同金额和会员等级的待支付订单
    from datetime import timedelta
    recent_orders = PointsOrder.objects.filter(
        user=user,
        status=PointsOrder.ORDER_STATUS_PENDING,
        amount=amount,
        payment_method=payment_method,
        created_at__gte=timezone.now() - timedelta(minutes=5),
    ).order_by('-created_at')
    
    # 检查是否有相同会员信息的订单
    for recent_order in recent_orders:
        recent_metadata = recent_order.metadata or {}
        if (recent_metadata.get('order_type') == 'membership' and
            recent_metadata.get('tier') == tier and
            recent_metadata.get('expires_at') == expires_at):
            # 返回已存在的订单
            logger.info(f"用户 {user.email} 在5分钟内已创建相同订单 {recent_order.order_number}，返回已有订单")
            try:
                if payment_method == PointsOrder.PAYMENT_METHOD_ALIPAY:
                    subject = f"EchoDraw会员-{tier}"
                    pay_url = create_alipay_payment_url(
                        order_number=recent_order.order_number,
                        amount=str(amount),
                        subject=subject,
                    )
                    return Response({
                        'order_id': recent_order.id,
                        'order_number': recent_order.order_number,
                        'pay_url': pay_url,
                        'payment_method': payment_method,
                        'message': '已返回您最近创建的订单',
                    })
                elif payment_method == PointsOrder.PAYMENT_METHOD_WECHAT:
                    # 微信支付：重新生成二维码
                    from core.payment.wechat import create_wechatpay_qrcode
                    description = f"EchoDraw会员-{tier}"
                    code_url = create_wechatpay_qrcode(
                        order_number=recent_order.order_number,
                        amount=str(amount),
                        description=description,
                    )
                    return Response({
                        'order_id': recent_order.id,
                        'order_number': recent_order.order_number,
                        'code_url': code_url,
                        'payment_method': payment_method,
                        'message': '已返回您最近创建的订单',
                    })
            except Exception as e:
                logger.exception(f"为已有订单生成支付URL失败: {e}")
                # 如果生成支付URL失败，继续创建新订单
    
    # 生成唯一订单号
    import uuid
    order_number = f"{datetime.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:8]}"
    
    # 创建订单
    order = PointsOrder.objects.create(
        user=user,
        order_number=order_number,
        points=0,  # 会员订单，点数为0
        amount=amount,
        payment_method=payment_method,
        status=PointsOrder.ORDER_STATUS_PENDING,
        metadata={
            "tier": tier,
            "expires_at": expires_at,
            "order_type": "membership",  # 标识这是会员订单
        }
    )
    
    if payment_method == PointsOrder.PAYMENT_METHOD_ALIPAY:
        try:
            # 调用支付宝接口
            subject = f"EchoDraw会员-{tier}"
            pay_url = create_alipay_payment_url(
                order_number=order_number,
                amount=str(amount),
                subject=subject,
            )
            
            return Response({
                'order_id': order.id,
                'order_number': order_number,
                'pay_url': pay_url,
                'payment_method': payment_method,
            })
        except ValueError as e:
            # 环境变量配置错误
            error_detail = str(e)
            logger.exception(f"创建支付宝支付失败（配置错误）: {error_detail}")
            order.delete()
            # 配置错误应该明确告知用户，这是服务器配置问题
            return Response(
                {"detail": f"支付配置错误: {error_detail}。请联系管理员检查服务器环境变量配置。"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            # 其他错误（网络错误、API错误等）
            error_detail = str(e)
            logger.exception(f"创建支付宝支付失败: {error_detail}")
            order.delete()
            # 在生产环境不暴露详细错误信息，但记录到日志
            # 配置错误（ValueError）已经在上面处理，这里主要是网络或API错误
            error_msg = "创建支付订单失败，请稍后重试。如果问题持续，请联系客服。"
            if settings.DEBUG:
                error_msg = f"创建支付订单失败: {error_detail}"
            return Response(
                {"detail": error_msg},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    elif payment_method == PointsOrder.PAYMENT_METHOD_WECHAT:
        try:
            # 调用微信支付接口
            from core.payment.wechat import create_wechatpay_qrcode
            description = f"EchoDraw会员-{tier}"
            code_url = create_wechatpay_qrcode(
                order_number=order_number,
                amount=str(amount),
                description=description,
            )
            
            return Response({
                'order_id': order.id,
                'order_number': order_number,
                'code_url': code_url,  # 微信支付二维码URL
                'payment_method': payment_method,
            })
        except ValueError as e:
            # 环境变量配置错误
            error_detail = str(e)
            logger.exception(f"创建微信支付失败（配置错误）: {error_detail}")
            order.delete()
            # 配置错误应该明确告知用户，这是服务器配置问题
            return Response(
                {"detail": f"支付配置错误: {error_detail}。请联系管理员检查服务器环境变量配置。"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            # 其他错误（网络错误、API错误等）
            error_detail = str(e)
            logger.exception(f"创建微信支付失败: {error_detail}")
            order.delete()
            # 在生产环境不暴露详细错误信息，但记录到日志
            error_msg = "创建支付订单失败，请稍后重试。如果问题持续，请联系客服。"
            if settings.DEBUG:
                error_msg = f"创建支付订单失败: {error_detail}"
            return Response(
                {"detail": error_msg},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    return Response(
        {"detail": "不支持的支付方式"},
        status=status.HTTP_400_BAD_REQUEST
    )


@api_view(['GET', 'POST'])
@csrf_exempt  # 支付宝回调不需要CSRF验证
@permission_classes([AllowAny])  # 支付宝回调不需要认证
def alipay_notify(request):
    """
    支付宝支付回调接口
    
    GET请求：返回接口信息（用于测试和调试）
    POST请求：处理支付宝回调
    """
    # 如果是GET请求，返回友好提示
    if request.method == 'GET':
        return Response({
            'message': '支付宝支付回调接口',
            'method': '此接口仅接受POST请求',
            'description': '支付宝会在用户支付完成后，通过POST请求调用此接口',
            'url': request.build_absolute_uri(),
        })
    
    from core.payment.alipay import verify_alipay_notify
    
    # 获取回调数据（支付宝使用POST表单数据，Content-Type: application/x-www-form-urlencoded）
    # 优先使用 request.POST（Django会自动解析表单数据）
    data = {}
    if hasattr(request, 'POST') and request.POST:
        data = dict(request.POST)
        # Django的QueryDict返回列表，需要转换为单个值
        data = {k: v[0] if isinstance(v, list) and len(v) > 0 else v for k, v in data.items()}
    # 如果没有POST数据，尝试从请求体解析
    elif hasattr(request, 'body') and request.body:
        try:
            import urllib.parse
            body_str = request.body.decode('utf-8')
            parsed_data = urllib.parse.parse_qs(body_str, keep_blank_values=True)
            # parse_qs 返回的是列表，需要转换为单个值
            data = {k: v[0] if isinstance(v, list) and len(v) > 0 else v for k, v in parsed_data.items()}
        except Exception as e:
            logger.warning(f"解析回调请求体失败: {e}, body: {request.body[:500] if request.body else 'empty'}")
            # 尝试使用DRF的request.data
            if hasattr(request, 'data') and request.data:
                if hasattr(request.data, 'dict'):
                    data = request.data.dict()
                else:
                    data = dict(request.data)
    # 最后尝试使用DRF的request.data
    elif hasattr(request, 'data') and request.data:
        if hasattr(request.data, 'dict'):
            data = request.data.dict()
        else:
            data = dict(request.data)
    
    if not data:
        logger.warning(f"支付宝回调数据为空, Content-Type: {request.META.get('CONTENT_TYPE', 'unknown')}, Method: {request.method}")
        return Response('fail')
    
    logger.info(f"收到支付宝回调: 订单号={data.get('out_trade_no', 'N/A')}, 交易状态={data.get('trade_status', 'N/A')}, Content-Type: {request.META.get('CONTENT_TYPE', 'unknown')}")
    
    sign = data.pop('sign', None)
    
    if not sign:
        logger.warning("支付宝回调缺少签名")
        return Response('fail')
    
    # 验证签名
    success = verify_alipay_notify(data, sign)
    
    if not success:
        logger.warning(f"支付宝回调签名验证失败: {data}")
        return Response('fail')
    
    # 检查交易状态
    trade_status = data.get('trade_status')
    order_number = data.get('out_trade_no')  # 获取订单号
    trade_no = data.get('trade_no')
    
    logger.info(f"支付宝回调 - 订单号: {order_number}, 交易状态: {trade_status}")
    
    if not order_number:
        logger.warning("支付宝回调缺少订单号")
        return Response('fail')
    
    if trade_status not in ('TRADE_SUCCESS', 'TRADE_FINISHED'):
        logger.info(f"支付宝回调交易状态不是成功: {trade_status}, 订单号: {order_number}")
        return Response('success')  # 即使不是成功状态，也返回success，避免支付宝重复通知
    
    # 支付成功
    
    try:
        order = PointsOrder.objects.get(order_number=order_number)
        
        # 更新订单状态（如果还未支付）
        order_was_paid = order.status == PointsOrder.ORDER_STATUS_PAID
        if not order_was_paid:
            # 更新订单状态
            order.status = PointsOrder.ORDER_STATUS_PAID
            order.payment_transaction_id = trade_no
            order.paid_at = timezone.now()
            order.save()
            logger.info(f"订单 {order_number} 状态已更新为已支付")
        else:
            logger.info(f"订单 {order_number} 已经支付过，检查会员状态是否需要更新")
        
        # 如果是会员订单，更新用户会员状态（即使订单已经支付过，也要检查会员状态）
        metadata = order.metadata or {}
        if metadata.get('order_type') == 'membership':
            tier = metadata.get('tier')
            expires_at_str = metadata.get('expires_at')
            
            if tier and expires_at_str:
                try:
                    # 解析到期时间
                    expires_at = datetime.strptime(expires_at_str, "%Y-%m-%d").date()
                    expires_at_datetime = timezone.make_aware(
                        datetime.combine(expires_at, datetime.max.time())
                    )
                    
                    # 更新用户会员状态
                    profile, _ = UserProfile.objects.get_or_create(user=order.user)
                    
                    # 检查会员状态是否需要更新
                    needs_update = False
                    if not profile.is_member:
                        needs_update = True
                        logger.info(f"用户 {order.user.email} 当前不是会员，需要更新")
                    elif not profile.membership_expires or profile.membership_expires < expires_at_datetime:
                        needs_update = True
                        logger.info(f"用户 {order.user.email} 会员到期时间需要更新: 当前={profile.membership_expires}, 应该={expires_at_datetime}")
                    else:
                        logger.info(f"用户 {order.user.email} 会员状态检查: is_member={profile.is_member}, expires={profile.membership_expires}, 订单到期时间={expires_at_datetime}")
                    
                    # 总是更新会员状态，确保状态正确（即使看起来已经是最新的）
                    # 这样可以修复任何可能的同步问题
                    # 如果用户之前不是会员，或者会员已过期，记录新的开通时间
                    was_member = profile.is_member and profile.membership_expires and profile.membership_expires > timezone.now()
                    if not was_member:
                        profile.membership_started_at = timezone.now()
                        # 重置视觉分析额度周期
                        try:
                            from core.models import VisualAnalysisQuota
                            quota = VisualAnalysisQuota.objects.filter(user=order.user).first()
                            if quota:
                                quota.current_month = ""
                                quota.save(update_fields=["current_month"])
                        except Exception:
                            pass
                    
                    profile.is_member = True
                    profile.membership_expires = expires_at_datetime
                    profile.save(update_fields=["is_member", "membership_expires", "membership_started_at", "updated_at"])
                    logger.info(f"订单 {order_number} 支付成功，已更新用户 {order.user.email} 的会员状态，到期时间: {expires_at_datetime}")
                except Exception as e:
                    logger.exception(f"更新会员状态失败: {e}, 订单号: {order_number}, 用户: {order.user.email}")
                    # 即使会员状态更新失败，也返回success，避免支付宝重复通知
        else:
            logger.info(f"订单 {order_number} 不是会员订单，跳过会员状态更新")
        
        return Response('success')
        
    except PointsOrder.DoesNotExist:
        logger.warning(f"订单不存在: {order_number}")
        return Response('fail')
    except Exception as e:
        logger.exception(f"处理支付宝回调失败: {e}")
        return Response('fail')


@api_view(['GET', 'POST'])
@csrf_exempt  # 微信回调不需要CSRF验证
@permission_classes([AllowAny])  # 微信回调不需要认证
def wechat_notify(request):
    """
    微信支付回调接口
    
    GET请求：返回接口信息（用于测试和调试）
    POST请求：处理微信支付回调
    """
    # 如果是GET请求，返回友好提示
    if request.method == 'GET':
        return Response({
            'message': '微信支付回调接口',
            'method': '此接口仅接受POST请求',
            'description': '微信支付会在用户支付完成后，通过POST请求调用此接口',
            'url': request.build_absolute_uri(),
        })
    
    from core.payment.wechat import verify_wechatpay_notify
    
    # 获取请求体（微信支付使用JSON格式）
    import json
    try:
        body = request.body.decode('utf-8')
    except Exception as e:
        logger.warning(f"微信支付回调无法解析请求体: {e}")
        return Response({'code': 'FAIL', 'message': '无法解析请求体'}, status=400)
    
    if not body:
        logger.warning("微信支付回调数据为空")
        return Response({'code': 'FAIL', 'message': '请求体为空'}, status=400)
    
    # 获取请求头
    # Django会将HTTP头转换为大写，并用下划线替换连字符
    # 例如：Wechatpay-Signature -> HTTP_WECHATPAY_SIGNATURE
    # 但wechatpay-python期望原始格式，所以我们需要转换回来
    def get_header(name):
        # 先尝试Django转换后的格式
        django_name = f"HTTP_{name.upper().replace('-', '_')}"
        value = request.META.get(django_name, '')
        if not value:
            # 如果没有找到，尝试原始格式（某些情况下可能保留）
            value = request.META.get(name, '')
        return value
    
    headers = {
        'Wechatpay-Signature': get_header('Wechatpay-Signature'),
        'Wechatpay-Timestamp': get_header('Wechatpay-Timestamp'),
        'Wechatpay-Nonce': get_header('Wechatpay-Nonce'),
        'Wechatpay-Serial': get_header('Wechatpay-Serial'),
    }
    
    logger.info(f"收到微信支付回调: 订单号={json.loads(body).get('out_trade_no', 'N/A') if body else 'N/A'}")
    
    # 验证签名并解析数据
    result = verify_wechatpay_notify(headers, body)
    
    if not result:
        logger.warning("微信支付回调签名验证失败")
        return Response({'code': 'FAIL', 'message': '签名验证失败'}, status=400)
    
    # 检查交易状态
    trade_state = result.get('trade_state')
    order_number = result.get('out_trade_no')
    transaction_id = result.get('transaction_id')
    success_time = result.get('success_time')
    
    logger.info(f"微信支付回调 - 订单号: {order_number}, 交易状态: {trade_state}")
    
    if not order_number:
        logger.warning("微信支付回调缺少订单号")
        return Response({'code': 'FAIL', 'message': '缺少订单号'}, status=400)
    
    if trade_state != 'SUCCESS':
        logger.info(f"微信支付回调交易状态不是成功: {trade_state}, 订单号: {order_number}")
        return Response({'code': 'SUCCESS', 'message': '已收到通知'})  # 即使不是成功状态，也返回成功，避免微信重复通知
    
    # 支付成功
    try:
        order = PointsOrder.objects.get(order_number=order_number)
        
        # 更新订单状态（如果还未支付）
        order_was_paid = order.status == PointsOrder.ORDER_STATUS_PAID
        if not order_was_paid:
            # 更新订单状态
            order.status = PointsOrder.ORDER_STATUS_PAID
            order.payment_transaction_id = transaction_id
            if success_time:
                try:
                    # 解析微信支付的时间格式：2024-01-01T12:00:00+08:00
                    from dateutil import parser
                    paid_time = parser.parse(success_time)
                    order.paid_at = paid_time
                except Exception:
                    order.paid_at = timezone.now()
            else:
                order.paid_at = timezone.now()
            order.save()
            logger.info(f"订单 {order_number} 状态已更新为已支付")
        else:
            logger.info(f"订单 {order_number} 已经支付过，检查会员状态是否需要更新")
        
        # 如果是会员订单，更新用户会员状态（即使订单已经支付过，也要检查会员状态）
        metadata = order.metadata or {}
        if metadata.get('order_type') == 'membership':
            tier = metadata.get('tier')
            expires_at_str = metadata.get('expires_at')
            
            if tier and expires_at_str:
                try:
                    # 解析到期时间
                    expires_at = datetime.strptime(expires_at_str, "%Y-%m-%d").date()
                    expires_at_datetime = timezone.make_aware(
                        datetime.combine(expires_at, datetime.max.time())
                    )
                    
                    # 更新用户会员状态
                    profile, _ = UserProfile.objects.get_or_create(user=order.user)
                    
                    # 检查会员状态是否需要更新
                    needs_update = False
                    if not profile.is_member:
                        needs_update = True
                        logger.info(f"用户 {order.user.email} 当前不是会员，需要更新")
                    elif not profile.membership_expires or profile.membership_expires < expires_at_datetime:
                        needs_update = True
                        logger.info(f"用户 {order.user.email} 会员到期时间需要更新: 当前={profile.membership_expires}, 应该={expires_at_datetime}")
                    else:
                        logger.info(f"用户 {order.user.email} 会员状态检查: is_member={profile.is_member}, expires={profile.membership_expires}, 订单到期时间={expires_at_datetime}")
                    
                    # 总是更新会员状态，确保状态正确（即使看起来已经是最新的）
                    # 这样可以修复任何可能的同步问题
                    # 如果用户之前不是会员，或者会员已过期，记录新的开通时间
                    was_member = profile.is_member and profile.membership_expires and profile.membership_expires > timezone.now()
                    if not was_member:
                        profile.membership_started_at = timezone.now()
                        # 重置视觉分析额度周期
                        try:
                            from core.models import VisualAnalysisQuota
                            quota = VisualAnalysisQuota.objects.filter(user=order.user).first()
                            if quota:
                                quota.current_month = ""
                                quota.save(update_fields=["current_month"])
                        except Exception:
                            pass
                    
                    profile.is_member = True
                    profile.membership_expires = expires_at_datetime
                    profile.save(update_fields=["is_member", "membership_expires", "membership_started_at", "updated_at"])
                    logger.info(f"订单 {order_number} 支付成功，已更新用户 {order.user.email} 的会员状态，到期时间: {expires_at_datetime}")
                except Exception as e:
                    logger.exception(f"更新会员状态失败: {e}, 订单号: {order_number}, 用户: {order.user.email}")
                    # 即使会员状态更新失败，也返回成功，避免微信重复通知
        else:
            logger.info(f"订单 {order_number} 不是会员订单，跳过会员状态更新")
        
        return Response({'code': 'SUCCESS', 'message': '成功'})
        
    except PointsOrder.DoesNotExist:
        logger.warning(f"订单不存在: {order_number}")
        return Response({'code': 'FAIL', 'message': '订单不存在'}, status=400)
    except Exception as e:
        logger.exception(f"处理微信支付回调失败: {e}")
        return Response({'code': 'FAIL', 'message': '处理失败'}, status=500)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_order_status(request, order_id):
    """
    查询订单状态
    
    GET /api/payments/orders/{order_id}/status/
    """
    try:
        order = PointsOrder.objects.get(id=order_id, user=request.user)
        return Response({
            'order_id': order.id,
            'order_number': order.order_number,
            'status': order.status,
            'amount': str(order.amount),
            'payment_method': order.payment_method,
            'paid_at': order.paid_at.isoformat() if order.paid_at else None,
            'created_at': order.created_at.isoformat(),
        })
    except PointsOrder.DoesNotExist:
        return Response(
            {'detail': '订单不存在'},
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def query_and_sync_order(request, order_id):
    """
    查询支付宝订单状态并同步到本地订单（用于修复已支付但状态未更新的订单）
    
    POST /api/payments/orders/{order_id}/query-and-sync/
    """
    from core.payment.alipay import query_alipay_order_status
    
    try:
        order = PointsOrder.objects.get(id=order_id, user=request.user)
        
        # 只有待支付状态的订单才需要查询
        if order.status != PointsOrder.ORDER_STATUS_PENDING:
            return Response({
                'success': True,
                'message': f'订单状态已经是 {order.get_status_display()}，无需同步',
                'order_status': order.status,
            })
        
        # 只有支付宝订单才能查询
        if order.payment_method != PointsOrder.PAYMENT_METHOD_ALIPAY:
            return Response(
                {'detail': '只有支付宝订单可以查询状态'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 查询支付宝订单状态
        result = query_alipay_order_status(order.order_number)
        
        if not result.get('success'):
            return Response(
                {'detail': f'查询失败: {result.get("msg")}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        trade_status = result.get('trade_status')
        
        # 如果订单已支付，更新本地订单状态
        if trade_status in ('TRADE_SUCCESS', 'TRADE_FINISHED'):
            trade_no = result.get('trade_no')
            gmt_payment = result.get('gmt_payment')
            
            # 更新订单状态
            order.status = PointsOrder.ORDER_STATUS_PAID
            order.payment_transaction_id = trade_no
            if gmt_payment:
                try:
                    from datetime import datetime as dt
                    paid_time = dt.strptime(gmt_payment, "%Y-%m-%d %H:%M:%S")
                    order.paid_at = timezone.make_aware(paid_time)
                except Exception:
                    order.paid_at = timezone.now()
            else:
                order.paid_at = timezone.now()
            order.save()
            
            # 如果是会员订单，更新用户会员状态
            metadata = order.metadata or {}
            if metadata.get('order_type') == 'membership':
                tier = metadata.get('tier')
                expires_at_str = metadata.get('expires_at')
                
                if tier and expires_at_str:
                    try:
                        # 解析到期时间
                        expires_at = datetime.strptime(expires_at_str, "%Y-%m-%d").date()
                        expires_at_datetime = timezone.make_aware(
                            datetime.combine(expires_at, datetime.max.time())
                        )
                        
                        # 更新用户会员状态
                        profile, _ = UserProfile.objects.get_or_create(user=order.user)
                        
                        # 如果用户之前不是会员，或者会员已过期，记录新的开通时间
                        was_member = profile.is_member and profile.membership_expires and profile.membership_expires > timezone.now()
                        if not was_member:
                            profile.membership_started_at = timezone.now()
                            # 重置视觉分析额度周期
                            try:
                                from core.models import VisualAnalysisQuota
                                quota = VisualAnalysisQuota.objects.filter(user=order.user).first()
                                if quota:
                                    quota.current_month = ""
                                    quota.save(update_fields=["current_month"])
                            except Exception:
                                pass
                        
                        profile.is_member = True
                        profile.membership_expires = expires_at_datetime
                        profile.save(update_fields=["is_member", "membership_expires", "membership_started_at", "updated_at"])
                        
                        logger.info(f"订单 {order.order_number} 查询并同步成功，已更新用户 {order.user.email} 的会员状态")
                    except Exception as e:
                        logger.exception(f"更新会员状态失败: {e}")
            
            return Response({
                'success': True,
                'message': '订单状态已更新为已支付',
                'order_status': order.status,
                'trade_no': trade_no,
            })
        else:
            return Response({
                'success': True,
                'message': f'订单在支付宝的状态是: {trade_status}，尚未支付',
                'order_status': order.status,
                'alipay_status': trade_status,
            })
        
    except PointsOrder.DoesNotExist:
        return Response(
            {'detail': '订单不存在'},
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.exception(f"查询并同步订单失败: {e}")
        return Response(
            {'detail': f'查询并同步订单失败: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sync_order_membership(request, order_id):
    """
    手动同步订单会员状态（用于修复已支付但会员状态未更新的订单）
    
    POST /api/payments/orders/{order_id}/sync-membership/
    """
    try:
        order = PointsOrder.objects.get(id=order_id, user=request.user)
        
        # 只有已支付的订单才能同步
        if order.status != PointsOrder.ORDER_STATUS_PAID:
            return Response(
                {'detail': '订单未支付，无法同步会员状态'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # 检查是否是会员订单
        metadata = order.metadata or {}
        if metadata.get('order_type') != 'membership':
            return Response(
                {'detail': '该订单不是会员订单'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        tier = metadata.get('tier')
        expires_at_str = metadata.get('expires_at')
        
        if not tier or not expires_at_str:
            return Response(
                {'detail': '订单缺少会员信息'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # 解析到期时间
            expires_at = datetime.strptime(expires_at_str, "%Y-%m-%d").date()
            expires_at_datetime = timezone.make_aware(
                datetime.combine(expires_at, datetime.max.time())
            )
            
            # 更新用户会员状态
            profile, _ = UserProfile.objects.get_or_create(user=order.user)
            
            # 记录更新前的状态（用于日志）
            old_is_member = profile.is_member
            old_expires = profile.membership_expires
            
            # 如果用户之前不是会员，或者会员已过期，记录新的开通时间
            was_member = profile.is_member and profile.membership_expires and profile.membership_expires > timezone.now()
            if not was_member:
                profile.membership_started_at = timezone.now()
                # 重置视觉分析额度周期
                try:
                    from core.models import VisualAnalysisQuota
                    quota = VisualAnalysisQuota.objects.filter(user=order.user).first()
                    if quota:
                        quota.current_month = ""
                        quota.save(update_fields=["current_month"])
                except Exception:
                    pass
            
            # 强制更新会员状态
            profile.is_member = True
            profile.membership_expires = expires_at_datetime
            profile.save(update_fields=["is_member", "membership_expires", "membership_started_at", "updated_at"])
            
            logger.info(f"手动同步订单 {order.order_number} 的会员状态成功: 用户={order.user.email}, 更新前(is_member={old_is_member}, expires={old_expires}), 更新后(is_member={profile.is_member}, expires={profile.membership_expires})")
            
            return Response({
                'success': True,
                'message': '会员状态已更新',
                'membership_expires': profile.membership_expires.isoformat() if profile.membership_expires else None,
            })
        except Exception as e:
            logger.exception(f"同步会员状态失败: {e}")
            return Response(
                {'detail': f'同步会员状态失败: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
    except PointsOrder.DoesNotExist:
        return Response(
            {'detail': '订单不存在'},
            status=status.HTTP_404_NOT_FOUND
        )