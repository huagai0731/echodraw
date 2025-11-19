from __future__ import annotations

import hashlib
import secrets
import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


def user_upload_path(instance, filename):
    """
    生成包含用户ID hash的文件路径，使用UUID作为文件名避免冲突。
    
    格式：uploads/{user_hash}/{uuid}.{ext}
    """
    user_hash = hashlib.md5(str(instance.user.id).encode()).hexdigest()[:8]
    # 使用UUID作为文件名，避免冲突
    file_ext = filename.split('.')[-1] if '.' in filename else 'webp'
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    return f"uploads/{user_hash}/{unique_filename}"


def daily_quiz_upload_path(instance, filename):
    """
    生成每日小测图片的文件路径，使用UUID作为文件名避免冲突。
    
    格式：daily_quiz/{uuid}.{ext}
    """
    file_ext = filename.split('.')[-1] if '.' in filename else 'webp'
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    return f"daily_quiz/{unique_filename}"


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
    # Token过期时间（天），默认30天
    TOKEN_EXPIRY_DAYS = 30
    
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="auth_token",
    )
    key = models.CharField(max_length=96, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Token过期时间，过期后需要重新登录"
    )

    class Meta:
        indexes = [
            models.Index(fields=["key"]),
            models.Index(fields=["expires_at"]),
        ]

    def save(self, *args, **kwargs):
        # 如果未设置过期时间，自动设置为创建时间+30天
        if not self.expires_at:
            from datetime import timedelta
            self.expires_at = timezone.now() + timedelta(days=self.TOKEN_EXPIRY_DAYS)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        """检查token是否已过期"""
        # 如果expires_at为None（旧数据），视为未过期，但会在下次使用时自动设置
        if self.expires_at is None:
            return False
        return timezone.now() >= self.expires_at

    @classmethod
    def issue_for_user(cls, user):
        from datetime import timedelta
        
        token, created = cls.objects.get_or_create(
            user=user,
            defaults={
                "key": generate_token_key(),
                "expires_at": timezone.now() + timedelta(days=cls.TOKEN_EXPIRY_DAYS),
            }
        )
        if not created:
            # 如果expires_at为None（旧数据），设置过期时间
            if token.expires_at is None:
                token.expires_at = timezone.now() + timedelta(days=cls.TOKEN_EXPIRY_DAYS)
            # 如果token已过期，生成新token
            elif token.is_expired:
                token.key = generate_token_key()
                token.expires_at = timezone.now() + timedelta(days=cls.TOKEN_EXPIRY_DAYS)
            token.last_used_at = timezone.now()
            # 根据是否有变更决定更新哪些字段
            update_fields = ["last_used_at"]
            if token.expires_at is None or token.is_expired:
                update_fields.extend(["key", "expires_at"])
            token.save(update_fields=update_fields)
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
    registration_number = models.PositiveIntegerField(
        unique=True,
        null=True,
        blank=True,
        help_text="用户注册编号，从1开始递增。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user__email"]
        verbose_name = "用户资料"
        verbose_name_plural = "用户资料"
        indexes = [
            models.Index(fields=["registration_number"]),  # 性能优化：为注册编号添加索引
        ]

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


