from __future__ import annotations

import json
from typing import Any
from io import BytesIO

from django.contrib.auth import get_user_model
from django.db import transaction
from django.urls import reverse
from rest_framework import serializers

from django.utils import timezone
from django.core.files.base import ContentFile
from PIL import Image, ImageOps

from core.models import (
    Achievement,
    AchievementGroup,
    ConditionalMessage,
    DailyCheckIn,
    DailyHistoryMessage,
    DailyQuiz,
    DailyQuizOption,
    EncouragementMessage,
    HolidayMessage,
    LongTermGoal,
    LongTermPlanCopy,
    ShortTermGoal,
    ShortTermTaskPreset,
    TestAccountProfile,
    Test,
    TestDimension,
    TestQuestion,
    TestOptionText,
    TestOption,
    UserTestResult,
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

    @staticmethod
    def _rename_with_format(original_name: str, fmt: str) -> str:
        base = original_name.rsplit(".", 1)[0] if original_name and "." in original_name else (original_name or "upload")
        return f"{base}.{fmt.lower()}"

    @staticmethod
    def _compress_image(file_obj, *, max_side: int = 2048, fmt: str = "WEBP", quality: int = 82):
        """
        将输入文件压缩为指定格式（默认 WEBP），并限制最长边，返回 ContentFile。
        压缩失败则回退原文件。
        """
        try:
            img = Image.open(file_obj)
            # 纠正 EXIF 方向并统一到 RGB，避免部分模式保存失败
            img = ImageOps.exif_transpose(img).convert("RGB")

            width, height = img.size
            if max(width, height) > max_side:
                if width >= height:
                    new_width = max_side
                    new_height = int(height * (max_side / width))
                else:
                    new_height = max_side
                    new_width = int(width * (max_side / height))
                img = img.resize((new_width, new_height), Image.LANCZOS)

            buffer = BytesIO()
            # optimize=True 可能提高压缩率；webp 默认使用 4:2:0 色度抽样
            img.save(buffer, format=fmt, quality=quality, optimize=True)
            data = buffer.getvalue()
            new_name = UserUploadSerializer._rename_with_format(getattr(file_obj, "name", "upload"), fmt)
            return ContentFile(data, name=new_name)
        except Exception:
            # 任意异常时回退使用原文件，避免阻断上传流程
            return file_obj

    def create(self, validated_data: dict[str, Any]) -> UserUpload:
        image_file = validated_data.get("image")
        if image_file:
            validated_data["image"] = self._compress_image(
                image_file,
                max_side=2048,
                fmt="WEBP",
                quality=82,
            )
        return super().create(validated_data)

    def update(self, instance: UserUpload, validated_data: dict[str, Any]) -> UserUpload:
        image_file = validated_data.get("image", None)
        if image_file:
            validated_data["image"] = self._compress_image(
                image_file,
                max_side=2048,
                fmt="WEBP",
                quality=82,
            )
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if instance.image:
            proxy_url = reverse("core:user-upload-image", args=[instance.pk])
            if request is not None:
                absolute_url = request.build_absolute_uri(proxy_url)
            else:
                site_root = getattr(settings, "FRONTEND_ORIGIN", "").rstrip("/")
                if site_root:
                    absolute_url = f"{site_root}{proxy_url}"
                else:
                    absolute_url = proxy_url

            token = getattr(getattr(request, "auth", None), "key", None)
            if not token and request is not None:
                token = getattr(request.user, "auth_token", None)
                if token:
                    token = getattr(token, "key", None)

            if token:
                separator = "&" if "?" in absolute_url else "?"
                absolute_url = f"{absolute_url}{separator}token={token}"

            data["image"] = absolute_url
        else:
            data["image"] = None
        return data

    def to_internal_value(self, data):
        # 对于包含文件的 multipart/form-data，避免使用 copy() 因为文件对象不能被 pickle
        # 直接修改 data 的字段，而不是先 copy
        
        # 处理 tags
        tags_value = data.get("tags")
        if isinstance(tags_value, str):
            parsed = self._parse_tags(tags_value)
            if parsed is not None:
                if hasattr(data, "setlist"):
                    data.setlist("tags", parsed)
                elif hasattr(data, "__setitem__"):
                    data["tags"] = parsed

        # 处理 title
        title_value = data.get("title")
        if isinstance(title_value, str):
            trimmed = title_value.strip()
            if hasattr(data, "setlist"):
                data.setlist("title", [trimmed])
            elif hasattr(data, "__setitem__"):
                data["title"] = trimmed

        # 处理 description
        description_value = data.get("description")
        if isinstance(description_value, str):
            trimmed = description_value.strip()
            if hasattr(data, "setlist"):
                data.setlist("description", [trimmed])
            elif hasattr(data, "__setitem__"):
                data["description"] = trimmed

        return super().to_internal_value(data)

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


class ConditionalMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConditionalMessage
        fields = [
            "id",
            "name",
            "text",
            "priority",
            "is_active",
            "min_total_checkins",
            "max_total_checkins",
            "min_streak_days",
            "max_streak_days",
            "min_total_uploads",
            "max_total_uploads",
            "match_last_upload_moods",
            "match_last_upload_tags",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class HolidayMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = HolidayMessage
        fields = [
            "id",
            "month",
            "day",
            "headline",
            "text",
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


# ==================== 测试管理序列化器 ====================

class TestDimensionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestDimension
        fields = [
            "id",
            "code",
            "name",
            "endpoint_a_code",
            "endpoint_a_name",
            "endpoint_b_code",
            "endpoint_b_name",
            "description",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class TestOptionSerializer(serializers.ModelSerializer):
    dimension_name = serializers.CharField(source="dimension.name", read_only=True)

    class Meta:
        model = TestOption
        fields = [
            "id",
            "dimension",
            "dimension_name",
            "endpoint_code",
            "score_config",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class TestOptionTextSerializer(serializers.ModelSerializer):
    options = TestOptionSerializer(many=True, read_only=True)
    option_count = serializers.SerializerMethodField()

    def get_option_count(self, obj):
        return obj.options.count()

    class Meta:
        model = TestOptionText
        fields = [
            "id",
            "text",
            "display_order",
            "is_active",
            "options",
            "option_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class TestQuestionSerializer(serializers.ModelSerializer):
    option_texts = TestOptionTextSerializer(many=True, read_only=True)
    option_text_count = serializers.SerializerMethodField()
    dimension_id = serializers.IntegerField(source="dimension.id", read_only=True, allow_null=True)
    dimension_name = serializers.CharField(source="dimension.name", read_only=True, allow_null=True)

    def get_option_text_count(self, obj):
        return obj.option_texts.count()

    class Meta:
        model = TestQuestion
        fields = [
            "id",
            "test",
            "question_text",
            "dimension",
            "dimension_id",
            "dimension_name",
            "endpoint_code",
            "score_config",
            "display_order",
            "is_active",
            "option_texts",
            "option_text_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class TestQuestionOptionInputSerializer(serializers.Serializer):
    """类型2的选项输入序列化器"""
    text = serializers.CharField(max_length=256, help_text="选项文本")
    # 类型2专用的维度分值配置：每个选项可以给多个维度加分
    dimension_scores = serializers.DictField(
        child=serializers.IntegerField(),
        help_text="维度分值配置（类型2使用），键为维度端点代码，值为该选项给该维度加的分值",
        required=False,
        allow_empty=True,
    )


class TestQuestionInputSerializer(serializers.Serializer):
    """简化的题目输入序列化器，用于创建测试时同时创建题目"""
    question_text = serializers.CharField(help_text="题目文本")
    display_order = serializers.IntegerField(default=100, help_text="排序权重")
    # 类型1使用：题目对应的维度和分值配置
    dimension_id = serializers.IntegerField(required=False, help_text="类型1使用：题目对应的维度ID")
    endpoint_code = serializers.CharField(max_length=16, required=False, allow_blank=True, help_text="类型1使用：维度端点代码")
    score_config = serializers.DictField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        help_text="类型1使用：5个选择强度对应的分值，格式：{\"-2\": 2, \"-1\": 1, \"0\": 0, \"1\": 1, \"2\": 2}",
    )
    # 类型2使用：选项列表（固定4个）
    options = TestQuestionOptionInputSerializer(many=True, required=False, help_text="类型2使用：选项列表，固定4个")


class TestSerializer(serializers.ModelSerializer):
    dimensions = TestDimensionSerializer(many=True, read_only=True)
    dimension_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=TestDimension.objects.all(), source="dimensions", write_only=True, required=False
    )
    questions = TestQuestionSerializer(many=True, read_only=True)
    question_count = serializers.SerializerMethodField()
    # 用于嵌套创建题目和选项
    questions_data = TestQuestionInputSerializer(many=True, write_only=True, required=False)
    test_type = serializers.ChoiceField(
        choices=Test.TEST_TYPE_CHOICES,
        default=Test.TYPE_1,
        help_text="测试类型：类型1为5级选择，类型2为4个选项选择。",
    )

    def get_question_count(self, obj):
        return obj.questions.count()

    def create(self, validated_data):
        questions_data = validated_data.pop("questions_data", [])
        dimension_ids = validated_data.pop("dimensions", [])
        
        test = Test.objects.create(**validated_data)
        
        # 关联维度
        if dimension_ids:
            test.dimensions.set(dimension_ids)
        
        # 创建题目和选项
        from core.models import TestOptionText, TestOption, TestQuestion, TestDimension
        
        for idx, question_data in enumerate(questions_data):
            if test.test_type == Test.TYPE_1:
                # 类型1：题目直接配置维度和分值
                dimension_id = question_data.get("dimension_id")
                endpoint_code = question_data.get("endpoint_code", "")
                score_config = question_data.get("score_config", {})
                
                dimension = None
                if dimension_id:
                    try:
                        dimension = TestDimension.objects.get(id=dimension_id)
                    except TestDimension.DoesNotExist:
                        pass
                
                question = TestQuestion.objects.create(
                    test=test,
                    question_text=question_data["question_text"],
                    display_order=question_data.get("display_order", 100 + idx * 10),
                    dimension=dimension,
                    endpoint_code=endpoint_code,
                    score_config=score_config,
                )
            else:
                # 类型2：题目有选项文本
                question = TestQuestion.objects.create(
                    test=test,
                    question_text=question_data["question_text"],
                    display_order=question_data.get("display_order", 100 + idx * 10),
                )
                
                # 创建选项文本和选项
                options_data = question_data.get("options", [])
                for opt_idx, option_data in enumerate(options_data):
                    option_text = TestOptionText.objects.create(
                        question=question,
                        text=option_data["text"],
                        display_order=100 + opt_idx * 10,
                    )
                    
                    # 类型2：直接选择选项，可以给多个维度加分
                    dimension_scores = option_data.get("dimension_scores", {})
                    
                    # 为每个维度创建TestOption
                    for endpoint_code, score_value in dimension_scores.items():
                        # 查找对应的维度
                        dimension = None
                        for dim in test.dimensions.all():
                            if dim.endpoint_a_code == endpoint_code or dim.endpoint_b_code == endpoint_code:
                                dimension = dim
                                break
                        
                        if dimension:
                            # 类型2的分值配置格式：{"selected": score_value}
                            score_config = {"selected": score_value}
                            TestOption.objects.create(
                                option_text=option_text,
                                dimension=dimension,
                                endpoint_code=endpoint_code,
                                score_config=score_config,
                            )
        
        return test

    def update(self, instance, validated_data):
        questions_data = validated_data.pop("questions_data", None)
        dimension_ids = validated_data.pop("dimensions", None)
        
        # 更新基本字段
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # 更新维度关联
        if dimension_ids is not None:
            instance.dimensions.set(dimension_ids)
        
        # 如果提供了questions_data，更新题目（这里简化处理，实际可能需要更复杂的逻辑）
        if questions_data is not None:
            # 删除旧题目（级联删除会处理选项）
            instance.questions.all().delete()
            
            # 创建新题目
            from core.models import TestOptionText, TestOption, TestDimension
            
            for idx, question_data in enumerate(questions_data):
                if instance.test_type == Test.TYPE_1:
                    # 类型1：题目直接配置维度和分值
                    dimension_id = question_data.get("dimension_id")
                    endpoint_code = question_data.get("endpoint_code", "")
                    score_config = question_data.get("score_config", {})
                    
                    dimension = None
                    if dimension_id:
                        try:
                            dimension = TestDimension.objects.get(id=dimension_id)
                        except TestDimension.DoesNotExist:
                            pass
                    
                    TestQuestion.objects.create(
                        test=instance,
                        question_text=question_data["question_text"],
                        display_order=question_data.get("display_order", 100 + idx * 10),
                        dimension=dimension,
                        endpoint_code=endpoint_code,
                        score_config=score_config,
                    )
                else:
                    # 类型2：题目有选项文本
                    question = TestQuestion.objects.create(
                        test=instance,
                        question_text=question_data["question_text"],
                        display_order=question_data.get("display_order", 100 + idx * 10),
                    )
                    
                    options_data = question_data.get("options", [])
                    for opt_idx, option_data in enumerate(options_data):
                        option_text = TestOptionText.objects.create(
                            question=question,
                            text=option_data["text"],
                            display_order=100 + opt_idx * 10,
                        )
                        
                        # 类型2：直接选择选项，可以给多个维度加分
                        dimension_scores = option_data.get("dimension_scores", {})
                        
                        # 为每个维度创建TestOption
                        for endpoint_code, score_value in dimension_scores.items():
                            # 查找对应的维度
                            dimension = None
                            for dim in instance.dimensions.all():
                                if dim.endpoint_a_code == endpoint_code or dim.endpoint_b_code == endpoint_code:
                                    dimension = dim
                                    break
                            
                            if dimension:
                                # 类型2的分值配置格式：{"selected": score_value}
                                score_config = {"selected": score_value}
                                TestOption.objects.create(
                                    option_text=option_text,
                                    dimension=dimension,
                                    endpoint_code=endpoint_code,
                                    score_config=score_config,
                                )
        
        return instance

    class Meta:
        model = Test
        fields = [
            "id",
            "slug",
            "name",
            "description",
            "test_type",
            "dimensions",
            "dimension_ids",
            "questions",
            "questions_data",
            "question_count",
            "is_active",
            "display_order",
            "metadata",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class UserTestResultSerializer(serializers.ModelSerializer):
    test_name = serializers.CharField(source="test.name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = UserTestResult
        fields = [
            "id",
            "user",
            "user_email",
            "test",
            "test_name",
            "dimension_scores",
            "answers",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


# ==================== 每日小测序列化器 ====================

class DailyQuizOptionSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    class Meta:
        model = DailyQuizOption
        fields = [
            "id",
            "option_type",
            "text",
            "image",
            "image_url",
            "display_order",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at", "image_url"]


class DailyQuizOptionInputSerializer(serializers.Serializer):
    """简化的选项输入序列化器，用于创建每日小测时同时创建选项"""
    option_type = serializers.ChoiceField(
        choices=[("text", "文字"), ("image", "图片")],
        default="text",
    )
    text = serializers.CharField(max_length=256, required=False, allow_blank=True)
    image = serializers.ImageField(required=False, allow_null=True)
    display_order = serializers.IntegerField(default=100, required=False)


class DailyQuizSerializer(serializers.ModelSerializer):
    options = DailyQuizOptionSerializer(many=True, read_only=True)
    option_count = serializers.SerializerMethodField()
    # 用于嵌套创建选项 - 支持JSON字符串或列表
    options_data = serializers.JSONField(write_only=True, required=False, allow_null=True)

    def get_option_count(self, obj):
        return obj.options.count()

    def _parse_options_data(self, options_data, request=None):
        """解析options_data，支持列表或JSON字符串，并处理图片文件"""
        if options_data is None:
            return []
        if isinstance(options_data, str):
            try:
                parsed = json.loads(options_data)
                if isinstance(parsed, list):
                    options_data = parsed
                else:
                    return []
            except (json.JSONDecodeError, TypeError):
                return []
        if not isinstance(options_data, list):
            return []
        
        # 处理图片文件（从request中获取）
        if request and hasattr(request, 'FILES'):
            for idx, option_data in enumerate(options_data):
                if isinstance(option_data, dict) and option_data.get("option_type") == "image":
                    image_key = f"option_image_{idx}"
                    if image_key in request.FILES:
                        option_data["image"] = request.FILES[image_key]
        
        return options_data

    def create(self, validated_data):
        request = self.context.get("request")
        options_data_raw = validated_data.pop("options_data", None)
        options_data = self._parse_options_data(options_data_raw, request)
        
        quiz = DailyQuiz.objects.create(**validated_data)
        
        # 创建选项
        for opt_idx, option_data in enumerate(options_data):
            if isinstance(option_data, dict):
                DailyQuizOption.objects.create(
                    quiz=quiz,
                    option_type=option_data.get("option_type", "text"),
                    text=option_data.get("text", ""),
                    image=option_data.get("image"),
                    display_order=option_data.get("display_order", 100 + opt_idx * 10),
                )
        
        return quiz

    def update(self, instance, validated_data):
        request = self.context.get("request")
        options_data_raw = validated_data.pop("options_data", None)
        
        # 更新基本字段
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # 如果提供了options_data，更新选项
        if options_data_raw is not None:
            options_data = self._parse_options_data(options_data_raw, request)
            # 删除旧选项
            instance.options.all().delete()
            
            # 创建新选项
            for opt_idx, option_data in enumerate(options_data):
                if isinstance(option_data, dict):
                    DailyQuizOption.objects.create(
                        quiz=instance,
                        option_type=option_data.get("option_type", "text"),
                        text=option_data.get("text", ""),
                        image=option_data.get("image"),
                        display_order=option_data.get("display_order", 100 + opt_idx * 10),
                    )
        
        return instance

    class Meta:
        model = DailyQuiz
        fields = [
            "id",
            "date",
            "question_text",
            "options",
            "options_data",
            "option_count",
            "display_order",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

