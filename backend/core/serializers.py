from __future__ import annotations

import json
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.urls import reverse
from rest_framework import serializers

from django.utils import timezone

from core.models import (
    Achievement,
    AchievementGroup,
    DailyCheckIn,
    DailyHistoryMessage,
    EncouragementMessage,
    LongTermGoal,
    LongTermPlanCopy,
    ShortTermGoal,
    ShortTermTaskPreset,
    TestAccountProfile,
    UploadConditionalMessage,
    UserTaskPreset,
    UserUpload,
    UserProfile,
)
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            "display_name",
            "signature",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
        extra_kwargs = {
            "display_name": {
                "allow_blank": True,
                "required": False,
                "trim_whitespace": True,
            },
            "signature": {
                "allow_blank": True,
                "required": False,
                "trim_whitespace": True,
            },
        }

    def validate_display_name(self, value: str) -> str:
        return value.strip()

    def validate_signature(self, value: str) -> str:
        return value.strip()

    def update(self, instance: UserProfile, validated_data: dict[str, Any]) -> UserProfile:
        display_name = validated_data.get("display_name", instance.display_name)
        signature = validated_data.get("signature", instance.signature)
        instance.update_preferences(
            display_name=display_name.strip(),
            signature=signature.strip(),
        )
        return instance



