from __future__ import annotations

import random
import secrets
import calendar
import mimetypes
import os
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView

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
    ShortTermGoal,
    ShortTermTaskPreset,
    UploadConditionalMessage,
    UserTaskPreset,
    UserUpload,
    UserProfile,
)
from core.serializers import (
    LongTermGoalSerializer,
    LongTermGoalSetupSerializer,
    LongTermPlanCopyPublicSerializer,
    ShortTermGoalSerializer,
    ShortTermTaskPresetPublicSerializer,
    UserTaskPresetPublicSerializer,
    UserTaskPresetSerializer,
    UserUploadSerializer,
    UserProfileSerializer,
)

CODE_EXPIRY_MINUTES = 10
RESEND_INTERVAL_SECONDS = 60
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
    return {
        "id": user.id,
        "email": user.email,
        "is_staff": bool(user.is_staff),
        "is_active": bool(user.is_active),
        "first_name": user.first_name,
        "last_name": user.last_name,
    }


@api_view(["GET"])
def health_check(_request):
    """Simple endpoint to verify the service is running."""

    return Response({"status": "ok"})


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

    now = timezone.now()
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

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = now + timedelta(minutes=CODE_EXPIRY_MINUTES)

    verification = EmailVerification.objects.create(
        email=email,
        purpose=purpose,
        code=code,
        expires_at=expires_at,
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

    try:
        send_mail(subject, message, from_email, [email], fail_silently=False)
    except Exception as exc:  # pylint: disable=broad-except
        verification.delete()
        payload = {"detail": "验证码发送失败，请稍后重试"}
        if settings.DEBUG:
            payload["error"] = _extract_error_message(exc, "邮件发送失败")
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
        "level": achievement.level,
        "metadata": metadata.copy() if isinstance(metadata, dict) else {},
        "condition": condition.copy() if isinstance(condition, dict) else {},
        "unlocked_at": unlocked_at,
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def profile_achievements(request):
    """
    返回当前用户的成就概览。

    目前尚未实现成就判定逻辑，因此所有配置成就默认视为“未解锁”。
    后续可在此处根据用户数据计算已解锁等级并补充 unlocked_at 字段。
    """

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

    group_map: dict[int, dict] = {}
    standalone: list[dict] = []

    for achievement in achievements:
        payload = _build_achievement_payload(achievement)
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
        groups.append(group_payload)

    summary = {
        "group_count": len(groups),
        "standalone_count": len(standalone),
        "achievement_count": len(standalone) + sum(
            group["summary"]["level_count"] for group in groups
        ),
    }

    return Response({"summary": summary, "groups": groups, "standalone": standalone})


class UserUploadListCreateView(generics.ListCreateAPIView):
    serializer_class = UserUploadSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return UserUpload.objects.filter(user=self.request.user).order_by("-uploaded_at")

    def perform_create(self, serializer: UserUploadSerializer):
        upload = serializer.save(user=self.request.user)

        # 确保 uploaded_at 有时区信息，如果没有则使用当前时间
        uploaded_at = upload.uploaded_at
        if uploaded_at is None:
            uploaded_at = timezone.now()
        # 确保是时区感知的 datetime（如果已经是 timezone-aware，timezone.localtime 可以直接处理）
        elif timezone.is_naive(uploaded_at):
            uploaded_at = timezone.make_aware(uploaded_at)

        localized = timezone.localtime(uploaded_at)
        checkin_date = localized.date()

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
        return UserUpload.objects.filter(user=self.request.user).order_by("-uploaded_at")


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

        return response


class ShortTermGoalListCreateView(generics.ListCreateAPIView):
    serializer_class = ShortTermGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ShortTermGoal.objects.filter(user=self.request.user).order_by("-created_at", "-id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class ShortTermGoalDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = ShortTermGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ShortTermGoal.objects.filter(user=self.request.user)


class UserTaskPresetListCreateView(generics.ListCreateAPIView):
    serializer_class = UserTaskPresetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return UserTaskPreset.objects.filter(user=self.request.user).order_by("-updated_at", "-id")

    def perform_create(self, serializer: UserTaskPresetSerializer):
        serializer.save(
            user=self.request.user,
            category=UserTaskPreset.DEFAULT_CATEGORY,
        )


class UserTaskPresetDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = UserTaskPresetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return UserTaskPreset.objects.filter(user=self.request.user).order_by("-updated_at", "-id")

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
    user = request.user
    today = timezone.localdate()

    # 第二块：条件文案（基于用户条件，优先检查）
    check_in_stats = _get_check_in_stats(user)
    total_uploads = UserUpload.objects.filter(user=user).count()
    last_upload = UserUpload.objects.filter(user=user).order_by("-uploaded_at").first()
    conditional_text = _resolve_conditional_message(
        user,
        check_in_stats=check_in_stats,
        total_uploads=total_uploads,
        last_upload=last_upload,
    )

    # 第一块：通用文案（随机展示，仅在不是特殊打卡日期时显示）
    # 如果匹配到条件文案（特殊打卡日期），则不显示通用文案
    general_text = None
    if not conditional_text:
        general_text = _resolve_general_message()

    # 第三块：节日文案和历史文案（基于日期）
    holiday_message = HolidayMessage.get_for_date(today)
    holiday_payload = None
    if holiday_message:
        holiday_payload = {
            "headline": holiday_message.headline or None,
            "text": holiday_message.text,
        }
    
    # 历史文案（历史上的今天）
    history_message = DailyHistoryMessage.get_for_date(today)
    history_payload = None
    if history_message:
        history_payload = {
            "headline": history_message.headline or None,
            "text": history_message.text,
        }

    response_payload = {
        "general": general_text,  # 通用文案（当不是特殊打卡日期时）
        "conditional": conditional_text,  # 条件文案（特殊打卡日期等）
        "holiday": holiday_payload,  # 节日文案
        "history": history_payload,  # 历史文案（历史上的今天）
    }
    return Response(response_payload)


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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def goals_calendar(request):
    user = request.user
    today = timezone.localdate()

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

    checkins = {
        item.date
        for item in DailyCheckIn.objects.filter(
            user=user, date__range=(display_start, display_end)
        )
    }

    uploads = set()
    for upload in UserUpload.objects.filter(
        user=user, uploaded_at__date__range=(display_start, display_end)
    ):
        localized = timezone.localtime(upload.uploaded_at)
        uploads.add(localized.date())

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
    today = timezone.localdate()

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
    today = timezone.localdate()
    queryset = DailyCheckIn.objects.filter(user=user).order_by("-date")
    total = queryset.count()

    latest_date = queryset[0].date if total else None
    checked_today = latest_date == today if latest_date else False

    streak = 0
    expected = latest_date
    for record in queryset:
        if expected is None:
            break
        if record.date == expected:
            streak += 1
            expected = expected - timedelta(days=1)
        else:
            break

    return {
        "checked_today": checked_today,
        "current_streak": streak if latest_date else 0,
        "total_checkins": total,
        "latest_checkin": latest_date.isoformat() if latest_date else None,
    }


def _resolve_general_message():
    """解析通用文案：随机展示一句。"""
    messages = list(EncouragementMessage.objects.filter(is_active=True))
    if not messages:
        return None

    weights = [max(message.weight, 1) for message in messages]
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
