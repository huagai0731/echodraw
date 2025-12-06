# API 请求优化方案

## 问题分析

从您提供的日志来看，当频繁切换导航栏时，会产生大量重复的 API 请求。这是**不正常**的行为。

### 问题根源

1. **组件频繁挂载卸载**：每次切换导航栏时，页面组件会挂载，触发 `useEffect` 执行数据获取
2. **缺乏请求去重机制**：相同 URL 的请求在短时间内会被多次发送
3. **缓存机制不足**：虽然有缓存，但在快速切换时，缓存可能还未生效

### 从日志中看到的重复请求

```
/api/goals/long-term/          - Goals 页面
/api/notifications/            - Home 和 Reports 页面
/api/goals/check-in/           - Home 页面 (useCheckIn hook)
/api/goals/short-term/         - Goals 页面 (useShortTermGoals hook)
/api/goals/calendar/?year=...  - Goals 和 Reports 页面
/api/visual-analysis/          - Reports 页面
/api/tests/results/            - Reports 页面
/api/profile/preferences/      - Profile 和 Home 页面
```

这些请求在几秒内重复了多次，说明每个页面切换都会触发新的请求。

## 解决方案

我已经创建了请求去重工具 (`requestDeduplicator.ts`)，但需要在 API 层面集成。以下是推荐的优化方案：

### 1. 在 API 拦截器中添加请求去重（推荐）

这是最有效的方法，可以在 API 层面统一处理。

### 2. 优化组件的 useEffect 依赖

确保 useEffect 只在必要时执行，避免不必要的重新获取。

### 3. 增加请求防抖

对于非关键数据，可以延迟执行请求。

## 建议的优化措施

### 优先级 1：快速修复

1. **增加请求去重机制**：在 axios 拦截器中实现
2. **优化组件卸载**：确保组件卸载时取消正在进行的请求
3. **使用 AbortController**：所有 API 请求都应该支持取消

### 优先级 2：长期优化

1. **实现全局状态管理**：使用 React Query 或 SWR 等库统一管理数据获取
2. **增加请求队列**：限制同时进行的请求数量
3. **优化缓存策略**：根据数据更新频率调整缓存时间

## 短期解决方案

在 API 服务中添加请求去重拦截器是最快的解决方案。这样可以：
- 自动去重所有请求
- 不需要修改现有组件代码
- 统一管理请求逻辑

## 预期效果

优化后，即使在快速切换导航栏时：
- 相同 URL 的请求在 500ms 内只会发送一次
- 切换回已访问过的页面会使用缓存，不会重新请求
- 减少服务器压力，提升用户体验

