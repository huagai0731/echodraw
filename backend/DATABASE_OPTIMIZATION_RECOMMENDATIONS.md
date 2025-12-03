# 数据库优化建议

## 📊 概述

基于对当前数据库结构的分析，以下是详细的优化建议，按优先级和影响范围分类。

---

## 🔴 高优先级优化（性能关键）

### 1. **索引优化**

#### 1.1 DailyHistoryMessage - 日期查询索引
**问题**：`get_for_date()` 方法使用 `date__month` 和 `date__day` 查询，但没有索引。

```python
# 当前查询（慢）
cls.objects.filter(
    date__month=target_date.month,
    date__day=target_date.day,
    is_active=True
)
```

**优化方案**：
```python
class DailyHistoryMessage(models.Model):
    class Meta:
        indexes = [
            models.Index(fields=["date"]),  # 已有，但需要优化
            # 添加组合索引
            models.Index(
                fields=["date__month", "date__day", "is_active"],
                name="core_dailyhistory_month_day_active_idx"
            ),
            # 或者使用数据库函数索引（PostgreSQL）
            # 需要迁移文件手动创建
        ]
```

**注意**：MySQL 不支持函数索引，建议：
- 添加 `month` 和 `day` 字段（冗余但高效）
- 或使用 `Extract('month', date)` 但需要应用层处理

#### 1.2 HolidayMessage - 月份日期索引
**问题**：同样使用 `month` 和 `day` 查询，但缺少组合索引。

**优化方案**：
```python
class HolidayMessage(models.Model):
    class Meta:
        indexes = [
            models.Index(fields=["month", "day", "is_active"]),
        ]
```

#### 1.3 is_active 字段索引
**问题**：多个表频繁使用 `is_active=True` 过滤，但缺少索引。

**需要添加索引的表**：
- `EncouragementMessage` - 经常查询 `is_active=True`
- `ConditionalMessage` - 查询时过滤 `is_active=True`
- `UploadConditionalMessage` - 同上
- `Test` - 查询活跃测试
- `TestQuestion` - 查询活跃题目
- `TestOptionText` - 查询活跃选项
- `TestOption` - 查询活跃选项
- `ShortTermTaskPreset` - 查询活跃预设
- `Achievement` - 查询活跃成就

**优化方案**：
```python
# 示例：EncouragementMessage
class EncouragementMessage(models.Model):
    class Meta:
        indexes = [
            models.Index(fields=["is_active", "-created_at"]),
        ]
```

#### 1.4 UserUpload - 常用查询组合索引
**问题**：经常需要按用户、日期范围、标签等组合查询。

**优化方案**：
```python
class UserUpload(models.Model):
    class Meta:
        indexes = [
            models.Index(fields=["user", "-uploaded_at"]),  # 已有
            models.Index(fields=["uploaded_at"]),  # 已有
            # 添加以下索引
            models.Index(fields=["user", "uploaded_at", "self_rating"]),  # 统计查询
            models.Index(fields=["mood_label"]),  # 如果经常按心情查询
        ]
```

#### 1.5 DailyCheckIn - 统计查询优化
**问题**：需要计算连续打卡天数，当前查询可能较慢。

**优化方案**：
```python
class DailyCheckIn(models.Model):
    class Meta:
        indexes = [
            models.Index(fields=["user", "-date"]),  # 已有
            # 添加日期范围查询索引
            models.Index(fields=["user", "date"]),  # 正序，用于计算连续天数
        ]
```

---

### 2. **废弃字段清理**

#### 2.1 UserUpload.tags_old
**问题**：`tags_old` 字段已废弃，占用存储空间。

**优化方案**：
1. 确认所有数据已迁移到 `tags` ManyToManyField
2. 创建迁移删除该字段：
```python
# migrations/0049_remove_userupload_tags_old.py
class Migration(migrations.Migration):
    operations = [
        migrations.RemoveField(
            model_name='userupload',
            name='tags_old',
        ),
    ]
```

---

### 3. **统计信息缓存/物化**

#### 3.1 用户统计信息缓存
**问题**：频繁计算用户的总上传数、总打卡数、连续打卡天数等。

**当前实现**（views.py）：
```python
total_uploads = UserUpload.objects.filter(user=user).count()
# 计算连续打卡天数需要遍历所有打卡记录
```

**优化方案**：

**方案A：添加统计字段到 UserProfile**
```python
class UserProfile(models.Model):
    # 添加统计字段
    total_uploads = models.PositiveIntegerField(default=0)
    total_checkins = models.PositiveIntegerField(default=0)
    current_streak_days = models.PositiveIntegerField(default=0)
    last_checkin_date = models.DateField(null=True, blank=True)
    last_upload_date = models.DateTimeField(null=True, blank=True)
    
    # 使用信号自动更新
    # 在 UserUpload 和 DailyCheckIn 的 post_save/post_delete 信号中更新
```

