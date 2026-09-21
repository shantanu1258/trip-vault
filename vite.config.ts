import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  build: {
    // Keep travel documents as real files so browsers can preview/download them.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/@supabase") ||
            id.includes("node_modules/@gotrue") ||
            id.includes("node_modules/@realtime") ||
            id.includes("node_modules/@postgrest") ||
            id.includes("node_modules/@storage")
          )
            return "supabase";
          if (id.includes("node_modules/dexie")) return "offline-storage";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/react") || id.includes("node_modules/@tanstack"))
            return "react-vendor";
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "icons/wallet-v2-32.png",
        "icons/wallet-v2-192.png",
        "icons/wallet-v2-512.png",
        "icons/wallet-v2-apple-touch.png"
      ],
      manifest: {
        name: "Trip Vault",
        short_name: "Trip Vault",
        description: "Your trips, documents, and next actions - ready when you are.",
        theme_color: "#146b67",
        background_color: "#f5f7fa",
        display: "standalone",
        start_url: "/",
        share_target: {
          action: "/share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [
              {
                name: "documents",
                accept: ["application/pdf", "application/x-pdf", ".pdf"]
              },
              {
                name: "images",
                // Gallery apps may advertise image/* rather than a precise type.
                // The receiver still validates JPEG/PNG/WebP and the 5 MB limit.
                accept: ["image/*", ".jpg", ".jpeg", ".png", ".webp"]
              }
            ]
          }
        },
        icons: [
          {
            src: "/icons/wallet-v2-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/wallet-v2-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        importScripts: ["/push-worker.js", "/share-target-worker.js"],
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,jpg,jpeg,webp,pdf,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true
      }
    })
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true
  }
});
