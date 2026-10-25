import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/kxnoverse-pwa/" : "/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["kxnodesk-logo.png", "kxnodesk-icon-192.png", "kxnodesk-icon-512.png"],
      manifest: {
        name: "Kxno Desk",
        short_name: "Kxno Desk",
        description: "A local workspace for school.",
        theme_color: "#111316",
        background_color: "#111316",
        display: "standalone",
        orientation: "landscape",
        start_url: "/kxnoverse-pwa/",
        scope: "/kxnoverse-pwa/",
        icons: [
          {
            src: "/kxnoverse-pwa/kxnodesk-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/kxnoverse-pwa/kxnodesk-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,ico,png,webmanifest}"],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
}));