class Tag(models.Model):
    """
    标签模型：存储用户自定义标签和预设标签。
    预设标签的user为None，自定义标签关联到具体用户。
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="custom_tags",
        null=True,
        blank=True,
        help_text="标签所属用户，None表示预设标签。",
    )
    name = models.CharField(
        max_length=24,
        help_text="标签名称，最多24个字符。",
    )
    is_preset = models.BooleanField(
        default=False,
        help_text="是否为预设标签。",
    )
    is_hidden = models.BooleanField(
        default=False,
        help_text="是否隐藏（用户可隐藏预设标签或自定义标签）。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="显示顺序，数值越小越靠前。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["is_preset", "is_hidden"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                condition=models.Q(user__isnull=False),
                name="unique_user_tag_name",
            ),
            models.UniqueConstraint(
                fields=["name"],
                condition=models.Q(user__isnull=True, is_preset=True),
                name="unique_preset_tag_name",
            ),
        ]
        ordering = ["display_order", "name"]

    def __str__(self):
        if self.is_preset:
            return f"[预设] {self.name}"
        return f"{self.user.email if self.user else 'Unknown'} - {self.name}"


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
    tags = models.ManyToManyField(
        Tag,
        related_name="uploads",
        blank=True,
        help_text="上传时选择的作品标签。",
    )
    # 保留旧的tags JSONField用于数据迁移，迁移完成后可删除
    tags_old = models.JSONField(
        default=list,
        blank=True,
        help_text="[已废弃] 旧版标签存储，仅用于数据迁移。",
    )
    duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="此次创作的时长（分钟）。",
    )
    notes = models.TextField(blank=True)
    image = models.ImageField(
        upload_to=user_upload_path,
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
    text = models.TextField(help_text="历史上的今天文案内容。")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.date}: {self.headline or self.text[:24]}"
    
    @classmethod
    def get_for_date(cls, target_date):
        """
        获取指定日期的历史文案（按月-日匹配，忽略年份）。
        
        Args:
            target_date: date 对象
            
        Returns:
            匹配的历史文案对象，如果没有则返回 None
        """
        return cls.objects.filter(
            date__month=target_date.month,
            date__day=target_date.day,
            is_active=True
        ).order_by("-date").first()


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
    checked_at = models.DateTimeField(auto_now=True, help_text="最后打卡时间，每次打卡都会更新")
    source = models.CharField(
        max_length=32,
        blank=True,
        help_text="用于追踪打卡来源，例如 'app'、'admin'。",
    )
    notes = models.TextField(
        blank=True,
        help_text="用户为这一天留下的备注或感想。",
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


class ShortTermGoalTaskCompletion(models.Model):
    """
    短期目标任务完成记录，用于存储用户为每个任务选择的上传作品。
    """
    goal = models.ForeignKey(
        ShortTermGoal,
        on_delete=models.CASCADE,
        related_name="task_completions",
        help_text="关联的短期目标。",
    )
    task_id = models.CharField(
        max_length=64,
        help_text="任务ID，对应schedule中的taskId。",
    )
    upload = models.ForeignKey(
        UserUpload,
        on_delete=models.CASCADE,
        related_name="task_completions",
        help_text="用户为该任务选择的上传作品。",
    )
    date = models.DateField(
        help_text="完成日期，对应打卡日期。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["goal", "task_id", "date"],
                name="unique_task_completion_per_goal_task_date"
            )
        ]
        indexes = [
            models.Index(fields=["goal", "date"]),
            models.Index(fields=["goal", "task_id"]),
        ]
        ordering = ["-date", "task_id"]

    def __str__(self) -> str:
        return f"{self.goal.title} - Task {self.task_id} @ {self.date:%Y-%m-%d}"


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


class ConditionalMessage(models.Model):
    """
    条件文案：当用户达成某些条件时显示特定语句。
    例如：打卡满7天、连续打卡30天等。
    """
    name = models.CharField(max_length=128, help_text="条件文案名称，便于后台识别。")
    text = models.TextField(help_text="满足条件时展示的文案内容。")
    priority = models.PositiveIntegerField(
        default=100,
        help_text="数字越小优先级越高，当多个条件同时满足时，优先显示优先级高的。",
    )
    is_active = models.BooleanField(default=True)
    
    # 打卡相关条件
    min_total_checkins = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="总打卡次数最低值（含）。",
    )
    max_total_checkins = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="总打卡次数最高值（含）。",
    )
    min_streak_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="连续打卡天数最低值（含）。",
    )
    max_streak_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="连续打卡天数最高值（含）。",
    )
    
    # 上传相关条件
    min_total_uploads = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="总上传次数最低值（含）。",
    )
    max_total_uploads = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="总上传次数最高值（含）。",
    )
    
    # 上一次上传的条件
    match_last_upload_moods = models.JSONField(
        default=list,
        blank=True,
        help_text="限定上一次上传的心情标签（任意匹配一个即满足）。",
    )
    match_last_upload_tags = models.JSONField(
        default=list,
        blank=True,
        help_text="限定上一次上传的作品标签（任意匹配一个即满足）。",
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "id"]
        verbose_name = "条件文案"
        verbose_name_plural = "条件文案"

    def __str__(self):
        return self.name

    def matches_user(
        self,
        user,
        *,
        check_in_stats=None,
        total_uploads=None,
        last_upload=None,
    ) -> bool:
        """
        检查用户是否满足此条件文案的条件。
        
        Args:
            user: 用户对象
            check_in_stats: 打卡统计信息字典，包含 total_checkins 和 current_streak
            total_uploads: 总上传次数
            last_upload: 上一次上传记录（UserUpload 对象）
        """
        if not self.is_active:
            return False

        # 检查打卡条件
        if check_in_stats:
            total_checkins = check_in_stats.get("total_checkins", 0)
            current_streak = check_in_stats.get("current_streak", 0)
            
            # 确保类型一致（防止从数据库读取时是字符串）
            min_total_checkins = int(self.min_total_checkins) if self.min_total_checkins is not None else None
            max_total_checkins = int(self.max_total_checkins) if self.max_total_checkins is not None else None
            min_streak_days = int(self.min_streak_days) if self.min_streak_days is not None else None
            max_streak_days = int(self.max_streak_days) if self.max_streak_days is not None else None
            
            if min_total_checkins is not None and total_checkins < min_total_checkins:
                return False
            if max_total_checkins is not None and total_checkins > max_total_checkins:
                return False
            if min_streak_days is not None and current_streak < min_streak_days:
                return False
            if max_streak_days is not None and current_streak > max_streak_days:
                return False

        # 检查上传条件
        if total_uploads is not None:
            # 确保类型一致（防止从数据库读取时是字符串）
            min_total_uploads = int(self.min_total_uploads) if self.min_total_uploads is not None else None
            max_total_uploads = int(self.max_total_uploads) if self.max_total_uploads is not None else None
            
            if min_total_uploads is not None and total_uploads < min_total_uploads:
                return False
            if max_total_uploads is not None and total_uploads > max_total_uploads:
                return False

        # 检查上一次上传的心情和标签条件
        if self.match_last_upload_moods:
            if last_upload is None:
                return False
            mood = (last_upload.mood_label or "").strip()
            if not mood or mood not in self.match_last_upload_moods:
                return False

        if self.match_last_upload_tags:
            if last_upload is None:
                return False
            tags = last_upload.tags or []
            if not any(tag in self.match_last_upload_tags for tag in tags):
                return False

        return True


class HolidayMessage(models.Model):
    """
    节日文案：在特定日期显示特定文案。
    使用 month 和 day 字段存储月-日，年份使用固定值 2000（仅用于存储）。
    """
    month = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        help_text="月份（1-12）。",
    )
    day = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(31)],
        help_text="日期（1-31）。",
    )
    headline = models.CharField(
        max_length=128,
        blank=True,
        help_text="可选标题，例如节日名称。",
    )
    text = models.TextField(help_text="节日文案内容。")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["month", "day"]
        verbose_name = "节日文案"
        verbose_name_plural = "节日文案"

    def __str__(self):
        return f"{self.month:02d}-{self.day:02d}: {self.headline or self.text[:24]}"
    
    @classmethod
    def get_for_date(cls, target_date):
        """
        获取指定日期的节日文案。
        
        Args:
            target_date: date 对象
            
        Returns:
            匹配的节日文案对象，如果没有则返回 None
        """
        return cls.objects.filter(
            month=target_date.month,
            day=target_date.day,
            is_active=True
        ).order_by("id").first()


class TestDimension(models.Model):
    """
    测试维度：定义测试的评估维度，每个维度有两个端点。
    例如：维度1的两端是 o 和 M，维度2的两端是 A 和 B 等。
    """
    code = models.SlugField(
        max_length=32,
        unique=True,
        help_text="维度唯一标识，建议使用英文短标签。",
    )
    name = models.CharField(
        max_length=128,
        help_text="维度名称，例如：创作风格、情绪倾向等。",
    )
    endpoint_a_code = models.CharField(
        max_length=16,
        help_text="端点A的标识（例如：o）。",
    )
    endpoint_a_name = models.CharField(
        max_length=64,
        help_text="端点A的名称（例如：有序创作）。",
    )
    endpoint_b_code = models.CharField(
        max_length=16,
        help_text="端点B的标识（例如：M）。",
    )
    endpoint_b_name = models.CharField(
        max_length=64,
        help_text="端点B的名称（例如：自由创作）。",
    )
    description = models.TextField(
        blank=True,
        help_text="维度描述，说明该维度评估的内容。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="排序权重，数值越小越靠前。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "code"]
        verbose_name = "测试维度"
        verbose_name_plural = "测试维度"

    def __str__(self) -> str:
        return f"{self.name} ({self.endpoint_a_code} ↔ {self.endpoint_b_code})"


class Test(models.Model):
    """
    测试：心理测试或评估测试的基本信息。
    
    支持两种测试类型：
    1. TYPE_1: 第一种测试 - 有n个维度，每个维度有m道题，用户选择"非常同意/比较同意/中立/比较不同意/非常不同意"，
       每个选项对应某个维度的不同分数，最后相加某些维度对应题号的分数。
    2. TYPE_2: 第二种测试 - 给用户一个题目+4个具体内容选项，用户选择不同的选项会给不同的维度加分。
    """
    TYPE_1 = "type_1"
    TYPE_2 = "type_2"
    TEST_TYPE_CHOICES = [
        (TYPE_1, "类型1：5级选择（非常同意/比较同意/中立/比较不同意/非常不同意）"),
        (TYPE_2, "类型2：题目+4个选项（选择不同选项给不同维度加分）"),
    ]
    
    slug = models.SlugField(
        max_length=64,
        unique=True,
        help_text="测试唯一标识，建议使用英文短标签。",
    )
    name = models.CharField(
        max_length=128,
        help_text="测试名称，例如：创作风格评估、心境测试等。",
    )
    description = models.TextField(
        blank=True,
        help_text="测试描述，说明测试的目的和内容。",
    )
    test_type = models.CharField(
        max_length=16,
        choices=TEST_TYPE_CHOICES,
        default=TYPE_1,
        help_text="测试类型：类型1为5级选择，类型2为4个选项选择。",
    )
    dimensions = models.ManyToManyField(
        TestDimension,
        related_name="tests",
        help_text="该测试使用的维度。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="关闭后将从用户端隐藏该测试。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="排序权重，数值越小越靠前。",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="附加元数据，例如结果解释模板等。",
    )
    # 维度题目映射：存储每个维度对应的题目ID列表
    # 格式：{"dimension_id": [question_id1, question_id2, ...], ...}
    # 用于计算维度总分时，将指定题目的得分相加
    dimension_question_mapping = models.JSONField(
        default=dict,
        blank=True,
        help_text="维度题目映射，JSON格式。键为维度ID（字符串），值为该维度对应的题目ID列表。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "slug"]
        verbose_name = "测试"
        verbose_name_plural = "测试"

    def __str__(self) -> str:
        return self.name


class TestQuestion(models.Model):
    """
    测试题目：测试中的单个问题。
    
    根据测试类型不同，题目结构也不同：
    - 类型1（TYPE_1）：只有题目名称，没有选项文本。题目对应一个维度，用户通过5个圆圈选择强度（-2到2），
      表示"非常同意/比较同意/中立/比较不同意/非常不同意"。分值配置在 score_config 中。
    - 类型2（TYPE_2）：题目有4个选项文本，用户直接选择一个选项，选择后会给不同维度加分。
    """
    test = models.ForeignKey(
        Test,
        on_delete=models.CASCADE,
        related_name="questions",
        help_text="所属测试。",
    )
    question_text = models.TextField(
        help_text="题目文本，例如：你准备开始今天的绘画，却不知道先画什么：",
    )
    # 类型1使用：题目对应的维度
    dimension = models.ForeignKey(
        TestDimension,
        on_delete=models.CASCADE,
        related_name="type1_questions",
        null=True,
        blank=True,
        help_text="类型1使用：该题目对应的维度。",
    )
    # 类型1使用：5个选择强度对应的分值
    # 格式：{"-2": 2, "-1": 1, "0": 0, "1": 1, "2": 2}
    # 键为选择强度（-2到2），值为该维度端点在该强度下的得分
    score_config = models.JSONField(
        default=dict,
        blank=True,
        help_text="类型1使用：分值配置，JSON格式。键为选择强度（-2到2），值为该维度端点在该强度下的得分。",
    )
    # 类型1使用：该题目对应的维度端点代码
    endpoint_code = models.CharField(
        max_length=16,
        blank=True,
        help_text="类型1使用：该题目对应的维度端点代码（例如：o 或 M）。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="题目顺序，数值越小越靠前。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="关闭后该题目将不显示。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["test", "display_order", "id"]
        verbose_name = "测试题目"
        verbose_name_plural = "测试题目"

    def __str__(self) -> str:
        return f"{self.test.name} - {self.question_text[:32]}"


class TestOptionText(models.Model):
    """
    测试选项文本：题目的选项文本，显示给用户。
    
    仅用于类型2（TYPE_2）：一个题目固定有4个选项文本，用户直接选择一个选项。
    """
    question = models.ForeignKey(
        TestQuestion,
        on_delete=models.CASCADE,
        related_name="option_texts",
        help_text="所属题目。",
    )
    text = models.CharField(
        max_length=256,
        help_text="选项文本，例如：会先翻之前的草稿或参考，找个入口。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="选项文本顺序，数值越小越靠前。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="关闭后该选项文本将不显示。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["question", "display_order", "id"]
        verbose_name = "测试选项文本"
        verbose_name_plural = "测试选项文本"

    def __str__(self) -> str:
        return f"{self.question.question_text[:24]} - {self.text[:32]}"


class TestOption(models.Model):
    """
    测试选项：关联选项文本和维度端点，配置分值。
    
    仅用于类型2（TYPE_2）：用户直接选择一个选项
    - 分值配置 score_config 格式：{"selected": 3} 或 {"value": 3}
    表示用户选择该选项时，该维度端点获得的分数。
    也可以使用简化格式，直接存储一个数值。
    
    例如：如果选项文本A对应维度o，配置为 {"selected": 3} 或 {"value": 3}
    表示用户选择该选项时，维度o加3分。
    """
    option_text = models.ForeignKey(
        TestOptionText,
        on_delete=models.CASCADE,
        related_name="options",
        help_text="所属选项文本。",
    )
    dimension = models.ForeignKey(
        TestDimension,
        on_delete=models.CASCADE,
        related_name="test_options",
        help_text="该选项对应的维度。",
    )
    endpoint_code = models.CharField(
        max_length=16,
        help_text="该选项对应的维度端点代码（例如：o 或 M）。",
    )
    # 分值配置：使用 JSON 存储不同选择强度的分值
    # 格式：{"-2": 2, "-1": 1, "0": 0, "1": 0, "2": 0}
    # 键为选择强度（-2到2），值为该维度端点在该强度下的得分
    score_config = models.JSONField(
        default=dict,
        help_text="分值配置，JSON格式。键为选择强度（-2到2），值为该维度端点在该强度下的得分。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="关闭后该选项将不生效。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["option_text", "id"]
        verbose_name = "测试选项"
        verbose_name_plural = "测试选项"

    def __str__(self) -> str:
        return f"{self.option_text.text[:24]} -> {self.endpoint_code}"

    def get_score(self) -> int:
        """
        获取选择该选项时的分值（仅用于类型2）。
        
        Returns:
            选择该选项时的分值
        """
        # 类型2：直接选择该选项时的分值
        # 支持多种格式：{"selected": 3}, {"value": 3}, 或直接是数值
        if "selected" in self.score_config:
            return self.score_config.get("selected", 0)
        elif "value" in self.score_config:
            return self.score_config.get("value", 0)
        # 如果score_config是单个数值，直接返回
        elif isinstance(self.score_config, (int, float)):
            return int(self.score_config)
        # 默认返回0
        return 0


class UserTestResult(models.Model):
    """
    用户测试结果：存储用户完成测试后的结果。
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="test_results",
        help_text="完成测试的用户。",
    )
    test = models.ForeignKey(
        Test,
        on_delete=models.CASCADE,
        related_name="user_results",
        help_text="完成的测试。",
    )
    # 存储每个维度的得分
    # 格式：{"o": 5, "M": -3, "A": 2, "B": -1, ...}
    dimension_scores = models.JSONField(
        default=dict,
        help_text="各维度端点得分，JSON格式。键为端点代码，值为得分。",
    )
    # 存储用户的每个选择
    # 格式：{"question_id": {"option_id": intensity, ...}, ...}
    answers = models.JSONField(
        default=dict,
        help_text="用户的选择记录，JSON格式。",
    )
    completed_at = models.DateTimeField(
        default=timezone.now,
        help_text="完成测试的时间。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-completed_at"]
        indexes = [
            models.Index(fields=["user", "-completed_at"]),
            models.Index(fields=["test", "-completed_at"]),
        ]
        verbose_name = "用户测试结果"
        verbose_name_plural = "用户测试结果"

    def __str__(self) -> str:
        return f"{self.user} - {self.test.name} @ {self.completed_at:%Y-%m-%d %H:%M}"


