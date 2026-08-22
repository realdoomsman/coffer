import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // one .env at the monorepo root serves web + api. Without this Vite
  // would only read apps/web/.env and VITE_PRIVY_APP_ID would silently
  // never load.
  envDir: "../../",
  build: {
    rollupOptions: {
      output: {
        // separate cacheable vendor chunks: the chart and auth stacks are
        // big and change far less often than app code
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["lightweight-charts"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
