# ADR-0015: The group measure

- Status: accepted
- Date: 2026-10-09
- Decided by: the owner, in two steps on 2026-10-09:
  1. **The measure.** Two birds are linked only within the link radius and with headings
     less than 45° apart. Clusters of fewer than 4 birds are strays, not groups.
  2. **The reading.** The sweep found the measure failed the owner's first criterion. The
     owner then chose to add a strays share, and to read the flock as one group only when
     its one group holds at least half the birds.

## Context

ADR-0003 found that, under flock 2.x's distance-only measure, 17% of random scatters at the
default density count as one group. So "Groups: 1" could not tell a murmuration from noise.
The owner set two criteria to validate any new measure before a level teaches with it:
- random scatters read as one group in under 1% of seeds;
- seed 4's murmuration reads as one group.

## Decision

1. **E14 `clusterCount`.**
   - Birds i and j link when |δ_ij| < 4.5 and their headings differ by less than 45°. That
     is, v_i·v_j > 0 and 2(v_i·v_j)² > |v_i|²|v_j|².
   - A bird at rest has no heading and links to nobody.
   - Links join transitively, and a cluster of at least 4 birds is a group.
2. **E18 `strayShare`,** a new observable: the share of birds in clusters smaller than 4.
3. **O1, "one group",** a reading, not an observable: exactly one group, and strayShare ≤ ½.
   - Level texts, the hook-seed rule and the sweep all use it.
   - It is exported as `flockReadsAsOneGroup`.
4. **Version 3.0.0.** `clusterCount` changes for the same state, so a 2.x record's
   observables no longer replay: a major version, by `MODEL.md`'s rule. The steps and the
   state are unchanged, so a run is identical step for step.
5. **The validation sweep:** `npm run sweep:groups`, recorded in
   `eval/sweeps/group-measure.md`. A test re-runs it, checks both criteria, and holds the
   record to a fresh run byte for byte.

## The sweep

Over 10,000 random scatters (seeds 0 to 9,999), counting those that read as one group:

| Measure | One group | Share | 95% upper bound (Wilson) |
|---|---|---|---|
| Distance only (flock 2.x) | 1,709 | 17.09% | 17.840% |
| Distance and headings | 0 | 0.00% | 0.038% |
| Distance and strays | 5,938 | 59.38% | 60.339% |
| The owner's measure, a bare count of one | 128 | 1.28% | 1.520% |
| **O1: one group holding at least half the birds (adopted)** | **0** | **0.00%** | **0.038%** |

- **Seed 4's murmuration** reads as one group under O1 from step 1118 (18.63 s) to 20 s.
- **The bare count failed** because a scatter usually holds several small chance groups: 70%
  hold four or more, and only 8 seeds hold none. Now and then it holds exactly one, and that
  reads as "1 group" although more than half the birds are strays around it. O1 rejects all
  128 of them.
- **Measured and rejected:** a larger minimum or a tighter angle makes it worse, because a
  single chance cluster becomes more likely than several. A minimum of 5 birds gives 14.76%,
  6 gives 35.39%, 8 gives 43.28%, and 30° headings give 20.00%.

## Consequences

- **The hook seed changes.**
  - Under O1, the hook-seed rule (ADR-0003) picks seed 5. It reads as one group from 12.95 s;
    seed 4 does so from 18.63 s.
  - The owner chose to follow the rule, so `/world/hook` and `/world/local` open on seed 5.
  - The demo capture keeps seed 4, which the owner named for it (ADR-0010).
- **Still 14 of 20 seeds qualify** under the defaults sweep's criterion. The defaults
  themselves (ADR-0003) are unchanged.
- **Level 4 can teach with groups.** Its readout is a groups counter (ADR-0014).
- **The oracles:**
  - three measure fixtures are re-derived;
  - four new ones pin the 45° limit (44°/46°, and sharply 44.9°/45.1°), strays and a bird at
    rest, and a group across the seam;
  - every fixture names 3.0.0.
