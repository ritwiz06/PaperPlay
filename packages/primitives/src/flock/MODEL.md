# flock.planar.weighted@3.1.0

A planar, weighted-rule adaptation of local flocking in the spirit of Reynolds (1987),
"Flocks, Herds, and Schools: A Distributed Behavioral Model". It is a teaching model:
not the paper's three-dimensional system, and not a reproduction of its results.

These equations are the primitive's specification. The oracle fixtures in
`fixtures/oracles/flock.planar.weighted/` are derived from this page by hand, never from
the implementation. Changing any equation, the state contract or a default requires a new
primitive version.

Versions: 1.0.0 (2026-09-28, never tagged or persisted) introduced E1–E15. 2.0.0
(2026-09-30) names every beacon and obstacle so a learner's placement can be removed and
replayed (E16, E17). E1–E15 are unchanged, so every 1.0.0 derivation still holds.
2.1.0 (2026-09-30) changes four defaults, chosen by a deterministic sweep (ADR-0003);
the equations and the state contract are those of 2.0.0. 2.2.0 (2026-10-01) widens
`alignmentWeight`'s range from 0–2 to 0–4, so its default of 2 sits mid-range and a
learner can raise it as well as lower it (ADR-0003). Equations, defaults and the state
contract are unchanged, so every value accepted by 2.1.0 behaves exactly as before.
3.0.0 (2026-10-09) changes the group measure, E14 (ADR-0015). A link now also needs the two
headings to differ by less than 45°, and a cluster of fewer than 4 birds is strays, not a
group. The steps and the state are those of 2.2.0, so runs are identical step for step. But
`clusterCount` changes for the same state, so a 2.x record's observables no longer replay:
a major version. It also adds the observable `strayShare` (E18) and the reading "one group"
(O1). 3.1.0 (2026-10-09) adds two observables, `groupSpread` (E19) and `birdsAtObstacles`
(E20), and the query Q3, for the level rule (ADR-0018). Nothing else changes: the steps, the
state and every earlier observable are those of 3.0.0, bit for bit.

## Symbols

| Symbol | Parameter | Unit | Default | Range | Phase |
|---|---|---|---|---|---|
| N | `agentCount` | birds | 72 | 2 – 400 (whole) | init |
| W | `worldWidth` | world units | 32 | 8 – 200 | init |
| H | `worldHeight` | world units | 32 | 8 – 200 | init |
| w_s | `separationWeight` | per second | 1.05 | 0 – 2 | live |
| w_a | `alignmentWeight` | per second | 2 | 0 – 4 | live |
| w_c | `cohesionWeight` | per second | 0.4 | 0 – 2 | live |
| R | `perceptionRadius` | world units | 9 | 0.5 – 50 | live |
| R_s | `separationRadius` | world units | 1.55 | 0.1 – 10 | live |
| v* | `targetSpeed` | world units per second | 2.7 | 0.1 – 8 | live |
| v_min | `minSpeed` | world units per second | 0.45 | 0.05 – 4 | live |
| v_max | `maxSpeed` | world units per second | 3.6 | 0.1 – 8 | live |
| a_max | `maxAcceleration` | world units per second² | 4.6 | 0.1 – 50 | live |
| w_b | `beaconWeight` | per second | 0.85 | 0 – 4 | live |
| w_o | `obstacleWeight` | per second² | 3 | 0 – 20 | live |
| R_o | `obstacleRadius` | world units | 3.4 | 0.1 – 10 | live |

`minSpeed` must be below `maxSpeed`. Fixed constants: cohesion ease radius r_c = 3, beacon
ease radius r_b = 2.5, cluster link distance L_c = 4.5, rock touch distance r_rock = 1 (world
units), fixed timestep
Δt = 1/60 s (any step from 0 to 0.05 s is accepted). Ranges are teaching choices carried
over from the Murmuration Valley prototype, except alignment's, widened in 2.2.0; the four
rule defaults come from a sweep (ADR-0003) and the rest from the prototype. None comes
from the paper.

## State

```json
{ "width": 32, "height": 32, "stepIndex": 0,
  "agents": [{ "x": 0, "y": 0, "vx": 0, "vy": 0 }],
  "beacons": [{ "id": "beacon-1", "x": 0, "y": 0 }],
  "obstacles": [{ "id": "rock-1", "x": 0, "y": 0 }] }
```

Plain JSON: a JSON round trip reproduces it exactly. Invariants: at least two agents;
every agent, beacon and obstacle lies in [0, W) × [0, H); entity ids are unique across
beacons and obstacles. `stepIndex` counts steps taken. `stateSchema` checks all of this
for states read back from JSON.

## One step (all agents update synchronously)

- **E1 Shortest displacement.** δ(a→b) = (m(b.x − a.x, W), m(b.y − a.y, H)), where
  m(d, L) = d − L if d ≥ L/2, d + L if d < −L/2, otherwise d. Distance |δ| = √(δx² + δy²).
  Write δ_ij = δ(p_i → p_j).
- **E2 Neighbourhoods.** N_i = { j ≠ i : |δ_ij| < R }. S_i = { j ≠ i : 0 < |δ_ij| < R_s }.
  Coincident birds are neighbours but never separate each other.
- **E3 Alignment.** If N_i is non-empty: A_i = w_a (ū_i − v_i), with ū_i the mean of v_j over
  N_i. Otherwise A_i = 0.
- **E4 Cohesion.** If N_i is non-empty: c_i = mean of δ_ij over N_i and
  C_i = w_c (v* c_i / max(|c_i|, r_c) − v_i). Otherwise C_i = 0.