**方案B：使用缓存（Redis/Memcached）**
```python
from django.core.cache import cache

def get_user_stats(user):
    cache_key = f"user_stats_{user.id}"
    stats = cache.get(cache_key)
    if stats is None:
        stats = calculate_user_stats(user)
        cache.set(cache_key, stats, timeout=300)  # 5分钟缓存
    return stats
```

**方案C：创建统计表（适合大数据量）**
```python
class UserStatistics(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    total_uploads = models.PositiveIntegerField(default=0)
    total_checkins = models.PositiveIntegerField(default=0)
    current_streak_days = models.PositiveIntegerField(default=0)
    total_duration_minutes = models.PositiveIntegerField(default=0)
    last_updated = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=["user", "-last_updated"]),
        ]
```

**推荐**：方案A（统计字段）+ 方案B（缓存）组合使用。

---

## 🟡 中优先级优化（代码质量）

### 4. **查询优化（N+1 问题）**

#### 4.1 使用 select_related 和 prefetch_related
**问题**：多处查询可能产生 N+1 问题。

**优化示例**：
```python
# 当前（可能 N+1）
uploads = UserUpload.objects.filter(user=user)
for upload in uploads:
    print(upload.user.email)  # 每次访问都会查询数据库

# 优化后
uploads = UserUpload.objects.select_related('user').filter(user=user)
for upload in uploads:
    print(upload.user.email)  # 已预加载

# 多对多关系
uploads = UserUpload.objects.prefetch_related('tags').filter(user=user)
for upload in uploads:
    print(upload.tags.all())  # 已预加载
```

**需要优化的视图**：
- `views.py` 中的多个视图函数
- `admin_views.py` 中的 ViewSet（部分已优化）

---

### 5. **字段类型优化**

#### 5.1 自评分字段范围错误
**问题**：
- `UserUpload.self_rating` 范围是 0-100 ✅
- `UploadConditionalMessage.min_self_rating` / `max_self_rating` 范围是 0-100 ✅
- ❌ **`MonthlyReportTemplate.min_avg_rating` / `max_avg_rating` 的验证器错误设置为 0-5，应该是 0-100**

**优化方案**：
```python
class MonthlyReportTemplate(models.Model):
    min_avg_rating = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],  # 修正：应该是100，不是5
        help_text="平均自评分最低值（含）。",
    )
    max_avg_rating = models.FloatField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],  # 修正：应该是100，不是5
        help_text="平均自评分最高值（含）。",
    )
```

#### 5.2 时长字段单位说明
**当前设计**（这是合理的，不是问题）：
- `UserUpload.duration_minutes` - 使用**分钟**（单次上传，需要精确）
- `LongTermGoal.target_hours` - 使用**小时**（长期目标，宏观规划）
- `LongTermPlanCopy.min_hours` / `max_hours` - 使用**小时**（长期规划建议）
- `UploadConditionalMessage.min_duration_minutes` / `max_duration_minutes` - 使用**分钟**（匹配单次上传）
- `MonthlyReportTemplate.min_total_hours` / `max_total_hours` / `min_avg_hours` / `max_avg_hours` - 使用**小时**（月报统计汇总）

**说明**：不同场景使用不同单位是合理的：
- 单次上传用分钟更精确
- 长期目标和月报用小时更直观
- 需要在计算时进行转换（分钟 ÷ 60 = 小时）

**建议**：在模型方法中提供便捷的转换方法，确保转换逻辑一致。

---

### 6. **约束优化**

#### 6.1 添加数据库级约束
**问题**：部分约束只在应用层验证。

**优化方案**：
```python
class UserUpload(models.Model):
    self_rating = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    
    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(self_rating__isnull=True) | models.Q(self_rating__gte=0, self_rating__lte=100),
                name="userupload_self_rating_range"
            ),
        ]
```

#### 6.2 唯一性约束
**问题**：部分唯一性约束可以加强。

**示例**：
```python
class DailyQuiz(models.Model):
    date = models.DateField(unique=True)  # 已有，很好
    
class DailyHistoryMessage(models.Model):
    # 建议：确保同一天只有一条活跃记录
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["date"],
                condition=models.Q(is_active=True),
                name="unique_active_daily_history"
            ),
        ]
```

---

## 🟢 低优先级优化（长期维护）

### 7. **数据归档策略**

#### 7.1 EmailVerification 和 LoginAttempt
**问题**：这些表会无限增长。

