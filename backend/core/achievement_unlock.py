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
    
    对于基于上传数量的成就，返回触发该成就的上传记录的ID和图片URL。
    
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
    
    if metric != "total_uploads":
        return None
    
    try:
        threshold = int(float(threshold))
    except (ValueError, TypeError):
        return None
    
    # 查找用户第 threshold 次上传
    if operator in (">=", ">", "=="):
        uploads = (
            UserUpload.objects.filter(user=user)
            .order_by("uploaded_at", "id")[:threshold]
        )
        uploads_list = list(uploads)
        if len(uploads_list) >= threshold:
            target_upload = uploads_list[threshold - 1]
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