- **E5 Separation.** s_i = Σ over S_i of −δ_ij / |δ_ij|². If |s_i| > 0:
  S_i = w_s (v* s_i / |s_i| − v_i). Otherwise S_i = 0.
- **E6 Beacon.** If any beacon exists, take the nearest by |δ(p_i → b)| (ties go to the
  earliest in the list): B_i = w_b (v* δ_ib / max(|δ_ib|, r_b) − v_i). Otherwise B_i = 0.
- **E7 Obstacles.** O_i = Σ over obstacles with 0 < |δ_io| < R_o of
  w_o (R_o − |δ_io|) (−δ_io / |δ_io|). Obstacles push; they are not solid.
- **E8 Acceleration.** a_i = S_i + A_i + C_i + B_i + O_i. If |a_i| > a_max, scale a_i to
  length a_max.
- **E9 Velocity.** v′ = v_i + a_i Δt. With σ = |v′|: if σ > v_max, scale v′ to v_max; if
  0 < σ < v_min, scale v′ to v_min; if σ = 0, v′ = v_min v_i / |v_i| (or (v_min, 0) if v_i is
  zero too).
- **E10 Position.** p′ = (wrap(x + v′x Δt, W), wrap(y + v′y Δt, H)), wrap mapping into [0, L).
- **E11 Synchrony.** Every term uses the state before the step. Beacons and obstacles do not
  move. `stepIndex` increases by one. The x and y components are computed by the same
  sequence of operations, and sums over agents run in list order.

## Observables (independent of parameters, so forked worlds stay comparable)

- **E12 `directionalAgreement`** = |(1/N) Σ v_i / |v_i||, from 0 (headings cancel) to 1
  (one shared heading). A bird with zero velocity contributes nothing.
- **E13 `meanNeighbourDistance`** = (1/N) Σ over i of min over j ≠ i of |δ_ij|: the mean
  nearest-neighbour distance, measured across the torus seams.
- **E14 `clusterCount`** = the number of groups. Link birds i and j when both:
  - |δ_ij| < L_c = 4.5;
  - their headings differ by less than 45°, i.e. v_i·v_j > 0 and 2(v_i·v_j)² >
    |v_i|²|v_j|².

  A bird with zero velocity has no heading and links to nobody. Links join birds
  transitively into clusters, and a cluster of at least G_min = 4 birds is a group; smaller
  clusters are strays. L_c, 45° and G_min are fixed, so counts compare across perception
  settings. All three are the owner's (ADR-0015).
- **E18 `strayShare`** = (the number of birds in clusters smaller than G_min) / N, from 0 to
  1 (ADR-0015).
- **O1 One group,** a reading of E14 and E18, not a new observable. The flock reads as one
  group when clusterCount = 1 and strayShare ≤ 1/2: exactly one group, holding at least
  half the birds. A chance cluster of four amid strays is one group, but not one flock.
  Level texts, the hook-seed rule and the group sweep all use this reading.
- **E19 `groupSpread`** = how far the largest group spreads. Take the largest group of E14
  (ties go to the group holding the lowest-numbered bird); with no group, groupSpread = 0.
  - Its centre, axis by axis, is the circular mean c = wrap(L·atan2(Σ sin θ_i, Σ cos θ_i)/2π, L),
    with θ_i = 2π x_i / L for x (L = W) and likewise for y (L = H), summed in list order.
    When both sums are exactly 0, atan2 gives 0 and c = 0.
  - groupSpread = √((1/|G|) Σ |δ(c → p_i)|²) over the group's birds, with E1's shortest
    displacement, in world units.
- **E20 `birdsAtObstacles`** = the number of birds closer than r_rock = 1 world unit to any
  obstacle, by E1's distance. A bird near two rocks counts once. r_rock is about the size a rock
  is drawn, and fixed, so counts compare across `obstacleRadius` settings.

## Edits (between steps, from learner events)

- **E16 Place.** `place(id, beacon | obstacle, x, y)` appends an entity with that id at
  (wrap(x, W), wrap(y, H)) to the end of its list. The id must not already name an entity,
  and x and y must be finite.
- **E17 Remove.** `remove(id)` drops the entity with that id from whichever list holds it.
  The id must name an existing entity.

Edits never touch the birds or `stepIndex`. In a run, the events recorded at step s are
applied in order after any sample taken at s and before step s is taken.

## Queries (read a state, change nothing)

- **Q1 Neighbourhoods.** `neighbours(state, params, i)` returns N_i and S_i (E2) as lists of
  bird indices in list order. The selected-neighbour view shows them. A query adds no
  equation and changes no state, default or range, so it does not change the version.
- **Q2 Headings.** `headings(state)` returns each bird's heading atan2(vy_i, vx_i), in list
  order (null for a bird with zero velocity), and the flock's mean heading atan2(Σ ŷ, Σ x̂)
  over E12's unit headings, summed in list order (null when both sums are exactly 0). The
  mean's length over n is E12's directional agreement. The heading compass shows both.
- **Q3 Spread.** `spread(state)` returns E19's group as a list of bird indices in index order,
  its centre (null with no group) and its radius, groupSpread. The ring drawn around the flock
  shows it.

## Initial state

- **E15** Draw from mulberry32(seed), seed an unsigned 32-bit integer. For each agent in
  order: x = W·u, y = H·u; then draw pairs (a, b) = (2u − 1, 2u − 1) until 0 < a² + b² ≤ 1
  and head along (a, b) / √(a² + b²), which is uniform on the circle without trigonometry.
  Every bird starts at speed clamp(v*, v_min, v_max). `stepIndex` is 0; there are no beacons
  or obstacles until a learner places them.
