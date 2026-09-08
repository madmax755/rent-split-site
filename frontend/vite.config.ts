import path from "node:path";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babelPlugin from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [
    // Compiler must run before the React/oxc JSX transform.
    babelPlugin({
      presets: [reactCompilerPreset()],
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
