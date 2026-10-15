import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeFetch } from "../src/models/node-fetch.ts";

// The live client's fetch on node:http(s) (ADR-0030's amendment): it carries the method, headers
// and body, gives back status, headers and body as a Response, waits as long as the reply takes,
// and stops when the adapter's timeout aborts it. Served here by a local server, never the gateway.

let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => (body += chunk.toString()));
    request.on("end", () => {
      const delay = Number(new URL(request.url ?? "/", "http://x").searchParams.get("delay") ?? 0);
      setTimeout(() => {
        response.writeHead(request.url?.startsWith("/missing") ? 404 : 200, { "content-type": "application/json", "retry-after": "3" });
        response.end(JSON.stringify({ method: request.method, auth: request.headers.authorization, body }));
      }, delay);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("[R09] the live client's fetch", () => {
  it("sends the method, headers and body, and answers with the status, headers and body", async () => {
    const response = await nodeFetch(`${base}/chat?delay=300`, { method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" }, body: '{"a":1}' });
    expect(response.status).toBe(200);
    expect(response.headers.get("retry-after")).toBe("3");
    expect(await response.json()).toEqual({ method: "POST", auth: "Bearer test", body: '{"a":1}' });
    const missing = await nodeFetch(`${base}/missing`);
    expect(missing.ok).toBe(false);
    expect(missing.status).toBe(404);
  });

  it("stops when it is aborted, as the adapter's timeout does", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    await expect(nodeFetch(`${base}/slow?delay=2000`, { signal: controller.signal })).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true);
  });

  it("refuses a protocol other than http and https", async () => {
    await expect(nodeFetch("file:///etc/passwd")).rejects.toThrow(/not a protocol/);
  });
});
