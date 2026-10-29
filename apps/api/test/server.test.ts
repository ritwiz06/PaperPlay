import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.ts";
import { urlOf, webPort } from "../../../scripts/machine/ports.ts";

describe("api server", () => {
  it("answers GET /health with ok", async () => {
    const app = buildServer();
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      const body: unknown = response.json();

      expect(response.statusCode).toBe(200);
      expect(body).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });

  it("answers its root, which has no page, by saying where the app is", async () => {
    const app = buildServer();
    try {
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ service: "PaperPlay API", message: expect.stringContaining(`has no pages. Run \`npm run dev\` and open the app, at ${urlOf(webPort())} (PAPERPLAY_WEB_PORT)`) as unknown });
    } finally {
      await app.close();
    }
  });
});
