"""
管理命令：同步待支付订单状态。

查询支付宝订单状态，如果已支付则更新本地订单和会员状态。
用于修复支付宝回调未正确处理的情况。
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta, datetime

from core.models import PointsOrder, UserProfile
from core.payment.alipay import query_alipay_order_status


class Command(BaseCommand):
    help = "同步待支付订单状态（查询支付宝并更新本地订单）"

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
            help="同步指定订单号",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="仅查询，不更新（测试模式）",
        )

    def handle(self, *args, **options):
        days = options.get("days", 7)
        order_number = options.get("order_number")
        dry_run = options.get("dry_run", False)

        self.stdout.write("=" * 80)
        self.stdout.write("同步待支付订单状态")
        if dry_run:
            self.stdout.write(self.style.WARNING("【测试模式】仅查询，不更新"))
        self.stdout.write("=" * 80)
        self.stdout.write("")

        # 查询订单
        if order_number:
            orders = PointsOrder.objects.filter(
                order_number=order_number,
                status=PointsOrder.ORDER_STATUS_PENDING,
                payment_method=PointsOrder.PAYMENT_METHOD_ALIPAY,
            )
        else:
            since = timezone.now() - timedelta(days=days)
            orders = PointsOrder.objects.filter(
                created_at__gte=since,
                status=PointsOrder.ORDER_STATUS_PENDING,
                payment_method=PointsOrder.PAYMENT_METHOD_ALIPAY,
            ).order_by('-created_at')

        total_orders = orders.count()
        self.stdout.write(f"找到 {total_orders} 个待支付的支付宝订单（最近 {days} 天）")
        self.stdout.write("")

        if total_orders == 0:
            self.stdout.write(self.style.SUCCESS("没有待同步的订单"))
            return

        # 统计
        synced_count = 0
        paid_count = 0
        failed_count = 0

        for order in orders:
            self.stdout.write(f"检查订单: {order.order_number} (用户: {order.user.email})")
            
            # 查询支付宝订单状态
            try:
                result = query_alipay_order_status(order.order_number)
                
                if not result.get('success'):
                    self.stdout.write(self.style.WARNING(f"  查询失败: {result.get('msg')}"))
                    failed_count += 1
                    continue
                
                trade_status = result.get('trade_status')
                self.stdout.write(f"  支付宝状态: {trade_status}")
                
                # 如果订单已支付，更新本地订单状态
                if trade_status in ('TRADE_SUCCESS', 'TRADE_FINISHED'):
                    paid_count += 1
                    trade_no = result.get('trade_no')
                    gmt_payment = result.get('gmt_payment')
                    
                    if dry_run:
                        self.stdout.write(self.style.WARNING("  【测试模式】跳过更新"))
                        continue
                    
                    # 更新订单状态
                    order.status = PointsOrder.ORDER_STATUS_PAID
                    order.payment_transaction_id = trade_no
                    if gmt_payment:
                        try:
                            paid_time = datetime.strptime(gmt_payment, "%Y-%m-%d %H:%M:%S")
                            order.paid_at = timezone.make_aware(paid_time)
                        except Exception:
                            order.paid_at = timezone.now()
                    else:
                        order.paid_at = timezone.now()
                    order.save()
                    self.stdout.write(self.style.SUCCESS(f"  ✓ 订单状态已更新为已支付"))
                    
                    # 如果是会员订单，更新用户会员状态
                    metadata = order.metadata or {}
                    if metadata.get('order_type') == 'membership':
                        tier = metadata.get('tier')
                        expires_at_str = metadata.get('expires_at')
                        
                        if tier and expires_at_str:
                            try:
                                # 解析到期时间
                                expires_at = datetime.strptime(expires_at_str, "%Y-%m-%d").date()
                                expires_at_datetime = timezone.make_aware(
                                    datetime.combine(expires_at, datetime.max.time())
                                )
                                
                                # 更新用户会员状态
                                profile, _ = UserProfile.objects.get_or_create(user=order.user)
                                
                                # 如果用户之前不是会员，或者会员已过期，记录新的开通时间
                                was_member = profile.is_member and profile.membership_expires and profile.membership_expires > timezone.now()
                                if not was_member:
                                    profile.membership_started_at = timezone.now()
                                    # 重置视觉分析额度周期
                                    try:
                                        from core.models import VisualAnalysisQuota
                                        quota = VisualAnalysisQuota.objects.filter(user=order.user).first()
                                        if quota:
                                            quota.current_month = ""
                                            quota.save(update_fields=["current_month"])
                                    except Exception:
                                        pass
                                
                                profile.is_member = True
                                profile.membership_expires = expires_at_datetime
                                profile.save(update_fields=["is_member", "membership_expires", "membership_started_at", "updated_at"])
                                
                                self.stdout.write(self.style.SUCCESS(f"  ✓ 用户会员状态已更新（到期时间: {expires_at_datetime}）"))
                                synced_count += 1
                            except Exception as e:
                                self.stdout.write(self.style.ERROR(f"  ✗ 更新会员状态失败: {e}"))
                        else:
                            self.stdout.write(self.style.WARNING("  ⚠ 会员订单缺少必要字段（tier或expires_at）"))
                    else:
                        self.stdout.write("  ℹ 非会员订单，跳过会员状态更新")
                else:
                    self.stdout.write(f"  ℹ 订单尚未支付（状态: {trade_status}）")
                    
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  ✗ 查询异常: {e}"))
                failed_count += 1
            
            self.stdout.write("")

        # 输出统计
        self.stdout.write("=" * 80)
        self.stdout.write("同步完成！统计信息：")
        self.stdout.write(f"  总订单数: {total_orders}")
        self.stdout.write(f"  已支付订单: {paid_count}")
        self.stdout.write(f"  成功同步: {synced_count}")
        self.stdout.write(f"  查询失败: {failed_count}")
        self.stdout.write("=" * 80)

