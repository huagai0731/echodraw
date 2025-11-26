"""
成就条件评估引擎：可组合、可测试、可扩展的评估模块。

支持：
- 多种指标（metric）的评估
- 可扩展的指标注册机制
- 评估结果包含匹配原因（reasons）
- 评估日志记录（可选）
"""
from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional, Tuple

from django.contrib.auth import get_user_model
from django.db.models import Count, Q

from core.models import Achievement, DailyCheckIn, UserUpload

logger = logging.getLogger(__name__)

User = get_user_model()

# 指标计算器类型：接收用户对象，返回指标值
MetricCalculator = Callable[[Any], float | int]


class EvaluationResult:
    """评估结果"""
    
    def __init__(
        self,
        matched: bool,
        reasons: Optional[List[str]] = None,
        metric_values: Optional[Dict[str, Any]] = None,
    ):
        self.matched = matched
        self.reasons = reasons or []
        self.metric_values = metric_values or {}
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "matched": self.matched,
            "reasons": self.reasons,
            "metric_values": self.metric_values,
        }


class AchievementEvaluator:
    """
    成就条件评估器。
    
    使用注册的指标计算器来评估成就条件。
    """
    
    def __init__(self):
        self._metric_calculators: Dict[str, MetricCalculator] = {}
        self._register_default_metrics()
    
    def register_metric(self, name: str, calculator: MetricCalculator) -> None:
        """
        注册指标计算器。
        
        Args:
            name: 指标名称（如 "total_uploads"）
            calculator: 计算器函数，接收用户对象，返回数值
        """
        self._metric_calculators[name] = calculator
    
    def _register_default_metrics(self) -> None:
        """注册默认的指标计算器"""
        
        def total_uploads(user) -> int:
            """总上传数"""
            return UserUpload.objects.filter(user=user).count()
        
        def total_checkins(user) -> int:
            """总打卡次数"""
            return DailyCheckIn.objects.filter(user=user).count()
        
        def current_streak(user) -> int:
            """当前连续打卡天数"""
            from core.views import _get_check_in_stats
            stats = _get_check_in_stats(user)
            return stats.get("current_streak", 0)
        
        def checked_today(user) -> int:
            """今天是否打卡（1=是，0=否）"""
            from core.views import _get_check_in_stats
            stats = _get_check_in_stats(user)
            return 1 if stats.get("checked_today", False) else 0
        
        def total_duration_minutes(user) -> int:
            """总时长（分钟）"""
            from django.db.models import Sum
            result = UserUpload.objects.filter(user=user).aggregate(
                total=Sum("duration_minutes")
            )
            return int(result["total"] or 0)
        
        def upload_self_rating(user) -> int:
            """自评分数满足条件的上传数（需要从条件中获取阈值和出现次数）"""
            # 这个指标需要从成就条件中获取额外参数，暂时返回0
            # 实际评估时应该通过条件中的occurrence参数来判断
            return 0
        
        def upload_rating_with_mood(user) -> int:
            """带心情的上传评分满足条件的数量（需要从条件中获取mood和threshold）"""
            # 这个指标需要从成就条件中获取mood和threshold参数，暂时返回0
            return 0
        
        def uploads_in_time_window(user) -> int:
            """时间窗口内的上传数（需要从条件中获取time_window参数）"""
            # 这个指标需要从成就条件中获取time_window参数，暂时返回0
            return 0
        
        def custom(user) -> int:
            """自定义指标（需要特殊处理，暂时返回0）"""
            # 自定义指标需要根据code和parameters来评估，这里暂时返回0
            # 实际评估应该在evaluate方法中特殊处理
            return 0
        
        def uploads_with_mood(user) -> int:
            """带心情的上传数（需要从条件中获取mood参数）"""
            # 这个指标需要从成就条件中获取mood参数，暂时返回0
            # 实际评估时应该通过条件中的mood参数来判断
            return 0
        
        def consecutive_upload_days(user) -> int:
            """连续上传天数"""
            from django.utils import timezone
            from datetime import timedelta
            from collections import defaultdict
            
            # 获取用户的所有上传记录，按日期分组
            uploads = UserUpload.objects.filter(user=user).order_by("uploaded_at")
            if not uploads.exists():
                return 0
            
            # 按日期分组（使用上海时区）
            from core.views import get_today_shanghai
            daily_uploads = defaultdict(set)
            for upload in uploads:
                # 使用上传时间转换为上海时区的日期
                upload_date = upload.uploaded_at
                if upload_date.tzinfo is None:
                    upload_date = timezone.make_aware(upload_date)
                # 转换为上海时区
                from django.utils import timezone as tz
                shanghai_tz = tz.get_fixed_timezone(8 * 60)  # UTC+8
                upload_date_shanghai = upload_date.astimezone(shanghai_tz)
                date_key = upload_date_shanghai.date()
                daily_uploads[date_key].add(upload.id)
            
            if not daily_uploads:
                return 0
            
            # 计算连续天数（从今天往前计算）
            today = get_today_shanghai()
            consecutive_days = 0
            current_date = today
            
            while current_date in daily_uploads:
                consecutive_days += 1
                current_date = current_date - timedelta(days=1)
            
            return consecutive_days
        
        def tag_usage(user) -> int:
            """标签使用次数（需要从条件中获取tag参数）"""
            # 这个指标需要从成就条件中获取tag参数，暂时返回0
            # 实际评估时应该通过条件中的tag参数来判断
            return 0
        
        self.register_metric("total_uploads", total_uploads)
        self.register_metric("total_checkins", total_checkins)
        self.register_metric("current_streak", current_streak)
        self.register_metric("checked_today", checked_today)
        self.register_metric("total_duration_minutes", total_duration_minutes)
        self.register_metric("upload_self_rating", upload_self_rating)
        self.register_metric("upload_rating_with_mood", upload_rating_with_mood)
        self.register_metric("uploads_in_time_window", uploads_in_time_window)
        self.register_metric("uploads_with_mood", uploads_with_mood)
        self.register_metric("consecutive_upload_days", consecutive_upload_days)
        self.register_metric("tag_usage", tag_usage)
        self.register_metric("custom", custom)
    
    def _compare_values(
        self,
        actual_value: float | int,
        operator: str,
        threshold: float,
    ) -> bool:
        """
        比较实际值与阈值。
        
        Args:
            actual_value: 实际值
            operator: 操作符（">=", ">", "<=", "<", "==", "!="）
            threshold: 阈值
        
        Returns:
            比较结果
        """
        try:
            actual_value = float(actual_value)
            threshold = float(threshold)
        except (ValueError, TypeError):
            return False
        
        if operator == ">=":
            return actual_value >= threshold
        elif operator == ">":
            return actual_value > threshold
        elif operator == "<=":
            return actual_value <= threshold
        elif operator == "<":
            return actual_value < threshold
        elif operator == "==":
            return abs(actual_value - threshold) < 1e-6  # 浮点数比较
        elif operator == "!=":
            return abs(actual_value - threshold) >= 1e-6
        else:
            logger.warning(f"Unknown operator: {operator}", extra={"operator": operator})
            return False
    
    def evaluate(
        self,
        user: Any,
        achievement: Achievement,
        *,
        user_stats: Optional[Dict[str, Any]] = None,
        log_evaluation: bool = False,
    ) -> EvaluationResult:
        """
        评估用户是否满足成就条件。
        
        Args:
            user: 用户对象
            achievement: 成就对象
            user_stats: 可选的用户统计数据缓存（键为指标名，值为指标值）
            log_evaluation: 是否记录评估日志
        
        Returns:
            EvaluationResult 对象，包含匹配结果、原因和指标值
        """
        condition = achievement.condition or {}
        if not isinstance(condition, dict) or not condition:
            return EvaluationResult(
                matched=False,
                reasons=["成就条件为空或格式错误"],
            )
        
        metric = condition.get("metric", "").strip()
        operator = condition.get("operator", ">=").strip()
        threshold = condition.get("threshold", 0)
        
        if not metric:
            return EvaluationResult(
                matched=False,
                reasons=["成就条件缺少指标名称"],
            )
        
        try:
            threshold = float(threshold)
        except (ValueError, TypeError):
            return EvaluationResult(
                matched=False,
                reasons=[f"成就条件阈值格式错误: {threshold}"],
            )
        
        # 特殊处理：custom指标需要根据code和parameters来评估
        if metric == "custom":
            # custom指标暂时返回不匹配，因为这些需要特殊的评估逻辑
            # 可以在后续版本中实现具体的custom指标评估
            logger.debug(
                f"Custom metric detected for achievement {achievement.slug}, skipping standard evaluation",
                extra={
                    "achievement_id": achievement.id,
                    "achievement_slug": achievement.slug,
                    "condition": condition,
                }
            )
            return EvaluationResult(
                matched=False,
                reasons=["自定义指标需要特殊评估逻辑"],
            )
        
        # 特殊处理：需要额外参数的指标
        if metric in ("upload_self_rating", "upload_rating_with_mood", "uploads_in_time_window", "uploads_with_mood", "tag_usage"):
            # 这些指标需要从条件中获取额外参数，暂时返回不匹配
            # 可以在后续版本中实现具体的评估逻辑
            logger.debug(
                f"Complex metric {metric} detected for achievement {achievement.slug}, requires additional parameters",
                extra={
                    "achievement_id": achievement.id,
                    "achievement_slug": achievement.slug,
                    "condition": condition,
                }
            )
            return EvaluationResult(
                matched=False,
                reasons=[f"指标 {metric} 需要额外的评估参数"],
            )
        
        # 获取指标值
        if user_stats is not None and metric in user_stats:
            # 使用缓存的统计值
            user_value = user_stats[metric]
        elif metric in self._metric_calculators:
            # 使用注册的计算器
            try:
                user_value = self._metric_calculators[metric](user)
            except Exception as e:
                logger.error(
                    f"Error calculating metric {metric} for user {user.id}",
                    exc_info=True,
                    extra={"metric": metric, "user_id": user.id},
                )
                return EvaluationResult(
                    matched=False,
                    reasons=[f"计算指标 {metric} 时出错: {str(e)}"],
                )
        else:
            # 未知指标
            logger.warning(
                f"Unknown achievement metric: {metric}",
                extra={"metric": metric, "achievement_id": achievement.id},
            )
            return EvaluationResult(
                matched=False,
                reasons=[f"未知的指标: {metric}"],
            )
        
        # 比较值
        matched = self._compare_values(user_value, operator, threshold)
        
        # 构建原因
        reasons = []
        if matched:
            reasons.append(
                f"{metric} ({user_value}) {operator} {threshold} 满足条件"
            )
        else:
            reasons.append(
                f"{metric} ({user_value}) {operator} {threshold} 不满足条件"
            )
        
        # 记录评估日志（可选）
        if log_evaluation:
            logger.info(
                f"Achievement evaluation: {achievement.slug} for user {user.id}",
                extra={
                    "achievement_id": achievement.id,
                    "achievement_slug": achievement.slug,
                    "user_id": user.id,
                    "metric": metric,
                    "user_value": user_value,
                    "operator": operator,
                    "threshold": threshold,
                    "matched": matched,
                },
            )
        
        return EvaluationResult(
            matched=matched,
            reasons=reasons,
            metric_values={metric: user_value},
        )


# 全局单例评估器
_evaluator_instance: Optional[AchievementEvaluator] = None


def get_evaluator() -> AchievementEvaluator:
    """获取全局评估器实例"""
    global _evaluator_instance
    if _evaluator_instance is None:
        _evaluator_instance = AchievementEvaluator()
    return _evaluator_instance