class DailyQuiz(models.Model):
    """
    每日小测：每天一道题目，包含多个选项（文字或图片）。
    """
    date = models.DateField(
        unique=True,
        help_text="小测日期，每天只能有一个小测。",
    )
    question_text = models.TextField(
        help_text="题目文本。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="排序权重，数值越小越靠前。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="关闭后该小测将不显示。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        indexes = [
            models.Index(fields=["-date"]),
            models.Index(fields=["is_active", "-date"]),
        ]
        verbose_name = "每日小测"
        verbose_name_plural = "每日小测"

    def __str__(self) -> str:
        return f"{self.date:%Y-%m-%d}: {self.question_text[:32]}"


class DailyQuizOption(models.Model):
    """
    每日小测选项：可以是文字或图片。
    """
    OPTION_TYPE_TEXT = "text"
    OPTION_TYPE_IMAGE = "image"
    OPTION_TYPE_CHOICES = [
        (OPTION_TYPE_TEXT, "文字"),
        (OPTION_TYPE_IMAGE, "图片"),
    ]

    quiz = models.ForeignKey(
        DailyQuiz,
        on_delete=models.CASCADE,
        related_name="options",
        help_text="所属每日小测。",
    )
    option_type = models.CharField(
        max_length=16,
        choices=OPTION_TYPE_CHOICES,
        default=OPTION_TYPE_TEXT,
        help_text="选项类型：文字或图片。",
    )
    text = models.CharField(
        max_length=256,
        blank=True,
        help_text="选项文字（当选项类型为文字时使用）。",
    )
    image = models.ImageField(
        upload_to=daily_quiz_upload_path,
        blank=True,
        null=True,
        help_text="选项图片（当选项类型为图片时使用）。",
    )
    display_order = models.PositiveIntegerField(
        default=100,
        help_text="选项顺序，数值越小越靠前。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="关闭后该选项将不显示。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["quiz", "display_order", "id"]
        indexes = [
            models.Index(fields=["quiz", "display_order"]),
        ]
        verbose_name = "每日小测选项"
        verbose_name_plural = "每日小测选项"

    def __str__(self) -> str:
        if self.option_type == self.OPTION_TYPE_IMAGE:
            return f"{self.quiz.date:%Y-%m-%d} - 图片选项"
        return f"{self.quiz.date:%Y-%m-%d} - {self.text[:32]}"


class MonthlyReportTemplate(models.Model):
    """
    月报文案模板：根据用户数据生成个性化月报文案。
    支持不同部分（月度摘要、节点回顾、创作深度等）的条件化文案模板。
    """
    SECTION_MONTHLY_SUMMARY = "monthly_summary"  # 月度摘要
    SECTION_RHYTHM = "rhythm"  # 节律与习惯
    SECTION_TAGS = "tags"  # 标签快照
    SECTION_MILESTONE_REVIEW = "milestone_review"  # 节点回顾
    SECTION_CREATIVE_DEPTH = "creative_depth"  # 创作深度
    SECTION_TREND_COMPARISON = "trend_comparison"  # 趋势对比
    SECTION_PERSONALIZED_INSIGHT = "personalized_insight"  # 个性化洞察
    
    SECTION_CHOICES = [
        (SECTION_MONTHLY_SUMMARY, "月度摘要"),
        (SECTION_RHYTHM, "节律与习惯"),
        (SECTION_TAGS, "标签快照"),
        (SECTION_MILESTONE_REVIEW, "节点回顾"),
        (SECTION_CREATIVE_DEPTH, "创作深度"),
        (SECTION_TREND_COMPARISON, "趋势对比"),
        (SECTION_PERSONALIZED_INSIGHT, "个性化洞察"),
    ]
    
    CREATOR_TYPE_FRAGMENTED = "fragmented"  # 碎片型创作者
    CREATOR_TYPE_FOCUSED = "focused"  # 专注型创作者
    CREATOR_TYPE_BALANCED = "balanced"  # 平衡型创作者
    
    CREATOR_TYPE_CHOICES = [
        (CREATOR_TYPE_FRAGMENTED, "碎片型创作者"),
        (CREATOR_TYPE_FOCUSED, "专注型创作者"),
        (CREATOR_TYPE_BALANCED, "平衡型创作者"),
    ]
    
    section = models.CharField(
        max_length=64,
        choices=SECTION_CHOICES,
        help_text="月报部分标识。",
    )
    name = models.CharField(
        max_length=128,
        help_text="模板名称，便于后台识别。",
    )
    text_template = models.TextField(
        help_text="文案模板，支持变量：{count}（上传数）、{hours}（总时长）、{avg_hours}（平均时长）、{creator_type}（创作类型）、{rating}（平均评分）、{trend}（趋势描述）等。",
    )
    priority = models.PositiveIntegerField(
        default=100,
        help_text="优先级，数字越小优先级越高。当多个条件同时满足时，优先显示优先级高的。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="是否启用此模板。",
    )
    
    # 条件规则
    # 上传相关条件
    min_total_uploads = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="本月上传总数最低值（含）。",
    )
    max_total_uploads = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="本月上传总数最高值（含）。",
    )
    
    # 时长相关条件
    min_total_hours = models.FloatField(
        null=True,
        blank=True,
        help_text="本月总时长最低值（小时，含）。",
    )
    max_total_hours = models.FloatField(
        null=True,
        blank=True,
        help_text="本月总时长最高值（小时，含）。",
    )
    min_avg_hours = models.FloatField(
        null=True,
        blank=True,
        help_text="平均单张时长最低值（小时，含）。",
    )
    max_avg_hours = models.FloatField(
        null=True,
        blank=True,
        help_text="平均单张时长最高值（小时，含）。",
    )
    
    # 创作类型条件
    creator_type = models.CharField(
        max_length=32,
        choices=CREATOR_TYPE_CHOICES,
        null=True,
        blank=True,
        help_text="限定创作类型（碎片型、专注型、平衡型）。",
    )
    
    # 评分相关条件
    min_avg_rating = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="平均自评分最低值（含），范围 0-100。",
    )
    max_avg_rating = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text="平均自评分最高值（含），范围 0-100。",
    )
    
    # 与上月对比条件
    uploads_change_direction = models.CharField(
        max_length=16,
        choices=[
            ("increase", "增加"),
            ("decrease", "减少"),
            ("stable", "稳定"),
        ],
        null=True,
        blank=True,
        help_text="与上月相比上传数的变化方向。",
    )
    hours_change_direction = models.CharField(
        max_length=16,
        choices=[
            ("increase", "增加"),
            ("decrease", "减少"),
            ("stable", "稳定"),
        ],
        null=True,
        blank=True,
        help_text="与上月相比总时长的变化方向。",
    )
    
    # 其他条件（JSON格式，便于扩展）
    extra_conditions = models.JSONField(
        default=dict,
        blank=True,
        help_text="其他扩展条件（JSON格式）。",
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["section", "priority", "id"]
        indexes = [
            models.Index(fields=["section", "is_active", "priority"]),
        ]
        verbose_name = "月报文案模板"
        verbose_name_plural = "月报文案模板"

    def __str__(self) -> str:
        return f"{self.get_section_display()}: {self.name}"

    def matches_conditions(
        self,
        *,
        total_uploads: int | None = None,
        total_hours: float | None = None,
        avg_hours: float | None = None,
        creator_type: str | None = None,
        avg_rating: float | None = None,
        uploads_change: str | None = None,  # "increase", "decrease", "stable"
        hours_change: str | None = None,  # "increase", "decrease", "stable"
    ) -> bool:
        """
        检查是否满足此模板的条件。
        
        Args:
            total_uploads: 本月上传总数
            total_hours: 本月总时长（小时）
            avg_hours: 平均单张时长（小时）
            creator_type: 创作类型
            avg_rating: 平均自评分
            uploads_change: 与上月相比上传数的变化方向
            hours_change: 与上月相比总时长的变化方向
        """
        if not self.is_active:
            return False
        
        # 检查上传条件
        if total_uploads is not None:
            # 确保类型一致（防止从数据库读取时是字符串）
            min_total_uploads = int(self.min_total_uploads) if self.min_total_uploads is not None else None
            max_total_uploads = int(self.max_total_uploads) if self.max_total_uploads is not None else None
            
            if min_total_uploads is not None and total_uploads < min_total_uploads:
                return False
            if max_total_uploads is not None and total_uploads > max_total_uploads:
                return False
        
        # 检查时长条件
        if total_hours is not None:
            # 确保类型一致（防止从数据库读取时是字符串）
            min_total_hours = float(self.min_total_hours) if self.min_total_hours is not None else None
            max_total_hours = float(self.max_total_hours) if self.max_total_hours is not None else None
            
            if min_total_hours is not None and total_hours < min_total_hours:
                return False
            if max_total_hours is not None and total_hours > max_total_hours:
                return False
        
        if avg_hours is not None:
            # 确保类型一致（防止从数据库读取时是字符串）
            min_avg_hours = float(self.min_avg_hours) if self.min_avg_hours is not None else None
            max_avg_hours = float(self.max_avg_hours) if self.max_avg_hours is not None else None
            
            if min_avg_hours is not None and avg_hours < min_avg_hours:
                return False
            if max_avg_hours is not None and avg_hours > max_avg_hours:
                return False
        
        # 检查创作类型条件
        if self.creator_type and creator_type != self.creator_type:
            return False
        
        # 检查评分条件
        if avg_rating is not None:
            if self.min_avg_rating is not None and avg_rating < self.min_avg_rating:
                return False
            if self.max_avg_rating is not None and avg_rating > self.max_avg_rating:
                return False
        
        # 检查变化方向条件
        if self.uploads_change_direction and uploads_change != self.uploads_change_direction:
            return False
        if self.hours_change_direction and hours_change != self.hours_change_direction:
            return False
        
        return True
    
    def render_template(
        self,
        *,
        count: int | None = None,
        hours: float | None = None,
        avg_hours: float | None = None,
        creator_type: str | None = None,
        rating: float | None = None,
        trend: str | None = None,
    ) -> str:
        """
        渲染文案模板，替换变量。
        
        Args:
            count: 上传数
            hours: 总时长
            avg_hours: 平均时长
            creator_type: 创作类型显示名称
            rating: 平均评分
            trend: 趋势描述
        """
        text = self.text_template
        
        # 替换变量
        if count is not None:
            text = text.replace("{count}", str(count))
        if hours is not None:
            text = text.replace("{hours}", f"{hours:.1f}")
        if avg_hours is not None:
            text = text.replace("{avg_hours}", f"{avg_hours:.1f}")
        if creator_type:
            text = text.replace("{creator_type}", creator_type)
        if rating is not None:
            text = text.replace("{rating}", f"{rating:.1f}")
        if trend:
            text = text.replace("{trend}", trend)
        
        return text


class Notification(models.Model):
    """
    系统通知：管理员可以创建并推送通知给所有用户。
    """
    title = models.CharField(
        max_length=256,
        help_text="通知标题。",
    )
    summary = models.CharField(
        max_length=512,
        help_text="通知摘要，显示在通知列表中。",
    )
    content = models.TextField(
        help_text="通知正文，显示在通知详情页。",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="是否启用此通知。",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["is_active", "-created_at"]),
        ]
        verbose_name = "系统通知"
        verbose_name_plural = "系统通知"

    def __str__(self) -> str:
        return self.title


