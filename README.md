# Echo 全栈项目脚手架

该仓库采用 **Django** 作为后端 API，**React + Vite** 作为前端界面。当前仅搭建了基础结构，方便将 Stitch 导出的页面逐步迁移到 React 组件中。

## 目录结构

- `backend/`：Django 项目（项目名 `config`，核心应用 `core`）。
- `frontend/`：Vite 创建的 React TypeScript 项目。
- `*/code.html`：Stitch 导出的静态页面，后续可参考迁移。

## 后端（Django）

1. 创建虚拟环境（可选）：

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\activate
   ```

2. 安装依赖：

   ```powershell
   pip install -r requirements.txt
   ```

3. 配置环境变量：复制 `backend/.env.example` 到 `.env`，根据需要调整 `DJANGO_SECRET_KEY`、`DJANGO_ALLOWED_HOSTS` 等。若要启用火山云 TOS 对象存储，请额外设置：
   ```env
   DJANGO_USE_TOS_STORAGE=true
   TOS_ACCESS_KEY_ID=your-access-key-id
   TOS_SECRET_ACCESS_KEY=your-secret-access-key
   TOS_REGION_NAME=cn-shanghai
   TOS_ENDPOINT_URL=https://tos-s3-cn-shanghai.volces.com
   TOS_BUCKET=echobucket
   TOS_MEDIA_LOCATION=uploads
   TOS_CUSTOM_DOMAIN=echobucket.tos-cn-shanghai.volces.com  # 有自定义 CDN 域名时使用
   ```
   未启用 TOS 时，可省略上述变量，媒体文件将继续保存在本地 `backend/media/`。

4. 运行迁移并启动开发服务器：

   ```powershell
   python manage.py migrate
   python manage.py runserver
   ```

5. 健康检查端点：`GET http://localhost:8000/api/health/`

## 前端（React + Vite）

1. 安装依赖：

   ```powershell
   cd frontend
   npm install
   ```

2. 配置开发环境变量：复制 `frontend/.env.development` 到 `.env.development.local` 或 `.env` 并修改 `VITE_API_BASE_URL`，确保指向 Django API。

3. 启动开发服务器：

   ```powershell
   npm run dev
   ```

4. 访问 `http://localhost:5173`，主页会展示后端健康状态。

## 迁移 Stitch 页面建议

- 将每个 HTML 页面拆分成 `frontend/src/pages` 和 `frontend/src/components` 下的 React 组件。
- 共享的 UI 元素集中在 `src/components`；与 API 交互逻辑放在 `src/services` 中（`api.ts` 已封装 axios 实例）。
- 如需全局样式，可在 `src/index.css` 中统一调整。

## 后续步骤

- 添加身份认证 / API 逻辑到 `backend/core`。
- 依据业务需求扩展 REST API（推荐使用 Django REST Framework 的 ViewSets）。
- 逐步替换 `frontend/src/pages/Home.tsx` 中的占位内容，导入 Stitch 的布局与样式。









