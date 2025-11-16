# 架构设计风险自检报告

## 📋 检查时间
生成时间：2025-01-27

## ⚠️ 风险概述

本次检查针对两个核心架构设计风险：
1. **逻辑写死在前端**（成就系统、任务逻辑等）
2. **调用链太复杂，难以 debug**

---

## 🔴 风险 1：逻辑写死在前端

### ❌ 发现的问题

#### 1. **任务库硬编码在前端（中等风险）**

**位置：** `frontend/src/pages/NewChallengeWizard.tsx`

**问题描述：**
```89:170:frontend/src/pages/NewChallengeWizard.tsx
const FALLBACK_TASK_CATEGORIES: TaskCategory[] = [
  { id: "sketch", name: "速写" },
  { id: "color", name: "色彩" },
  { id: "inspiration", name: "灵感" },
  { id: "study", name: "学习" },
  { id: MY_CATEGORY_ID, name: "我的" },
];

const FALLBACK_TASK_LIBRARY: TaskItem[] = [
  {
    id: "sketch-dynamic",
    categoryId: "sketch",
    title: "人物动态",
    subtitle: "练习快速捕捉人体姿态",
    metadata: {},
    origin: "global",
  },
  // ... 更多硬编码任务
];
```

**风险分析：**
- ✅ **有后端API**：代码中调用了 `fetchShortTermTaskPresets()` 从后端获取任务数据
- ⚠️ **存在 Fallback 机制**：当后端API失败或返回空数据时，会使用前端硬编码的数据（第249-250行、第294行）
- ⚠️ **影响范围**：如果后端任务数据需要修改，前端代码中仍有硬编码数据可能被使用，导致数据不一致
- ⚠️ **发版依赖**：修改任务库内容需要重新发版前端应用

**代码证据：**
```277:295:frontend/src/pages/NewChallengeWizard.tsx
    const loadPresets = async () => {
      try {
        const bundle = await fetchShortTermTaskPresets();
        if (!mounted) {
          return;
        }
        const tasks = bundle.tasks.length
          ? bundle.tasks.map(mapPresetToTaskItem)
          : FALLBACK_TASK_LIBRARY;
        const categories = ensureCategories(bundle, tasks);
        setTaskLibrary(tasks);
        setTaskCategories(categories);
      } catch (err) {
        if (!mounted) {
          return;
        }
        setTaskLibrary(FALLBACK_TASK_LIBRARY);
        setTaskCategories(FALLBACK_TASK_CATEGORIES);
      }
    };
```

**建议修复：**
1. **短期方案**：移除 Fallback 硬编码数据，API失败时显示明确的错误提示，而不是静默使用旧数据
2. **长期方案**：确保后端任务数据API稳定可靠，前端完全依赖后端数据

---

#### 2. **成就判定逻辑未实现（高风险）**

**位置：** `backend/core/views.py:578-650`

**问题描述：**
```578:586:backend/core/views.py
@api_view(["GET"])
@permission_classes([AllowAny])
@cache_page(600)
def profile_achievements(request):
    """
    返回当前用户的成就概览。

    目前尚未实现成就判定逻辑，因此所有配置成就默认视为"未解锁"。
    后续可在此处根据用户数据计算已解锁等级并补充 unlocked_at 字段。
    """
```

**风险分析：**
- ⚠️ **判定逻辑缺失**：成就的解锁条件（如"上传10张作品"、"连续打卡7天"）在后端没有实现
- ⚠️ **返回固定值**：所有成就的 `unlocked_at` 都是 `null`，`highest_unlocked_level` 始终是 `0`
- ⚠️ **前端无法判断**：前端只能显示"未解锁"状态，无法根据用户实际数据判断成就进度
- ⚠️ **未来实现成本高**：如果在前端实现判定逻辑，会导致业务逻辑分散，难以维护

**当前返回结构：**
```621:624:backend/core/views.py
                    "summary": {
                        "level_count": 0,
                        "highest_unlocked_level": 0,
                        "unlocked_levels": [],
                    },
```

**建议修复：**
1. **立即实施**：在后端 `profile_achievements` 函数中实现成就判定逻辑
2. **判定依据**：根据 `Achievement.condition` 字段（如 `{metric: "total_uploads", operator: ">=", threshold: 10}`）计算用户是否达成
3. **数据来源**：从 `UserUpload`、`DailyCheckIn` 等模型获取用户统计数据

---

#### 3. **前端格式化逻辑（低风险，可接受）**

**位置：** `frontend/src/pages/Goals.tsx`、`frontend/src/pages/Home.tsx`

