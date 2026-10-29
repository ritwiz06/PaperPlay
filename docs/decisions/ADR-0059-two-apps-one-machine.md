# ADR-0059: Two apps on one machine

- Status: accepted, amended 2026-10-29 (one endpoint). The owner, 2026-10-28: PaperPlay runs on the same Mac as another app, Replay
  World, and must never collide with it; the ports, the address, the start-up message, the stop
  command, the gate's wait and the README section below are the owner's list.
- Date: 2026-10-28
- Decided by: the owner.

## Context

Two things went wrong on 2026-10-26. Replay World's Vite and PaperPlay's both held port 5173:
"localhost" resolved to ::1 for one and to 127.0.0.1 for the other, so `http://localhost:5173`
showed PaperPlay and `http://127.0.0.1:5173` showed Replay World. And a PaperPlay API started on
18 October still held 8787, so `npm run pipeline:live -- serve` crashed with EADDRINUSE and a stack
trace. Three lands that day were also refused by browser tests timing out while another app's tests
loaded the machine.

## Decision

1. **Ports from settings**, in one module, `scripts/machine/ports.ts`: `PAPERPLAY_WEB_PORT` (default
   5180) and `PAPERPLAY_API_PORT` (8787), read by Vite and its `/api` proxy, the API, `pipeline:live
   -- serve`; the browser tests' own servers on `PAPERPLAY_TEST_WEB_PORT` and
   `PAPERPLAY_TEST_BUILT_PORT` (4317, 4318), read by Playwright, `serve-dist`, `capture-demo` and every
   spec that builds a URL. No other file names a port.
2. **127.0.0.1, never "localhost".** Every PaperPlay server binds 127.0.0.1 by number: Vite's server
   and preview, with `strictPort`, the API, and the proxy's target.
3. **The URL said at start-up:** "PaperPlay: http://127.0.0.1:5180/create", and the API's own.
4. **A busy port said plainly** (`scripts/machine/servers.ts`): which port, the process holding it on
   any address, from lsof (127.0.0.1, ::1 or every address), whether it looks like a PaperPlay
   server, and how to choose another port; then exit, with no stack trace. A port held only on ::1
   counts as busy, so "localhost" never reaches another app beside PaperPlay.
5. **`npm run stop`** stops PaperPlay's own servers and background runs, by pid files each writes
   when it starts (in the git directory's `paperplay-run`, beside the machine's locks), and only a
   process whose command line is still the one it recorded, so it never stops another app, nor a
   process that took a dead server's pid; a `node --watch` above the API is stopped with it. A server
   warns at start-up of an older PaperPlay server, from another commit, still running.
6. **The gate waits for a quiet machine** before its browser tests: while the one-minute load is
   above twice the core count, it waits, saying the load, the heaviest processes and how long it has
   waited, up to 20 minutes; then the tests run, their timeouts unchanged (`scripts/machine/load.ts`).
   Locally they run on a third of the cores, four workers here, not half: the suite's own software
   WebGL, beside another app's browser tests, took the load past 40 and cost first frames their 5 s.
7. **README.md**, new at the repository's root, says how to run PaperPlay next to another app.

## Consequences

- PaperPlay's web app moves from 5173 to 5180: bookmarks to the old port point at whichever app
  holds it now.
- A PaperPlay server started before this, with no pid file, is not stopped by `npm run stop`; the
  busy message names it as PaperPlay's and gives the `kill` that stops it.
- The browser tests' development server still proxies `/api` to `PAPERPLAY_API_PORT`; the tests
  answer every API call they rely on themselves.

## Amendment, 2026-10-29: one endpoint

The owner: "why 2 different end points needed, put them under 1 only". They were two servers for
history's sake: the API holds the gateway's key and runs jobs, and the public site is a static build
with no API; on this machine the app reached the API through a proxy, so a browser only ever used the
app's port, but starting PaperPlay took two commands and two ports. Now:

- **`npm run dev` is the whole of PaperPlay, one process on one port** (`PAPERPLAY_WEB_PORT`, 5180):
  the web app's development server hands every request under `/api` to the API in the same process
  (`apps/api/src/dev.ts`, through Fastify's `routing`), with recorded model calls; no proxy and no
  second server.
- **`npm run pipeline:live -- serve`** starts the same server from `pipeline:live`, its API making
  live calls, recorded; a live client is still refused anywhere else (ADR-0030).
- `npm run dev:api` remains, the API alone on `PAPERPLAY_API_PORT` (8787), for a tool such as curl.
- The gateway's key stays in `apps/api/.env` and in the server's Node process, never in a page: the
  development server serves no `.env` file, and the production build holds no API at all.
