import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";

const host = process.env.TAURI_DEV_HOST;

const mediapipeSourcemapFixPlugin = (): Plugin => ({
  name: "mediapipe-sourcemap-fix",
  enforce: "pre",
  async load(id: string) {
    const cleanId = id.split("?")[0].replace(/\\/g, "/");
    if (cleanId.includes("@mediapipe/tasks-vision") && cleanId.endsWith(".mjs")) {
      const rawCode = await fs.promises.readFile(id.split("?")[0], "utf-8");
      return {
        code: rawCode.replace(/\/\/# sourceMappingURL=.*/g, ""),
        map: null,
      };
    }
  },
});

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    tailwindcss(),
    mediapipeSourcemapFixPlugin(),
  ],

  assetsInclude: ["**/*.task", "**/*.wasm"],
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Keep backend and generated artifacts out of the development watcher.
      ignored: ["**/src-tauri/**", "**/logs/**", "**/dist/**"],
    },
  },
}));
