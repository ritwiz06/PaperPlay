import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The local API, for /create on a development server only; a production build calls no API (ADR-0030).
  server: { proxy: { "/api": { target: "http://127.0.0.1:8787", rewrite: (path) => path.replace(/^\/api/, "") } } },
  build: {
    // Font files stay separate, so a browser fetches a face only when the page uses it (ADR-0002).
    assetsInlineLimit: (file) => (file.endsWith(".woff2") ? false : undefined),
  },
});
