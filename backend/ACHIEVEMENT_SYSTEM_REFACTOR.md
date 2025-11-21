# 成就系统重构总结

## 已完成的工作

### 1. 数据模型调整 ✅

- **UserAchievement 模型增强**：
  - 添加 `provenance` 字段（auto/manual/inferred/legacy）
  - 添加 `meta` JSON 字段（存储解锁时的元数据快照）
  - 添加索引优化查询性能

- **AchievementCondition 模型**：
  - 创建新表用于存储条件表达式子项
  - 支持未来扩展多条件组合
  - 添加索引便于查询和统计

- **数据迁移**：
  - 迁移文件：`0059_add_achievement_provenance_and_condition.py`
  - 为现有 UserAchievement 记录设置 `provenance="legacy"`

### 2. 条件评估引擎 ✅

- **文件**：`backend/core/achievement_evaluator.py`
- **功能**：
  - 可组合、可测试的评估模块
  - 支持扩展 metric（通过注册机制）
  - 评估结果包含匹配原因（reasons）和指标值
  - 可选的评估日志记录

- **默认支持的指标**：
  - `total_uploads`: 总上传数
  - `total_checkins`: 总打卡次数
  - `current_streak`: 当前连续打卡天数
  - `checked_today`: 今天是否打卡

### 3. 幂等解锁逻辑 ✅

- **文件**：`backend/core/achievement_unlock.py`
- **功能**：
  - 幂等解锁（重复调用不会创建重复记录）
  - 并发安全（使用数据库唯一约束 + 重试机制）
  - 解锁时间推断（基于最早满足条件的日期）
  - 解锁来源记录（auto/manual/inferred/legacy）

- **核心函数**：
  - `evaluate_or_unlock()`: 评估并解锁成就
  - `infer_unlock_date()`: 推断合理的解锁日期

### 4. API 端点 ✅

- **现有端点增强**：
  - `GET /profile/achievements/`: 使用新的评估器和解锁逻辑

- **新增端点**：
  - `POST /achievements/evaluate-or-unlock/`: 幂等解锁 API
    - 支持单个成就评估
    - 支持批量评估所有活跃成就
    - 管理员可指定其他用户

### 5. 历史推断任务 ✅

- **管理命令**：`backend/core/management/commands/infer_achievements.py`
- **功能**：
  - 批量扫描用户数据
  - 回填缺失的 UserAchievement 记录
  - 推断 unlocked_at 基于最早满足条件的日期
  - 支持 dry-run 模式
  - 支持指定用户或成就（用于测试）

- **使用方法**：
  ```bash
  python manage.py infer_achievements
  python manage.py infer_achievements --dry-run
  python manage.py infer_achievements --user-id 123
  python manage.py infer_achievements --achievement-id 456
  ```

## 待完成的工作

### 1. 管理后台增强 ✅

- [x] 条件表达式编辑 UI（表单分项：metric/operator/threshold）
- [x] 条件预览功能（显示如何匹配）
- [x] 模拟评估功能（在 admin 可模拟某用户数据查看该成就是否会解锁）

### 2. 性能优化 ✅

- [x] 物化统计字段（UserStats 表）
- [x] 定期聚合表（避免每次评估做复杂聚合）
- [x] 短期缓存策略（防止重复频繁评估）

### 3. 前端重构 ⏳

- [ ] 统一的 achievements store（或 context）
- [ ] 对接新的批量状态 API
- [ ] 解锁原因展示（显示后端返回的 reasons）
- [ ] Pin 功能后端持久化（若当前仅前端存储）

### 4. 测试 ⏳

- [ ] 后端单元测试（评估引擎、解锁逻辑）
- [ ] 集成测试（并发场景、重复请求、事务）
- [ ] 性能测试（批量评估、历史推断）

### 5. 文档 ✅

- [x] 条件语法说明
- [x] 如何新增 metric
- [x] 如何在 admin 中创建成就组
- [x] 运维 runbook（历史推断与重跑步骤）

## 设计决策

### 1. 向后兼容

- 保持现有 API 路径不变
- 通过兼容层适配旧字段
- 现有 UserAchievement 记录标记为 `legacy`

### 2. 并发安全

- 使用数据库唯一约束防止重复解锁
- 事务 + 重试机制处理并发冲突
- 幂等 API 设计

### 3. 可扩展性

- 指标计算器注册机制
- 条件表达式可解析为子项（便于未来扩展多条件组合）
- 元数据字段支持存储任意信息

### 4. 可观测性

- 评估日志记录（可选）
- 解锁来源追踪（provenance）
- 解锁原因记录（reasons）

## 迁移步骤

1. **运行数据迁移**：
   ```bash
   python manage.py migrate core
   ```

2. **回填现有数据**（可选）：
   ```bash
   python manage.py infer_achievements --dry-run  # 先预览
   python manage.py infer_achievements  # 实际执行
   ```

3. **验证**：
   - 检查现有成就展示是否正常
   - 测试新解锁 API
   - 验证并发场景

## API 使用示例

### 评估并解锁单个成就

```bash
POST /achievements/evaluate-or-unlock/?achievement_id=123
```

响应：
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

### 批量评估所有成就

```bash
POST /achievements/evaluate-or-unlock/
```

响应：
```json
{
  "unlocked_count": 5,
  "total_evaluated": 20,
  "new_unlocks": [
    {
      "achievement_id": 123,
      "achievement_slug": "first-upload",
      "unlocked": true,
      "is_new": true
    }
  ]
}
```

## 注意事项

1. **性能考虑**：
   - 批量评估可能较慢，建议使用异步任务
   - 历史推断任务建议在低峰期运行

2. **数据一致性**：
   - 解锁记录一旦创建不会删除（即使条件不再满足）
   - 历史推断可能产生大量记录，注意数据库空间

3. **扩展指标**：
   - 新增 metric 需要在 `AchievementEvaluator._register_default_metrics()` 中注册
   - 或使用 `evaluator.register_metric()` 动态注册

