import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.ts";

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
});
