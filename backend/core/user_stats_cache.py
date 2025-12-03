"""
用户统计缓存：物化统计字段，避免每次评估做复杂聚合。

提供：
- 用户统计数据的缓存和更新机制
- 定期聚合任务支持
- 缓存失效策略
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Dict

from django.core.cache import cache
from django.utils import timezone

from core.models import DailyCheckIn, UserStats, UserUpload

logger = logging.getLogger(__name__)

# 缓存键前缀
CACHE_PREFIX = "user_stats"
CACHE_TIMEOUT = 300  # 5分钟


def get_user_stats(user) -> Dict[str, any]:
    """
    获取用户统计数据（带缓存）。
    
    Args:
        user: 用户对象
    
    Returns:
        统计数据字典，包含：
        - total_uploads: 总上传数
        - total_checkins: 总打卡次数
        - current_streak: 当前连续打卡天数
        - checked_today: 今天是否打卡（1=是，0=否）
    """
    cache_key = f"{CACHE_PREFIX}:{user.id}"
    
    # 尝试从缓存获取
    cached_stats = cache.get(cache_key)
    if cached_stats is not None:
        return cached_stats
    
    # 缓存未命中，计算统计数据
    stats = _calculate_user_stats(user)
    
    # 写入缓存
    cache.set(cache_key, stats, CACHE_TIMEOUT)
    
    return stats


def _calculate_user_stats(user) -> Dict[str, any]:
    """
    计算用户统计数据（不使用缓存）。
    
    注意：此函数可能执行较慢，应配合缓存使用。
    """
    from core.views import _get_check_in_stats
    
    check_in_stats = _get_check_in_stats(user)
    total_uploads = UserUpload.objects.filter(user=user).count()
    
    return {
        "total_uploads": total_uploads,
        "total_checkins": check_in_stats.get("total_checkins", 0),
        "current_streak": check_in_stats.get("current_streak", 0),
        "checked_today": 1 if check_in_stats.get("checked_today", False) else 0,
    }


def invalidate_user_stats_cache(user_id: int) -> None:
    """
    使指定用户的统计缓存失效。
    
    在以下情况下应调用此函数：
    - 用户上传了新作品
    - 用户打卡
    - 用户数据发生变化
    """
    cache_key = f"{CACHE_PREFIX}:{user_id}"
    cache.delete(cache_key)
    logger.debug(f"Invalidated user stats cache for user {user_id}")


def invalidate_all_user_stats_cache() -> None:
    """
    使所有用户的统计缓存失效。
    
    注意：此操作可能较慢，应谨慎使用。
    """
    # 由于无法枚举所有缓存键，这里使用一个版本号机制
    # 实际实现中可以使用 Redis 的 keys 命令或维护一个键集合
    logger.warning("invalidate_all_user_stats_cache() called - this may be slow")


def update_user_stats_cache(user) -> Dict[str, any]:
    """
    强制更新用户统计缓存。
    
    Args:
        user: 用户对象
    
    Returns:
        更新后的统计数据
    """
    invalidate_user_stats_cache(user.id)
    return get_user_stats(user)


def get_or_update_for_user(user) -> UserStats:
    """
    获取或更新用户的统计数据（使用物化表）。
    
    Args:
        user: 用户对象
    
    Returns:
        UserStats 对象
    """
    stats, created = UserStats.objects.get_or_create(user=user)
    if not created:
        # 检查是否需要更新（超过5分钟）
        time_threshold = timezone.now() - timedelta(minutes=5)
        if stats.last_updated < time_threshold:
            stats = update_for_user(user)
    return stats


def update_for_user(user) -> UserStats:
    """
    强制更新用户的统计数据（使用物化表）。
    
    Args:
        user: 用户对象
    
    Returns:
        更新后的 UserStats 对象
    """
    calculated_stats = _calculate_user_stats(user)
    
    stats, _ = UserStats.objects.update_or_create(
        user=user,
        defaults={
            "total_uploads": calculated_stats["total_uploads"],
            "total_checkins": calculated_stats["total_checkins"],
            "current_streak": calculated_stats["current_streak"],
            "checked_today": bool(calculated_stats["checked_today"]),
        },
    )
    
    return stats


def user_stats_to_dict(stats: UserStats) -> Dict[str, any]:
    """转换为字典格式"""
    return {
        "total_uploads": stats.total_uploads,
        "total_checkins": stats.total_checkins,
        "current_streak": stats.current_streak,
        "checked_today": 1 if stats.checked_today else 0,
    }
