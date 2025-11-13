from __future__ import annotations

import secrets
import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


class EmailVerification(models.Model):
    PURPOSE_REGISTER = "register"
    PURPOSE_RESET_PASSWORD = "reset_password"

    PURPOSE_CHOICES = [
        (PURPOSE_REGISTER, "Register"),
        (PURPOSE_RESET_PASSWORD, "Reset Password"),
    ]

    email = models.EmailField()
    purpose = models.CharField(max_length=32, choices=PURPOSE_CHOICES)
    code = models.CharField(max_length=6)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["email", "purpose", "code"]),
            models.Index(fields=["created_at"]),
        ]
        ordering = ["-created_at"]

    def mark_used(self):
        if not self.is_used:
            self.is_used = True
            self.save(update_fields=["is_used"])

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at


def generate_token_key() -> str:
    return secrets.token_urlsafe(32)


class AuthToken(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="auth_token",
    )
    key = models.CharField(max_length=96, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["key"])]

    @classmethod
    def issue_for_user(cls, user):
        token, created = cls.objects.get_or_create(
            user=user, defaults={"key": generate_token_key()}
        )
        if not created:
            token.key = generate_token_key()
            token.save(update_fields=["key", "last_used_at"])
        return token.key


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    display_name = models.CharField(
        max_length=64,
        blank=True,
        help_text="用户自定义的展示名称，将在个人页等位置显示。",
    )
    signature = models.CharField(
        max_length=160,
        blank=True,
        help_text="个人签名或座右铭。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user__email"]
        verbose_name = "用户资料"
        verbose_name_plural = "用户资料"

    def __str__(self) -> str:
        return self.display_name or self.user.get_username()

    def update_preferences(self, *, display_name: str | None = None, signature: str | None = None) -> None:
        changed = False
        if display_name is not None and display_name != self.display_name:
            self.display_name = display_name
            changed = True
        if signature is not None and signature != self.signature:
            self.signature = signature
            changed = True
        if changed:
            self.save(update_fields=["display_name", "signature", "updated_at"])


class UserUpload(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="uploads",
    )
    title = models.CharField(
        max_length=120,
        blank=True,
        help_text="作品标题，用于前端展示。",
    )
    uploaded_at = models.DateTimeField(default=timezone.now)
    self_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="创作者自评分，范围 0-100。",
    )
    mood_label = models.CharField(
        max_length=64,
        blank=True,
        help_text="上传时选择的心情标签。",
    )
    tags = models.JSONField(
        default=list,
        blank=True,
        help_text="上传时选择的作品标签列表。",
    )
    duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="此次创作的时长（分钟）。",
    )
    notes = models.TextField(blank=True)
    image = models.ImageField(
        upload_to="uploads/%Y/%m/",
        blank=True,
        null=True,
        help_text="用户上传的作品图片。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "-uploaded_at"]),
            models.Index(fields=["uploaded_at"]),
        ]
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.user} @ {self.uploaded_at:%Y-%m-%d %H:%M}"


class LongTermGoal(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="long_term_goal",
    )
    title = models.CharField(
        max_length=160,
        help_text="长期计划标题。",
    )
    description = models.TextField(
        blank=True,
        help_text="长期计划描述，展示在详情页顶部。",
    )
    target_hours = models.PositiveIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5000)],
        help_text="目标投入总小时数。",
    )
    checkpoint_count = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(90)],
        help_text="检查点数量，用于划分阶段。",
    )
    started_at = models.DateTimeField(
        default=timezone.now,
        help_text="计划开始时间，用于统计进度。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(
                fields=["target_hours"],
                name="core_lt_goal_target_hours_idx",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.user})"


