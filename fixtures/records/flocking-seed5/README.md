# The flocking world on seed 5, recorded before G3a

Eighteen run records (`runrecord/3`): for each of the six levels of
`fixtures/worldspecs/flocking-reference.json`, the level as played (`<level>-trunk.json`) and both
worlds of its fork (`<level>-here.json`, `<level>-there.json`). `apps/web/test/records/flocking.ts` says
exactly what each run does.

They were made once, on 2026-10-10, by the code at `f0bc31c` (main before G3a.1's refactor), on
Node 24.21.0 on macOS arm64. They are never made again. `apps/web/test/records.test.ts` holds the
code to them:
- each replays bit for bit, tolerance 0, against the world as the builder builds it today;
- the app's own session and fork make each again, byte for byte.

Each record's `worldSpecHash` is the SHA-256 of the WorldSpec as it stood at `f0bc31c`
(`worldspec/2`), and its `codeHash` the SHA-256 of that commit's id. Nothing here is a claim from
the paper; every value is the model's.
