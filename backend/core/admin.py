from django.contrib import admin
from django.db import models

from core.models import (
    ConditionalMessage,
    DailyHistoryMessage,
    DailyQuiz,
    DailyQuizOption,
    EncouragementMessage,
    HighFiveClick,
    HighFiveCounter,
    HolidayMessage,
    MonthlyReport,
    MonthlyReportTemplate,
    UserProfile,
    TestAccountProfile,
    UploadConditionalMessage,
    UserUpload,
    Test,
    TestDimension,
    TestQuestion,
    TestOptionText,
    TestOption,
    UserTestResult,
)


@admin.register(DailyHistoryMessage)
class DailyHistoryMessageAdmin(admin.ModelAdmin):
    list_display = ("date", "headline", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("headline", "text")
    ordering = ("-date",)


@admin.register(EncouragementMessage)
class EncouragementMessageAdmin(admin.ModelAdmin):
    list_display = ("preview", "weight", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("text",)
    ordering = ("-updated_at",)

    @staticmethod
    def preview(obj: EncouragementMessage) -> str:
        return obj.text[:32]


@admin.register(ConditionalMessage)
class ConditionalMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "priority", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "text")
    ordering = ("priority", "name")
    fieldsets = (
        (
            "基础信息",
            {"fields": ("name", "text", "priority", "is_active")},
        ),
        (
            "打卡条件",
            {
                "fields": (
                    "min_total_checkins",
                    "max_total_checkins",
                    "min_streak_days",
                    "max_streak_days",
                )
            },
        ),
        (
            "上传条件",
            {"fields": ("min_total_uploads", "max_total_uploads")},
        ),
        (
            "上一次上传条件",
            {
                "fields": (
                    "match_last_upload_moods",
                    "match_last_upload_tags",
                )
            },
        ),
    )


@admin.register(HolidayMessage)
class HolidayMessageAdmin(admin.ModelAdmin):
    list_display = ("month", "day", "headline", "is_active", "updated_at")
    list_filter = ("is_active", "month")
    search_fields = ("headline", "text")
    ordering = ("month", "day")
    fieldsets = (
        (
            "基础信息",
            {"fields": ("month", "day", "headline", "text", "is_active")},
        ),
    )


@admin.register(UploadConditionalMessage)
class UploadConditionalMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "priority", "is_active", "applies_when_no_upload", "updated_at")
    list_filter = ("is_active", "applies_when_no_upload")
    search_fields = ("name", "text")
    ordering = ("priority", "name")
    fieldsets = (
        (
            "基础信息",
            {"fields": ("name", "text", "priority", "is_active", "applies_when_no_upload")},
        ),
        (
            "时间条件",
            {"fields": ("min_days_since_last_upload", "max_days_since_last_upload")},
        ),
        (
            "评分与时长条件",
            {
                "fields": (
                    "min_self_rating",
                    "max_self_rating",
                    "min_duration_minutes",
                    "max_duration_minutes",
                )
            },
        ),
        (
            "标签条件",
            {"fields": ("match_moods", "match_tags")},
        ),
    )


@admin.register(MonthlyReportTemplate)
class MonthlyReportTemplateAdmin(admin.ModelAdmin):
    list_display = ("section", "name", "priority", "is_active", "updated_at")
    list_filter = ("section", "is_active", "creator_type")
    search_fields = ("name", "text_template")
    ordering = ("section", "priority", "name")
    fieldsets = (
        (
            "基础信息",
            {"fields": ("section", "name", "text_template", "priority", "is_active")},
        ),
        (
            "上传条件",
            {"fields": ("min_total_uploads", "max_total_uploads")},
        ),
        (
            "时长条件",
            {"fields": ("min_total_hours", "max_total_hours", "min_avg_hours", "max_avg_hours")},
        ),
        (
            "创作类型与评分条件",
            {"fields": ("creator_type", "min_avg_rating", "max_avg_rating")},
        ),
        (
            "变化趋势条件",
            {"fields": ("uploads_change_direction", "hours_change_direction")},
        ),
        (
            "扩展条件",
            {"fields": ("extra_conditions",)},
        ),
    )
    formfield_overrides = {
        models.JSONField: {"widget": admin.widgets.AdminTextareaWidget},
    }


