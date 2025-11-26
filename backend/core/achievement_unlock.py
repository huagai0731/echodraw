"""
成就解锁逻辑：幂等、并发安全的解锁流程。

支持：
- 幂等解锁（重复调用不会创建重复记录）
- 并发安全（使用数据库唯一约束 + 事务）
- 解锁时间推断（基于最早满足条件的日期）
- 解锁来源记录（自动/手动/推断）
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional, Tuple, Dict, Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.achievement_evaluator import get_evaluator
from core.models import Achievement, DailyCheckIn, UserAchievement, UserUpload

logger = logging.getLogger(__name__)

User = get_user_model()


class UnlockResult:
    """解锁结果"""
    
    def __init__(
        self,
        unlocked: bool,
        is_new: bool,
        unlocked_at: Optional[datetime] = None,
        user_achievement: Optional[UserAchievement] = None,
        reason: Optional[str] = None,
    ):
        self.unlocked = unlocked
        self.is_new = is_new
        self.unlocked_at = unlocked_at
        self.user_achievement = user_achievement
        self.reason = reason
    
    def to_dict(self) -> dict:
        return {
            "unlocked": self.unlocked,
            "is_new": self.is_new,
            "unlocked_at": self.unlocked_at.isoformat() if self.unlocked_at else None,
            "reason": self.reason,
        }


def _get_trigger_upload_info(
    user: User,
    achievement: Achievement,
) -> Optional[Dict[str, Any]]:
    """
    获取触发成就的上传记录信息（如果适用）。
    
    对于所有可以关联到具体上传记录的成就类型，返回触发该成就的上传记录的ID和图片URL。
    支持多种成就类型：total_uploads, total_duration_minutes, max_session_minutes,
    upload_self_rating, uploads_in_time_window, uploads_with_mood, tag_usage,
    upload_rating_with_mood, uploads_per_day 等。
    
    Args:
        user: 用户对象
        achievement: 成就对象
    
    Returns:
        包含上传ID和图片URL的字典，如果不适用则返回 None
    """
    condition = achievement.condition or {}
    if not isinstance(condition, dict):
        return None
    
    metric = condition.get("metric", "").strip()
    operator = condition.get("operator", ">=").strip()
    threshold = condition.get("threshold", 0)
    
    try:
        threshold = int(float(threshold))
    except (ValueError, TypeError):
        pass  # 某些成就类型可能不需要数值threshold
    
    target_upload: Optional[UserUpload] = None
    
    # 处理基于上传数量的成就（如"世界留痕"）
    if metric == "total_uploads":
        if operator in (">=", ">", "==") and threshold > 0:
            uploads = (
                UserUpload.objects.filter(user=user)
                .order_by("uploaded_at", "id")[:threshold]
            )
            uploads_list = list(uploads)
            if len(uploads_list) >= threshold:
                target_upload = uploads_list[threshold - 1]
    
    # 处理基于累计时长的成就（如"长路积深"）
    elif metric == "total_duration_minutes":
        if operator in (">=", ">") and threshold > 0:
            # 按时间顺序获取所有上传记录，累计时长
            uploads = (
                UserUpload.objects.filter(user=user)
                .order_by("uploaded_at", "id")
            )
            cumulative_duration = 0
            for upload in uploads:
                # 累加时长（单位：分钟）
                duration_minutes = upload.duration_minutes or 0
                cumulative_duration += duration_minutes
                # 找到第一次达到阈值的上传
                if cumulative_duration >= threshold:
                    target_upload = upload
                    break
    
    # 处理单次最长时长的成就（如"心流时刻"、"一笔封山"）
    elif metric == "max_session_minutes":
        if operator in (">=", ">") and threshold > 0:
            # 找到时长最长的上传记录
            uploads = (
                UserUpload.objects.filter(user=user)
                .filter(duration_minutes__gte=threshold)
                .order_by("-duration_minutes", "-uploaded_at")
            )
            target_upload = uploads.first()
    
    # 处理自评分的成就（如"一见倾心"）
    elif metric == "upload_self_rating":
        occurrence = condition.get("occurrence", 1)
        rating_threshold = threshold if threshold > 0 else 100
        if operator in (">=", ">", "=="):
            # 找到第N次评分≥阈值的上传
            uploads = (
                UserUpload.objects.filter(user=user, self_rating__gte=rating_threshold)
                .order_by("uploaded_at", "id")
            )
            uploads_list = list(uploads)
            if len(uploads_list) >= occurrence:
                target_upload = uploads_list[occurrence - 1]
    
    # 处理时间窗口内的上传（如"清晨之光"、"黄昏笔迹"等）
    elif metric == "uploads_in_time_window":
        time_window = condition.get("time_window", {})
        if time_window and threshold > 0:
            # 找到最后一次在时间窗口内上传的记录
            from datetime import time as dt_time
            start_str = time_window.get("start", "")
            end_str = time_window.get("end", "")
            spans_midnight = time_window.get("spans_midnight", False)
            
            if start_str and end_str:
                try:
                    start_hour, start_min = map(int, start_str.split(":"))
                    end_hour, end_min = map(int, end_str.split(":"))
                    
                    # 获取所有上传记录，然后在Python中过滤时间窗口
                    # 注意：为了找到准确的第threshold次上传，我们需要所有记录
                    # 但如果用户记录太多，可以考虑限制范围
                    all_uploads = (
                        UserUpload.objects.filter(user=user)
                        .order_by("uploaded_at", "id")
                    )
                    
                    # 在Python层面过滤时间窗口内的上传
                    filtered_uploads = []
                    for upload in all_uploads:
                        upload_time = upload.uploaded_at
                        # 转换为用户本地时区的小时和分钟
                        if hasattr(upload_time, 'astimezone'):
                            try:
                                from zoneinfo import ZoneInfo
                                shanghai_tz = ZoneInfo("Asia/Shanghai")
                                local_time = upload_time.astimezone(shanghai_tz)
                            except (ImportError, Exception):
                                # 回退到系统时区
                                local_time = upload_time
                        else:
                            local_time = upload_time
                        
                        hour = local_time.hour
                        minute = local_time.minute
                        time_minutes = hour * 60 + minute
                        start_minutes = start_hour * 60 + start_min
                        end_minutes = end_hour * 60 + end_min
                        
                        in_window = False
                        if spans_midnight:
                            # 跨午夜的时间窗口（如22:00-00:00）
                            in_window = time_minutes >= start_minutes or time_minutes <= end_minutes
                        else:
                            # 正常时间窗口
                            in_window = start_minutes <= time_minutes <= end_minutes
                        
                        if in_window:
                            filtered_uploads.append(upload)
                    
                    # 取第threshold次上传
                    if len(filtered_uploads) >= threshold:
                        target_upload = filtered_uploads[threshold - 1]
                except (ValueError, TypeError) as e:
                    logger.debug(
                        f"Failed to parse time window for achievement {achievement.slug}: {e}",
                        extra={"time_window": time_window}
                    )
                    pass
    
    # 处理带心情的上传（如"灵感闪起"等心情系列）
    elif metric == "uploads_with_mood":
        mood = condition.get("mood", "")
        if mood and threshold > 0:
            # 找到最后一次使用指定心情的第threshold次上传
            uploads = (
                UserUpload.objects.filter(user=user, mood_label=mood)
                .order_by("uploaded_at", "id")
            )
            uploads_list = list(uploads[:threshold])
            if len(uploads_list) >= threshold:
                target_upload = uploads_list[threshold - 1]
    
    # 处理标签使用的成就（如"摸鱼者"、"成图者"等）
    elif metric == "tag_usage":
        tag = condition.get("tag", "")
        if tag and threshold > 0:
            # 找到最后一次使用指定标签的第threshold次上传
            # tags是ManyToManyField，需要使用tags__name来查询
            uploads = (
                UserUpload.objects.filter(user=user, tags__name=tag)
                .order_by("uploaded_at", "id")
            )
            uploads_list = list(uploads[:threshold])
            if len(uploads_list) >= threshold:
                target_upload = uploads_list[threshold - 1]
    
    # 处理评分+心情组合的成就（如"笑里藏刀"、"愉悦的自嘲"等）
    elif metric == "upload_rating_with_mood":
        mood = condition.get("mood", "")
        rating_threshold = threshold if threshold > 0 else 80
        if mood:
            # 找到最后一次评分和心情都满足条件的上传
            query = Q(user=user, mood_label=mood)
            if operator in (">=", ">"):
                query &= Q(self_rating__gte=rating_threshold)
            elif operator in ("<=", "<"):
                query &= Q(self_rating__lte=rating_threshold)
            elif operator == "==":
                query &= Q(self_rating=rating_threshold)
            
            uploads = UserUpload.objects.filter(query).order_by("-uploaded_at")
            target_upload = uploads.first()
    
    # 处理单日多次上传的成就（如"碎片成诗"）
    elif metric == "uploads_per_day":
        if threshold > 0:
            # 找到最后一次在某天有≥threshold次上传的那天的最后一次上传
            from django.db.models import Count
            from django.utils import timezone
            from datetime import timedelta
            
            # 查找最近60天内的数据（扩大范围以增加找到匹配的概率）
            sixty_days_ago = timezone.now() - timedelta(days=60)
            recent_uploads = (
                UserUpload.objects.filter(user=user, uploaded_at__gte=sixty_days_ago)
                .order_by("uploaded_at", "id")
            )
            
            # 按日期分组统计
            from collections import defaultdict
            daily_uploads = defaultdict(list)
            for upload in recent_uploads:
                upload_date = upload.uploaded_at.date()
                daily_uploads[upload_date].append(upload)
            
            # 找到有≥threshold次上传的日期（按时间倒序）
            matching_dates = [
                date for date, uploads in sorted(daily_uploads.items(), reverse=True)
                if len(uploads) >= threshold
            ]
            
            if matching_dates:
                target_date = matching_dates[0]
                target_upload = daily_uploads[target_date][-1]  # 该天最后一次上传
    
    # 对于其他类型的成就，尝试找到最近一次相关的上传记录
    # 这样可以尽可能多地显示图片，即使不是精确的触发记录
    if not target_upload and metric not in ("total_checkins", "custom"):
        # 对于与上传相关的成就，至少返回最近一次上传的图片
        recent_upload = (
            UserUpload.objects.filter(user=user)
            .order_by("-uploaded_at")
            .first()
        )
        if recent_upload:
            target_upload = recent_upload
    
    # 如果找到了触发上传，返回其信息
    if target_upload:
        result = {
            "artwork_id": target_upload.id,
            "upload_id": target_upload.id,
        }
        # 获取图片URL
        if target_upload.image:
            try:
                result["artwork_url"] = target_upload.image.url
                result["unlock_image_url"] = target_upload.image.url
                result["image_url"] = target_upload.image.url
            except Exception as e:
                logger.warning(
                    f"Failed to get image URL for upload {target_upload.id}: {e}",
                    extra={"upload_id": target_upload.id, "user_id": user.id}
                )
        return result
    
    return None


def infer_unlock_date(
    user: User,
    achievement: Achievement,
    *,
    reference_time: Optional[datetime] = None,
) -> Optional[datetime]:
    """
    根据成就条件推断合理的解锁日期。
    
    对于已经满足条件但之前没有记录的成就，尝试根据条件推断一个合理的解锁日期。
    
    Args:
        user: 用户对象
        achievement: 成就对象
        reference_time: 参考时间（用于推断），默认为当前时间
    
    Returns:
        推断的解锁日期，如果无法推断则返回 None
    """
    # 尝试获取上海时区
    try:
        from zoneinfo import ZoneInfo
        SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
    except ImportError:
        try:
            import pytz
            SHANGHAI_TZ = pytz.timezone("Asia/Shanghai")
        except ImportError:
            SHANGHAI_TZ = None
    
    condition = achievement.condition or {}
    if not isinstance(condition, dict):
        return None
    
    metric = condition.get("metric", "").strip()
    operator = condition.get("operator", ">=").strip()
    threshold = condition.get("threshold", 0)
    
    if not metric:
        return None
    
    try:
        threshold = int(float(threshold))
    except (ValueError, TypeError):
        return None
    
    reference_time = reference_time or timezone.now()
    
    # 根据不同的指标类型推断解锁日期
    if metric == "total_uploads":
        # 查找用户第 threshold 次上传的时间
        if operator in (">=", ">"):
            # 对于 >= 或 >，查找第 threshold 次上传
            uploads = (
                UserUpload.objects.filter(user=user)
                .order_by("uploaded_at", "id")[:threshold]
            )
            uploads_list = list(uploads)
            if len(uploads_list) >= threshold:
                # 获取第 threshold 次上传的时间
                target_upload = uploads_list[threshold - 1]
                return target_upload.uploaded_at
        elif operator == "==":
            # 对于 ==，查找第 threshold 次上传
            uploads = (
                UserUpload.objects.filter(user=user)
                .order_by("uploaded_at", "id")[:threshold]
            )
            uploads_list = list(uploads)
            if len(uploads_list) >= threshold:
                target_upload = uploads_list[threshold - 1]
                return target_upload.uploaded_at
    
    elif metric == "total_checkins":
        # 查找用户第 threshold 次打卡的时间
        # 使用 date 字段排序，因为 checked_at 是 auto_now 会变化
        if operator in (">=", ">"):
            checkins = (
                DailyCheckIn.objects.filter(user=user)
                .order_by("date", "id")[:threshold]
            )
            checkins_list = list(checkins)
            if len(checkins_list) >= threshold:
                target_checkin = checkins_list[threshold - 1]
                # 将日期转换为 datetime（使用当天的开始时间）
                from datetime import time as dt_time
                
                date_obj = target_checkin.date
                dt = datetime.combine(date_obj, dt_time.min)
                if SHANGHAI_TZ is not None:
                    return timezone.make_aware(dt, timezone=SHANGHAI_TZ)
                else:
                    return timezone.make_aware(dt)
        elif operator == "==":
            checkins = (
                DailyCheckIn.objects.filter(user=user)
                .order_by("date", "id")[:threshold]
            )
            checkins_list = list(checkins)
            if len(checkins_list) >= threshold:
                target_checkin = checkins_list[threshold - 1]
                from datetime import time as dt_time
                
                date_obj = target_checkin.date
                dt = datetime.combine(date_obj, dt_time.min)
                if SHANGHAI_TZ is not None:
                    return timezone.make_aware(dt, timezone=SHANGHAI_TZ)
                else:
                    return timezone.make_aware(dt)
    
    # 对于其他类型的指标，无法推断，返回 None
    return None


def evaluate_or_unlock(
    user: User,
    achievement: Achievement,
    *,
    user_stats: Optional[dict] = None,
    provenance: str = UserAchievement.PROVENANCE_AUTO,
    meta: Optional[dict] = None,
    max_retries: int = 3,
) -> UnlockResult:
    """
    评估成就条件并解锁（如果满足）。
    
    此函数是幂等的：如果成就已解锁，不会创建重复记录。
    并发安全：使用数据库唯一约束 + 重试机制。
    
    Args:
        user: 用户对象
        achievement: 成就对象
        user_stats: 可选的用户统计数据缓存
        provenance: 解锁来源（auto/manual/inferred/legacy）
        meta: 解锁时的元数据（例如触发的指标值、评估原因等）
        max_retries: 最大重试次数（用于处理并发冲突）
    
    Returns:
        UnlockResult 对象
    """
    evaluator = get_evaluator()
    
    # 评估条件
    eval_result = evaluator.evaluate(
        user,
        achievement,
        user_stats=user_stats,
        log_evaluation=True,
    )
    
    if not eval_result.matched:
        return UnlockResult(
            unlocked=False,
            is_new=False,
            reason="条件不满足",
        )
    
    # 检查是否已解锁
    try:
        existing = UserAchievement.objects.get(
            user=user,
            achievement=achievement,
        )
        return UnlockResult(
            unlocked=True,
            is_new=False,
            unlocked_at=existing.unlocked_at,
            user_achievement=existing,
            reason="已解锁",
        )
    except UserAchievement.DoesNotExist:
        pass
    
    # 推断解锁时间
    inferred_date = infer_unlock_date(user, achievement)
    unlock_time = inferred_date if inferred_date else timezone.now()
    
    # 获取触发图片信息（如果适用）
    trigger_upload_info = _get_trigger_upload_info(user, achievement)
    
    # 构建元数据
    unlock_meta = meta or {}
    unlock_meta.update({
        "evaluation_reasons": eval_result.reasons,
        "metric_values": eval_result.metric_values,
        "inferred_date": inferred_date.isoformat() if inferred_date else None,
    })
    
    # 如果找到了触发上传，将图片信息添加到元数据
    if trigger_upload_info:
        unlock_meta.update(trigger_upload_info)
        logger.info(
            f"Added trigger image info to achievement {achievement.slug}",
            extra={
                "achievement_id": achievement.id,
                "achievement_slug": achievement.slug,
                "user_id": user.id,
                "artwork_id": trigger_upload_info.get("artwork_id"),
                "has_image_url": bool(trigger_upload_info.get("artwork_url") or trigger_upload_info.get("unlock_image_url")),
            }
        )
    else:
        logger.debug(
            f"No trigger upload info found for achievement {achievement.slug}",
            extra={
                "achievement_id": achievement.id,
                "achievement_slug": achievement.slug,
                "user_id": user.id,
                "condition_metric": achievement.condition.get("metric") if isinstance(achievement.condition, dict) else None,
            }
        )
    
    # 尝试创建解锁记录（带重试机制处理并发）
    for attempt in range(max_retries):
        try:
            with transaction.atomic():
                # 再次检查（防止并发创建）
                existing = UserAchievement.objects.filter(
                    user=user,
                    achievement=achievement,
                ).first()
                if existing:
                    return UnlockResult(
                        unlocked=True,
                        is_new=False,
                        unlocked_at=existing.unlocked_at,
                        user_achievement=existing,
                        reason="已解锁（并发检测）",
                    )
                
                # 创建新记录
                user_achievement = UserAchievement.objects.create(
                    user=user,
                    achievement=achievement,
                    unlocked_at=unlock_time,
                    provenance=provenance,
                    meta=unlock_meta,
                )
                
                logger.info(
                    f"Achievement unlocked: {achievement.slug} for user {user.id}",
                    extra={
                        "achievement_id": achievement.id,
                        "achievement_slug": achievement.slug,
                        "user_id": user.id,
                        "provenance": provenance,
                        "unlocked_at": unlock_time.isoformat(),
                    },
                )
                
                return UnlockResult(
                    unlocked=True,
                    is_new=True,
                    unlocked_at=unlock_time,
                    user_achievement=user_achievement,
                    reason="新解锁",
                )
        except Exception as e:
            if attempt < max_retries - 1:
                # 重试（可能是并发冲突）
                logger.debug(
                    f"Retry unlocking achievement {achievement.slug} for user {user.id} (attempt {attempt + 1})",
                    extra={
                        "achievement_id": achievement.id,
                        "user_id": user.id,
                        "error": str(e),
                    },
                )
                continue
            else:
                # 最后一次尝试失败，记录错误
                logger.error(
                    f"Failed to unlock achievement {achievement.slug} for user {user.id} after {max_retries} attempts",
                    exc_info=True,
                    extra={
                        "achievement_id": achievement.id,
                        "user_id": user.id,
                        "error": str(e),
                    },
                )
                # 尝试获取已存在的记录（可能在其他事务中已创建）
                try:
                    existing = UserAchievement.objects.get(
                        user=user,
                        achievement=achievement,
                    )
                    return UnlockResult(
                        unlocked=True,
                        is_new=False,
                        unlocked_at=existing.unlocked_at,
                        user_achievement=existing,
                        reason="已解锁（最终检查）",
                    )
                except UserAchievement.DoesNotExist:
                    return UnlockResult(
                        unlocked=False,
                        is_new=False,
                        reason=f"解锁失败: {str(e)}",
                    )
    
    # 理论上不会到达这里
    return UnlockResult(
        unlocked=False,
        is_new=False,
        reason="未知错误",
    )

