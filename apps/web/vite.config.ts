import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { HOST, urlOf, webPort } from "../../scripts/machine/ports.ts";
import { ensurePortFree, registerServer, staleWarnings } from "../../scripts/machine/servers.ts";

/** Which model calls the development server's API makes: `pipeline:live -- serve` asks for live ones. */
const calls = process.env["PAPERPLAY_API_CALLS"] === "live" ? "live" : "recorded";

/**
 * Once the server listens (ADR-0059): it is recorded as PaperPlay's, so `npm run stop` can stop it;
 * an older PaperPlay server still running is named; and the exact URL to open is said.
 */
function paperplayServer(port: number, role: string, path: string, says: string): Plugin {
  const announce = (): void => {
    registerServer(role, port);
    for (const warning of staleWarnings()) console.log(warning);
    console.log(`\n  PaperPlay: ${urlOf(port, path)}${says}\n`);
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

/**
 * The API at /api on the same server, in the same process (ADR-0059's amendment): one port and one
 * URL for the whole of PaperPlay on this machine, never a second server to start or a proxy to it.
 */
function paperplayApi(): Plugin {
  return {
    name: "paperplay-api",
    async configureServer(server) {
      const { apiForDevelopment } = await import("../api/src/dev.ts");
      const api = await apiForDevelopment(calls);
      // Connect strips the /api it is mounted at, so the API sees its own paths: /jobs, /health.
      server.middlewares.use("/api", (request, response) => api.routing(request, response));
      server.httpServer?.once("close", () => void api.close());
    },
  };
}

export default defineConfig(async ({ command, isPreview }) => {
  // One port and one address, from settings, never "localhost" (ADR-0059). On a development server
  // the API answers at /api in this process, for /create; a production build holds no API (ADR-0030).
  const port = webPort();
  const developing = command === "serve" && !isPreview;
  // A test that starts this server itself neither checks the port nor records the server.
  const watched = command === "serve" && !process.env["VITEST"];
  if (watched) await ensurePortFree(port, isPreview ? "the built app" : "the web app and its API", "PAPERPLAY_WEB_PORT");
  return {
    plugins: [
      react(),
      ...(developing ? [paperplayApi()] : []),
      ...(watched ? [paperplayServer(port, isPreview ? "web preview" : calls === "live" ? "web live" : "web", isPreview ? "/" : "/create", developing ? `, its API at /api with ${calls === "live" ? "live model calls, recorded" : "recorded model calls"}` : "")] : []),
    ],
    server: { host: HOST, port, strictPort: true },
    preview: { host: HOST, port, strictPort: true },
    build: {
      // Font files stay separate, so a browser fetches a face only when the page uses it (ADR-0002).
      assetsInlineLimit: (file: string) => (file.endsWith(".woff2") ? false : undefined),
    },
  };
});
