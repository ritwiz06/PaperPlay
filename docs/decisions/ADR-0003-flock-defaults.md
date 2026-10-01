# ADR-0003: Teaching defaults for flock.planar.weighted

- Status: accepted, with open follow-ups (see "Options")
- Date: 2026-09-30
- Decided by: the owner set the criterion and method; a deterministic sweep picked the values

## Context

On the torus, the prototype's defaults (separation 1.2, alignment 1.0, cohesion 0.8,
perception 4.5) gave directional agreement of only 0.18–0.67 after 20 s. The flock formed
several groups rather than one murmuration (session note 2026-09-28). The G2 hook needs "a
striking murmuration pattern you can already touch".

## Criterion

The owner's criterion:
- Sweep separationWeight, alignmentWeight, cohesionWeight and perceptionRadius over 20 seeds.
- Choose defaults under which most seeds reach directional agreement ≥ 0.8 within 20 s and
  form one cluster.

Three readings were made explicit in the script:
- **"Within 20 s":** the flock is still ordered at the 20 s mark (step 1,200 at 1/60 s). A
  flock that touched 0.8 earlier and then broke apart does not count.
- **"Most":** at least 11 of 20 seeds.
- **Ties:** go to the configuration closest to the prototype's settings, then to the earlier
  one in grid order.

Everything not swept stays at the prototype's values: 72 birds on a 32 × 32 torus,
separationRadius 1.55, targetSpeed 2.7, speeds 0.45–3.6, maxAcceleration 4.6. There are no
beacons or obstacles.

## Method

`npm run sweep:defaults` (`scripts/sweep-defaults.ts`) is deterministic. It takes about
8.5 minutes on Node 24.21.0.

1. **Initial stage: 256 configurations.** The grid brackets the prototype's settings, with
   alignment capped at 1.5 so the default would leave room to raise it.
   - No configuration qualified; the best managed 10 of 20.
   - The best configurations sat on the grid's boundary: alignment at its top, cohesion at
     its bottom, perception at its top.
2. **Extension stage: 192 configurations,** declared after the initial result.
   - It extends one step past each boundary: alignment to 2.0 (the parameter's maximum),
     cohesion down to 0.1, perception to 12. Separation is refined around 0.9.
   - Before declaring it, an 8-point probe beyond the boundary showed that lower cohesion
     helped, while alignment 2.0 or perception 12 alone did not. All 8 probe points are in
     this stage.
3. **Held-out check:** the chosen configuration was re-run on 40 seeds (21–60) that the
   choice never saw.

The full tables are in `eval/sweeps/` (`flock-defaults.md`, plus a CSV for each stage). The
initial-stage table came out byte-identical across separate runs.

## Decision

New defaults: separationWeight **1.05**, alignmentWeight **2**, cohesionWeight **0.4**,
perceptionRadius **9**. Every other default is unchanged.

These are teaching choices: they make the opening world order itself into one murmuration
more often. They are not values from the paper. flock.planar.weighted becomes **2.1.0**: its
defaults changed, but its equations (E1–E17) and state contract did not.

| | Sweep seeds 1–20 | Held-out seeds 21–60 | Median agreement | Median groups | Median s to order |
|---|---|---|---|---|---|
| Chosen | 14/20 | 17/40 | 0.8994 | 1 | 18 |
| Prototype's settings | 0/20 | not run | 0.3495 | 3 | never for most seeds |

## What the numbers do not support

- **"Most seeds" holds only on the seeds used to choose.** It holds on seeds 1–20 (14 of
  20), not on unseen seeds (17 of 40, 43%).
  - Picking the best of 448 configurations on 20 seeds flatters the winner.
  - The configurations that scored 13 of 20 are within noise of it: at this success rate,
    one standard error is about two seeds.
- **No headroom on alignment.** It sits at the top of its range (2), so a learner can lower
  it but not raise it.
- **Order arrives late:** a median of 18 s into the 20 s window.

## Options (open, for the owner)

1. Accept these defaults as they are.
2. Widen alignmentWeight's range (for example to 0–3) in a later version, so the default
   leaves room to raise it.
3. Relax or lengthen the criterion (for example 30 s, or agreement ≥ 0.75) and rerun the
   same script.
4. Let the hook level pin a seed known to form a murmuration, labelled as a teaching
   choice, while free exploration keeps random seeds.
5. Sweep other parameters (targetSpeed, maxAcceleration, world size) or a wider region.
   Choose on more seeds and confirm on a fresh held-out set.

## Consequences

- `/world/local`, and later the hook, start from these defaults.
- The oracle fixtures are unaffected, since every fixture states its parameters explicitly.
  Only their version field moved to 2.1.0.
- Rerunning `npm run sweep:defaults` on the same commit rewrites the tables byte for byte.
