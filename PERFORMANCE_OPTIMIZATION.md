# 性能优化说明

## 已实施的优化

### 1. 图片懒加载 ✅
- 创建了 `LazyImage` 组件，使用 Intersection Observer API 实现图片懒加载
- 图片只在进入视口时才开始加载，减少初始加载时间
- 在 `ShortTermGoalDetails` 组件中所有图片都使用了懒加载

### 2. API 请求缓存 ✅
- 创建了 `apiCache.ts` 工具，实现 API 请求缓存
- `fetchUserUploads` 函数现在支持缓存（默认5分钟有效期）
- 减少重复的 API 请求，提升页面响应速度

### 3. Vite 构建优化 ✅
- 启用代码分割，将 React 和工具库单独打包
- 启用 Terser 压缩，移除生产环境的 console 和 debugger
- 优化资源内联策略（小于 4kb 的资源内联为 base64）
- 关闭 source map 以减小构建体积

### 4. 组件性能优化 ✅
- 优化了 `getStatusClass` 函数，使用 `useCallback` 缓存
- 简化了 API 请求的缓存逻辑

## 额外建议

### 服务器端优化

1. **启用 Gzip/Brotli 压缩**
   - 在 Nginx 或 Web 服务器中启用压缩
   - 可以显著减少传输的数据量

2. **配置静态资源缓存**
   - 为图片、CSS、JS 文件设置适当的缓存头
   - 例如：`Cache-Control: public, max-age=31536000`

3. **使用 CDN**
   - 如果图片存储在 TOS（对象存储），确保使用 CDN 加速
   - 检查 `TOS_CUSTOM_DOMAIN` 配置是否正确

4. **数据库优化**
   - 检查数据库查询是否有索引
   - 考虑为常用查询添加索引

5. **API 响应优化**
   - 检查后端 API 是否返回了不必要的数据
   - 考虑添加分页功能，避免一次性返回大量数据

### 前端优化

1. **图片优化**
   - 考虑在后端生成缩略图
   - 使用 WebP 格式（如果浏览器支持）
   - 压缩上传的图片

2. **监控和调试**
   - 使用浏览器开发者工具的网络面板检查慢请求
   - 使用 Performance 面板分析页面加载性能
   - 检查是否有大量重复的 API 请求

3. **代码分割**
   - 考虑使用 React.lazy 进行路由级别的代码分割
   - 减少初始加载的 JavaScript 体积

## 排查步骤

如果仍然很卡，请按以下步骤排查：

1. **检查网络**
   - 打开浏览器开发者工具 → Network 面板
   - 查看哪些请求最慢
   - 检查是否有请求失败或超时

2. **检查图片加载**
   - 查看图片 URL 是否正确
   - 检查图片大小（是否过大）
   - 确认图片服务器响应速度

3. **检查 API 响应时间**
   - 查看 API 请求的响应时间
   - 检查后端日志，看是否有慢查询

4. **检查服务器资源**
   - 使用 `top` 或 `htop` 查看服务器 CPU 和内存使用情况
   - 检查是否有其他进程占用资源

5. **检查数据库**
   - 如果使用 SQLite，考虑迁移到 PostgreSQL 或 MySQL
   - SQLite 在高并发下性能较差

## 快速修复建议

如果问题仍然存在，可以尝试：

1. **重新构建前端**
   ```bash
   cd frontend
   npm run build
   ```

2. **清除浏览器缓存**
   - 强制刷新页面（Ctrl+Shift+R 或 Cmd+Shift+R）

3. **检查环境变量**
   - 确认生产环境的 `VITE_API_BASE_URL` 配置正确
   - 确认 `DJANGO_DEBUG=False` 在生产环境

4. **启用 Django 缓存**
   - 考虑使用 Redis 或 Memcached 作为 Django 缓存后端