class ShortTermGoal(models.Model):
    PLAN_TYPE_SAME = "same"
    PLAN_TYPE_DIFFERENT = "different"
    PLAN_TYPE_CHOICES = [
        (PLAN_TYPE_SAME, "Same Task Daily"),
        (PLAN_TYPE_DIFFERENT, "Different Task Daily"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="short_term_goals",
    )
    title = models.CharField(max_length=160)
    duration_days = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(90)],
        help_text="挑战持续天数，范围 1-90 天。",
    )
    plan_type = models.CharField(
        max_length=16,
        choices=PLAN_TYPE_CHOICES,
        default=PLAN_TYPE_DIFFERENT,
        help_text="任务结构类型：每日相同或每日不同。",
    )
    schedule = models.JSONField(
        default=list,
        blank=True,
        help_text="任务安排列表，元素包含 day_index 与任务条目。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["user", "plan_type"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.user})"


class LongTermPlanCopy(models.Model):
    min_hours = models.PositiveIntegerField(
        default=0,
        help_text="该文案适用的最少总时长（含），单位：小时。",
    )
    max_hours = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="该文案适用的最大总时长（含），留空表示无限上限。",
    )
    message = models.TextField(
        help_text="展示给用户的提示文案，建议说明该时长区间的规划建议。",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["min_hours", "max_hours", "id"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(max_hours__isnull=True)
                | models.Q(max_hours__gte=models.F("min_hours")),
                name="core_longtermplancopy_valid_range",
            ),
        ]
        verbose_name = "长期计划文案"
        verbose_name_plural = "长期计划文案"

    def __str__(self) -> str:
        upper = f"{self.max_hours}" if self.max_hours is not None else "∞"
        return f"{self.min_hours}-{upper}h"


class ShortTermTaskPreset(models.Model):
    code = models.SlugField(
        max_length=64,
        unique=True,
        help_text="用于构建短期任务计划的唯一任务标识。",
    )
    category = models.CharField(
        max_length=64,
        help_text="任务分类，便于前端分组展示。",
    )
    title = models.CharField(
        max_length=160,
        help_text="任务名称。",
    )
    description = models.CharField(
        max_length=240,
        blank=True,
        help_text="任务简介，将展示给用户。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="关闭后将从用户端隐藏该任务预设。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="排序权重，数值越小越靠前。",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="附加元数据，保留扩展字段。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "code"]
        indexes = [
            models.Index(fields=["category", "display_order"]),
            models.Index(fields=["is_active", "display_order"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.category})"


class UserTaskPreset(models.Model):
    DEFAULT_CATEGORY = "我的"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_task_presets",
    )
    slug = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    category = models.CharField(
        max_length=64,
        default=DEFAULT_CATEGORY,
        help_text="自定义任务分类，默认“我的”。",
    )
    title = models.CharField(
        max_length=160,
        help_text="自定义任务名称。",
    )
    description = models.CharField(
        max_length=240,
        blank=True,
        help_text="任务简介，将展示给用户。",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="附加元数据，保留扩展字段。",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-updated_at"]),
            models.Index(fields=["user", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.user})"

class DailyHistoryMessage(models.Model):
    date = models.DateField(unique=True)
    headline = models.CharField(
        max_length=128,
        blank=True,
        help_text="可选标题，例如节日名称。",
    )
    text = models.TextField(help_text="“历史上的今天”文案内容。")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.date}: {self.headline or self.text[:24]}"


class EncouragementMessage(models.Model):
    text = models.TextField(help_text="鼓励类文案，将随机展示。")
    weight = models.PositiveIntegerField(
        default=1,
        help_text="权重越高，被选中的概率越大。",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.text[:32]


class UploadConditionalMessage(models.Model):
    name = models.CharField(max_length=128, help_text="条件文案名称，便于后台识别。")
    text = models.TextField(help_text="满足条件时展示的文案内容。")
    priority = models.PositiveIntegerField(
        default=100,
        help_text="数字越小优先级越高。",
    )
    is_active = models.BooleanField(default=True)
    applies_when_no_upload = models.BooleanField(
        default=False,
        help_text="勾选后，若用户暂无上传记录也会匹配此文案。",
    )
    min_days_since_last_upload = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="距离上次上传的最少天数（含）。",
    )
    max_days_since_last_upload = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="距离上次上传的最多天数（含）。",
    )
    min_self_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="上一次自评分最低值（含）。",
    )
    max_self_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="上一次自评分最高值（含）。",
    )
    match_moods = models.JSONField(
        default=list,
        blank=True,
        help_text="限定心情标签（任意匹配一个即满足）。",
    )
    match_tags = models.JSONField(
        default=list,
        blank=True,
        help_text="限定作品标签（任意匹配一个即满足）。",
    )
    min_duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="创作时长最低值（含，单位：分钟）。",
    )
    max_duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="创作时长最高值（含，单位：分钟）。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "id"]

    def __str__(self):
        return self.name

    def matches_upload(self, upload: UserUpload | None, *, reference_time=None) -> bool:
        if not self.is_active:
            return False

        if upload is None:
            return self.applies_when_no_upload

        reference_time = reference_time or timezone.now()
        delta = reference_time - upload.uploaded_at
        days_since_last = delta.total_seconds() / 86400

        if self.min_days_since_last_upload is not None and days_since_last < self.min_days_since_last_upload:
            return False
        if self.max_days_since_last_upload is not None and days_since_last > self.max_days_since_last_upload:
            return False

        rating = upload.self_rating
        if rating is not None:
            if self.min_self_rating is not None and rating < self.min_self_rating:
                return False
            if self.max_self_rating is not None and rating > self.max_self_rating:
                return False
        elif self.min_self_rating is not None or self.max_self_rating is not None:
            # 没有评分但设定了评分条件，则不匹配。
            return False

        if self.min_duration_minutes is not None:
            duration = upload.duration_minutes
            if duration is None or duration < self.min_duration_minutes:
                return False
        if self.max_duration_minutes is not None:
            duration = upload.duration_minutes
            if duration is None or duration > self.max_duration_minutes:
                return False

        if self.match_moods:
            mood = (upload.mood_label or "").strip()
            if not mood or mood not in self.match_moods:
                return False

        if self.match_tags:
            tags = upload.tags or []
            if not any(tag in self.match_tags for tag in tags):
                return False

        return True


