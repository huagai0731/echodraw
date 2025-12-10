"""
管理命令：检查支付订单和会员状态问题。

用于诊断支付宝支付后会员状态未更新的问题。
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from core.models import PointsOrder, UserProfile


class Command(BaseCommand):
    help = "检查支付订单和会员状态问题"

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=7,
            help="检查最近N天的订单（默认：7天）",
        )
        parser.add_argument(
            "--order-number",
            type=str,
            help="检查指定订单号",
        )

    def handle(self, *args, **options):
        days = options.get("days", 7)
        order_number = options.get("order_number")

        self.stdout.write("=" * 80)
        self.stdout.write("检查支付订单和会员状态问题")
        self.stdout.write("=" * 80)
        self.stdout.write("")

        # 查询订单
        if order_number:
            orders = PointsOrder.objects.filter(order_number=order_number)
        else:
            since = timezone.now() - timedelta(days=days)
            orders = PointsOrder.objects.filter(
                created_at__gte=since
            ).order_by('-created_at')

        total_orders = orders.count()
        self.stdout.write(f"找到 {total_orders} 个订单（最近 {days} 天）")
        self.stdout.write("")

        # 统计
        paid_orders = 0
        membership_orders = 0
        problem_orders = []

        for order in orders:
            is_paid = order.status == PointsOrder.ORDER_STATUS_PAID
            if is_paid:
                paid_orders += 1

            metadata = order.metadata or {}
            is_membership = metadata.get('order_type') == 'membership'
            if is_membership:
                membership_orders += 1

            # 检查问题
            problems = []
            
            # 问题1: 已支付但metadata为空或不是会员订单
            if is_paid and not is_membership:
                problems.append("已支付但不是会员订单（metadata可能丢失）")
            
            # 问题2: 会员订单但缺少必要字段
            if is_membership:
                if not metadata.get('tier'):
                    problems.append("会员订单缺少tier字段")
                if not metadata.get('expires_at'):
                    problems.append("会员订单缺少expires_at字段")
            
            # 问题3: 已支付的会员订单，但用户会员状态未更新
            if is_paid and is_membership:
                try:
                    profile = UserProfile.objects.get(user=order.user)
                    tier = metadata.get('tier')
                    expires_at_str = metadata.get('expires_at')
                    
                    if tier and expires_at_str:
                        from datetime import datetime
                        expires_at = datetime.strptime(expires_at_str, "%Y-%m-%d").date()
                        expires_at_datetime = timezone.make_aware(
                            datetime.combine(expires_at, datetime.max.time())
                        )
                        
                        if not profile.is_member:
                            problems.append(f"用户不是会员（应该到期时间: {expires_at_datetime}）")
                        elif not profile.membership_expires or profile.membership_expires < expires_at_datetime:
                            problems.append(f"会员到期时间不正确（当前: {profile.membership_expires}, 应该: {expires_at_datetime}）")
                except UserProfile.DoesNotExist:
                    problems.append("用户没有UserProfile记录")
                except Exception as e:
                    problems.append(f"检查会员状态时出错: {e}")

            if problems:
                problem_orders.append({
                    'order': order,
                    'problems': problems,
                    'metadata': metadata,
                })

        # 输出统计
        self.stdout.write("统计信息：")
        self.stdout.write(f"  总订单数: {total_orders}")
        self.stdout.write(f"  已支付订单: {paid_orders}")
        self.stdout.write(f"  会员订单: {membership_orders}")
        self.stdout.write(f"  有问题的订单: {len(problem_orders)}")
        self.stdout.write("")

        # 输出问题订单详情
        if problem_orders:
            self.stdout.write(self.style.ERROR("=" * 80))
            self.stdout.write(self.style.ERROR(f"发现 {len(problem_orders)} 个有问题的订单："))
            self.stdout.write(self.style.ERROR("=" * 80))
            self.stdout.write("")

            for item in problem_orders:
                order = item['order']
                problems = item['problems']
                metadata = item['metadata']

                self.stdout.write(self.style.WARNING(f"订单号: {order.order_number}"))
                self.stdout.write(f"  订单ID: {order.id}")
                self.stdout.write(f"  用户: {order.user.email} (ID: {order.user.id})")
                self.stdout.write(f"  状态: {order.status}")
                self.stdout.write(f"  金额: {order.amount} 元")
                self.stdout.write(f"  支付方式: {order.payment_method}")
                self.stdout.write(f"  创建时间: {order.created_at}")
                self.stdout.write(f"  支付时间: {order.paid_at}")
                self.stdout.write(f"  metadata: {metadata}")
                self.stdout.write("")
                
                self.stdout.write(self.style.ERROR("  问题："))
                for problem in problems:
                    self.stdout.write(self.style.ERROR(f"    - {problem}"))
                
                # 检查用户会员状态
                try:
                    profile = UserProfile.objects.get(user=order.user)
                    self.stdout.write(f"  用户会员状态:")
                    self.stdout.write(f"    is_member: {profile.is_member}")
                    self.stdout.write(f"    membership_expires: {profile.membership_expires}")
                    self.stdout.write(f"    membership_started_at: {profile.membership_started_at}")
                except UserProfile.DoesNotExist:
                    self.stdout.write(self.style.ERROR("  用户会员状态: 无UserProfile记录"))
                
                self.stdout.write("")
                self.stdout.write("-" * 80)
                self.stdout.write("")
        else:
            self.stdout.write(self.style.SUCCESS("未发现问题订单！"))

        self.stdout.write("")
        self.stdout.write("=" * 80)
        self.stdout.write("检查完成")
        self.stdout.write("=" * 80)

