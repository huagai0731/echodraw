from django.contrib import admin
from django.db import models

from core.models import (
    Achievement,
    AchievementGroup,
    DailyHistoryMessage,
    EncouragementMessage,
    UserProfile,
    TestAccountProfile,
    UploadConditionalMessage,
    UserUpload,
)


class AchievementInline(admin.StackedInline):
    model = Achievement
    extra = 0
    show_change_link = False
    ordering = ("level", "display_order", "slug")
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "name",
                    "slug",
                    "level",
                    "category",
                    "description",
                    "icon",
                    "is_active",
                    "display_order",
                )
            },
        ),
        (
            "条件配置",
            {
                "fields": (
                    "condition",
                    "metadata",
                )
            },
        ),
    )
    formfield_overrides = {
        models.JSONField: {"widget": admin.widgets.AdminTextareaWidget},
    }


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


@admin.register(UserUpload)
class UserUploadAdmin(admin.ModelAdmin):
    list_display = ("user", "title", "uploaded_at", "self_rating", "mood_label", "duration_minutes")
    list_filter = ("mood_label",)
    search_fields = ("user__email", "title", "mood_label", "tags")
    ordering = ("-uploaded_at",)


@admin.register(AchievementGroup)
class AchievementGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "category", "display_order", "updated_at")
    search_fields = ("name", "slug", "description")
    ordering = ("display_order", "slug")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [AchievementInline]
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "name",
                    "slug",
                    "category",
                    "description",
                    "icon",
                    "display_order",
                )
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
        return super().get_queryset(request).prefetch_related("achievements")


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "category", "is_active", "display_order", "updated_at")
    list_filter = ("is_active", "category")
    search_fields = ("name", "slug", "description")
    ordering = ("display_order", "slug")
    prepopulated_fields = {"slug": ("name",)}
    formfield_overrides = {
        models.JSONField: {"widget": admin.widgets.AdminTextareaWidget},
    }
    fieldsets = (
        (
            "基础信息",
            {
                "fields": (
                    "name",
                    "slug",
                    "category",
                    "description",
                    "icon",
                    "is_active",
                    "display_order",
                )
            },
        ),
        ("条件与元数据", {"fields": ("condition", "metadata")}),
        ("时间戳", {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at")
    exclude = ("group", "level")

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(group__isnull=True)

    def save_model(self, request, obj, form, change):
        obj.group = None
        obj.level = 1
        super().save_model(request, obj, form, change)


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
