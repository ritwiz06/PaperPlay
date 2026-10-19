# ADR-0049: The library, every world in one place

- Status: accepted. The owner asked for `/library` on 2026-10-18: every world, hand-made,
  generated and draft, with its paper, its kind, its status, its levels and a thumbnail, linked from
  every world's title card, shipped in the public build with only the worlds built beforehand. How
  it is built is mine.
- Date: 2026-10-18
- Decided by: the owner, the page; me, how it is held.

## Context

The worlds had no page that listed them. A learner reached each by its route, and the generated
worlds, five of them from two papers by 2026-10-18, differed only in the date in their ids. The owner
reviews the worlds together, and the public build should say what it holds.

## Decision

1. **An index written from the fixtures.** `npm run library` (`scripts/library.ts`) writes
   `apps/web/src/library/worlds.json`: the three hand-made worlds, each with the route the shell
   plays it on, then every world in `fixtures/worldspecs/generated/`, by paper and newest first.
   Each entry has its paper, its family, who made it, its status, its levels in order and its
   picture's path; a generated world also has the day its job was recorded. A test holds the index
   to what the script writes, byte for byte, so it cannot drift from the worlds the build holds.
2. **Three statuses, each with its meaning on the page:** verified, made by hand with every passage
   checked against the paper (the world's `status` is `reviewed`); draft, made by hand with its
   passages not yet checked (Threshold Town, until its source map); generated, made by the pipeline
   and checked by its rules.
3. **What the rules of today say of a world made before them.** A generated world's entry lists the
   levels the definitional rule of 2026-10-18 finds definitional (ADR-0044's amendment), computed
   by the same code the controller runs, and the page says so under the world: "Made before the rule
   of 2026-10-18: levels 1 and 3 are definitional by it. Kept as made." A world is not changed for
   a rule that came after it.
4. **A picture of each stage.** `npm run library:thumbnails` (`scripts/library-thumbnails.ts`)
   opens every world in the index on a development server of its own, plays it for three seconds
   with its HUD hidden, and saves its stage as a JPEG in `apps/web/public/library/`, committed; the
   test checks each one is there and under 120 KB. It makes the pictures that are missing, so
   adding a world changes no other picture; `--all` makes every picture again, when worlds change
   how they look.
5. **Linked from every world's title card,** as "Library" before the line saying what the world is
   about, and kept on a phone, where the card drops that line.
6. **The public build lists the worlds built beforehand and asks no API.** A development server
   also lists the worlds this machine's API has made since it started, from a new `GET /jobs`
   listing each job, its source and state, and a ready job's world's title and levels; the section
   is a lazy chunk only a development build has, as `/create` is (ADR-0030).
7. **The API's root says what it is.** `GET /` on the API answers that it has no pages and that the
   app is at `http://127.0.0.1:5173`, after the owner opened the API's address and met
   "Route GET:/ not found".

## Consequences

- A world added to the fixtures fails the index's test until `npm run library` runs, and the
  picture test until `npm run library:thumbnails` does.
- `scripts/serve-dist.ts`, the production server's stand-in, serves `.jpg` as `image/jpeg`, as the
  static host does.
- The library groups worlds by their paper's title; two papers with the same title would share a
  group.
