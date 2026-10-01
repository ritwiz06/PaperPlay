import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // Font files stay separate, so a browser fetches a face only when the page uses it (ADR-0002).
    assetsInlineLimit: (file) => (file.endsWith(".woff2") ? false : undefined),
  },
});