@admin.register(UserUpload)
class UserUploadAdmin(admin.ModelAdmin):
    list_display = ("user", "title", "uploaded_at", "self_rating", "mood_label", "duration_minutes")
    list_filter = ("mood_label",)
    search_fields = ("user__email", "title", "mood_label", "tags")
    ordering = ("-uploaded_at",)


@admin.register(TestAccountProfile)
class TestAccountProfileAdmin(admin.ModelAdmin):
    list_display = ("email", "display_name", "created_at", "updated_at")
    search_fields = ("user__email", "display_name", "notes")
    ordering = ("user__email",)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("email", "display_name", "updated_at")
    search_fields = ("user__email", "display_name", "signature")
    ordering = ("user__email",)

    @staticmethod
    def email(obj: UserProfile) -> str:
        return obj.user.email or obj.user.get_username()


# ==================== 测试管理 ====================

@admin.register(TestDimension)
class TestDimensionAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "endpoint_a_code", "endpoint_b_code", "display_order", "updated_at")
    list_filter = ("display_order",)
    search_fields = ("name", "code", "endpoint_a_code", "endpoint_b_code", "endpoint_a_name", "endpoint_b_name")
    ordering = ("display_order", "code")
    prepopulated_fields = {"code": ("name",)}
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "name",
                    "code",
                    "description",
                    "display_order",
                )
            },
        ),
        (
            "端点A",
            {
                "fields": (
                    "endpoint_a_code",
                    "endpoint_a_name",
                )
            },
        ),
        (
            "端点B",
            {
                "fields": (
                    "endpoint_b_code",
                    "endpoint_b_name",
                )
            },
        ),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")


class TestOptionInline(admin.TabularInline):
    model = TestOption
    extra = 1
    show_change_link = True
    ordering = ("id",)
    fields = (
        "dimension",
        "endpoint_code",
        "score_config",
        "is_active",
    )
    formfield_overrides = {
        models.JSONField: {"widget": admin.widgets.AdminTextareaWidget},
    }


class TestOptionTextInline(admin.StackedInline):
    model = TestOptionText
    extra = 1
    show_change_link = True
    ordering = ("display_order", "id")
    fieldsets = (
        (
            "选项文本",
            {
                "fields": (
                    "text",
                    "display_order",
                    "is_active",
                )
            },
        ),
    )


class TestQuestionInline(admin.StackedInline):
    model = TestQuestion
    extra = 1
    show_change_link = True
    ordering = ("display_order", "id")
    fieldsets = (
        (
            "题目内容",
            {
                "fields": (
                    "question_text",
                    "display_order",
                    "is_active",
                )
            },
        ),
    )


@admin.register(Test)
class TestAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "display_order", "question_count", "updated_at")
    list_filter = ("is_active", "display_order")
    search_fields = ("name", "slug", "description")
    ordering = ("display_order", "slug")
    prepopulated_fields = {"slug": ("name",)}
    filter_horizontal = ("dimensions",)
    inlines = [TestQuestionInline]
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "name",
                    "slug",
                    "description",
                    "is_active",
                    "display_order",
                )
            },
        ),
        (
            "维度配置",
            {
                "fields": ("dimensions",),
                "description": "选择该测试使用的维度。每个维度有两个端点，用户的选择会影响对应端点的得分。",
            },
        ),
        ("附加信息", {"fields": ("metadata",)}),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")
    formfield_overrides = {
        models.JSONField: {"widget": admin.widgets.AdminTextareaWidget},
    }

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("questions")

    @staticmethod
    def question_count(obj: Test) -> int:
        return obj.questions.count()


