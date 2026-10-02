import { defineConfig } from "vite";

// Keep the browser's Host header so the mock SSO can redirect back to the address the device used.
const backend = { target: "http://127.0.0.1:5179", changeOrigin: false };

export default defineConfig({
  server: {
    proxy: {
      "/api": backend,
      "/mock-sso": backend
    }
  },
  build: {
    outDir: "dist"
  }
});
