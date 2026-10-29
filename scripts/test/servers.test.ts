import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as listenOn, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { waitForQuietMachine, type MachineProbe } from "../machine/load.ts";
import { HOST, portOf } from "../machine/ports.ts";
import { busyMessage, commandOf, stopServers } from "../machine/servers.ts";

// Two apps on one machine (ADR-0059): PaperPlay's servers bind 127.0.0.1 on ports from settings,
// refuse a busy port plainly, stop only what PaperPlay started, and the gate waits for a quiet
// machine before its browser tests.

const root = join(import.meta.dirname, "..", "..");
const started: ChildProcess[] = [];
const servers: Server[] = [];
afterEach(() => {
  for (const child of started.splice(0)) child.kill("SIGKILL");
  for (const server of servers.splice(0)) server.close();
});

/** A port this test holds on 127.0.0.1, as another app would. */
const holdPort = (): Promise<number> =>
  new Promise((resolve) => {
    const server = listenOn();
    servers.push(server);
    server.listen(0, HOST, () => resolve((server.address() as { port: number }).port));
  });
const freePort = async (): Promise<number> => {
  const port = await holdPort();
  servers.pop()?.close();
  return port;
};
const lsof = spawnSync("lsof", ["-v"]).error === undefined;

describe("ports from settings (ADR-0059)", () => {
  it("default to 5180 and 8787, take a setting, and refuse one that is not a port, by name", () => {
    expect(portOf("PAPERPLAY_WEB_PORT", {})).toBe(5180);
    expect(portOf("PAPERPLAY_API_PORT", {})).toBe(8787);
    expect(portOf("PAPERPLAY_WEB_PORT", { PAPERPLAY_WEB_PORT: "5190" })).toBe(5190);
    expect(() => portOf("PAPERPLAY_API_PORT", { PAPERPLAY_API_PORT: "localhost" })).toThrow("PAPERPLAY_API_PORT is \"localhost\"");
  });

  it("refuse a busy port plainly: which port, who holds it, whether it is PaperPlay's, and no stack trace", async () => {
    const port = await holdPort();
    const api = spawnSync(process.execPath, ["src/main.ts"], { cwd: join(root, "apps", "api"), env: { ...process.env, PAPERPLAY_API_PORT: String(port) }, encoding: "utf8", timeout: 30_000 });
    expect(api.status).toBe(1);
    expect(api.stderr).toContain(`PaperPlay cannot start the API: port ${port} is in use.`);
    if (lsof) expect(api.stderr).toContain(`pid ${process.pid} listens on ${HOST}:${port}`);
    expect(api.stderr).toContain(`PAPERPLAY_API_PORT=${port + 1}`);
    expect(`${api.stdout}${api.stderr}`).not.toMatch(/^\s+at /m);
    const web = spawnSync(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js")], { cwd: join(root, "apps", "web"), env: { ...process.env, PAPERPLAY_WEB_PORT: String(port), VITEST: "" }, encoding: "utf8", timeout: 30_000 });
    expect(web.status).toBe(1);
    expect(web.stderr).toContain(`PaperPlay cannot start the web app and its API: port ${port} is in use.`);
    expect(`${web.stdout}${web.stderr}`).not.toMatch(/^\s+at /m);
  }, 60_000);

  it("say what holds a port, and leave another app's server alone", () => {
    const message = busyMessage(5173, "the web app", "PAPERPLAY_WEB_PORT", [{ pid: 20866, addresses: ["127.0.0.1:5173", "[::1]:5173"], command: "node …/ReplayWorldStudio/apps/web/node_modules/.bin/vite", cwd: "/Users/someone/ReplayWorldStudio/apps/web", paperplay: false, record: null }]);
    expect(message).toContain("pid 20866 listens on 127.0.0.1:5173 and [::1]:5173");
    expect(message).toContain("It is not a PaperPlay server; PaperPlay leaves it alone.");
  });

  it("serve the web app and its API on one port, the API at /api in the same process, on 127.0.0.1", async () => {
    const web = await freePort();
    process.env["PAPERPLAY_WEB_PORT"] = String(web);
    const { createServer } = await import("vite");
    const frontend = await createServer({ root: join(root, "apps", "web"), configFile: join(root, "apps", "web", "vite.config.ts"), logLevel: "silent" });
    try {
      await frontend.listen();
      expect(frontend.config.server.host).toBe(HOST);
      expect(frontend.config.server.strictPort).toBe(true);
      expect(frontend.config.server.proxy).toBeUndefined();
      expect(await (await fetch(`http://${HOST}:${web}/api/health`)).json()).toEqual({ status: "ok" });
      expect(await (await fetch(`http://${HOST}:${web}/api/jobs`)).json()).toEqual({ jobs: [] });
      // The API's key lives in this process now, never in a page: the server serves no .env file.
      expect((await fetch(`http://${HOST}:${web}/@fs${join(root, "apps", "api", ".env.example")}`)).status).toBe(403);
    } finally {
      await frontend.close();
      delete process.env["PAPERPLAY_WEB_PORT"];
    }
  }, 60_000);
});

describe("npm run stop (ADR-0059)", () => {
  it("stops PaperPlay's recorded process, and never one it did not record, nor one that took a recorded pid", async () => {
    const dir = mkdtempSync(join(tmpdir(), "paperplay-run-"));
    try {
      const forever = ["-e", "setInterval(() => {}, 1000)"];
      const ours = spawn(process.execPath, [...forever, "paperplay-test-ours"]);
      const other = spawn(process.execPath, [...forever, "another-app"]);
      started.push(ours, other);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const record = (pid: number, command: string) => ({ pid, watcher: null, role: "web", port: null, commit: "abc1234", started: new Date().toISOString(), command, cwd: root });
      writeFileSync(join(dir, `web-${ours.pid ?? 0}.json`), JSON.stringify(record(ours.pid ?? 0, commandOf(ours.pid ?? 0))));
      // The other app's pid, recorded with a command line it does not have: a pid reused after a PaperPlay server ended.
      writeFileSync(join(dir, `api-${other.pid ?? 0}.json`), JSON.stringify(record(other.pid ?? 0, "node src/main.ts")));
      const said = await stopServers(dir, 2_000);
      expect(said).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(ours.exitCode !== null || ours.signalCode !== null).toBe(true);
      expect(other.exitCode).toBeNull();
      expect(other.signalCode).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("the gate's wait for a quiet machine (ADR-0059)", () => {
  const probe = (loads: number[]): MachineProbe & { readonly said: string[] } => {
    const said: string[] = [];
    return { said, load: () => loads.shift() ?? 0, cores: () => 12, heavy: () => ["120.0% chrome-headless-shell", "95.0% another app"], sleep: () => Promise.resolve(), say: (line) => void said.push(line) };
  };

  it("waits while the load is above twice the cores, saying what is heavy and for how long, then runs", async () => {
    const machine = probe([30, 26, 10]);
    expect(await waitForQuietMachine("the browser tests", machine, { limitMs: 600_000, intervalMs: 30_000 })).toEqual({ waitedMs: 60_000, quiet: true });
    expect(machine.said[0]).toContain("the machine's load is 30.0, above 24 (twice its 12 cores); the browser tests wait, 0 s so far of at most 10 min. Heaviest: 120.0% chrome-headless-shell");
    expect(machine.said.at(-1)).toContain("run after waiting 60 s");
  });

  it("runs anyway at its limit, and does not wait at all on a quiet machine", async () => {
    const busy = probe([40, 40, 40, 40]);
    expect(await waitForQuietMachine("the browser tests", busy, { limitMs: 60_000, intervalMs: 30_000 })).toEqual({ waitedMs: 60_000, quiet: false });
    expect(busy.said.at(-1)).toContain("their timeouts unchanged");
    const quiet = probe([3]);
    expect(await waitForQuietMachine("the browser tests", quiet)).toEqual({ waitedMs: 0, quiet: true });
    expect(quiet.said).toEqual([]);
  });
});