@admin.register(TestQuestion)
class TestQuestionAdmin(admin.ModelAdmin):
    list_display = ("test", "question_preview", "display_order", "option_text_count", "is_active", "updated_at")
    list_filter = ("test", "is_active", "display_order")
    search_fields = ("question_text", "test__name")
    ordering = ("test", "display_order", "id")
    inlines = [TestOptionTextInline]
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "test",
                    "question_text",
                    "display_order",
                    "is_active",
                )
            },
        ),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("test").prefetch_related("option_texts")

    @staticmethod
    def question_preview(obj: TestQuestion) -> str:
        return obj.question_text[:64] + ("..." if len(obj.question_text) > 64 else "")

    @staticmethod
    def option_text_count(obj: TestQuestion) -> int:
        return obj.option_texts.count()


@admin.register(TestOptionText)
class TestOptionTextAdmin(admin.ModelAdmin):
    list_display = ("question", "text_preview", "display_order", "option_count", "is_active", "updated_at")
    list_filter = ("question__test", "is_active", "display_order")
    search_fields = ("text", "question__question_text", "question__test__name")
    ordering = ("question", "display_order", "id")
    inlines = [TestOptionInline]
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "question",
                    "text",
                    "display_order",
                    "is_active",
                )
            },
        ),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("question", "question__test").prefetch_related("options")

    @staticmethod
    def text_preview(obj: TestOptionText) -> str:
        return obj.text[:64] + ("..." if len(obj.text) > 64 else "")

    @staticmethod
    def option_count(obj: TestOptionText) -> int:
        return obj.options.count()


@admin.register(TestOption)
class TestOptionAdmin(admin.ModelAdmin):
    list_display = (
        "option_text",
        "dimension",
        "endpoint_code",
        "is_active",
        "updated_at",
    )
    list_filter = ("dimension", "is_active", "option_text__question__test")
    search_fields = ("option_text__text", "option_text__question__question_text", "dimension__name", "endpoint_code")
    ordering = ("option_text", "id")
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "option_text",
                    "is_active",
                )
            },
        ),
        (
            "维度与分值配置",
            {
                "fields": (
                    "dimension",
                    "endpoint_code",
                    "score_config",
                ),
                "description": (
                    "选择该选项对应的维度和端点。"
                    "分值配置格式：{\"-2\": 2, \"-1\": 1, \"0\": 0, \"1\": 0, \"2\": 0}, "
                    "键为选择强度（-2到2），值为该维度端点在该强度下的得分。"
                    "例如：如果选项文本对应维度o，配置为{\"-2\": 2, \"-1\": 1, \"0\": 0, \"1\": 0, \"2\": 0}，"
                    "表示用户选择最左边（-2）时，维度o加2分；选择比较左边（-1）时，维度o加1分。"
                ),
            },
        ),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")
    formfield_overrides = {
        models.JSONField: {"widget": admin.widgets.AdminTextareaWidget},
    }

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("option_text", "option_text__question", "dimension")


@admin.register(UserTestResult)
class UserTestResultAdmin(admin.ModelAdmin):
    list_display = ("user", "test", "completed_at", "dimension_scores_preview", "updated_at")
    list_filter = ("test", "completed_at")
    search_fields = ("user__email", "test__name")
    ordering = ("-completed_at",)
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "user",
                    "test",
                    "completed_at",
                )
            },
        ),
        (
            "测试结果",
            {
                "fields": (
                    "dimension_scores",
                    "answers",
                ),
                "description": (
                    "dimension_scores: 各维度端点得分，格式：{\"o\": 5, \"M\": -3, ...}\n"
                    "answers: 用户的选择记录，格式：{\"question_id\": {\"option_id\": intensity}, ...}, ...}"
                ),
            },
        ),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    formfield_overrides = {
        models.JSONField: {"widget": admin.widgets.AdminTextareaWidget},
    }

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user", "test")

    @staticmethod
    def dimension_scores_preview(obj: UserTestResult) -> str:
        scores = obj.dimension_scores or {}
        if not scores:
            return "无得分"
        items = [f"{k}: {v}" for k, v in list(scores.items())[:3]]
        if len(scores) > 3:
            items.append(f"... (共{len(scores)}个)")
        return ", ".join(items)


