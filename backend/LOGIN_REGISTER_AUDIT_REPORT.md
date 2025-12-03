# 登录注册逻辑审计报告

## 概述
针对每日1万+用户、4核8GB服务器的生产环境，对登录注册逻辑进行全面审计。

## 🔴 严重性能问题

### 1. JSONField查询缺少索引（高优先级）
**位置**: `backend/core/views.py:370-373, 376-379, 398-401`

**问题**:
- `EmailVerification.metadata` 是JSONField，查询 `metadata__ip=client_ip` 没有索引
- 在高并发下，每次发送验证码都要全表扫描或使用低效的JSON查询
- 每日1万+用户，EmailVerification表会快速增长，查询性能会急剧下降

**影响**:
- 发送验证码接口响应时间会随数据量增长而线性增加
- 可能导致数据库CPU占用过高，影响整体性能

**修复方案**:
```python
# 方案1: 将IP地址提取为独立字段（推荐）
# 在EmailVerification模型中添加ip_address字段
ip_address = models.CharField(max_length=45, db_index=True, blank=True)

# 方案2: 为PostgreSQL添加GIN索引（如果使用PostgreSQL）
# 在migration中添加：
# migrations.RunSQL(
#     "CREATE INDEX IF NOT EXISTS email_verification_metadata_ip_gin ON core_emailverification USING GIN ((metadata->>'ip'));"
# )
```

### 2. 验证码查询缺少时间范围限制（中优先级）
**位置**: `backend/core/views.py:535-544`

**问题**:
- 查询验证码时只过滤了`is_used=False`，没有限制`created_at`的时间范围
- 随着数据量增长，即使有索引，查询范围也会越来越大
- 验证码有效期只有10分钟，应该只查询最近10-15分钟的数据

**修复方案**:
```python
# 在register函数中，添加时间范围限制
verification = (
    EmailVerification.objects.filter(
        email__iexact=email,
        purpose=EmailVerification.PURPOSE_REGISTER,
        code=code,
        is_used=False,
        created_at__gte=timezone.now() - timedelta(minutes=15),  # 只查询最近15分钟
    )
    .order_by("-created_at")
    .first()
)
```

### 3. 缺少数据清理机制（高优先级）
**位置**: 全局问题

**问题**:
- `EmailVerification` 和 `LoginAttempt` 表会无限增长
- 过期和已使用的验证码永远不会被删除
- 旧的登录尝试记录也不会被清理
- 在高并发下，表会快速增长，导致：
  - 查询性能下降
  - 数据库存储空间浪费
  - 索引维护成本增加

**修复方案**:
创建定期清理任务（建议每小时或每天执行）：
```python
# backend/core/management/commands/cleanup_auth_records.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from core.models import EmailVerification, LoginAttempt

class Command(BaseCommand):
    def handle(self, *args, **options):
        now = timezone.now()
        
        # 删除过期超过7天的验证码（无论是否使用）
        cutoff_date = now - timedelta(days=7)
        deleted_verifications = EmailVerification.objects.filter(
            created_at__lt=cutoff_date
        ).delete()
        
        # 删除30天前的登录尝试记录
        login_cutoff = now - timedelta(days=30)
        deleted_attempts = LoginAttempt.objects.filter(
            created_at__lt=login_cutoff
        ).delete()
        
        self.stdout.write(
            f"清理完成: 删除 {deleted_verifications[0]} 条验证码记录, "
            f"{deleted_attempts[0]} 条登录尝试记录"
        )
```

## 🟡 潜在Bug和优化

### 4. 注册验证码竞态条件（中优先级）
**位置**: `backend/core/views.py:535-564`

**问题**:
- 验证码查询在`transaction.atomic()`外部
- 如果两个请求同时使用同一个验证码，可能都通过验证
- 虽然`mark_used()`在事务内，但查询在事务外，存在时间窗口

**修复方案**:
```python
# 使用select_for_update锁定验证码记录
with transaction.atomic():
    verification = (
        EmailVerification.objects.filter(
            email__iexact=email,
            purpose=EmailVerification.PURPOSE_REGISTER,
            code=code,
            is_used=False,
            created_at__gte=timezone.now() - timedelta(minutes=15),
        )
        .select_for_update()  # 锁定记录，防止并发
        .order_by("-created_at")
        .first()
    )
    
    if not verification or verification.is_expired:
        return Response(
            {"detail": "验证码不正确或已过期"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # 检查是否已被使用（双重检查）
    if verification.is_used:
        return Response(
            {"detail": "验证码已被使用"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # 立即标记为已使用
    verification.is_used = True
    verification.save(update_fields=["is_used"])
    
    # 创建用户...
```

### 5. 登录失败检查查询优化（低优先级）
**位置**: `backend/core/views.py:730-735`

**问题**:
- 查询使用了`models.Q(email__iexact=email) | models.Q(ip_address=client_ip)`
- 虽然LoginAttempt有索引，但OR查询可能不如分别查询高效

**当前代码**:
```python
recent_failures = LoginAttempt.objects.filter(
    success=False,
    created_at__gte=fifteen_minutes_ago
).filter(
    models.Q(email__iexact=email) | models.Q(ip_address=client_ip)
).count()
```

**优化建议**:
```python
# 分别查询，利用索引，然后取最大值
email_failures = LoginAttempt.objects.filter(
    email__iexact=email,
    success=False,
    created_at__gte=fifteen_minutes_ago
).count()

ip_failures = LoginAttempt.objects.filter(
    ip_address=client_ip,
    success=False,
    created_at__gte=fifteen_minutes_ago
).count()

recent_failures = max(email_failures, ip_failures)
```

### 6. 邮箱查询使用iexact的性能问题（低优先级）
**位置**: 多处使用`email__iexact`

**问题**:
- `iexact`查询可能不如直接索引email字段高效
- 如果数据库支持，应该将email统一存储为小写，然后使用精确匹配

**建议**:
- 在用户注册时，将email统一转换为小写存储
- 查询时直接使用`email=email.lower()`而不是`email__iexact`

## 🟢 已做好的地方

1. ✅ 登录失败次数限制机制完善
2. ✅ 验证码发送频率限制（IP、邮箱级别）
3. ✅ 密码强度验证
4. ✅ 异步邮件发送
5. ✅ 注册编号分配的并发控制（使用select_for_update）
6. ✅ 登录失败记录使用独立表（LoginAttempt）

## 📋 修复优先级

1. **立即修复**（影响性能）:
   - JSONField查询索引问题
   - 数据清理机制
   - 验证码查询时间范围限制

2. **尽快修复**（潜在Bug）:
   - 注册验证码竞态条件

3. **优化建议**（性能提升）:
   - 登录失败检查查询优化
   - 邮箱查询优化

## 🔧 实施建议

1. **短期**（1-2天）:
   - 添加数据清理任务
   - 修复验证码查询时间范围
   - 修复注册竞态条件

2. **中期**（1周内）:
   - 将IP地址提取为独立字段并添加索引
   - 优化登录失败检查查询

3. **长期**（持续监控）:
   - 监控数据库查询性能
   - 定期检查表大小和索引使用情况
   - 根据实际使用情况调整清理策略

## 📊 预期效果

修复后预期：
- 验证码发送接口响应时间减少50-80%
- 数据库CPU占用降低30-50%
- 数据库存储空间增长放缓
- 高并发下系统稳定性提升