class HighFiveCounter(models.Model):
    """击掌按钮点击计数器（单例模式）"""
    count = models.PositiveIntegerField(default=0, verbose_name="点击总数")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="更新时间")

    class Meta:
        verbose_name = "击掌计数器"
        verbose_name_plural = "击掌计数器"

    def __str__(self) -> str:
        return f"击掌计数: {self.count}"

    @classmethod
    def get_or_create_singleton(cls):
        """获取或创建单例实例"""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

    @classmethod
    def increment(cls, user=None, session_key=None):
        """增加计数（每个用户只能点击一次）"""
        # 延迟导入避免循环引用
        from core.models import HighFiveClick
        
        # 检查用户是否已经点击过
        if user and user.is_authenticated:
            # 已登录用户：检查是否已点击
            existing_click = HighFiveClick.objects.filter(user=user).first()
            if existing_click:
                counter = cls.get_or_create_singleton()
                return counter.count, False, existing_click.created_at  # 返回当前计数、是否成功和点击时间
        elif session_key:
            # 未登录用户：使用session_key检查
            existing_click = HighFiveClick.objects.filter(session_key=session_key).first()
            if existing_click:
                counter = cls.get_or_create_singleton()
                return counter.count, False, existing_click.created_at
        
        # 如果用户未点击过，增加计数并记录
        counter = cls.get_or_create_singleton()
        counter.count += 1
        counter.save(update_fields=["count", "updated_at"])
        
        # 记录点击
        click_record = HighFiveClick.objects.create(
            user=user if user and user.is_authenticated else None,
            session_key=session_key if not (user and user.is_authenticated) else None,
        )
        
        return counter.count, True, click_record.created_at

    @classmethod
    def get_count(cls):
        """获取当前计数"""
        counter = cls.get_or_create_singleton()
        return counter.count

    @classmethod
    def has_clicked(cls, user=None, session_key=None):
        """检查用户是否已经点击过，返回(是否已点击, 点击时间)"""
        # 延迟导入避免循环引用
        from core.models import HighFiveClick
        
        if user and user.is_authenticated:
            click_record = HighFiveClick.objects.filter(user=user).first()
            if click_record:
                return True, click_record.created_at
        elif session_key:
            click_record = HighFiveClick.objects.filter(session_key=session_key).first()
            if click_record:
                return True, click_record.created_at
        return False, None