**发现：**
- `formatShortTermGoalSubtitle`：格式化短期目标副标题
- `normalizeUploadedDate`：规范化上传日期
- `normalizeMessages`：规范化首页消息

**评估：**
- ✅ **属于展示层**：这些是 UI 格式化逻辑，不算业务规则
- ✅ **不影响业务**：核心业务逻辑（如打卡规则、成就判定）仍在后端

---

### ✅ 做得好的地方

1. **任务预设管理**：任务预设通过后端 API (`/goals/short-term/presets/`) 管理，前端只负责展示
2. **打卡逻辑**：打卡统计逻辑完全在后端实现（`_get_check_in_stats`）
3. **条件消息**：条件消息的匹配逻辑在后端实现（`_resolve_conditional_message`）

---

## 🔴 风险 2：调用链太复杂，难以 debug

### ❌ 发现的问题

#### 1. **完全缺少日志记录（高风险）**

**位置：** 整个 `backend/core/views.py`

**问题描述：**
- ❌ **没有日志框架**：整个 `views.py` 文件没有任何 `logger`、`logging` 导入或使用
- ❌ **无法追踪请求**：出 bug 时无法知道请求的完整调用链
- ❌ **难以定位问题**：无法知道某个接口内部调用了哪些函数、查询了哪些数据

**影响：**
- 用户报告"首页消息显示错误"时，无法快速定位是哪个条件匹配出错
- 无法追踪性能瓶颈（不知道哪个查询慢）
- 无法排查异常情况（不知道哪个步骤抛出了异常）

**建议修复：**
1. **添加日志框架**：
```python
import logging
logger = logging.getLogger(__name__)
```

2. **在关键函数中添加日志**：
```python
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def homepage_messages(request):
    logger.info("homepage_messages request started", extra={
        "user_id": request.user.id,
        "trace_id": request.META.get("HTTP_X_TRACE_ID", "unknown")
    })
    # ... 后续逻辑
```

3. **记录关键步骤**：
- 接口入口和退出
- 数据库查询结果
- 条件匹配结果
- 异常情况

---

#### 2. **没有请求追踪 UUID（高风险）**

**位置：** 整个后端代码

**问题描述：**
- ❌ **没有 trace_id**：请求和响应中没有唯一的追踪ID
- ❌ **无法关联日志**：多个服务的日志无法通过 trace_id 关联
- ❌ **分布式追踪困难**：未来如果有多个后端服务，无法追踪跨服务调用

**影响：**
- 一个用户的请求在前端、后端、数据库之间产生的日志无法关联
- 出 bug 时需要手动查找多个日志文件，效率低

**建议修复：**
1. **添加中间件生成 trace_id**：
```python
# backend/config/middleware.py
import uuid
class TraceIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        trace_id = request.META.get('HTTP_X_TRACE_ID') or str(uuid.uuid4())
        request.trace_id = trace_id
        response = self.get_response(request)
        response['X-Trace-Id'] = trace_id
        return response
```

2. **在日志中使用 trace_id**：
```python
logger.info("message", extra={"trace_id": request.trace_id})
```

3. **前端传递 trace_id**：前端请求时在 Header 中添加 `X-Trace-Id`

---

#### 3. **单个接口内部逻辑复杂（中等风险）**

**位置：** `backend/core/views.py:872-925` - `homepage_messages`

**问题描述：**
```872:925:backend/core/views.py
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def homepage_messages(request):
    """
    返回首页三大块文案：
    1. 通用文案 - 随机展示一句（当不是特殊打卡日期时显示）
    2. 条件文案 - 当用户达成某些条件时显示（如打卡满7天）
    3. 节日文案 - 特定日期显示特定文案
    """
    user = request.user
    today = get_today_shanghai()

    # 第二块：条件文案（基于用户条件，优先检查）
    check_in_stats = _get_check_in_stats(user)
    total_uploads = UserUpload.objects.filter(user=user).count()
    last_upload = UserUpload.objects.filter(user=user).order_by("-uploaded_at").first()
    conditional_text = _resolve_conditional_message(
        user,
        check_in_stats=check_in_stats,
        total_uploads=total_uploads,
        last_upload=last_upload,
    )

    # 第一块：通用文案（随机展示，仅在不是特殊打卡日期时显示）
    # 如果匹配到条件文案（特殊打卡日期），则不显示通用文案
    general_text = None
    if not conditional_text:
        general_text = _resolve_general_message()

    # 第三块：节日文案和历史文案（基于日期）
    holiday_message = HolidayMessage.get_for_date(today)
    holiday_payload = None
    if holiday_message:
        holiday_payload = {
            "headline": holiday_message.headline or None,
            "text": holiday_message.text,
        }
    
    # 历史文案（历史上的今天）
    history_message = DailyHistoryMessage.get_for_date(today)
    history_payload = None
    if history_message:
        history_payload = {
            "headline": history_message.headline or None,
            "text": history_message.text,
        }

    response_payload = {
        "general": general_text,  # 通用文案（当不是特殊打卡日期时）
        "conditional": conditional_text,  # 条件文案（特殊打卡日期等）
        "holiday": holiday_payload,  # 节日文案
        "history": history_payload,  # 历史文案（历史上的今天）
    }
    return Response(response_payload)
```