class DailyCheckIn(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="daily_checkins",
    )
    date = models.DateField()
    checked_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(
        max_length=32,
        blank=True,
        help_text="用于追踪打卡来源，例如 'app'、'admin'。",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"], name="unique_daily_checkin_per_user"
            )
        ]
        indexes = [
            models.Index(fields=["user", "-date"]),
        ]
        ordering = ["-date"]

    def __str__(self) -> str:
        return f"{self.user} @ {self.date:%Y-%m-%d}"


class AchievementGroup(models.Model):
    slug = models.SlugField(
        max_length=64,
        unique=True,
        help_text="成就组唯一标识，建议使用英文短标签。",
    )
    name = models.CharField(max_length=128, help_text="成就组名称。")
    description = models.TextField(blank=True, help_text="成就组描述或引导文案。")
    category = models.CharField(
        max_length=64,
        blank=True,
        help_text="可选分类标签，便于分组展示。",
    )
    icon = models.CharField(
        max_length=256,
        blank=True,
        help_text="成就组图标（URL 或资源标识）。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="用于排序，数值越小越靠前。",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="附加元数据，例如分组逻辑、展示配置等。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "slug"]
        verbose_name = "成就组"
        verbose_name_plural = "成就组"

    def __str__(self) -> str:
        return self.name


class Achievement(models.Model):
    """
    后台配置的成就信息，供业务系统判定和展示。

    条件字段允许存储灵活的 JSON 描述，例如：
    {
        "metric": "total_uploads",
        "operator": ">=",
        "threshold": 10
    }
    """

    group = models.ForeignKey(
        AchievementGroup,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="achievements",
        help_text="所属成就组，可为空表示独立成就。",
    )
    level = models.PositiveSmallIntegerField(
        default=1,
        help_text="在成就组内的层级，1 表示第一层。",
    )
    slug = models.SlugField(
        max_length=64,
        unique=True,
        help_text="唯一标识符，建议使用英文短标签。",
    )
    name = models.CharField(max_length=128, help_text="成就名称。")
    description = models.TextField(blank=True, help_text="成就描述文案。")
    category = models.CharField(
        max_length=64,
        blank=True,
        help_text="可选分类标签，便于分组展示。",
    )
    icon = models.CharField(
        max_length=256,
        blank=True,
        help_text="成就图标（URL 或资源标识）。",
    )
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="用于排序，数值越小越靠前。",
    )
    condition = models.JSONField(
        default=dict,
        blank=True,
        help_text="成就判定条件的 JSON 描述。",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="附加元数据，例如奖励值等。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "slug"]
        indexes = [
            models.Index(fields=["group", "level"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["group", "level"],
                name="core_achievement_unique_group_level",
                condition=models.Q(group__isnull=False),
            )
        ]

    def __str__(self) -> str:
        return self.name


class TestAccountProfile(models.Model):
    """
    测试账号的拓展信息，同时作为筛选标记。
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="test_profile",
    )
    display_name = models.CharField(
        max_length=128,
        blank=True,
        help_text="后台展示用昵称，默认为邮箱前缀。",
    )
    notes = models.TextField(
        blank=True,
        help_text="测试账号备注，例如用途、测试场景等。",
    )
    tags = models.JSONField(
        default=list,
        blank=True,
        help_text="自定义标签列表，便于分类筛选。",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="附加元数据，例如模拟配置。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user__email"]

    def __str__(self) -> str:
        return self.display_name or self.user.get_username()

    @property
    def email(self) -> str:
        return self.user.email or self.user.get_username()
