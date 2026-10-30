import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

function normalizeBasePath(value: string | undefined): string {
  if (value === undefined) return "/kxnoverse-pwa/";
  const segments = value.trim().split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}/` : "/";
}

export default defineConfig(({ mode }) => {
  const basePath = mode === "production"
    ? normalizeBasePath(loadEnv(mode, process.cwd(), "VITE_").VITE_BASE_PATH)
    : "/";
  return {
    base: basePath,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("/node_modules/@tiptap/") || id.includes("/node_modules/prosemirror/")) {
              return "docs-editor-core";
            }
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["kxnodesk-logo.png", "kxnodesk-icon-192.png", "kxnodesk-icon-512.png"],
        manifest: {
          name: "Kxno Desk",
          short_name: "Kxno Desk",
          description: "A local workspace for school.",
          theme_color: "#111316",
          background_color: "#111316",
          display: "standalone",
          orientation: "landscape",
          start_url: basePath,
          scope: basePath,
          icons: [
            {
              src: `${basePath}kxnodesk-icon-192.png`,
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: `${basePath}kxnodesk-icon-512.png`,
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
          ],
        },
        workbox: {
          clientsClaim: true,
          cleanupOutdatedCaches: false,
          navigateFallback: "index.html",
          globPatterns: ["**/*.{js,css,html,svg,ico,png,json,txt,webmanifest,wasm,mjs,woff2}"],
          maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  };
});
