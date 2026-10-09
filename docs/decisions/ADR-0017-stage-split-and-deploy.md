# ADR-0017: The stage as its own chunk, and a static deploy on Vercel

- Status: accepted. The owner connects the deploy. A Content-Security-Policy was added before
  the first deploy (follow-up below).
- Date: 2026-10-09
- Decided by:
  - the owner asked for slice 4: "a Vercel/Netlify static deploy with PR previews, the
    Three.js stage code-split first. Tell me what you need from me to connect the account";
  - I chose the host and wrote the configuration. The owner connects it, or not.

## Context

- **The app shipped as one 967 KB chunk.**
  - Three.js was more than half of it, and loaded before anything was drawn.
  - The owner had deferred the split on 2026-10-01, and asked for it now.
- **This repository is private.** A static host publishes whatever it builds, and its
  pull-request previews are reachable by URL.

## Decision

1. **`WorldStage` imports the Three.js adapter with `import()`** when it mounts.
   - The page and its HUD draw first, and the stage mounts when its chunk arrives. Until then,
     the stage says `data-webgl="loading"`.
   - Unmounting before the chunk arrives cancels the mount.
   - The adapter's types are imported as types only, so they add nothing to the entry chunk.
   - **The result:** an entry chunk of 416 KB (128 KB gzipped), and a stage chunk of 551 KB
     (139 KB gzipped).
   - Vite still warns about the stage chunk, because Three.js alone is over 500 KB. The
     warning stays visible: the limit is not raised.
2. **A test builds the production bundle for real,** and checks two things (it caught a planted
   eager import):
   - exactly one entry chunk;
   - the Three.js renderer only in the `three-adapter-*` chunk.
3. **The host is Vercel, configured in `vercel.json`.**
   - It runs a clean `npm ci`, then the repository's own `npm run build`, and serves
     `apps/web/dist`.
   - Every path is rewritten to the app, so `/world/hook` loads on a fresh visit.
   - Three plain security headers: `nosniff`, a strict referrer policy, and no framing.
   - Hashed assets are cached for a year.
   - A test holds the file to the build script and Vite's output folder.
4. **Why Vercel over Netlify:**
   - Both build pull-request previews of a private repository on their free plans.
   - Vercel's Standard Deployment Protection is on by default, so only the account's members
     can open a preview. Netlify's password protection needs a paid plan.
   - The production deployment is public on either host's free plan.
5. **No secrets are involved.** The web app holds none, and none is needed to build it.
   - The API is not deployed.
   - The bundle check for key prefixes (R09) arrives with the API at G3.
6. **Not configured:** a Content-Security-Policy.
   - The app loads nothing from other origins, so a strict policy should fit.
   - But one that has not been tried against the deployed page could break it. It is
     recommended once a preview exists to test against.

## What the owner needs to do

1. Sign in to Vercel with the GitHub account that owns `ritwiz06/PaperPlay`, on the free
   Hobby plan (non-commercial use).
2. Choose **Add New → Project**. When asked, install Vercel's GitHub app with access to
   **this repository only**.
3. Import `ritwiz06/PaperPlay`, keeping these settings:
   - the root directory as the repository root;
   - the framework preset "Other". `vercel.json` sets the commands.
   - no environment variables.
4. **Deploy.**
   - `main` becomes the production deployment.
   - Each pull request then gets a preview link, posted on the pull request.
5. **Decide whether the production URL may be public.**
   - On Hobby, protection covers previews only.
   - If production must stay private too, keep using preview links. The alternatives are
     paid protection, or deploying only from a branch that is never public.

Before connecting, check that publishing this build fits ASU's data guidance. The build
holds no personal data and no secrets.

## Follow-up on 2026-10-09: the Content-Security-Policy, before the first deploy

The owner asked for the policy and the usual security headers before connecting, tested
against the built app. `vercel.json` now sends:
- **`Content-Security-Policy`:** `default-src 'self'`; scripts, styles, fonts and connections
  from the page's own origin only; images also from `data:`; no workers, objects, base URI,
  form targets or framing. No `'unsafe-inline'` and no `'unsafe-eval'`.
- **`Strict-Transport-Security`:** two years, with subdomains.
- **`Permissions-Policy`:** camera, microphone, geolocation, payment and USB, all off.
- **`Cross-Origin-Opener-Policy`:** `same-origin`.
- **Kept:** `nosniff`, the referrer policy and `X-Frame-Options: DENY`.

How it was tested:
- `scripts/serve-dist.ts` serves the production build as Vercel will: `vercel.json`'s header
  rules and rewrites, nothing else.
- The browser tests start it beside the dev server, and check that every header arrives.
- They play `/world/hook` through four levels, the journal and What if, and open
  `/world/local`. They require no policy violation and no console error.

What the test found:
- Zod 4 probes whether `new Function` works, and a strict policy reports the probe even
  though Zod catches it.
- The web app now sets Zod's `jitless` option in a module imported first, so nothing parses
  before it is set. Zod then neither probes nor compiles parsers with eval, and its
  interpreted parsers give the same results.

Once the owner has connected the deploy, the policy is checked against the preview and
tightened where the preview allows.

## Consequences

- The first frame of the HUD no longer waits for Three.js.
- Once connected, each pull request gets a preview to review the levels in a browser, and
  CI's `check:gate` still decides whether a change may merge.
- Moving to Netlify later means swapping `vercel.json` for a `netlify.toml` with the same
  commands, rewrite and headers.
