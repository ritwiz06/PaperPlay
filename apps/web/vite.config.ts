import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { apiPort, HOST, urlOf, webPort } from "../../scripts/machine/ports.ts";
import { ensurePortFree, registerServer, staleWarnings } from "../../scripts/machine/servers.ts";

/**
 * Once the server listens (ADR-0059): it is recorded as PaperPlay's, so `npm run stop` can stop it;
 * an older PaperPlay server still running is named; and the exact URL to open is said.
 */
function paperplayServer(port: number, role: string, path: string): Plugin {
  const announce = (): void => {
    registerServer(role, port);
    for (const warning of staleWarnings()) console.log(warning);
    console.log(`\n  PaperPlay: ${urlOf(port, path)}\n`);
  };
  return {
    name: "paperplay-server",
    configureServer(server) {
      server.httpServer?.once("listening", announce);
    },
    configurePreviewServer(server) {
      server.httpServer.once("listening", announce);
    },
  };
}

export default defineConfig(async ({ command, isPreview }) => {
  // One port and one address, from settings, never "localhost" (ADR-0059); the local API behind /api,
  // for /create on a development server only; a production build calls no API (ADR-0030).
  const port = webPort();
  const serving = command === "serve" && !process.env["VITEST"];
  if (serving) await ensurePortFree(port, isPreview ? "the built app" : "the web app", "PAPERPLAY_WEB_PORT");
  return {
    plugins: [react(), ...(serving ? [paperplayServer(port, isPreview ? "web preview" : "web", isPreview ? "/" : "/create")] : [])],
    server: { host: HOST, port, strictPort: true, proxy: { "/api": { target: urlOf(apiPort()), rewrite: (path: string) => path.replace(/^\/api/, "") } } },
    preview: { host: HOST, port, strictPort: true },
    build: {
      // Font files stay separate, so a browser fetches a face only when the page uses it (ADR-0002).
      assetsInlineLimit: (file: string) => (file.endsWith(".woff2") ? false : undefined),
    },
  };
});