class HighFiveClick(models.Model):
    """击掌点击记录（防止重复点击）"""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="high_five_clicks",
        verbose_name="用户",
    )
    session_key = models.CharField(
        max_length=40,
        null=True,
        blank=True,
        db_index=True,
        verbose_name="Session Key（未登录用户）",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="点击时间")

    class Meta:
        verbose_name = "击掌点击记录"
        verbose_name_plural = "击掌点击记录"
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["session_key"]),
        ]
        # 确保每个用户或session只能有一条记录
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(user__isnull=False),
                name="unique_user_high_five",
            ),
            models.UniqueConstraint(
                fields=["session_key"],
                condition=models.Q(session_key__isnull=False),
                name="unique_session_high_five",
            ),
        ]

    def __str__(self) -> str:
        if self.user:
            return f"{self.user.email} - {self.created_at}"
        return f"Session {self.session_key} - {self.created_at}"


class LoginAttempt(models.Model):
    """
    登录尝试记录：用于追踪登录失败次数，防止暴力破解攻击。
    
    与EmailVerification表分离，避免混淆验证码和登录失败记录。
    """
    email = models.EmailField(db_index=True, help_text="尝试登录的邮箱地址")
    ip_address = models.CharField(max_length=45, db_index=True, help_text="客户端IP地址")
    success = models.BooleanField(default=False, help_text="登录是否成功")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["email", "-created_at"]),
            models.Index(fields=["ip_address", "-created_at"]),
            models.Index(fields=["created_at"]),
        ]
        verbose_name = "登录尝试记录"
        verbose_name_plural = "登录尝试记录"

    def __str__(self) -> str:
        status = "成功" if self.success else "失败"
        return f"{self.email} @ {self.ip_address} - {status} - {self.created_at}"
