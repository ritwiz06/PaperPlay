# ADR-0034: /create on this machine only, and generated worlds in the town kit

- Status: accepted. The owner asked for a local `/create` whose storyboard shows real job states
  and says exactly why a job stopped, and for a public site that only plays worlds built
  beforehand (2026-10-14). How the build keeps them apart, and how a generated world is drawn,
  are mine, for the owner to confirm.
- Date: 2026-10-14
- Decided by: me, within ADR-0030 and ADR-0033.

## Context

The pipeline runs only where the gateway's key is: on this machine, or a server the owner
controls (ADR-0030). The static Vercel build must hold no key, no API and no working `/create`.
A generated compartment world needs the same shell Threshold Town plays in, with any number of
compartments from two to six.

## Decision

1. **`/create` exists only on a development server.** `App.tsx` loads it lazily behind
   `import.meta.env.DEV`, which a production build replaces with `false`, so the page, its
   `EventSource` and its `/api/` calls are dropped from the bundle. The bundle test builds in
   production mode and finds none of them [R09]; an e2e test opens `/create` on the built site and
   finds no form. Vite's development server proxies `/api` to the local API on 127.0.0.1:8787.
2. **The storyboard shows the job's own events.** Seven stages in order, each "done", "now" or
   "waiting" by the states the job has actually reached; each event's words under its stage; a
   repair under the stage it repairs; an ending (needs your decision, not supported, failed,
   cancelled) with the job's own message. No progress bar and no time estimate. "Play the world"
   appears only at `ready`.
3. **A generated world plays at `/world/generated/<sourceId>`** from
   `fixtures/worldspecs/generated/<sourceId>.json`, built beforehand and committed, on every build.
   A job's world, `/world/job/<id>`, is read from the local API on a development server only.
   Either is built by the same deterministic builder the gate uses.
4. **Any compartment world plays in the town kit** through one binding, `townWorld`, which
   Threshold Town now uses too. The figures take six colours, each kept at 3:1 against the ground
   and the plaza [R12]. Which compartments' figures stand in a ring, as the ill do, is named by
   the world or, for a generated one, found from compartment names that say ill, infected, acute
   or chronic: a choice of drawing, never a measurement.

## Consequences

- A learner on the public site can play a generated world and cannot make one.
- A generated world with more than six compartments would draw its seventh and later in the
  sixth colour; nothing refuses such a world yet. The three gold papers have four to six.
- The ring's name rule can miss a compartment a paper names otherwise; the world's own choice
  wins when it gives one.
