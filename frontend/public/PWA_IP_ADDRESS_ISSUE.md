# PWA 在 IP 地址环境下的限制和解决方案

## 问题说明

当您使用 IP 地址（如 `192.168.3.3:5173`）访问网站时，Service Worker **无法注册**。这是浏览器的安全限制。

### 浏览器安全策略

Service Worker 只能在以下环境中工作：
1. ✅ **HTTPS** 协议
2. ✅ **localhost** 或 **127.0.0.1**
3. ❌ **IP 地址**（即使是局域网 IP）**不支持**

这是所有现代浏览器的安全策略，无法绕过。

## 当前情况

- ✅ Manifest: 正常
- ❌ Service Worker: 无法注册（因为使用 IP 地址）
- ❌ HTTPS: 未使用（开发环境）
- 显示模式: browser（正常）

## 解决方案

### 方案 1: 使用 localhost（推荐 - 开发环境）

**最简单的方法**：使用 `localhost` 而不是 IP 地址访问

```bash
# 访问
http://localhost:5173
# 而不是
http://192.168.3.3:5173
```

**优点**：
- ✅ Service Worker 可以正常工作
- ✅ PWA 功能完全可用
- ✅ 无需额外配置

**缺点**：
- 只能在本机访问
- 其他设备无法通过局域网访问

### 方案 2: 配置 HTTPS 开发服务器（推荐 - 需要局域网访问）

如果需要其他设备访问，可以配置 HTTPS：

#### 使用 mkcert（最简单）

```bash
# 1. 安装 mkcert
# Windows: choco install mkcert
# Mac: brew install mkcert
# Linux: 查看 https://github.com/FiloSottile/mkcert

# 2. 安装本地 CA
mkcert -install

# 3. 生成证书（在项目根目录）
mkcert localhost 192.168.3.3 127.0.0.1

# 4. 会生成两个文件：
# - localhost+2.pem (证书)
# - localhost+2-key.pem (私钥)
```

#### 配置 Vite 使用 HTTPS

创建 `vite.config.https.ts` 或修改 `vite.config.ts`：

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'localhost+2-key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, 'localhost+2.pem')),
    },
    host: '0.0.0.0', // 允许局域网访问
    port: 5173,
  },
});
```

然后访问：`https://192.168.3.3:5173`

**注意**：首次访问需要在设备上信任证书。

### 方案 3: 等待备案通过（生产环境）

对于生产环境：
1. 等待备案通过
2. 配置域名和 SSL 证书
3. 使用 HTTPS 访问
4. Service Worker 将正常工作

## 临时解决方案（测试 PWA 功能）

如果只是想测试 PWA 的安装和 standalone 模式：

1. **在本机使用 localhost 测试**
   - 访问 `http://localhost:5173`
   - Service Worker 可以正常工作
   - 可以测试完整的 PWA 功能

2. **移动设备测试**
   - 如果需要在移动设备上测试，有两个选择：
     - 使用方案 2 配置 HTTPS
     - 或者等待生产环境 HTTPS 配置完成

## 关于 PWA 安装

即使 Service Worker 无法注册，**manifest.json 仍然有效**，这意味着：

- ✅ iOS Safari：可以手动添加到主屏幕（不依赖 Service Worker）
- ⚠️ Android Chrome：需要 Service Worker 才能安装
- ⚠️ 其他浏览器：行为各异

## 总结

| 环境 | Service Worker | PWA 安装 | 建议 |
|------|---------------|----------|------|
| localhost | ✅ 支持 | ✅ 完全支持 | 开发环境推荐 |
| IP 地址 (HTTP) | ❌ 不支持 | ⚠️ 部分支持 | 不推荐 |
| IP 地址 (HTTPS) | ✅ 支持 | ✅ 完全支持 | 需要配置证书 |
| 域名 (HTTPS) | ✅ 支持 | ✅ 完全支持 | 生产环境 |

## 下一步

1. **开发环境**：使用 `localhost` 访问，可以完整测试 PWA 功能
2. **生产环境**：等待备案通过，配置 HTTPS 后，PWA 功能将完全可用
3. **临时测试**：如果需要移动设备测试，配置 HTTPS 开发服务器

## 验证

配置完成后，刷新页面，等待 3 秒，控制台应该显示：
- ✅ Manifest: ✅
- ✅ Service Worker: ✅
- ✅ HTTPS: ✅
- 显示模式: browser（正常）






