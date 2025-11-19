import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(fileURLToPath(new URL("./src", import.meta.url))),
    },
  },
  server: {
    host: process.env.VITE_DEV_SERVER_HOST ?? "0.0.0.0",
    port: Number(process.env.VITE_DEV_SERVER_PORT ?? 5173),
    strictPort: true,
    hmr: {
      host: process.env.VITE_DEV_SERVER_HMR_HOST ?? undefined,
    },
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // 启用代码分割
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 React 相关库单独打包
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 将工具库单独打包
          'utils': ['axios'],
        },
      },
    },
    // 启用压缩（使用 esbuild，更快且类型安全）
    minify: 'esbuild',
    // 如果需要 terser，使用类型断言
    // minify: 'terser',
    // terserOptions: {
    //   compress: {
    //     drop_console: true,
    //     drop_debugger: true,
    //   },
    //   format: {
    //     comments: false,
    //   },
    // } as any,
    // 启用 CSS 代码分割
    cssCodeSplit: true,
    // 优化 chunk 大小警告阈值
    chunkSizeWarningLimit: 1000,
    // 启用 source map（生产环境可以关闭以提高性能）
    sourcemap: false,
    // 优化构建输出
    assetsInlineLimit: 4096, // 小于 4kb 的资源内联为 base64
  },
  // 优化依赖预构建
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios'],
  },
})