# ==================== 每日小测 ====================

class DailyQuizOptionInline(admin.TabularInline):
    model = DailyQuizOption
    extra = 2
    fields = ("option_type", "text", "image", "display_order", "is_active")
    ordering = ("display_order", "id")


@admin.register(DailyQuiz)
class DailyQuizAdmin(admin.ModelAdmin):
    list_display = ("date", "question_preview", "option_count", "is_active", "updated_at")
    list_filter = ("is_active", "date")
    search_fields = ("question_text",)
    ordering = ("-date",)
    inlines = [DailyQuizOptionInline]
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "date",
                    "question_text",
                    "display_order",
                    "is_active",
                )
            },
        ),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related("options")

    @staticmethod
    def question_preview(obj: DailyQuiz) -> str:
        return obj.question_text[:64] + ("..." if len(obj.question_text) > 64 else "")

    @staticmethod
    def option_count(obj: DailyQuiz) -> int:
        return obj.options.count()


@admin.register(DailyQuizOption)
class DailyQuizOptionAdmin(admin.ModelAdmin):
    list_display = ("quiz", "option_type", "text_preview", "has_image", "display_order", "is_active", "updated_at")
    list_filter = ("option_type", "is_active", "quiz__date")
    search_fields = ("text", "quiz__question_text")
    ordering = ("quiz", "display_order", "id")
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "quiz",
                    "option_type",
                    "text",
                    "image",
                    "display_order",
                    "is_active",
                )
            },
        ),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("quiz")

    @staticmethod
    def text_preview(obj: DailyQuizOption) -> str:
        if obj.option_type == DailyQuizOption.OPTION_TYPE_IMAGE:
            return "[图片选项]"
        return obj.text[:64] + ("..." if len(obj.text) > 64 else "")

    @staticmethod
    def has_image(obj: DailyQuizOption) -> bool:
        return bool(obj.image)


@admin.register(HighFiveCounter)
class HighFiveCounterAdmin(admin.ModelAdmin):
    list_display = ("count", "updated_at")
    readonly_fields = ("count", "updated_at")
    
    def has_add_permission(self, request):
        # 只允许有一个实例
        return not HighFiveCounter.objects.exists()
    
    def has_delete_permission(self, request, obj=None):
        # 不允许删除
        return False


@admin.register(HighFiveClick)
class HighFiveClickAdmin(admin.ModelAdmin):
    list_display = ("user", "session_key", "created_at")
    list_filter = ("created_at",)
    search_fields = ("user__email", "session_key")
    readonly_fields = ("created_at",)
    ordering = ("-created_at",)


@admin.register(MonthlyReport)
class MonthlyReportAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "year", "month", "total_uploads", "total_hours", "created_at")
    list_filter = ("year", "month", "created_at")
    search_fields = ("user__email",)
    readonly_fields = ("created_at", "updated_at")
    ordering = ("-year", "-month", "-created_at")
    fieldsets = (
        ("基本信息", {
            "fields": ("user", "year", "month")
        }),
        ("统计数据", {
            "fields": (
                "total_uploads",
                "total_hours",
                "avg_hours_per_upload",
                "avg_rating",
                "most_upload_day_date",
                "most_upload_day_count",
                "current_streak",
                "longest_streak",
            )
        }),
        ("分布数据", {
            "fields": ("time_distribution", "weekly_distribution", "tag_stats", "heatmap_calendar"),
            "classes": ("collapse",),
        }),
        ("其他", {
            "fields": ("upload_ids", "report_texts", "created_at", "updated_at"),
            "classes": ("collapse",),
        }),
    )
