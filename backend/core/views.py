from __future__ import annotations

import random
import secrets
import calendar
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.views import APIView

from core.models import (
    AuthToken,
    DailyHistoryMessage,
    DailyCheckIn,
    EmailVerification,
    EncouragementMessage,
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


class UserUploadListCreateView(generics.ListCreateAPIView):
    serializer_class = UserUploadSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return UserUpload.objects.filter(user=self.request.user).order_by("-uploaded_at")

    def perform_create(self, serializer: UserUploadSerializer):
        serializer.save(user=self.request.user)


class UserUploadDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = UserUploadSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return UserUpload.objects.filter(user=self.request.user).order_by("-uploaded_at")


class ShortTermGoalListCreateView(generics.ListCreateAPIView):
    serializer_class = ShortTermGoalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ShortTermGoal.objects.filter(user=self.request.user).order_by("-created_at", "-id")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


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
    user = request.user
    now = timezone.now()
    today = timezone.localdate()

    history_entry = (
        DailyHistoryMessage.objects.filter(date=today, is_active=True)
        .order_by("-updated_at")
        .first()
    )
    history_payload = {
        "headline": history_entry.headline if history_entry else None,
        "text": history_entry.text if history_entry else None,
    }

    last_upload = (
        UserUpload.objects.filter(user=user).order_by("-uploaded_at").first()
    )
    conditional_text = _resolve_conditional_message(last_upload, now=now)
    encouragement_text = _resolve_encouragement_message()
    check_in_payload = _get_check_in_stats(user)

    response_payload = {
        "history": history_payload,
        "conditional": conditional_text,
        "encouragement": encouragement_text,
        "last_upload": {
            "uploaded_at": last_upload.uploaded_at if last_upload else None,
            "self_rating": last_upload.self_rating if last_upload else None,
            "mood_label": last_upload.mood_label if last_upload else None,
            "duration_minutes": last_upload.duration_minutes if last_upload else None,
            "tags": last_upload.tags if last_upload else None,
        },
        "check_in": check_in_payload,
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


def _resolve_conditional_message(last_upload: UserUpload | None, *, now):
    queryset = UploadConditionalMessage.objects.filter(is_active=True).order_by(
        "priority", "id"
    )

    for message in queryset:
        if message.matches_upload(last_upload, reference_time=now):
            return message.text

    return None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def check_in(request):
    user = request.user
    today = timezone.localdate()

    if request.method == "POST":
        date_str = request.data.get("date")
        source = (request.data.get("source") or "").strip() or "app"

        if date_str:
            try:
                target_date = date.fromisoformat(date_str)
            except ValueError:
                return Response(
                    {"detail": "日期格式不正确，应为 YYYY-MM-DD。"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            target_date = today

        if target_date > today:
            return Response(
                {"detail": "不能为未来日期打卡。"},
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


def _resolve_encouragement_message():
    messages = list(EncouragementMessage.objects.filter(is_active=True))
    if not messages:
        return None

    weights = [max(message.weight, 1) for message in messages]
    selected = random.choices(messages, weights=weights, k=1)[0]
    return selected.text


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