**风险分析：**
- ⚠️ **多个数据库查询**：一个接口内执行了至少 4 次数据库查询
- ⚠️ **逻辑分支多**：有条件判断、日期匹配等多个分支
- ⚠️ **缺少异常处理**：如果某个步骤失败，整个接口会失败
- ✅ **但逻辑清晰**：虽然复杂，但函数拆分合理，可读性好

**评估：**
- 这个接口虽然复杂，但属于业务需求的正常范围
- **主要问题是缺少日志**，导致难以 debug

**建议优化：**
1. **添加日志记录**每个步骤的执行情况
2. **添加缓存**：节日消息、历史消息可以缓存（已有 `@cache_page(600)` 缓存整个响应，但可以更细粒度）
3. **异常处理**：如果某个消息解析失败，不应该影响其他消息的返回

---

### ✅ 做得好的地方

1. **函数拆分清晰**：复杂逻辑被拆分成多个小函数（`_get_check_in_stats`、`_resolve_conditional_message` 等）
2. **单一职责**：每个函数职责明确
3. **有缓存机制**：部分接口使用了 `@cache_page` 装饰器

---

## 📊 风险等级总结

| 风险项 | 等级 | 优先级 | 影响范围 |
|--------|------|--------|----------|
| 成就判定逻辑未实现 | 🔴 **高** | **P0** | 成就系统无法正常工作 |
| 完全缺少日志记录 | 🔴 **高** | **P0** | 所有接口难以调试 |
| 没有请求追踪 UUID | 🔴 **高** | **P1** | 跨服务调试困难 |
| 任务库硬编码（Fallback） | 🟡 **中** | **P2** | 数据一致性风险 |
| 单个接口逻辑复杂 | 🟡 **中** | **P2** | 调试和维护成本 |

---

## 🎯 修复建议优先级

### **P0 - 立即修复**

1. **实现成就判定逻辑**
   - 在 `profile_achievements` 中根据 `Achievement.condition` 计算解锁状态
   - 需要读取用户统计数据（上传数、打卡天数等）

2. **添加基础日志框架**
   - 导入 `logging` 模块
   - 在关键接口入口添加日志
   - 记录请求参数、执行结果、异常信息

### **P1 - 近期修复**

3. **实现请求追踪 UUID**
   - 添加中间件生成 `trace_id`
   - 在日志中携带 `trace_id`
   - 前端请求时传递 `trace_id`

### **P2 - 长期优化**

4. **移除前端任务库硬编码**
   - 确保后端API稳定后，移除 Fallback 机制
   - 或者改为明确的错误提示

5. **优化复杂接口**
   - 为 `homepage_messages` 添加更详细的日志
   - 考虑添加更细粒度的缓存

---

## ✅ 总体评价

### 做得好的方面
1. ✅ **业务逻辑主要在后端**：核心业务规则（打卡统计、条件消息匹配）都在后端实现
2. ✅ **代码结构清晰**：函数拆分合理，职责明确
3. ✅ **有缓存机制**：部分接口使用了缓存优化

### 需要改进的方面
1. ❌ **日志系统完全缺失**：这是最严重的问题，会严重影响调试效率
2. ❌ **成就判定逻辑未实现**：功能不完整
3. ⚠️ **部分硬编码数据**：任务库的 Fallback 机制存在风险

### 建议
- **短期**：优先实现日志系统和成就判定逻辑
- **中期**：添加请求追踪机制
- **长期**：逐步移除前端硬编码，确保所有业务数据来自后端

---

## 📝 附录：相关代码位置

- 任务库硬编码：`frontend/src/pages/NewChallengeWizard.tsx:89-170`
- 成就判定逻辑：`backend/core/views.py:578-650`
- 首页消息接口：`backend/core/views.py:872-925`
- 打卡统计逻辑：`backend/core/views.py:1163-1208`


