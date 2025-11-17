from __future__ import annotations

import random
import secrets
import calendar
import mimetypes
import os
import logging
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Max
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from core.email_utils import send_mail_async

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
    LongTermGoal,
    LongTermPlanCopy,
    Notification,
    ShortTermGoal,
    ShortTermTaskPreset,
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
    UserTaskPresetPublicSerializer,
    UserTaskPresetSerializer,
    UserUploadSerializer,
    UserProfileSerializer,
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
    """调试端点：检查时区计算是否正确"""
    import datetime
    now_utc = timezone.now()
    today_shanghai = get_today_shanghai()
    
    # 计算各种时区的当前时间
    info = {
        "timezone_now_utc": now_utc.isoformat() if now_utc else None,
        "timezone_is_naive": timezone.is_naive(now_utc) if now_utc else None,
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
            info["shanghai_time_error"] = str(e)
    
    # 如果用户已登录，显示用户打卡状态
    if request.user.is_authenticated:
        user = request.user
        stats = _get_check_in_stats(user)
        info["user_checkin_stats"] = stats
        info["user_email"] = user.email
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

    # 获取客户端IP地址
    def get_client_ip(request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR', 'unknown')
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
    one_hour_ago = now - timedelta(hours=1)
    ip_send_count = EmailVerification.objects.filter(
        metadata__ip=client_ip,
        created_at__gte=one_hour_ago
    ).count()
    
    if ip_send_count >= IP_RATE_LIMIT_PER_HOUR:
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
        payload = {"detail": "验证码发送失败，请稍后重试"}
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

    if len(password) < 8:
        return Response(
            {"detail": "密码长度至少 8 位"}, status=status.HTTP_400_BAD_REQUEST
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
            {"detail": "验证码不正确，请重新获取"},
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
        
        # 分配注册编号：获取当前最大注册编号，然后+1
        max_reg_number = UserProfile.objects.filter(
            registration_number__isnull=False
        ).aggregate(
            max_num=Max("registration_number")
        )["max_num"] or 0
        
        # 创建用户资料并分配注册编号
        UserProfile.objects.create(
            user=user,
            registration_number=max_reg_number + 1,
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

    if len(password) < 8:
        return Response(
            {"detail": "密码长度至少 8 位"}, status=status.HTTP_400_BAD_REQUEST
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
            {"detail": "验证码不正确，请重新获取"},
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

    user_model = get_user_model()

    try:
        user = user_model.objects.get(email__iexact=email)
    except user_model.DoesNotExist:
        return Response(
            {"detail": "账号或密码不正确"}, status=status.HTTP_400_BAD_REQUEST
        )

    if not user.check_password(password):
        return Response(
            {"detail": "账号或密码不正确"}, status=status.HTTP_400_BAD_REQUEST
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


def _build_achievement_payload(achievement: Achievement, *, unlocked_at=None) -> dict:
    metadata = achievement.metadata or {}
    condition = achievement.condition or {}
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
    """
    check_in_stats = _get_check_in_stats(user)
    total_uploads = UserUpload.objects.filter(user=user).count()
    
    return {
        "total_uploads": total_uploads,
        "total_checkins": check_in_stats.get("total_checkins", 0),
        "current_streak": check_in_stats.get("current_streak", 0),
        "checked_today": 1 if check_in_stats.get("checked_today", False) else 0,
    }


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
        today = timezone.now().isoformat()

        for achievement in achievements:
            unlocked_at = None
            
            # 如果用户已登录，评估成就条件
            if user and user.is_authenticated:
                condition = achievement.condition or {}
                if condition and _evaluate_achievement_condition(user, condition, user_stats):
                    unlocked_at = today
                    logger.debug(
                        f"achievement unlocked: {achievement.slug} (level {achievement.level})",
                        extra={"trace_id": trace_id, "user_id": user_id, "achievement_slug": achievement.slug}
                    )
            
            payload = _build_achievement_payload(achievement, unlocked_at=unlocked_at)
            
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


class UserUploadListCreateView(generics.ListCreateAPIView):
    serializer_class = UserUploadSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None  # 保持前端期望的数组响应，不受全局分页影响

    def get_queryset(self):
        return (
            UserUpload.objects.filter(user=self.request.user)
            .only(
                "id",
                "title",
                "notes",
                "uploaded_at",
                "self_rating",
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
        upload = serializer.save(user=self.request.user)

        # 确保 uploaded_at 有时区信息，如果没有则使用当前时间
        uploaded_at = upload.uploaded_at
        if uploaded_at is None:
            uploaded_at = timezone.now()
        # 确保是时区感知的 datetime
        elif timezone.is_naive(uploaded_at):
            uploaded_at = timezone.make_aware(uploaded_at)

        # 明确转换为中国时区，确保日期计算正确
        shanghai_time = uploaded_at.astimezone(SHANGHAI_TZ)
        checkin_date = shanghai_time.date()

        checkin, created = DailyCheckIn.objects.get_or_create(
            user=self.request.user,
            date=checkin_date,
            defaults={"source": "upload"},
        )
        if not created and not checkin.source:
            checkin.source = "upload"
            checkin.save(update_fields=["source"])


class UserUploadDetailView(generics.RetrieveDestroyAPIView):
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
        except AuthToken.DoesNotExist:
            return None

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
            .only("id", "title", "duration_days", "plan_type", "schedule", "created_at", "updated_at")
            .order_by("-created_at", "-id")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class ShortTermGoalDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ShortTermGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ShortTermGoal.objects.filter(user=self.request.user).only(
            "id", "title", "duration_days", "plan_type", "schedule", "created_at", "updated_at", "user"
        )


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
@permission_classes([IsAuthenticated])
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
    
    logger.info(
        f"homepage_messages request started for user_id={user.id}, today={today.isoformat()}",
        extra={"trace_id": trace_id, "user_id": user.id}
    )

    try:
        # 第二块：条件文案（基于用户条件，优先检查）
        check_in_stats = _get_check_in_stats(user)
        total_uploads = UserUpload.objects.filter(user=user).count()
        last_upload = UserUpload.objects.filter(user=user).order_by("-uploaded_at").first()
        
        logger.debug(
            f"check_in_stats: {check_in_stats}, total_uploads: {total_uploads}",
            extra={"trace_id": trace_id, "user_id": user.id}
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
                extra={"trace_id": trace_id, "user_id": user.id}
            )

        # 第一块：通用文案（随机展示，仅在不是特殊打卡日期时显示）
        # 如果匹配到条件文案（特殊打卡日期），则不显示通用文案
        general_text = None
        if not conditional_text:
            general_text = _resolve_general_message()
            if general_text:
                logger.debug(
                    f"selected general message: {general_text[:50]}...",
                    extra={"trace_id": trace_id, "user_id": user.id}
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
                extra={"trace_id": trace_id, "user_id": user.id}
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
                extra={"trace_id": trace_id, "user_id": user.id}
            )

        response_payload = {
            "general": general_text,  # 通用文案（当不是特殊打卡日期时）
            "conditional": conditional_text,  # 条件文案（特殊打卡日期等）
            "holiday": holiday_payload,  # 节日文案
            "history": history_payload,  # 历史文案（历史上的今天）
        }
        
        logger.info(
            f"homepage_messages request completed successfully",
            extra={"trace_id": trace_id, "user_id": user.id}
        )
        
        return Response(response_payload)
    except Exception as exc:
        logger.error(
            f"homepage_messages request failed: {exc}",
            extra={"trace_id": trace_id, "user_id": user.id},
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
        shanghai_time = uploaded_at.astimezone(SHANGHAI_TZ)
        uploads.add(shanghai_time.date())

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

        if date_str:
            if not isinstance(date_str, str):
                return Response(
                    {"detail": "日期参数必须是字符串格式。"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                target_date = date.fromisoformat(date_str.strip())
            except (ValueError, AttributeError) as e:
                return Response(
                    {"detail": f"日期格式不正确，应为 YYYY-MM-DD。收到: {date_str!r}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            target_date = today

        if target_date > today:
            return Response(
                {"detail": f"不能为未来日期打卡。目标日期: {target_date.isoformat()}, 今天: {today.isoformat()}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            checkin, created = DailyCheckIn.objects.get_or_create(
                user=user, date=target_date, defaults={"source": source}
            )
            if not created and source and not checkin.source:
                checkin.source = source
                checkin.save(update_fields=["source"])

        stats = _get_check_in_stats(user)
        payload = {
            **stats,
            "created": created,
            "checked_date": target_date.isoformat(),
        }
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
        shanghai_time = uploaded_at.astimezone(SHANGHAI_TZ)
        upload_dates.add(shanghai_time.date())
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

        defaults = {
            "title": data["title"],
            "description": data.get("description", ""),
            "target_hours": data["target_hours"],
            "checkpoint_count": data["checkpoint_count"],
            "started_at": timezone.now(),
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

            if should_reset or hours_changed or checkpoints_changed:
                goal.started_at = timezone.now()

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
        return list(
            UserUpload.objects.filter(user=user, uploaded_at__gte=started_at).order_by(
                "uploaded_at", "id"
            )
        )


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
    
    count, success = HighFiveCounter.increment(user=user, session_key=session_key)
    
    if success:
        return Response({"count": count, "success": True})
    else:
        return Response(
            {"count": count, "success": False, "message": "您已经点击过了"},
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
    
    has_clicked = HighFiveCounter.has_clicked(user=user, session_key=session_key)
    return Response({"has_clicked": has_clicked})