**优化方案**：
```python
# 创建管理命令定期清理过期数据
# management/commands/cleanup_old_records.py
class Command(BaseCommand):
    def handle(self, *args, **options):
        # 删除30天前的验证码记录
        cutoff = timezone.now() - timedelta(days=30)
        EmailVerification.objects.filter(created_at__lt=cutoff).delete()
        
        # 删除90天前的登录尝试记录（仅保留失败的）
        cutoff = timezone.now() - timedelta(days=90)
        LoginAttempt.objects.filter(
            created_at__lt=cutoff,
            success=False
        ).delete()
```

#### 7.2 软删除支持
**问题**：部分表可能需要软删除功能。

**建议**：考虑添加 `deleted_at` 字段（如果需要恢复功能）。

---

### 8. **JSON 字段优化**

#### 8.1 JSON 字段查询
**问题**：JSON 字段查询可能较慢。

**优化方案**：
- MySQL 5.7+ / PostgreSQL：使用 JSON 索引
- 考虑将常用 JSON 字段提取为独立字段

**示例**：
```python
# 如果经常查询 schedule 中的特定字段
class ShortTermGoal(models.Model):
    schedule = models.JSONField()  # 保留
    # 添加常用字段
    total_tasks = models.PositiveIntegerField(default=0)  # 从 schedule 计算
```

---

### 9. **数据库连接池**

#### 9.1 连接池配置
**问题**：高并发时数据库连接可能成为瓶颈。

**优化方案**：
```python
# settings.py
DATABASES = {
    'default': {
        # ...
        'CONN_MAX_AGE': 600,  # 连接复用10分钟
        'OPTIONS': {
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
            # MySQL 连接池
            'connect_timeout': 10,
        }
    }
}
```

---

## 📋 实施优先级建议

### 第一阶段（立即实施）
1. ✅ 添加 `is_active` 字段索引（多个表）
2. ✅ 添加 `HolidayMessage` 的 `month, day, is_active` 索引
3. ✅ 删除 `UserUpload.tags_old` 字段
4. ✅ 优化 `DailyHistoryMessage` 的日期查询（添加月份/日期字段或索引）

### 第二阶段（1-2周内）
5. ✅ 添加用户统计字段到 `UserProfile` 或创建 `UserStatistics` 表
6. ✅ 实现统计信息的自动更新（使用信号）
7. ✅ 优化查询中的 `select_related` 和 `prefetch_related`

### 第三阶段（1个月内）
8. ✅ 添加数据库级约束（CheckConstraint）
9. ✅ 实现数据归档策略（清理旧记录）
10. ✅ 添加缓存层（Redis）用于频繁查询

---

## 🔧 实施步骤示例

### 示例1：添加 is_active 索引

```python
# 1. 创建迁移文件
python manage.py makemigrations core --name add_is_active_indexes

# 2. 编辑迁移文件（如果需要）
# migrations/0050_add_is_active_indexes.py

# 3. 应用迁移
python manage.py migrate
```

### 示例2：添加统计字段

```python
# 1. 修改 models.py
class UserProfile(models.Model):
    # 添加字段
    total_uploads = models.PositiveIntegerField(default=0)
    total_checkins = models.PositiveIntegerField(default=0)
    # ...

# 2. 创建迁移
python manage.py makemigrations

# 3. 创建数据迁移填充现有数据
python manage.py makemigrations --empty core --name populate_user_statistics

# 4. 实现信号自动更新
# core/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

@receiver(post_save, sender=UserUpload)
def update_user_upload_count(sender, instance, created, **kwargs):
    if created:
        profile, _ = UserProfile.objects.get_or_create(user=instance.user)
        profile.total_uploads += 1
        profile.save(update_fields=['total_uploads'])
```

---

## 📊 性能监控建议

1. **启用 Django Debug Toolbar**（开发环境）
2. **使用 `django.db.backends` 日志**（查看 SQL 查询）
3. **数据库慢查询日志**（生产环境）
4. **使用 `django-extensions` 的 `runserver_plus`**（开发环境）

---

## ⚠️ 注意事项

1. **索引不是越多越好**：每个索引都会增加写入开销
2. **测试迁移**：在生产环境前，先在测试环境验证
3. **备份数据**：重要变更前备份数据库
4. **监控影响**：添加索引后监控查询性能变化
5. **渐进式优化**：不要一次性实施所有优化，逐步验证效果

---

## 📚 参考资源

- [Django 数据库优化文档](https://docs.djangoproject.com/en/stable/topics/db/optimization/)
- [PostgreSQL 索引类型](https://www.postgresql.org/docs/current/indexes-types.html)
- [MySQL 索引优化](https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html)

