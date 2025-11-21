# 成就系统完整文档

## 目录

1. [条件语法说明](#条件语法说明)
2. [如何新增 Metric](#如何新增-metric)
3. [如何在 Admin 中创建成就组](#如何在-admin-中创建成就组)
4. [运维 Runbook](#运维-runbook)
5. [API 参考](#api-参考)

---

## 条件语法说明

### 基本格式

成就条件使用 JSON 格式存储，基本结构如下：

```json
{
  "metric": "指标名称",
  "operator": "操作符",
  "threshold": 阈值
}
```

### 支持的指标（Metrics）

| 指标名称 | 说明 | 类型 | 示例值 |
|---------|------|------|--------|
| `total_uploads` | 总上传数 | 整数 | 10 |
| `total_checkins` | 总打卡次数 | 整数 | 7 |
| `current_streak` | 当前连续打卡天数 | 整数 | 30 |
| `checked_today` | 今天是否打卡 | 整数（1=是，0=否） | 1 |

### 支持的操作符（Operators）

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `>=` | 大于等于 | `total_uploads >= 10` |
| `>` | 大于 | `total_uploads > 5` |
| `<=` | 小于等于 | `current_streak <= 7` |
| `<` | 小于 | `total_checkins < 3` |
| `==` | 等于 | `checked_today == 1` |
| `!=` | 不等于 | `current_streak != 0` |

### 条件示例

#### 示例 1：首次上传成就

```json
{
  "metric": "total_uploads",
  "operator": ">=",
  "threshold": 1
}
```

#### 示例 2：连续打卡 7 天

```json
{
  "metric": "current_streak",
  "operator": ">=",
  "threshold": 7
}
```

#### 示例 3：今天已打卡

```json
{
  "metric": "checked_today",
  "operator": "==",
  "threshold": 1
}
```

---

## 如何新增 Metric

### 步骤 1：在评估器中注册 Metric

编辑 `backend/core/achievement_evaluator.py`，在 `_register_default_metrics()` 方法中添加新的指标计算器：

```python
def _register_default_metrics(self) -> None:
    """注册默认的指标计算器"""
    
    # ... 现有指标 ...
    
    def new_metric(user) -> int:
        """新指标的说明"""
        # 实现指标计算逻辑
        return calculated_value
    
    self.register_metric("new_metric", new_metric)
```

### 步骤 2：实现计算逻辑

指标计算器是一个函数，接收用户对象，返回数值（整数或浮点数）。

示例：添加"本月上传数"指标

```python
def monthly_uploads(user) -> int:
    """本月上传数"""
    from django.utils import timezone
    from datetime import datetime
    
    now = timezone.now()
    start_of_month = datetime(now.year, now.month, 1)
    if timezone.is_aware(now):
        start_of_month = timezone.make_aware(start_of_month)
    
    return UserUpload.objects.filter(
        user=user,
        uploaded_at__gte=start_of_month
    ).count()

self.register_metric("monthly_uploads", monthly_uploads)
```

### 步骤 3：更新文档

在本文档的"支持的指标"表格中添加新指标。

### 步骤 4：测试

创建测试用例验证新指标：

```python
def test_new_metric(self):
    user = User.objects.create_user(...)
    # 设置测试数据
    # ...
    
    evaluator = get_evaluator()
    condition = {
        "metric": "new_metric",
        "operator": ">=",
        "threshold": 5
    }
    
    result = evaluator.evaluate(user, achievement, condition)
    self.assertTrue(result.matched)
```

---

## 如何在 Admin 中创建成就组

### 方法 1：通过 Django Admin 界面

1. 登录 Django Admin（`/admin/`）
2. 进入"成就组"（Achievement Groups）
3. 点击"添加成就组"
4. 填写信息：
   - **Slug**: 唯一标识符（如 `daily-checkin`）
   - **Name**: 显示名称（如 `每日打卡`）
   - **Description**: 描述
   - **Category**: 分类（可选）
   - **Icon**: 图标 URL（可选）
   - **Display Order**: 显示顺序（数字越小越靠前）
5. 保存

### 方法 2：通过 API（推荐用于批量创建）

使用管理后台 API：

```bash
POST /api/admin/achievement-groups/
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "slug": "daily-checkin",
  "name": "每日打卡",
  "description": "连续打卡成就",
  "category": "打卡",
  "display_order": 10
}
```

### 创建成就组内的成就

1. 在成就组详情页，点击"添加成就"
2. 填写信息：
   - **Slug**: 唯一标识符
   - **Name**: 显示名称
   - **Level**: 等级（1, 2, 3...）
   - **Condition**: JSON 格式的条件表达式
   - **Metadata**: 元数据（如封面图片等）
3. 保存

### 条件表达式编辑

在 Admin 界面中，条件表达式以 JSON 文本形式编辑。示例：

```json
{
  "metric": "current_streak",
  "operator": ">=",
  "threshold": 7
}
```

### 模拟评估功能

在成就详情页，可以使用"模拟评估"功能：

1. 点击"模拟评估"按钮
2. 选择要测试的用户（可选，默认当前用户）
3. 查看评估结果：
   - 是否匹配
   - 匹配原因
   - 指标值
   - 用户统计数据

---

## 运维 Runbook

### 历史推断任务

#### 用途

批量扫描用户数据，回填缺失的 `UserAchievement` 记录。用于：
- 系统升级后回填历史数据
- 修复数据不一致问题
- 为新用户批量解锁已满足的成就

#### 使用方法

```bash
# 预览模式（不实际创建记录）
python manage.py infer_achievements --dry-run

# 实际执行
python manage.py infer_achievements

# 仅处理指定用户
python manage.py infer_achievements --user-id 123

# 仅处理指定成就
python manage.py infer_achievements --achievement-id 456

# 自定义批处理大小
python manage.py infer_achievements --batch-size 50
```

#### 注意事项

- **执行时间**：建议在低峰期运行
- **数据库负载**：大批量处理可能对数据库造成压力
- **数据一致性**：推断的解锁时间基于最早满足条件的日期，可能不完全准确

#### 监控

查看日志输出：
- 处理进度
- 新解锁记录数
- 已存在记录数
- 条件不满足数
- 错误数

### 用户统计更新任务

#### 用途

批量更新 `UserStats` 物化表，提高成就评估性能。

#### 使用方法

```bash
# 更新所有用户
python manage.py update_user_stats

# 仅更新指定用户
python manage.py update_user_stats --user-id 123

# 强制更新（即使最近已更新）
python manage.py update_user_stats --force

# 自定义批处理大小
python manage.py update_user_stats --batch-size 50
```

#### 定时任务配置

建议通过 Celery 或 cron 定期执行：

```python
# Celery 任务示例
from celery import shared_task
from django.core.management import call_command

@shared_task
def update_user_stats_task():
    call_command('update_user_stats')
```

```bash
# Cron 配置示例（每小时执行一次）
0 * * * * cd /path/to/project && python manage.py update_user_stats
```

### 缓存管理

#### 使缓存失效

```python
from core.user_stats_cache import invalidate_user_stats_cache

# 使指定用户的缓存失效
invalidate_user_stats_cache(user_id=123)
```

#### 手动触发场景

在以下操作后应使缓存失效：
- 用户上传新作品
- 用户打卡
- 管理员修改用户数据

### 数据修复

#### 修复异常的用户数据

1. **查找异常记录**：
   ```python
   from core.models import UserAchievement, Achievement
   
   # 查找解锁时间异常的记录
   abnormal = UserAchievement.objects.filter(
       unlocked_at__lt=models.F('created_at')
   )
   ```

2. **重新评估**：
   ```python
   from core.achievement_unlock import evaluate_or_unlock
   
   for ua in abnormal:
       # 删除异常记录
       ua.delete()
       # 重新评估
       evaluate_or_unlock(ua.user, ua.achievement)
   ```

#### 批量修复

创建管理命令：

```python
# backend/core/management/commands/fix_achievements.py
from django.core.management.base import BaseCommand
from core.models import UserAchievement
from core.achievement_unlock import evaluate_or_unlock

class Command(BaseCommand):
    def handle(self, *args, **options):
        # 修复逻辑
        pass
```

### 性能监控

#### 关键指标

- 成就评估响应时间
- 解锁 API 响应时间
- 缓存命中率
- 数据库查询次数

#### 日志分析

查看成就相关日志：

```bash
# 查看解锁日志
grep "Achievement unlocked" logs/django.log

# 查看评估日志
grep "Achievement evaluation" logs/django.log

# 查看错误日志
grep "ERROR.*achievement" logs/django.log
```

---

## API 参考

### GET /api/profile/achievements/

获取当前用户的成就概览。

**响应示例**：
```json
{
  "summary": {
    "group_count": 3,
    "standalone_count": 5,
    "achievement_count": 15
  },
  "groups": [
    {
      "id": 1,
      "slug": "daily-checkin",
      "name": "每日打卡",
      "levels": [...],
      "summary": {
        "level_count": 5,
        "highest_unlocked_level": 3,
        "unlocked_levels": [1, 2, 3]
      }
    }
  ],
  "standalone": [...]
}
```

### POST /api/achievements/evaluate-or-unlock/

评估并解锁成就（幂等 API）。

**查询参数**：
- `achievement_id` (可选): 成就 ID，不提供则评估所有活跃成就
- `user_id` (可选): 用户 ID，仅管理员可指定其他用户

**响应示例**：
```json
{
  "unlocked": true,
  "is_new": true,
  "unlocked_at": "2025-11-21T10:30:00Z",
  "reason": "新解锁",
  "achievement": {
    "id": 123,
    "slug": "first-upload",
    "name": "首次上传",
    ...
  }
}
```

### POST /api/admin/achievements/{id}/simulate-evaluation/

模拟评估成就（管理后台 API）。

**请求体**：
```json
{
  "user_id": 123  // 可选，默认当前用户
}
```

**响应示例**：
```json
{
  "matched": true,
  "reasons": [
    "total_uploads (10) >= 1 满足条件"
  ],
  "metric_values": {
    "total_uploads": 10
  },
  "user_stats": {
    "total_uploads": 10,
    "total_checkins": 5,
    "current_streak": 3,
    "checked_today": 1
  },
  "achievement": {
    "id": 123,
    "slug": "first-upload",
    "name": "首次上传",
    "condition": {
      "metric": "total_uploads",
      "operator": ">=",
      "threshold": 1
    }
  }
}
```

---

## 常见问题

### Q: 如何修改已存在的成就条件？

A: 在 Django Admin 中编辑成就，修改 `condition` 字段。注意：已解锁的记录不会自动更新，需要手动处理。

### Q: 如何删除成就？

A: 不建议删除成就，建议将 `is_active` 设置为 `False`。删除成就会导致已解锁记录的外键错误。

### Q: 如何批量解锁成就？

A: 使用历史推断任务或编写自定义脚本调用 `evaluate_or_unlock()`。

### Q: 缓存不更新怎么办？

A: 检查缓存配置，或调用 `invalidate_user_stats_cache()` 使缓存失效。

### Q: 如何添加新的成就类型？

A: 在 `Achievement` 模型中添加新的字段，或使用 `metadata` JSON 字段存储扩展信息。

---

## 更新日志

### 2025-11-21
- 添加 `provenance` 字段追踪解锁来源
- 添加 `meta` 字段存储解锁元数据
- 实现条件评估引擎
- 实现幂等解锁 API
- 添加历史推断任务
- 添加用户统计缓存

