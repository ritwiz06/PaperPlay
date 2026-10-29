# PaperPlay

PaperPlay turns a research paper into a playable, explorable world. The documentation starts at
[docs/README.md](docs/README.md); the standing instructions for working on it are in
[CLAUDE.md](CLAUDE.md).

## Running PaperPlay next to another app

PaperPlay's servers never share a port or an address with another app on the same machine
(ADR-0059):

- **Ports, from settings.** The web app listens on `PAPERPLAY_WEB_PORT` (default 5180), the local API
  on `PAPERPLAY_API_PORT` (default 8787), and the browser tests on their own,
  `PAPERPLAY_TEST_WEB_PORT` and `PAPERPLAY_TEST_BUILT_PORT` (4317 and 4318).
- **127.0.0.1, never "localhost".** Every PaperPlay server binds 127.0.0.1 by number, and so does the
  app's `/api` proxy. "localhost" can mean ::1 to one program and 127.0.0.1 to another, so two apps
  can seem to hold one port at once; open the URL each server prints, with 127.0.0.1.
- **A busy port is said plainly.** A server whose port is taken names the process holding it, on
  127.0.0.1 or ::1, says whether it looks like PaperPlay's, and exits. Choose another port, for
  example `PAPERPLAY_WEB_PORT=5181 npm run dev` (in PowerShell, `$env:PAPERPLAY_WEB_PORT=5181` first).
- **`npm run stop`** stops PaperPlay's own servers and background runs, the ones it recorded when it
  started them, and nothing else. A server says at start-up when an older PaperPlay server is still
  running.

Two terminals, from the repository's folder:

```sh
npm run dev:api      # the API, with recorded model calls; npm run pipeline:live -- serve for live ones
npm run dev          # the web app
```

Then open http://127.0.0.1:5180/create, as the web app prints it.
