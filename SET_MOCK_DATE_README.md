# 设置模拟日期工具使用说明

这个工具可以帮助你快速设置前端和后端的模拟日期，用于测试。

## 使用方法

### Windows 系统

#### 方法 1：使用批处理文件（推荐）
双击运行 `set_mock_date.bat` 文件

#### 方法 2：使用 PowerShell 脚本
在 PowerShell 中运行：
```powershell
.\set_mock_date.ps1
```

如果遇到执行策略限制，可以运行：
```powershell
powershell -ExecutionPolicy Bypass -File set_mock_date.ps1
```

#### 方法 3：使用 Python 脚本（跨平台）
```bash
python set_mock_date.py
```

### macOS / Linux 系统

使用 Python 脚本：
```bash
python3 set_mock_date.py
```

## 使用步骤

1. **运行脚本**
   - 双击 `set_mock_date.bat`（Windows）
   - 或在终端运行 `python set_mock_date.py`

2. **输入日期**
   - 按照提示输入日期，格式：`YYYY-MM-DD`（例如：`2026-03-01`）
   - 直接回车则使用当前真实日期

3. **自动更新配置**
   - 脚本会自动更新前端的 `frontend/src/utils/dateUtils.ts`
   - 脚本会自动更新后端的 `backend/core/views.py`
   - 脚本会自动更新/创建后端的 `backend/.env.local` 文件

4. **重启服务**
   - 重启前端服务（如果正在运行）
   - 重启后端服务（如果正在运行）
   - 刷新浏览器页面查看效果

## 示例

```
==================================================
设置模拟日期工具
==================================================

📅 当前设置的模拟日期: 2026-03-01

请输入新的模拟日期 (格式: YYYY-MM-DD，例如 2026-03-01，直接回车使用当前真实日期): 2026-03-15

正在更新配置...
--------------------------------------------------
✅ 前端日期已更新为: 2026-03-15
✅ 后端默认日期已更新为: 2026-03-15
✅ 后端环境变量文件已更新: backend\.env.local
--------------------------------------------------

==================================================
✅ 配置更新完成！
==================================================

📅 模拟日期已设置为: 2026-03-15

下一步操作:
1. 重启前端服务（如果正在运行）
2. 重启后端服务（如果正在运行）
3. 重新加载页面查看效果
```

## 修改的文件

1. **前端**: `frontend/src/utils/dateUtils.ts`
   - 修改 `getTodayInShanghai()` 函数的返回值

2. **后端**: `backend/core/views.py`
   - 修改 `get_now_with_mock()` 函数的默认日期
   - 修改 `get_today_shanghai()` 函数的默认日期

3. **后端环境变量**: `backend/.env.local`
   - 添加或更新 `MOCK_DATE` 环境变量

## 注意事项

- 脚本会修改源代码文件，建议先提交或备份当前代码
- 修改后需要重启前后端服务才能生效
- 如果不想使用模拟日期，可以删除 `.env.local` 中的 `MOCK_DATE` 变量，或将其值设为空

## 恢复真实日期

如果想要恢复使用真实日期：

1. **方法 1**：手动修改前端文件
   - 打开 `frontend/src/utils/dateUtils.ts`
   - 将硬编码的日期改为注释掉，使用真实日期

2. **方法 2**：删除环境变量
   - 删除 `backend/.env.local` 文件中的 `MOCK_DATE` 行
   - 或设置 `MOCK_DATE=`（空值）

## 故障排除

### Python 脚本无法运行
- 确保已安装 Python 3.6 或更高版本
- 检查 Python 是否在系统 PATH 中

### PowerShell 脚本被阻止
- 运行 `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- 或使用 `powershell -ExecutionPolicy Bypass -File set_mock_date.ps1`

### 找不到文件
- 确保在项目根目录运行脚本
- 检查 `frontend/src/utils/dateUtils.ts` 和 `backend/core/views.py` 是否存在

