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
})
