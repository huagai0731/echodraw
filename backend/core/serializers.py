from __future__ import annotations

import json
import logging
import copy
from typing import Any
from io import BytesIO

from django.contrib.auth import get_user_model
from django.db import transaction
from django.urls import reverse
from rest_framework import serializers

from django.utils import timezone
from django.core.files.base import ContentFile
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

from core.models import (
    ConditionalMessage,
    DailyCheckIn,
    DailyHistoryMessage,
    DailyQuiz,
    DailyQuizOption,
    EncouragementMessage,
    HolidayMessage,
    LongTermGoal,
    LongTermPlanCopy,
    Mood,
    MonthlyReportTemplate,
    ShortTermGoal,
    ShortTermTaskPreset,
    Tag,
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
    VisualAnalysisResult,
)
class MoodSerializer(serializers.ModelSerializer):
    """创作状态序列化器"""
    class Meta:
        model = Mood
        fields = [
            "id",
            "name",
            "display_order",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TagSerializer(serializers.ModelSerializer):
    """标签序列化器"""
    class Meta:
        model = Tag
        fields = [
            "id",
            "name",
            "is_preset",
            "is_hidden",
            "display_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
    
    def validate_name(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("标签名称不能为空。")
        if len(text) > 24:
            raise serializers.ValidationError("标签名称不可超过 24 字符。")
        return text
    
    def create(self, validated_data: dict[str, Any]) -> Tag:
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        
        if not user:
            raise serializers.ValidationError("用户未认证。")
        
        # 所有标签都是用户自定义标签
        validated_data["user"] = user
        validated_data["is_preset"] = False
        validated_data["is_hidden"] = False  # 不再支持隐藏功能
        
        return super().create(validated_data)


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            "display_name",
            "signature",
            "featured_artwork_ids",
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
            "featured_artwork_ids": {
                "required": False,
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
    title = serializers.CharField(
        max_length=120,
        allow_blank=True,
        required=False,
        trim_whitespace=True,
        help_text="作品标题，用于前端展示。",
    )
    description = serializers.CharField(
        source="notes",
        allow_blank=True,
        required=False,
        trim_whitespace=True,
    )
    image = serializers.ImageField(required=False, allow_null=True, use_url=True)
    # 接收mood ID（用于创建/更新）
    mood_id = serializers.PrimaryKeyRelatedField(
        queryset=Mood.objects.filter(is_active=True),
        source="mood",
        required=False,
        allow_null=True,
    )
    # 返回mood信息（用于序列化输出）
    mood_label = serializers.SerializerMethodField()
    # 接收标签ID列表（用于创建/更新）
    tag_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Tag.objects.all(),
        source="tags",
        required=False,
        allow_empty=True,
    )
    # 返回标签ID列表（用于序列化输出）
    # 前端会根据ID转换为名称显示
    tags = serializers.SerializerMethodField()

    # 允许的图片MIME类型
    ALLOWED_IMAGE_MIME_TYPES = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
    ]

    def validate_image(self, value):
        """
        验证图片文件：MIME类型、文件大小和文件内容
        使用PIL验证文件头，确保是真实的图片文件，防止文件伪装攻击
        """
        if value is None:
            return value
        
        # 1. 验证文件大小，限制为10MB
        max_size = 10 * 1024 * 1024  # 10MB
        if value.size > max_size:
            raise serializers.ValidationError(
                f"文件大小不能超过 {max_size / 1024 / 1024}MB，当前文件大小为 {value.size / 1024 / 1024:.2f}MB"
            )
        
        # 2. 验证文件扩展名
        if hasattr(value, 'name') and value.name:
            import os
            ext = os.path.splitext(value.name)[1].lower()
            allowed_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
            if ext not in allowed_extensions:
                raise serializers.ValidationError(
                    f"不支持的文件扩展名：{ext}。仅支持：{', '.join(allowed_extensions)}"
                )
        
        # 3. 验证MIME类型
        if hasattr(value, 'content_type'):
            content_type = value.content_type.lower()
            if content_type not in self.ALLOWED_IMAGE_MIME_TYPES:
                raise serializers.ValidationError(
                    f"不支持的文件类型：{content_type}。仅支持：{', '.join(self.ALLOWED_IMAGE_MIME_TYPES)}"
                )
        
        # 4. 使用PIL验证文件内容（文件头验证，防止文件伪装）
        # 这是最重要的验证，确保文件确实是图片格式
        try:
            # 保存当前位置
            if hasattr(value, 'seek'):
                current_pos = value.tell()
                value.seek(0)
            
            # 尝试用PIL打开文件，验证文件头
            img = Image.open(value)
            # 验证图片格式
            if img.format not in ['JPEG', 'PNG', 'WEBP', 'GIF']:
                raise serializers.ValidationError(
                    f"不支持的图片格式：{img.format}。仅支持：JPEG、PNG、WebP、GIF"
                )
            
            # 验证图片尺寸（防止超大图片导致内存问题）
            width, height = img.size
            max_dimension = 10000  # 最大边长10000像素
            if width > max_dimension or height > max_dimension:
                # 生产环境统一错误消息，不暴露具体尺寸
                logger.debug(
                    f"图片尺寸过大: {width}x{height} (限制: {max_dimension}x{max_dimension})",
                    extra={"width": width, "height": height, "file_name": getattr(value, "name", "unknown")}
                )
                raise serializers.ValidationError(
                    f"图片尺寸过大，最大支持 {max_dimension}x{max_dimension} 像素，请使用较小的图片"
                )
            
            # 恢复文件位置
            if hasattr(value, 'seek'):
                value.seek(current_pos)
            
        except Exception as e:
            if isinstance(e, serializers.ValidationError):
                raise
            # PIL无法打开文件，说明不是有效的图片文件
            raise serializers.ValidationError(
                "无法识别该文件为有效的图片格式。请确保上传的是有效的图片文件（JPEG、PNG、WebP或GIF）。"
            ) from e
        
        return value

    class Meta:
        model = UserUpload
        fields = [
            "id",
            "title",
            "description",
            "uploaded_at",
            "self_rating",
            "mood_id",
            "mood_label",
            "tags",
            "tag_ids",
            "duration_minutes",
            "image",
            "thumbnail",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "tags", "mood_label", "thumbnail"]
    
    def get_mood_label(self, obj):
        """返回状态名称，兼容旧版API"""
        if obj.mood:
            return obj.mood.name
        # 兼容旧数据：如果mood为空但mood_label有值，返回mood_label
        return obj.mood_label or ""

    def get_tags(self, obj):
        """返回标签ID列表，前端会根据ID转换为名称显示"""
        return list(obj.tags.values_list("id", flat=True))

    @staticmethod
    def _rename_with_format(original_name: str, fmt: str) -> str:
        base = original_name.rsplit(".", 1)[0] if original_name and "." in original_name else (original_name or "upload")
        return f"{base}.{fmt.lower()}"

    @staticmethod
    def _generate_thumbnail(file_obj, *, max_side: int = 800, fmt: str = "WEBP", quality: int = 75):
        """
        生成缩略图，用于列表页展示，节省CDN流量。
        参数：
        - max_side: 缩略图最长边，默认800px
        - fmt: 图片格式，默认WEBP
        - quality: 压缩质量，默认75（比完整图稍低以进一步减小文件）
        """
        return UserUploadSerializer._compress_image(
            file_obj,
            max_side=max_side,
            fmt=fmt,
            quality=quality,
        )

    @staticmethod
    def _compress_image(file_obj, *, max_side: int = 2048, fmt: str = "WEBP", quality: int = 82):
        """
        将输入文件压缩为指定格式（默认 WEBP），并限制最长边，返回 ContentFile。
        如果处理失败，抛出异常拒绝上传，确保只保存有效的图片文件。
        
        添加超时机制防止DoS攻击：
        - 文件大小限制：10MB（已在validate_image中验证）
        - 图片尺寸限制：20000x20000像素
        - 处理时间限制：30秒（通过文件大小和尺寸间接控制）
        """
        import signal
        import logging
        import threading
        from contextlib import contextmanager
        
        logger = logging.getLogger(__name__)
        
        # 统一的错误消息，不暴露内部细节
        GENERIC_ERROR_MESSAGE = "图片处理失败，请确保上传的是有效的图片文件（JPEG、PNG、WebP或GIF）。如果问题持续，请尝试使用其他图片或联系支持。"
        
        # 处理超时时间（秒）
        PROCESSING_TIMEOUT = 30
        
        @contextmanager
        def timeout_handler(timeout):
            """超时处理器，使用线程和事件实现超时控制"""
            timeout_event = threading.Event()
            exception_container = [None]
            
            def timeout_worker():
                if not timeout_event.wait(timeout):
                    # 超时触发
                    exception_container[0] = TimeoutError(f"图片处理超时（超过{timeout}秒）")
            
            worker_thread = threading.Thread(target=timeout_worker, daemon=True)
            worker_thread.start()
            
            try:
                yield
                timeout_event.set()  # 标记完成
            except Exception as e:
                timeout_event.set()  # 即使出错也要停止超时线程
                raise
            finally:
                worker_thread.join(timeout=1)  # 等待线程结束，最多1秒
                if exception_container[0]:
                    raise TimeoutError(str(exception_container[0]))
        
        try:
            # 限制处理时间（通过文件大小间接控制）
            # 如果文件过大，可能处理时间过长，提前拒绝
            if hasattr(file_obj, 'size') and file_obj.size > 50 * 1024 * 1024:  # 50MB
                raise serializers.ValidationError(
                    "文件过大，无法处理。请上传小于50MB的图片文件。"
                )
            
            # 使用超时处理器包装所有图片处理操作
            with timeout_handler(PROCESSING_TIMEOUT):
                img = Image.open(file_obj)
                
                # 验证图片格式
                if img.format not in ['JPEG', 'PNG', 'WEBP', 'GIF']:
                    raise serializers.ValidationError(
                        f"不支持的图片格式：{img.format}。仅支持：JPEG、PNG、WebP、GIF"
                    )
                
                # 验证图片尺寸（防止超大图片导致内存问题）
                width, height = img.size
                max_dimension = 20000  # 最大边长20000像素
                if width > max_dimension or height > max_dimension:
                    raise serializers.ValidationError(
                        f"图片尺寸过大：{width}x{height}。最大支持：{max_dimension}x{max_dimension}像素"
                    )
                
                # 验证确实是图片格式（PIL会尝试打开文件，如果不是图片会抛出异常）
                # 纠正 EXIF 方向，保留透明度通道（RGBA）或转换为RGB
                try:
                    img = ImageOps.exif_transpose(img)
                    # 检查是否有透明通道
                    # RGBA和LA模式直接有透明通道
                    # P模式（调色板）需要检查是否有透明色
                    has_transparency = False
                    if img.mode in ('RGBA', 'LA'):
                        has_transparency = True
                    elif img.mode == 'P':
                        # 调色板模式，检查是否有透明色
                        has_transparency = img.info.get('transparency') is not None
                    
                    # 如果有透明通道，转换为RGBA；否则转换为RGB
                    if has_transparency:
                        if img.mode != 'RGBA':
                            img = img.convert("RGBA")
                    else:
                        img = img.convert("RGB")
                except Exception as convert_error:
                    logger.warning(f"图片格式转换失败: {type(convert_error).__name__}", exc_info=True)
                    raise serializers.ValidationError(GENERIC_ERROR_MESSAGE) from convert_error

                # 调整尺寸
                if max(width, height) > max_side:
                    try:
                        if width >= height:
                            new_width = max_side
                            new_height = int(height * (max_side / width))
                        else:
                            new_height = max_side
                            new_width = int(width * (max_side / height))
                        img = img.resize((new_width, new_height), Image.LANCZOS)
                    except Exception as resize_error:
                        logger.warning(f"图片尺寸调整失败: {type(resize_error).__name__}", exc_info=True)
                        raise serializers.ValidationError(GENERIC_ERROR_MESSAGE) from resize_error

                # 保存压缩后的图片
                try:
                    # 目标文件大小：600KB（仅对完整图片应用，即max_side >= 2048）
                    target_size = 600 * 1024  # 600KB
                    min_quality = 30  # 最低质量阈值
                    quality_step = 5  # 每次降低的质量步长
                    apply_size_limit = max_side >= 2048  # 仅对完整图片应用大小限制
                    
                    current_quality = quality
                    data = None
                    
                    # 循环压缩，直到文件大小小于600KB（仅对完整图片）
                    while True:
                        buffer = BytesIO()
                        # optimize=True 可能提高压缩率；webp 默认使用 4:2:0 色度抽样
                        # 如果图片有透明通道（RGBA），保存时保留透明度
                        save_kwargs = {
                            'format': fmt,
                            'quality': current_quality,
                            'optimize': True
                        }
                        # WEBP格式支持透明度，如果图片是RGBA模式，会自动保留透明度
                        if img.mode == 'RGBA' and fmt.upper() == 'WEBP':
                            # WEBP格式会自动处理RGBA模式的透明度
                            pass
                        img.save(buffer, **save_kwargs)
                        data = buffer.getvalue()
                        
                        # 如果文件大小符合要求，或者不是完整图片，或者质量已降到最低，则退出循环
                        if not apply_size_limit or len(data) <= target_size or current_quality <= min_quality:
                            break
                        
                        # 降低质量继续尝试
                        current_quality = max(min_quality, current_quality - quality_step)
                        logger.info(f"图片大小 {len(data) / 1024:.1f}KB 超过 {target_size / 1024:.0f}KB，降低质量至 {current_quality} 重新压缩")
                    
                    # 验证压缩后的数据大小（防止异常大的输出）
                    max_output_size = 20 * 1024 * 1024  # 20MB
                    if len(data) > max_output_size:
                        raise serializers.ValidationError(
                            "图片压缩后仍然过大，请尝试使用较小的原始图片。"
                        )
                    
                    new_name = UserUploadSerializer._rename_with_format(getattr(file_obj, "name", "upload"), fmt)
                    return ContentFile(data, name=new_name)
                except Exception as save_error:
                    logger.warning(f"图片保存失败: {type(save_error).__name__}", exc_info=True)
                    raise serializers.ValidationError(GENERIC_ERROR_MESSAGE) from save_error
                
        except serializers.ValidationError:
            # 重新抛出验证错误（保持原有错误消息）
            raise
        except TimeoutError as e:
            # 处理超时错误
            logger.warning(
                f"图片处理超时: {str(e)}",
                extra={"file_name": getattr(file_obj, "name", "unknown"), "file_size": getattr(file_obj, "size", "unknown")}
            )
            raise serializers.ValidationError(
                "图片处理超时，请尝试使用较小的图片或联系支持。"
            ) from e
        except Exception as e:
            # 处理失败时拒绝上传，防止恶意文件或损坏文件被保存
            # 记录详细错误到日志，但不返回给客户端
            logger.error(
                f"图片处理失败: {type(e).__name__}",
                exc_info=True,
                extra={"file_name": getattr(file_obj, "name", "unknown")}
            )
            # 生产环境返回统一错误消息，不暴露内部细节
            raise serializers.ValidationError(GENERIC_ERROR_MESSAGE) from e

    def create(self, validated_data: dict[str, Any]) -> UserUpload:
        image_file = validated_data.get("image")
        if image_file:
            # 保存原始文件内容，因为_compress_image会读取文件
            image_file.seek(0)
            original_content = image_file.read()
            image_file.seek(0)
            
            # 先压缩完整图片
            from django.core.files.base import ContentFile
            compressed_image = self._compress_image(
                ContentFile(original_content, name=image_file.name),
                max_side=2048,
                fmt="WEBP",
                quality=82,
            )
            validated_data["image"] = compressed_image
            
            # 生成缩略图（从原始文件生成）
            validated_data["thumbnail"] = self._generate_thumbnail(
                ContentFile(original_content, name=image_file.name),
                max_side=800,
                fmt="WEBP",
                quality=75,
            )
        
        # 处理 uploaded_at 日期字段
        uploaded_at = validated_data.get("uploaded_at")
        if uploaded_at:
            # 如果提供了日期字符串（YYYY-MM-DD格式），需要转换为datetime
            if isinstance(uploaded_at, str):
                from django.utils.dateparse import parse_datetime, parse_date
                from datetime import datetime, time as dt_time
                # 尝试解析为datetime
                parsed_dt = parse_datetime(uploaded_at)
                if parsed_dt is None:
                    # 如果解析失败，尝试解析为日期，然后转换为datetime
                    parsed_date = parse_date(uploaded_at)
                    if parsed_date:
                        # 使用当天的中午时间（12:00）作为默认时间，并转换为时区感知的datetime
                        parsed_dt = timezone.make_aware(datetime.combine(parsed_date, dt_time(12, 0)))
                if parsed_dt:
                    # 确保是时区感知的datetime
                    if timezone.is_naive(parsed_dt):
                        parsed_dt = timezone.make_aware(parsed_dt)
                    validated_data["uploaded_at"] = parsed_dt
        
        # 处理标签关联（ManyToManyField需要在对象创建后设置）
        tags = validated_data.pop("tags", [])
        logger.info(f"[UserUploadSerializer] create 方法中获取的 tags: {tags}, 类型: {type(tags)}, 长度: {len(tags) if tags else 0}")
        
        # 如果没有提供 uploaded_at，使用模拟时间（如果设置了 MOCK_DATE）
        if "uploaded_at" not in validated_data or validated_data.get("uploaded_at") is None:
            from core.views import get_now_with_mock
            validated_data["uploaded_at"] = get_now_with_mock()
        
        upload = super().create(validated_data)
        if tags:
            logger.info(f"[UserUploadSerializer] 设置 tags 到 upload: {[t.id if hasattr(t, 'id') else t for t in tags]}")
            upload.tags.set(tags)
        else:
            logger.warning("[UserUploadSerializer] tags 为空，不会设置任何标签")
        return upload

    def update(self, instance: UserUpload, validated_data: dict[str, Any]) -> UserUpload:
        image_file = validated_data.get("image", None)
        if image_file:
            # 保存原始文件内容
            image_file.seek(0)
            original_content = image_file.read()
            image_file.seek(0)
            
            # 先压缩完整图片
            from django.core.files.base import ContentFile
            compressed_image = self._compress_image(
                ContentFile(original_content, name=image_file.name),
                max_side=2048,
                fmt="WEBP",
                quality=82,
            )
            validated_data["image"] = compressed_image
            
            # 如果更新了图片，删除旧的缩略图并生成新的
            if instance.thumbnail:
                instance.thumbnail.delete(save=False)
            
            # 生成缩略图（从原始文件生成）
            validated_data["thumbnail"] = self._generate_thumbnail(
                ContentFile(original_content, name=image_file.name),
                max_side=800,
                fmt="WEBP",
                quality=75,
            )
        
        # 处理标签关联
        tags = validated_data.pop("tags", None)
        upload = super().update(instance, validated_data)
        if tags is not None:
            upload.tags.set(tags)
        return upload

    def _get_image_url(self, image_field, instance_pk, request):
        """获取图片URL的辅助方法，处理代理和直链逻辑"""
        if not image_field:
            return None
        
        from django.conf import settings as dj_settings
        use_tos_storage = getattr(dj_settings, "USE_TOS_STORAGE", False)
        force_proxy_url = getattr(dj_settings, "FORCE_IMAGE_PROXY_URL", False)
        is_debug = getattr(dj_settings, "DEBUG", False)
        should_use_proxy = force_proxy_url or (use_tos_storage and is_debug)
        
        if use_tos_storage and not should_use_proxy:
            # 使用 TOS 直链
            return image_field.url
        else:
            # 使用代理 URL
            proxy_url = reverse("core:user-upload-image", args=[instance_pk])
            if request:
                image_url = request.build_absolute_uri(proxy_url)
            else:
                image_url = proxy_url
            
            token = getattr(getattr(request, "auth", None), "key", None)
            if not token and request is not None:
                token = getattr(request.user, "auth_token", None)
                if token:
                    token = getattr(token, "key", None)
            
            if token:
                separator = "&" if "?" in image_url else "?"
                image_url = f"{image_url}{separator}token={token}"
            return image_url

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        
        # 处理完整图片URL
        data["image"] = self._get_image_url(instance.image, instance.pk, request)
        
        # 处理缩略图URL（如果有缩略图则使用，否则回退到完整图）
        if instance.thumbnail:
            data["thumbnail"] = self._get_image_url(instance.thumbnail, instance.pk, request)
        else:
            # 如果没有缩略图，使用完整图作为回退（向后兼容）
            data["thumbnail"] = data["image"]
        
        return data

    def to_internal_value(self, data):
        # 对于包含文件的 multipart/form-data，避免使用 copy() 因为文件对象不能被 pickle
        # 但如果 QueryDict 不可变，需要先使其可变
        from django.http import QueryDict
        
        # 如果 data 是 QueryDict 且不可变，使其可变
        if isinstance(data, QueryDict) and not data._mutable:
            data._mutable = True
        
        # 处理 tags/tag_ids：支持旧版字符串数组和新版ID数组
        tags_value = data.get("tags") or data.get("tag_ids")
        if tags_value:
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"[UserUploadSerializer] 收到 tag_ids: {tags_value}, 类型: {type(tags_value)}")
            
            if isinstance(tags_value, str):
                # 尝试解析JSON字符串
                parsed = self._parse_tags(tags_value)
                logger.info(f"[UserUploadSerializer] 解析后的 tags: {parsed}, 类型: {type(parsed)}")
                if parsed is not None:
                    # 确保是列表格式，供 validate_tag_ids 处理
                    if hasattr(data, "setlist"):
                        data.setlist("tag_ids", parsed)
                    elif hasattr(data, "__setitem__"):
                        data["tag_ids"] = parsed
            elif isinstance(tags_value, list):
                # 检查是ID列表还是名称列表
                if tags_value and isinstance(tags_value[0], (int, str)) and str(tags_value[0]).isdigit():
                    # ID列表
                    if hasattr(data, "setlist"):
                        data.setlist("tag_ids", tags_value)
                    elif hasattr(data, "__setitem__"):
                        data["tag_ids"] = tags_value
                else:
                    # 名称列表（旧格式），需要转换为Tag对象
                    if hasattr(data, "setlist"):
                        data.setlist("tag_ids", tags_value)
                    elif hasattr(data, "__setitem__"):
                        data["tag_ids"] = tags_value

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
    def _parse_tags(value: str) -> list[int | str] | None:
        """解析标签值，支持JSON数组（数字或字符串）和逗号分隔的字符串"""
        text = value.strip()
        if not text:
            return []

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = [item.strip() for item in text.split(",") if item.strip()]

        if isinstance(parsed, list):
            result: list[int | str] = []
            for item in parsed:
                if isinstance(item, (int, float)):
                    # 数字ID，直接返回
                    result.append(int(item))
                elif isinstance(item, str):
                    stripped = item.strip()
                    if stripped:
                        # 如果是数字字符串，转换为int；否则保留为字符串（标签名称）
                        if stripped.isdigit():
                            result.append(int(stripped))
                        else:
                            result.append(stripped)
            return result
        return []

    def validate_title(self, value: str) -> str:
        if len(value) > 120:
            raise serializers.ValidationError("标题长度不可超过 120 字符。")
        return value

    def validate_tag_ids(self, value):
        """验证标签ID列表，如果是字符串数组则转换为Tag对象"""
        logger.info(f"[UserUploadSerializer] validate_tag_ids 收到值: {value}, 类型: {type(value)}")
        if not value:
            logger.info("[UserUploadSerializer] validate_tag_ids 返回空列表")
            return []
        
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        
        tag_objects = []
        for item in value:
            logger.info(f"[UserUploadSerializer] validate_tag_ids 处理项: {item}, 类型: {type(item)}")
            if isinstance(item, Tag):
                # 已经是Tag对象
                tag_objects.append(item)
            elif isinstance(item, (int, str)) and str(item).isdigit():
                # 是ID
                try:
                    tag = Tag.objects.get(pk=int(item))
                    tag_objects.append(tag)
                    logger.info(f"[UserUploadSerializer] validate_tag_ids 找到Tag: {tag.id} - {tag.name}")
                except Tag.DoesNotExist:
                    logger.error(f"[UserUploadSerializer] validate_tag_ids Tag ID {item} 不存在")
                    raise serializers.ValidationError(f"标签ID {item} 不存在。")
            elif isinstance(item, str):
                # 是标签名称（旧格式兼容），需要查找或创建Tag
                tag_name = item.strip()
                if not tag_name:
                    continue
                
                # 先查找预设标签
                preset_tag = Tag.objects.filter(name=tag_name, is_preset=True, user__isnull=True).first()
                if preset_tag:
                    tag_objects.append(preset_tag)
                elif user:
                    # 查找或创建用户自定义标签
                    custom_tag, _ = Tag.objects.get_or_create(
                        name=tag_name,
                        user=user,
                        is_preset=False,
                        defaults={
                            "display_order": 100,
                            "is_hidden": False,
                        }
                    )
                    tag_objects.append(custom_tag)
                else:
                    raise serializers.ValidationError(f"无法创建标签 '{tag_name}'：用户未认证。")
            else:
                raise serializers.ValidationError(f"无效的标签格式: {item}")
        
        return tag_objects


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
            "status",
            "started_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "started_at", "created_at", "updated_at"]

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
        
        # 创建目标，默认状态为已保存未进行
        validated_data["status"] = ShortTermGoal.STATUS_SAVED
        goal = ShortTermGoal.objects.create(user=user, **validated_data)
        
        return goal

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
    # 重写字段以处理类型转换问题
    target_hours = serializers.SerializerMethodField()
    checkpoint_count = serializers.SerializerMethodField()

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
            "target_hours",
            "checkpoint_count",
        ]
    
    def get_target_hours(self, obj):
        """安全转换为浮点数"""
        if obj.target_hours is None:
            return 0.0
        try:
            return float(obj.target_hours)
        except (ValueError, TypeError):
            return 0.0
    
    def get_checkpoint_count(self, obj):
        """安全转换为整数"""
        if obj.checkpoint_count is None:
            return 0
        try:
            # 先转 float 再转 int，处理 '120.00' 这种情况
            return int(float(obj.checkpoint_count))
        except (ValueError, TypeError):
            return 0

    def get_progress(self, obj: LongTermGoal) -> dict[str, object]:
        stats = self._ensure_goal_stats(obj)
        total_minutes = stats["total_minutes"]
        # 确保类型正确（防止从数据库读取时是字符串）
        target_hours = float(obj.target_hours) if obj.target_hours is not None else 0.0
        target_minutes = target_hours * 60
        ratio = total_minutes / target_minutes if target_minutes > 0 else 0
        # 修复：确保进度不超过100%，并处理浮点数精度问题
        ratio = max(0.0, min(ratio, 1.0))
        
        # 修复：使用上海时区计算elapsed_days，确保时区一致
        from core.views import SHANGHAI_TZ, get_today_shanghai
        from django.conf import settings
        
        if SHANGHAI_TZ is not None:
            # 获取上海时区的当前时间和开始时间
            now_utc = timezone.now()
            if timezone.is_naive(now_utc):
                now_utc = timezone.make_aware(now_utc)
            now_shanghai = now_utc.astimezone(SHANGHAI_TZ)
            
            started_at = obj.started_at
            if timezone.is_naive(started_at):
                started_at = timezone.make_aware(started_at)
            started_at_shanghai = started_at.astimezone(SHANGHAI_TZ)
            
            # 计算日期差（使用日期而不是时间戳，更准确）
            today_shanghai = get_today_shanghai()
            started_date_shanghai = started_at_shanghai.date()
            elapsed_days = max((today_shanghai - started_date_shanghai).days + 1, 1)
        else:
            # 回退：使用原始方法
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
            "targetHours": float(obj.target_hours) if obj.target_hours is not None else 0.0,
            "elapsedDays": elapsed_days,
            "completedCheckpoints": completed_checkpoints,
            "totalCheckpoints": int(obj.checkpoint_count) if obj.checkpoint_count is not None else 0,
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

        checkpoints = self._build_checkpoints(obj, entries, uploads)

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
        # 修复：使用与views.py中相同的时区处理逻辑
        # 确保查询时区一致，避免遗漏边界时间点的上传
        from core.views import SHANGHAI_TZ
        from django.conf import settings
        from datetime import datetime
        
        started_at = obj.started_at
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
                start_datetime = start_datetime.astimezone(timezone.utc)
        else:
            # 回退：使用原始started_at，但确保时区正确
            start_datetime = started_at
        
        return list(
            UserUpload.objects.filter(
                user=obj.user, 
                uploaded_at__gte=start_datetime
            ).order_by("uploaded_at", "id")
        )

    def _build_checkpoints(
        self,
        obj: LongTermGoal,
        entries: list[dict[str, object]],
        uploads: list[UserUpload],
    ) -> list[dict[str, object]]:
        checkpoints: list[dict[str, object]] = []
        # 确保类型正确（防止从数据库读取时是字符串）
        target_hours = float(obj.target_hours) if obj.target_hours is not None else 0.0
        checkpoint_count = int(obj.checkpoint_count) if obj.checkpoint_count is not None else 1
        per_checkpoint_minutes = target_hours * 60 / checkpoint_count
        first_open_index: int | None = None

        for index in range(checkpoint_count):
            threshold_minutes = per_checkpoint_minutes * (index + 1)
            
            # 从metadata中读取checkpoint的自定义数据
            checkpoint_index = index + 1
            checkpoint_key = f"checkpoint_{checkpoint_index}"
            checkpoint_metadata = {}
            try:
                if hasattr(obj, "metadata") and obj.metadata is not None:
                    if isinstance(obj.metadata, dict):
                        checkpoint_metadata = obj.metadata.get(checkpoint_key, {})
            except (AttributeError, TypeError):
                checkpoint_metadata = {}
            
            # 如果metadata中指定了upload_id，优先使用指定的upload
            custom_upload_id = checkpoint_metadata.get("upload_id") if isinstance(checkpoint_metadata, dict) else None
            if custom_upload_id and uploads:
                try:
                    custom_upload = next((u for u in uploads if u.id == custom_upload_id), None)
                    if custom_upload:
                        status = "completed"
                        reached_minutes = None  # 使用自定义upload时，不设置reached_minutes
                        reached_at = timezone.localtime(custom_upload.uploaded_at)
                        upload_payload = self._serialize_upload(custom_upload)
                    else:
                        # 如果指定的upload不存在，回退到原来的逻辑
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
                except (StopIteration, AttributeError):
                    # 如果出错，回退到原来的逻辑
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
            else:
                # 没有自定义upload，使用原来的逻辑
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
            
            # 从metadata中读取completionNote
            completion_note = checkpoint_metadata.get("completion_note") if isinstance(checkpoint_metadata, dict) else None

            checkpoint_payload = {
                "index": checkpoint_index,
                "label": f"CheckPoint {checkpoint_index:02d}",
                "status": status,
                "targetHours": round(threshold_minutes / 60, 2),
                "thresholdMinutes": threshold_minutes,
                "reachedMinutes": reached_minutes,
                "reachedAt": reached_at.isoformat() if reached_at else None,
                "upload": upload_payload,
                "completionNote": completion_note,
            }
            checkpoints.append(checkpoint_payload)

        return checkpoints

    def _serialize_upload(self, upload: UserUpload) -> dict[str, object]:
        localized = timezone.localtime(upload.uploaded_at)
        request = self.context.get("request")
        image_url = None
        if upload.image:
            # 使用与 UserUploadSerializer 相同的逻辑来决定使用代理 URL 还是直链
            # 生产环境（DEBUG=false）默认使用 TOS 直链，开发环境（DEBUG=true）自动使用代理
            from django.conf import settings as dj_settings
            use_tos_storage = getattr(dj_settings, "USE_TOS_STORAGE", False)
            force_proxy_url = getattr(dj_settings, "FORCE_IMAGE_PROXY_URL", False)
            is_debug = getattr(dj_settings, "DEBUG", False)
            should_use_proxy = force_proxy_url or (use_tos_storage and is_debug)
            
            if use_tos_storage and not should_use_proxy:
                # 使用 TOS 直链
                image_url = upload.image.url
            else:
                # 使用代理 URL（通过 Django 返回，自动处理 CORS）
                from django.urls import reverse
                proxy_url = reverse("core:user-upload-image", args=[upload.pk])
                
                if request:
                    image_url = request.build_absolute_uri(proxy_url)
                else:
                    image_url = proxy_url
                
                # 添加 token 参数
                token = getattr(getattr(request, "auth", None), "key", None)
                if not token and request is not None:
                    token = getattr(request.user, "auth_token", None)
                    if token:
                        token = getattr(token, "key", None)
                
                if token:
                    separator = "&" if "?" in image_url else "?"
                    image_url = f"{image_url}{separator}token={token}"

        return {
            "id": upload.id,
            "title": upload.title,
            "description": upload.notes,
            "uploadedAt": localized.isoformat(),
            "uploadedDate": localized.date().isoformat(),
            "durationMinutes": upload.duration_minutes,
            "selfRating": upload.self_rating,
            "moodLabel": upload.mood.name if upload.mood else (upload.mood_label or ""),
            "tags": list(upload.tags.values_list("name", flat=True)),
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
        
        # 验证每个检查点至少5小时
        target_hours = attrs.get("target_hours", 0)
        checkpoint_count = attrs.get("checkpoint_count", 1)
        if checkpoint_count > 0:
            hours_per_checkpoint = target_hours / checkpoint_count
            MIN_HOURS_PER_CHECKPOINT = 5
            if hours_per_checkpoint < MIN_HOURS_PER_CHECKPOINT:
                raise serializers.ValidationError(
                    f"每个检查点最少需要 {MIN_HOURS_PER_CHECKPOINT} 小时。"
                    f"当前总时长 {target_hours} 小时，{checkpoint_count} 个检查点，"
                    f"每个检查点约 {hours_per_checkpoint:.1f} 小时。"
                )
        
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


class MonthlyReportTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MonthlyReportTemplate
        fields = [
            "id",
            "section",
            "name",
            "text_template",
            "priority",
            "is_active",
            "min_total_uploads",
            "max_total_uploads",
            "min_total_hours",
            "max_total_hours",
            "min_avg_hours",
            "max_avg_hours",
            "creator_type",
            "min_avg_rating",
            "max_avg_rating",
            "uploads_change_direction",
            "hours_change_direction",
            "extra_conditions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_text_template(self, value: str) -> str:
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("文案模板不能为空。")
        if len(text) > 1000:
            raise serializers.ValidationError("文案模板不可超过 1000 字符。")
        return text

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # 验证数值范围
        min_uploads = attrs.get("min_total_uploads")
        max_uploads = attrs.get("max_total_uploads")
        if min_uploads is not None and max_uploads is not None and max_uploads < min_uploads:
            raise serializers.ValidationError({"max_total_uploads": "最大上传数需不小于最小上传数。"})
        
        min_hours = attrs.get("min_total_hours")
        max_hours = attrs.get("max_total_hours")
        if min_hours is not None and max_hours is not None and max_hours < min_hours:
            raise serializers.ValidationError({"max_total_hours": "最大总时长需不小于最小总时长。"})
        
        min_avg = attrs.get("min_avg_hours")
        max_avg = attrs.get("max_avg_hours")
        if min_avg is not None and max_avg is not None and max_avg < min_avg:
            raise serializers.ValidationError({"max_avg_hours": "最大平均时长需不小于最小平均时长。"})
        
        min_rating = attrs.get("min_avg_rating")
        max_rating = attrs.get("max_avg_rating")
        if min_rating is not None and max_rating is not None and max_rating < min_rating:
            raise serializers.ValidationError({"max_avg_rating": "最大平均评分需不小于最小平均评分。"})
        
        return attrs


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
            "dimension_question_mapping",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class UserTestResultListSerializer(serializers.ModelSerializer):
    """测试结果列表序列化器（轻量级，不包含详细答案数据）"""
    test_name = serializers.CharField(source="test.name", read_only=True)
    test_id = serializers.IntegerField(source="test.id", read_only=True)

    class Meta:
        model = UserTestResult
        fields = [
            "id",
            "test_id",
            "test_name",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class UserTestResultSerializer(serializers.ModelSerializer):
    """测试结果序列化器（完整数据）"""
    test_name = serializers.CharField(source="test.name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    test_id = serializers.IntegerField(source="test.id", read_only=True)

    class Meta:
        model = UserTestResult
        fields = [
            "id",
            "user",
            "user_email",
            "test",
            "test_id",
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


class VisualAnalysisResultListSerializer(serializers.ModelSerializer):
    """视觉分析结果列表序列化器（轻量级，不包含图片数据）"""
    
    class Meta:
        model = VisualAnalysisResult
        fields = [
            "id",
            "binary_threshold",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class VisualAnalysisResultSerializer(serializers.ModelSerializer):
    """视觉分析结果序列化器（完整数据）"""
    
    class Meta:
        model = VisualAnalysisResult
        fields = [
            "id",
            "original_image",
            "step1_binary",
            "step2_grayscale",
            "step3_lab_l",
            "step4_hsv_s",
            "step4_hls_s",
            "step5_hue",
            "step2_grayscale_3_level",
            "step2_grayscale_4_level",
            "step4_hls_s_inverted",
            "kmeans_segmentation_image",
            "kmeans_segmentation_image_12",
            "binary_threshold",
            "comprehensive_analysis",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
    
    def to_internal_value(self, data):
        """
        将base64字符串转换为文件对象
        """
        import base64
        import io
        from django.core.files.uploadedfile import InMemoryUploadedFile
        from django.core.files.base import ContentFile
        
        # 处理每个图片字段
        image_fields = [
            'original_image',
            'step1_binary',
            'step2_grayscale',
            'step3_lab_l',
            'step4_hsv_s',
            'step4_hls_s',
            'step5_hue',
            'step2_grayscale_3_level',
            'step2_grayscale_4_level',
            'step4_hls_s_inverted',
            'kmeans_segmentation_image',
        ]
        
        for field_name in image_fields:
            # 以下字段是可选的（旧字段，新流程不需要，或者新功能字段）
            optional_fields = [
                'step4_hsv_s',
                'step2_grayscale',  # 旧字段，新流程不需要
                'kmeans_segmentation_image_12',  # 新字段，旧数据可能没有
            ]
            
            # 如果字段不在data中，跳过
            if field_name not in data:
                continue
            
            # 如果字段是空字符串或None，从data中移除（不更新该字段，保留原有数据）
            field_value = data[field_name]
            if not field_value or (isinstance(field_value, str) and not field_value.strip()):
                # 可选字段允许为空，直接移除
                if field_name in optional_fields:
                    del data[field_name]
                    continue
                # 必需字段如果是空字符串，也移除（更新时保留原有数据）
                # 注意：创建时必需字段不能为空，但更新时可以为空（保留原有数据）
                # 如果是创建操作（没有instance），必需字段不能为空
                if self.instance is None:
                    # 创建时，必需字段不能为空
                    logger.warning(f"[VisualAnalysisResultSerializer] 创建时必需字段 {field_name} 为空，可能导致验证失败")
                del data[field_name]
                continue
                
            image_data = data[field_name]
            
            # 如果已经是文件对象（来自FormData），直接使用
            # Django REST Framework会自动处理FormData中的文件，所以这里应该已经是文件对象
            if hasattr(image_data, 'read') or hasattr(image_data, 'file') or hasattr(image_data, 'name'):
                # 已经是文件对象，不需要转换
                logger.info(f"[VisualAnalysisResultSerializer] {field_name} 是文件对象，直接使用")
                continue
            
            # 如果是base64字符串，转换为文件
            if isinstance(image_data, str) and image_data.strip():
                # 移除 data URL 前缀（如果有）
                if ',' in image_data:
                    image_data = image_data.split(',')[1]
                
                try:
                    # 解码base64
                    image_bytes = base64.b64decode(image_data)
                    
                    # 创建文件对象
                    file_obj = ContentFile(image_bytes)
                    
                    # 生成文件名（使用字段名作为扩展名提示）
                    filename = f"{field_name}.png"
                    
                    # 创建InMemoryUploadedFile
                    uploaded_file = InMemoryUploadedFile(
                        file_obj,
                        None,
                        filename,
                        'image/png',
                        len(image_bytes),
                        None
                    )
                    
                    data[field_name] = uploaded_file
                except Exception as e:
                    # 如果base64解码失败，可能是URL或其他格式，移除该字段（不更新）
                    logger.warning(f"[VisualAnalysisResultSerializer] {field_name} base64解码失败，跳过更新: {str(e)}")
                    del data[field_name]
                    continue
        
        # 处理comprehensive_analysis：新流程中只包含结构化数据（色相直方图、主色调分析）
        # 图片已经由 Celery 任务直接保存到 TOS，不需要在这里处理
        if 'comprehensive_analysis' in data:
            comprehensive_analysis = data['comprehensive_analysis']
            logger.info(f"[VisualAnalysisResultSerializer] 收到comprehensive_analysis: type={type(comprehensive_analysis)}")
            
            # 如果是字符串，先解析（FormData中的JSON字段会作为字符串传递）
            if isinstance(comprehensive_analysis, str):
                try:
                    comprehensive_analysis = json.loads(comprehensive_analysis)
                    logger.info(f"[VisualAnalysisResultSerializer] 解析JSON字符串成功")
                except (json.JSONDecodeError, TypeError) as e:
                    logger.error(f"[VisualAnalysisResultSerializer] JSON解析失败: {str(e)}")
                    comprehensive_analysis = None
            
            # 新流程：comprehensive_analysis 只包含结构化数据，不包含图片
            # 图片已经由 Celery 任务直接保存到 ImageField
            if isinstance(comprehensive_analysis, dict):
                # 直接保存，不需要提取图片（图片已由 Celery 任务保存）
                data['comprehensive_analysis'] = comprehensive_analysis
                logger.info(f"[VisualAnalysisResultSerializer] 保存comprehensive_analysis: keys={list(comprehensive_analysis.keys())}")
            elif comprehensive_analysis is None:
                # 如果为 None，设置为空字典
                data['comprehensive_analysis'] = {}
            else:
                logger.warning(f"[VisualAnalysisResultSerializer] comprehensive_analysis类型不正确: type={type(comprehensive_analysis)}")
                data['comprehensive_analysis'] = {}
        
        return super().to_internal_value(data)
    
    def to_representation(self, instance):
        """
        将ImageField转换为URL，如果是TOS URL则转换为代理URL（解决CORS问题）
        确保 comprehensive_analysis JSONField 被正确序列化
        """
        data = super().to_representation(instance)
        request = self.context.get('request')
        
        # 辅助函数：将TOS URL转换为代理URL
        def get_proxied_url(url):
            if not url or not isinstance(url, str):
                return url
            # 如果已经是代理URL，直接返回（避免重复转换）
            if '/visual-analysis/proxy-image/' in url:
                return url
            # 检查是否是TOS URL
            tos_domains = [
                'tos-cn-shanghai.volces.com',
                'tos.cn-shanghai.volces.com',
                'echobucket.tos-cn-shanghai.volces.com',
            ]
            if any(domain in url for domain in tos_domains):
                # 构建代理URL
                if request:
                    from urllib.parse import quote
                    base_url = request.build_absolute_uri('/api/visual-analysis/proxy-image/')
                    return f"{base_url}?url={quote(url, safe='')}"
            return url
        
        # 处理 comprehensive_analysis JSONField
        # 确保它被正确序列化为字典（而不是字符串）
        if 'comprehensive_analysis' in data:
            comprehensive_analysis = data['comprehensive_analysis']
            # 如果是字符串，尝试解析为字典
            if isinstance(comprehensive_analysis, str):
                try:
                    import json
                    comprehensive_analysis = json.loads(comprehensive_analysis)
                    data['comprehensive_analysis'] = comprehensive_analysis
                    logger.info(f"[VisualAnalysisResultSerializer] 解析comprehensive_analysis字符串为字典成功")
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"[VisualAnalysisResultSerializer] comprehensive_analysis字符串解析失败: {str(e)}")
                    # 如果解析失败，设置为空字典而不是None，避免前端报错
                    data['comprehensive_analysis'] = {}
            # 如果是None，设置为空字典
            elif comprehensive_analysis is None:
                data['comprehensive_analysis'] = {}
            # 确保是字典类型
            elif not isinstance(comprehensive_analysis, dict):
                logger.warning(f"[VisualAnalysisResultSerializer] comprehensive_analysis类型不正确: {type(comprehensive_analysis)}")
                data['comprehensive_analysis'] = {}
        
        # 处理每个图片字段，转换为URL
        image_fields = [
            'original_image',
            'step1_binary',
            'step2_grayscale',  # 旧字段，可选
            'step2_grayscale_3_level',  # 必填（Step1）
            'step2_grayscale_4_level',  # 必填（Step1）
            'step4_hls_s_inverted',  # 必填（Step3）
            'kmeans_segmentation_image',  # 必填（Step5，8色）
            'kmeans_segmentation_image_12',  # 可选（Step5，12色）
            'step3_lab_l',  # 必填（Step2）
            'step4_hsv_s',  # 旧字段，可选
            'step4_hls_s',  # 必填（Step3）
            'step5_hue',  # 必填（Step4）
        ]
        
        # 可选字段（旧字段，新流程不需要）
        # 注意：step2_grayscale 在新流程中用于保存RGB转明度图，所以应该返回URL（不再是可选字段）
        optional_fields = ['step4_hsv_s']  # step2_grayscale 不再可选，因为新流程会保存RGB转明度图
        
        for field_name in image_fields:
            field_value = getattr(instance, field_name, None)
            
            # 处理图片字段：转换为URL
            if field_value and hasattr(field_value, 'url'):
                # 如果有request上下文，构建绝对URL
                url = request.build_absolute_uri(field_value.url) if request else field_value.url
                data[field_name] = get_proxied_url(url)
            else:
                # 字段为空
                if field_name in optional_fields:
                    # 可选字段：返回空字符串
                    data[field_name] = ""
                else:
                    # 必填字段为空，记录警告但返回空字符串（避免前端报错）
                    logger.warning(f"[VisualAnalysisResultSerializer] 必填字段 {field_name} 为空！")
                    data[field_name] = ""
        
        return data