class UserUploadSerializer(serializers.ModelSerializer):
    description = serializers.CharField(
        source="notes",
        allow_blank=True,
        required=False,
        trim_whitespace=True,
    )
    image = serializers.ImageField(required=False, allow_null=True, use_url=True)
    tags = serializers.ListField(
        child=serializers.CharField(max_length=64),
        required=False,
        allow_empty=True,
    )

    class Meta:
        model = UserUpload
        fields = [
            "id",
            "title",
            "description",
            "uploaded_at",
            "self_rating",
            "mood_label",
            "tags",
            "duration_minutes",
            "image",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uploaded_at", "created_at", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if instance.image:
            if request is not None:
                proxy_url = reverse("core:user-upload-image", args=[instance.pk])
                data["image"] = request.build_absolute_uri(proxy_url)
            else:
                data["image"] = instance.image.url
        else:
            data["image"] = None
        return data

    def to_internal_value(self, data):
        mutable_data = data
        if hasattr(data, "copy"):
            mutable_data = data.copy()

        tags_value = mutable_data.get("tags")
        if isinstance(tags_value, str):
            parsed = self._parse_tags(tags_value)
            if parsed is not None:
                if hasattr(mutable_data, "setlist"):
                    mutable_data.setlist("tags", parsed)
                else:
                    mutable_data["tags"] = parsed

        title_value = mutable_data.get("title")
        if isinstance(title_value, str):
            trimmed = title_value.strip()
            if hasattr(mutable_data, "setlist"):
                mutable_data.setlist("title", [trimmed])
            else:
                mutable_data["title"] = trimmed

        description_value = mutable_data.get("description")
        if isinstance(description_value, str):
            trimmed = description_value.strip()
            if hasattr(mutable_data, "setlist"):
                mutable_data.setlist("description", [trimmed])
            else:
                mutable_data["description"] = trimmed

        return super().to_internal_value(mutable_data)

    @staticmethod
    def _parse_tags(value: str) -> list[str] | None:
        text = value.strip()
        if not text:
            return []

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = [item.strip() for item in text.split(",") if item.strip()]

        if isinstance(parsed, list):
            result: list[str] = []
            for item in parsed:
                if isinstance(item, str):
                    stripped = item.strip()
                    if stripped:
                        result.append(stripped)
            return result
        return []

    def validate_title(self, value: str) -> str:
        if len(value) > 120:
            raise serializers.ValidationError("标题长度不可超过 120 字符。")
        return value

    def validate_tags(self, value: list[str]) -> list[str]:
        sanitized: list[str] = []
        for item in value:
            if not isinstance(item, str):
                raise serializers.ValidationError("标签必须为字符串。")
            trimmed = item.strip()
            if trimmed:
                sanitized.append(trimmed)
        return sanitized


class ShortTermGoalTaskItemSerializer(serializers.Serializer):
    task_id = serializers.CharField(max_length=96)
    title = serializers.CharField(max_length=160)
    subtitle = serializers.CharField(max_length=240, allow_blank=True, required=False)

    def to_internal_value(self, data):
        payload = super().to_internal_value(data)
        payload["task_id"] = payload["task_id"].strip()
        payload["title"] = payload["title"].strip()
        payload["subtitle"] = payload.get("subtitle", "").strip()
        return payload


class ShortTermGoalDaySerializer(serializers.Serializer):
    day_index = serializers.IntegerField(min_value=0)
    tasks = ShortTermGoalTaskItemSerializer(many=True)


class ShortTermGoalSerializer(serializers.ModelSerializer):
    schedule = ShortTermGoalDaySerializer(many=True)

    class Meta:
        model = ShortTermGoal
        fields = [
            "id",
            "title",
            "duration_days",
            "plan_type",
            "schedule",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_title(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("挑战名称不能为空。")
        if len(text) > 160:
            raise serializers.ValidationError("挑战名称不可超过 160 字符。")
        return text

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        plan_type = attrs.get("plan_type") or getattr(self.instance, "plan_type", None)
        duration = attrs.get("duration_days") or getattr(
            self.instance, "duration_days", None
        )
        schedule = attrs.get("schedule")

        if plan_type not in {
            ShortTermGoal.PLAN_TYPE_SAME,
            ShortTermGoal.PLAN_TYPE_DIFFERENT,
        }:
            raise serializers.ValidationError({"plan_type": "未知的计划类型。"})

        if not duration or duration < 1:
            raise serializers.ValidationError({"duration_days": "持续天数至少为 1 天。"})

        if duration > 90:
            raise serializers.ValidationError({"duration_days": "持续天数不可超过 90 天。"})

        normalized_schedule = self._normalize_schedule(plan_type, duration, schedule)
        attrs["schedule"] = normalized_schedule
        return attrs

    def _normalize_schedule(
        self,
        plan_type: str,
        duration: int,
        schedule_data: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        if not schedule_data:
            return [] if plan_type == ShortTermGoal.PLAN_TYPE_DIFFERENT else [
                {"day_index": 0, "tasks": []}
            ]

        sanitized: dict[int, list[dict[str, str]]] = {}
        for entry in schedule_data:
            try:
                day_index = int(entry.get("day_index", 0))
            except (TypeError, ValueError):
                day_index = 0
            if day_index < 0:
                day_index = 0
            if day_index >= duration:
                day_index = duration - 1

            tasks = []

            for task in entry.get("tasks", []):
                task_id = (task.get("task_id") or "").strip()
                title = (task.get("title") or "").strip()
                subtitle = (task.get("subtitle") or "").strip()

                if not task_id and not title:
                    continue

                tasks.append(
                    {
                        "task_id": task_id or title[:96],
                        "title": title or task_id,
                        "subtitle": subtitle,
                    }
                )

            if tasks:
                sanitized.setdefault(day_index, [])
                sanitized[day_index].extend(tasks)

        if plan_type == ShortTermGoal.PLAN_TYPE_SAME:
            # 对于每日相同任务，仅保留首个日程作为共享任务。
            shared_tasks = []
            for index in sorted(sanitized.keys()):
                shared_tasks.extend(sanitized[index])
            return [{"day_index": 0, "tasks": shared_tasks}]

        # 对于每日不同任务，确保 day_index 单调且去重。
        normalized_list: list[dict[str, Any]] = []
        for index in range(duration):
            day_tasks = sanitized.get(index)
            if not day_tasks:
                continue
            normalized_list.append({"day_index": index, "tasks": day_tasks})

        return normalized_list

    def create(self, validated_data: dict[str, Any]) -> ShortTermGoal:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            raise serializers.ValidationError("无法识别当前用户。")
        return ShortTermGoal.objects.create(user=user, **validated_data)

    def update(self, instance: ShortTermGoal, validated_data: dict[str, Any]) -> ShortTermGoal:
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class ShortTermTaskPresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShortTermTaskPreset
        fields = [
            "id",
            "code",
            "category",
            "title",
            "description",
            "is_active",
            "display_order",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_code(self, value: str) -> str:
        text = (value or "").strip().lower()
        if not text:
            raise serializers.ValidationError("任务标识 code 不能为空。")
        if not text.replace("-", "").replace("_", "").isalnum():
            raise serializers.ValidationError("任务标识仅允许字母、数字、'-'、'_'。")
        return text

    def validate_category(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("分类不能为空。")
        if len(text) > 64:
            raise serializers.ValidationError("分类长度不可超过 64 字符。")
        return text

    def validate_title(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("任务名称不能为空。")
        if len(text) > 160:
            raise serializers.ValidationError("任务名称不可超过 160 字符。")
        return text

    def validate_description(self, value: str) -> str:
        text = (value or "").strip()
        if len(text) > 240:
            raise serializers.ValidationError("任务简介不可超过 240 字符。")
        return text


class LongTermPlanCopySerializer(serializers.ModelSerializer):
    class Meta:
        model = LongTermPlanCopy
        fields = [
            "id",
            "min_hours",
            "max_hours",
            "message",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_message(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("提示文案不能为空。")
        if len(text) > 600:
            raise serializers.ValidationError("提示文案不可超过 600 字符。")
        return text

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        min_hours = attrs.get("min_hours")
        max_hours = attrs.get("max_hours", None)
        if min_hours is None or min_hours < 0:
            raise serializers.ValidationError({"min_hours": "最小时长需为不小于 0 的整数。"})
        if max_hours is not None and max_hours < min_hours:
            raise serializers.ValidationError({"max_hours": "最大时长需不小于最小时长。"})
        return attrs


class LongTermPlanCopyPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = LongTermPlanCopy
        fields = [
            "id",
            "min_hours",
            "max_hours",
            "message",
        ]

class ShortTermTaskPresetPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShortTermTaskPreset
        fields = [
            "code",
            "category",
            "title",
            "description",
            "metadata",
        ]


class UserTaskPresetSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserTaskPreset
        fields = [
            "id",
            "slug",
            "title",
            "description",
            "metadata",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "is_active", "created_at", "updated_at"]
        extra_kwargs = {
            "title": {
                "required": True,
                "allow_blank": False,
                "trim_whitespace": True,
            },
            "description": {
                "required": False,
                "allow_blank": True,
                "trim_whitespace": True,
            },
        }

    def validate_title(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("任务名称不能为空。")
        if len(text) > 160:
            raise serializers.ValidationError("任务名称不可超过 160 字符。")
        return text

    def validate_description(self, value: str) -> str:
        text = (value or "").strip()
        if len(text) > 240:
            raise serializers.ValidationError("任务简介不可超过 240 字符。")
        return text

    def validate_metadata(self, value: Any) -> dict[str, Any]:
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("metadata 必须是对象。")
        return value


class UserTaskPresetPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserTaskPreset
        fields = [
            "id",
            "slug",
            "title",
            "description",
            "metadata",
            "created_at",
            "updated_at",
        ]


class LongTermGoalSerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()
    checkpoints = serializers.SerializerMethodField()

    class Meta:
        model = LongTermGoal
        fields = [
            "id",
            "title",
            "description",
            "target_hours",
            "checkpoint_count",
            "started_at",
            "created_at",
            "updated_at",
            "progress",
            "checkpoints",
        ]
        read_only_fields = [
            "id",
            "started_at",
            "created_at",
            "updated_at",
            "progress",
            "checkpoints",
        ]

    def get_progress(self, obj: LongTermGoal) -> dict[str, object]:
        stats = self._ensure_goal_stats(obj)
        total_minutes = stats["total_minutes"]
        target_minutes = obj.target_hours * 60
        ratio = total_minutes / target_minutes if target_minutes > 0 else 0
        ratio = max(0.0, min(ratio, 1.0))
        elapsed = timezone.now() - obj.started_at
        elapsed_days = max(elapsed.days + 1, 1)
        checkpoints = stats["checkpoints"]
        completed_checkpoints = sum(1 for checkpoint in checkpoints if checkpoint["status"] == "completed")
        next_checkpoint = None
        for checkpoint in checkpoints:
            if checkpoint["status"] != "completed":
                next_checkpoint = checkpoint["index"]
                break

        return {
            "spentMinutes": total_minutes,
            "spentHours": round(total_minutes / 60, 2),
            "progressRatio": ratio,
            "progressPercent": round(ratio * 100),
            "targetHours": obj.target_hours,
            "elapsedDays": elapsed_days,
            "completedCheckpoints": completed_checkpoints,
            "totalCheckpoints": obj.checkpoint_count,
            "nextCheckpoint": next_checkpoint,
            "startedDate": timezone.localdate(obj.started_at).isoformat(),
        }

    def get_checkpoints(self, obj: LongTermGoal) -> list[dict[str, object]]:
        stats = self._ensure_goal_stats(obj)
        return stats["checkpoints"]

    def _ensure_goal_stats(self, obj: LongTermGoal) -> dict[str, object]:
        cache = self.context.setdefault("_goal_cache", {})
        cache_key = f"goal:{obj.pk}"
        if cache_key in cache:
            return cache[cache_key]

        uploads = self._resolve_uploads(obj)
        entries: list[dict[str, object]] = []
        cumulative = 0
        for upload in uploads:
            minutes = self._safe_minutes(upload.duration_minutes)
            if minutes <= 0:
                continue
            cumulative += minutes
            entries.append({"upload": upload, "cumulative": cumulative})

        checkpoints = self._build_checkpoints(obj, entries)

        stats = {
            "uploads": uploads,
            "progress_entries": entries,
            "total_minutes": cumulative,
            "checkpoints": checkpoints,
        }
        cache[cache_key] = stats
        return stats

    def _resolve_uploads(self, obj: LongTermGoal) -> list[UserUpload]:
        uploads = self.context.get("uploads")
        if uploads is not None:
            return uploads
        return list(
            UserUpload.objects.filter(user=obj.user, uploaded_at__gte=obj.started_at)
            .order_by("uploaded_at", "id")
        )

    def _build_checkpoints(
        self,
        obj: LongTermGoal,
        entries: list[dict[str, object]],
    ) -> list[dict[str, object]]:
        checkpoints: list[dict[str, object]] = []
        per_checkpoint_minutes = obj.target_hours * 60 / obj.checkpoint_count
        first_open_index: int | None = None

        for index in range(obj.checkpoint_count):
            threshold_minutes = per_checkpoint_minutes * (index + 1)
            entry = next((item for item in entries if item["cumulative"] >= threshold_minutes), None)

            if entry:
                status = "completed"
                reached_minutes = entry["cumulative"]
                upload = entry["upload"]
                reached_at = timezone.localtime(upload.uploaded_at)
                upload_payload = self._serialize_upload(upload)
            else:
                status = "upcoming"
                reached_minutes = None
                reached_at = None
                upload_payload = None

            if status == "upcoming" and first_open_index is None:
                status = "current"
                first_open_index = index

            checkpoint_payload = {
                "index": index + 1,
                "label": f"Checkpoint {index + 1:02d}",
                "status": status,
                "targetHours": round(threshold_minutes / 60, 2),
                "thresholdMinutes": threshold_minutes,
                "reachedMinutes": reached_minutes,
                "reachedAt": reached_at.isoformat() if reached_at else None,
                "upload": upload_payload,
            }
            checkpoints.append(checkpoint_payload)

        return checkpoints

    def _serialize_upload(self, upload: UserUpload) -> dict[str, object]:
        localized = timezone.localtime(upload.uploaded_at)
        request = self.context.get("request")
        image_url = None
        if upload.image:
            image_url = upload.image.url
            if request:
                image_url = request.build_absolute_uri(image_url)

        return {
            "id": upload.id,
            "title": upload.title,
            "description": upload.notes,
            "uploadedAt": localized.isoformat(),
            "uploadedDate": localized.date().isoformat(),
            "durationMinutes": upload.duration_minutes,
            "selfRating": upload.self_rating,
            "moodLabel": upload.mood_label,
            "tags": upload.tags,
            "image": image_url,
        }

    @staticmethod
    def _safe_minutes(value: int | None) -> int:
        if value is None:
            return 0
        return max(int(value), 0)


class LongTermGoalSetupSerializer(serializers.Serializer):
    title = serializers.CharField(
        max_length=160,
        allow_blank=True,
        required=False,
        trim_whitespace=True,
    )
    description = serializers.CharField(
        allow_blank=True,
        required=False,
        max_length=1000,
        trim_whitespace=True,
    )
    target_hours = serializers.IntegerField(min_value=1, max_value=5000)
    checkpoint_count = serializers.IntegerField(min_value=1, max_value=90)
    reset_progress = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        title = attrs.get("title", "")
        if not title:
            attrs["title"] = f"{attrs['target_hours']} 小时计划"
        return attrs

class DailyHistoryMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyHistoryMessage
        fields = [
            "id",
            "date",
            "headline",
            "text",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class EncouragementMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = EncouragementMessage
        fields = [
            "id",
            "text",
            "weight",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class UploadConditionalMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadConditionalMessage
        fields = [
            "id",
            "name",
            "text",
            "priority",
            "is_active",
            "applies_when_no_upload",
            "min_days_since_last_upload",
            "max_days_since_last_upload",
            "min_self_rating",
            "max_self_rating",
            "min_duration_minutes",
            "max_duration_minutes",
            "match_moods",
            "match_tags",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class GroupAchievementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Achievement
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "category",
            "icon",
            "is_active",
            "display_order",
            "level",
            "condition",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AchievementGroupSerializer(serializers.ModelSerializer):
    achievements = GroupAchievementSerializer(many=True, read_only=True)

    class Meta:
        model = AchievementGroup
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "category",
            "icon",
            "display_order",
            "metadata",
            "created_at",
            "updated_at",
            "achievements",
        ]
        read_only_fields = ["created_at", "updated_at", "achievements"]


class AchievementSerializer(serializers.ModelSerializer):
    group = serializers.PrimaryKeyRelatedField(
        queryset=AchievementGroup.objects.all(),
        allow_null=True,
        required=False,
    )

    class Meta:
        model = Achievement
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "category",
            "icon",
            "is_active",
            "display_order",
            "group",
            "level",
            "condition",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_slug(self, value: str) -> str:
        if not value:
            raise serializers.ValidationError("slug 不能为空。")
        if not value.replace("-", "").replace("_", "").isalnum():
            raise serializers.ValidationError("slug 仅允许字母、数字、'-'、'_'。")
        return value.lower()


class TestAccountSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email")
    is_active = serializers.BooleanField(source="user.is_active", required=False)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = TestAccountProfile
        fields = [
            "id",
            "user_id",
            "email",
            "display_name",
            "notes",
            "tags",
            "metadata",
            "is_active",
            "last_login",
            "password",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "last_login", "user_id"]

    def validate_password(self, value: str) -> str:
        if value and len(value) < 8:
            raise serializers.ValidationError("密码至少 8 位。")
        return value

    def create(self, validated_data: dict[str, Any]) -> TestAccountProfile:
        user_data = validated_data.pop("user", {})
        email = user_data.get("email")
        password = validated_data.pop("password", None) or None
        is_active = user_data.get("is_active", True)

        user_model = get_user_model()
        if user_model.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({"email": "该邮箱已存在。"})

        display_name = validated_data.pop("display_name", "") or (email.split("@")[0] if email else "")

        with transaction.atomic():
            user = user_model.objects.create_user(
                username=email,
                email=email,
                password=password or user_model.objects.make_random_password(),
            )
            user.is_active = is_active
            user.save(update_fields=["is_active"])

            profile = TestAccountProfile.objects.create(
                user=user,
                display_name=display_name,
                **validated_data,
            )

        if password:
            profile.user.set_password(password)
            profile.user.save(update_fields=["password"])

        return profile

    def update(self, instance: TestAccountProfile, validated_data: dict[str, Any]) -> TestAccountProfile:
        user_data = validated_data.pop("user", {})
        password = validated_data.pop("password", None)

        if "email" in user_data:
            new_email = user_data["email"]
            if (
                new_email
                and new_email.lower() != instance.user.email.lower()
                and get_user_model().objects.filter(email__iexact=new_email).exclude(pk=instance.user.pk).exists()
            ):
                raise serializers.ValidationError({"email": "该邮箱已被使用。"})
            instance.user.email = new_email
            instance.user.username = new_email

        if "is_active" in user_data:
            instance.user.is_active = user_data["is_active"]

        if password:
            instance.user.set_password(password)

        instance.user.save()

        for field, value in validated_data.items():
            setattr(instance, field, value)

        if not instance.display_name:
            instance.display_name = instance.user.email.split("@")[0]

        instance.save()
        return instance


class TestAccountCheckInSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyCheckIn
        fields = [
            "id",
            "date",
            "checked_at",
            "source",
        ]
        read_only_fields = ["checked_at"]


class TestAccountUploadSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True, use_url=True)
    clear_image = serializers.BooleanField(required=False, write_only=True, default=False)

    class Meta:
        model = UserUpload
        fields = [
            "id",
            "title",
            "uploaded_at",
            "self_rating",
            "mood_label",
            "tags",
            "duration_minutes",
            "notes",
            "image",
            "clear_image",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def create(self, validated_data: dict[str, Any]) -> UserUpload:
        validated_data.pop("clear_image", None)
        return super().create(validated_data)

    def update(self, instance: UserUpload, validated_data: dict[str, Any]) -> UserUpload:
        clear_image = validated_data.pop("clear_image", False)
        image_provided = "image" in validated_data

        if clear_image:
            if instance.image:
                instance.image.delete(save=False)
            validated_data["image"] = None
        elif image_provided:
            new_image = validated_data.get("image")
            if not new_image:
                # 未提供新文件且未显式清除时忽略该字段，避免意外清空。
                validated_data.pop("image", None)
            elif instance.image:
                instance.image.delete(save=False)

        return super().update(instance, validated_data)

