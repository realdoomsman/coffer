import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // one .env at the monorepo root serves web + api. Without this Vite
  // would only read apps/web/.env and VITE_PRIVY_APP_ID would silently
  // never load.
  envDir: "../../",
  build: {
    // Enable minification
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Separate cacheable vendor chunks: the chart and auth stacks are
        // big and change far less often than app code
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            // React ecosystem
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) {
              return "react";
            }
            // Charts
            if (id.includes("lightweight-charts")) {
              return "charts";
            }
            // Buffer is a polyfill the Solana code DEPENDS on, so it must
            // not share a chunk with it — keep it separate so it is always
            // evaluated first.
            if (id.includes("/buffer/") || id.includes("node_modules/buffer")) {
              return "polyfills";
            }
            // Solana
            if (id.includes("@solana")) {
              return "solana";
            }
            // Auth
            if (id.includes("@privy")) {
              return "auth";
            }
            // QR codes
            if (id.includes("qrcode")) {
              return "qrcode";
            }
            // Other vendor code
            return "vendor";
          }
        },
        // Chunk file naming with content hash for long-term caching
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
      },
    },
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Target modern browsers
    target: "esnext",
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
    ],
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
  // Development server performance
  esbuild: {
    logOverride: { "this-is-undefined-in-esm": "silent" },
  },
});
