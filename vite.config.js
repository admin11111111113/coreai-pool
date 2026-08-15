import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const BASE = "/coreai-pool/"; // репозиторий на GitHub Pages: admin11111111113.github.io/coreai-pool/

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "CoreAI Pool",
        short_name: "CoreAI",
        description: "AI Chat Subscription",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: BASE,
        scope: BASE,
        icons: [
          {
            src: BASE + "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: BASE + "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  define: {
    global: "globalThis",
  },
});
