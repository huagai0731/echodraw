"""
生成固定月报的管理命令。

使用方法：
    # 为所有用户生成上个月的月报
    python manage.py generate_monthly_report
    
    # 为指定用户生成指定月份的月报（用于测试）
    python manage.py generate_monthly_report --user-email user@example.com --year 2024 --month 11
    
    # 强制重新生成已存在的月报
    python manage.py generate_monthly_report --force
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core.models import MonthlyReport, MonthlyReportTemplate, UserUpload
from core.views import get_today_shanghai


class Command(BaseCommand):
    help = "生成固定月报（每月1号自动生成上个月的月报）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--user-email",
            type=str,
            help="指定用户邮箱（用于测试）",
        )
        parser.add_argument(
            "--year",
            type=int,
            help="指定年份（用于测试）",
        )
        parser.add_argument(
            "--month",
            type=int,
            help="指定月份（1-12，用于测试）",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="强制重新生成已存在的月报",
        )
        parser.add_argument(
            "--all-users",
            action="store_true",
            help="为所有用户生成月报（默认只生成上个月的）",
        )

    def handle(self, *args, **options):
        user_email = options.get("user_email")
        year = options.get("year")
        month = options.get("month")
        force = options.get("force", False)
        all_users = options.get("all_users", False)

        # 确定目标月份
        if year and month:
            # 使用指定的年月（用于测试）
            target_year = year
            target_month = month
            if not (1 <= target_month <= 12):
                raise CommandError("月份必须在1-12之间")
        else:
            # 默认生成上个月的月报
            today = get_today_shanghai()
            if today.day == 1:
                # 如果是1号，生成上个月的
                if today.month == 1:
                    target_year = today.year - 1
                    target_month = 12
                else:
                    target_year = today.year
                    target_month = today.month - 1
            else:
                # 如果不是1号，也生成上个月的（用于测试）
                if today.month == 1:
                    target_year = today.year - 1
                    target_month = 12
                else:
                    target_year = today.year
                    target_month = today.month - 1

        self.stdout.write(
            f"生成 {target_year}年{target_month}月 的月报..."
        )

        # 确定用户列表
        from django.contrib.auth import get_user_model
        User = get_user_model()

        if user_email:
            try:
                users = [User.objects.get(email=user_email)]
            except User.DoesNotExist:
                raise CommandError(f"用户不存在: {user_email}")
        elif all_users:
            users = User.objects.filter(is_active=True)
        else:
            # 默认只处理有上传记录的用户
            start_date = date(target_year, target_month, 1)
            if target_month == 12:
                end_date = date(target_year + 1, 1, 1) - timedelta(days=1)
            else:
                end_date = date(target_year, target_month + 1, 1) - timedelta(days=1)
            
            # 获取该月有上传记录的用户
            user_ids = (
                UserUpload.objects.filter(
                    uploaded_at__date__gte=start_date,
                    uploaded_at__date__lte=end_date,
                )
                .values_list("user_id", flat=True)
                .distinct()
            )
            users = User.objects.filter(id__in=user_ids, is_active=True)

        if not users.exists():
            self.stdout.write(self.style.WARNING("没有找到需要生成月报的用户"))
            return

        success_count = 0
        skip_count = 0
        error_count = 0

        for user in users:
            try:
                with transaction.atomic():
                    # 检查是否已存在
                    existing = MonthlyReport.objects.filter(
                        user=user,
                        year=target_year,
                        month=target_month,
                    ).first()

                    if existing and not force:
                        self.stdout.write(
                            f"跳过 {user.email}（月报已存在，使用 --force 强制重新生成）"
                        )
                        skip_count += 1
                        continue

                    # 生成月报数据
                    report_data = self._generate_report_data(user, target_year, target_month)

                    # 保存或更新
                    if existing:
                        for key, value in report_data.items():
                            setattr(existing, key, value)
                        existing.save()
                        self.stdout.write(
                            self.style.SUCCESS(f"更新 {user.email} 的月报")
                        )
                    else:
                        MonthlyReport.objects.create(
                            user=user,
                            year=target_year,
                            month=target_month,
                            **report_data,
                        )
                        self.stdout.write(
                            self.style.SUCCESS(f"创建 {user.email} 的月报")
                        )

                    success_count += 1

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"生成 {user.email} 的月报失败: {e}")
                )
                error_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"\n完成！成功: {success_count}, 跳过: {skip_count}, 失败: {error_count}"
            )
        )

    def _generate_report_data(
        self, user, year: int, month: int
    ) -> dict[str, Any]:
        """生成月报数据"""
        # 计算月份的开始和结束日期
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)

        # 获取本月的上传记录
        monthly_uploads = UserUpload.objects.filter(
            user=user,
            uploaded_at__date__gte=start_date,
            uploaded_at__date__lte=end_date,
        ).order_by("uploaded_at")

        # 基础统计数据
        total_uploads = monthly_uploads.count()
        total_minutes = sum(upload.duration_minutes or 0 for upload in monthly_uploads)
        total_hours = total_minutes / 60.0
        avg_hours_per_upload = total_uploads > 0 and (total_hours / total_uploads) or 0.0

        # 平均评分
        ratings = [
            upload.self_rating
            for upload in monthly_uploads
            if upload.self_rating is not None and upload.self_rating > 0
        ]
        avg_rating = sum(ratings) / len(ratings) if ratings else 0.0

        # 最多上传日期
        date_counts = Counter(
            upload.uploaded_at.date() for upload in monthly_uploads
        )
        most_upload_day = date_counts.most_common(1)[0] if date_counts else None
        most_upload_day_date = most_upload_day[0] if most_upload_day else None
        most_upload_day_count = most_upload_day[1] if most_upload_day else 0

        # 连续打卡天数（需要所有历史数据）
        all_upload_dates = set(
            upload.uploaded_at.date()
            for upload in UserUpload.objects.filter(user=user).order_by("uploaded_at")
        )
        streaks = self._calculate_streaks(all_upload_dates)
        current_streak = streaks["current"]
        longest_streak = streaks["longest"]

        # 时段分布（24小时）
        hour_counts = Counter(
            upload.uploaded_at.hour for upload in monthly_uploads
        )
        total_for_hour_dist = sum(hour_counts.values())
        time_distribution = [
            {
                "hour": hour,
                "count": hour_counts.get(hour, 0),
                "percentage": (
                    (hour_counts.get(hour, 0) / total_for_hour_dist * 100)
                    if total_for_hour_dist > 0
                    else 0
                ),
            }
            for hour in range(24)
        ]

        # 周内分布（0=周一，6=周日）
        weekday_counts = Counter()
        weekday_minutes = Counter()
        for upload in monthly_uploads:
            weekday = upload.uploaded_at.weekday()  # 0=周一，6=周日
            weekday_counts[weekday] += 1
            weekday_minutes[weekday] += upload.duration_minutes or 0

        weekly_distribution = [
            {
                "weekday": weekday,
                "count": weekday_counts.get(weekday, 0),
                "minutes": weekday_minutes.get(weekday, 0),
            }
            for weekday in range(7)
        ]

        # 标签统计
        tag_counts = Counter()
        tag_minutes = Counter()
        tag_ratings = {}
        for upload in monthly_uploads:
            for tag in upload.tags.all():
                tag_counts[tag.name] += 1
                tag_minutes[tag.name] += upload.duration_minutes or 0
                if upload.self_rating and upload.self_rating > 0:
                    if tag.name not in tag_ratings:
                        tag_ratings[tag.name] = []
                    tag_ratings[tag.name].append(upload.self_rating)

        total_for_tags = sum(tag_counts.values())
        tag_stats = []
        for tag_name, count in tag_counts.most_common(10):  # 只取前10个
            avg_duration = (
                tag_minutes[tag_name] / count if count > 0 else 0
            )
            avg_tag_rating = (
                sum(tag_ratings.get(tag_name, [])) / len(tag_ratings.get(tag_name, []))
                if tag_ratings.get(tag_name)
                else 0
            )
            tag_stats.append(
                {
                    "tag": tag_name,
                    "count": count,
                    "percentage": (
                        (count / total_for_tags * 100) if total_for_tags > 0 else 0
                    ),
                    "avgDurationMinutes": avg_duration,
                    "avgRating": avg_tag_rating,
                }
            )

        # 日历热力图
        calendar_days = []
        # 获取该月的天数
        from calendar import monthrange
        days_in_month = monthrange(year, month)[1]
        for day in range(1, days_in_month + 1):
            day_date = date(year, month, day)
            weekday = day_date.weekday()  # 0=周一，6=周日
            day_uploads = [
                u for u in monthly_uploads if u.uploaded_at.date() == day_date
            ]
            count = len(day_uploads)
            # 计算透明度（基于该月最大上传数）
            max_count = max(
                (
                    len(
                        [
                            u
                            for u in monthly_uploads
                            if u.uploaded_at.date() == d
                        ]
                    )
                    for d in [
                        date(year, month, d)
                        for d in range(1, days_in_month + 1)
                    ]
                ),
                default=1,
            )
            opacity = count / max_count if max_count > 0 else 0

            calendar_days.append(
                {
                    "day": day,
                    "count": count,
                    "weekday": weekday,
                    "opacity": opacity,
                }
            )

        # 上传记录ID列表
        upload_ids = [upload.id for upload in monthly_uploads]

        # 生成月报文案（匹配模板）
        report_texts = self._generate_report_texts(
            user, total_uploads, total_hours, avg_hours_per_upload, avg_rating
        )

        return {
            "total_uploads": total_uploads,
            "total_hours": total_hours,
            "avg_hours_per_upload": avg_hours_per_upload,
            "avg_rating": avg_rating,
            "most_upload_day_date": most_upload_day_date,
            "most_upload_day_count": most_upload_day_count,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "time_distribution": time_distribution,
            "weekly_distribution": weekly_distribution,
            "tag_stats": tag_stats,
            "heatmap_calendar": calendar_days,
            "upload_ids": upload_ids,
            "report_texts": report_texts,
        }

    def _calculate_streaks(self, upload_dates: set[date]) -> dict[str, int]:
        """计算连续打卡天数"""
        if not upload_dates:
            return {"current": 0, "longest": 0}

        sorted_dates = sorted(upload_dates)
        current_streak = 1
        longest_streak = 1
        temp_streak = 1

        # 计算最长连续天数
        for i in range(1, len(sorted_dates)):
            days_diff = (sorted_dates[i] - sorted_dates[i - 1]).days
            if days_diff == 1:
                temp_streak += 1
                longest_streak = max(longest_streak, temp_streak)
            else:
                temp_streak = 1

        # 计算当前连续天数（从最新日期往前数）
        today = get_today_shanghai()
        current_date = today
        while (current_date - timedelta(days=1)) in upload_dates:
            current_streak += 1
            current_date -= timedelta(days=1)

        return {
            "current": current_streak,
            "longest": longest_streak,
        }

    def _generate_report_texts(
        self,
        user,
        total_uploads: int,
        total_hours: float,
        avg_hours: float,
        avg_rating: float,
    ) -> dict[str, str]:
        """生成月报文案（匹配模板）"""
        report_texts = {}

        # 获取所有活跃的模板
        templates = MonthlyReportTemplate.objects.filter(is_active=True).order_by(
            "section", "priority"
        )

        # 按部分分组
        sections = {}
        for template in templates:
            if template.section not in sections:
                sections[template.section] = []
            sections[template.section].append(template)

        # 为每个部分匹配模板并生成文案
        for section, section_templates in sections.items():
            matched_template = None
            for template in section_templates:
                if template.matches_conditions(
                    total_uploads=total_uploads,
                    total_hours=total_hours,
                    avg_hours=avg_hours,
                    avg_rating=avg_rating,
                ):
                    matched_template = template
                    break

            if matched_template:
                # 渲染模板文案
                text = matched_template.text_template
                text = text.replace("{count}", str(total_uploads))
                text = text.replace("{hours}", f"{total_hours:.1f}")
                text = text.replace("{avg_hours}", f"{avg_hours:.1f}")
                text = text.replace("{rating}", f"{avg_rating:.1f}")
                report_texts[section] = text

        return report_texts

