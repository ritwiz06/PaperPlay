import * as THREE from "three";
import type { StagePalette } from "../stage-core/index.ts";

/*
 * The valley and its birds, low-poly and flat-shaded. Everything here is decoration: the
 * simulation reads none of it. Scatter uses its own fixed hash, so the valley looks the same
 * on every load, and nothing here draws on the run's random numbers.
 */

const triangles = (faces: readonly (readonly [number, number, number])[]): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(faces.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
};

/** A bird's body, nose along local +x, about 1.4 world units from beak to tail. */
export function birdBodyGeometry(): THREE.BufferGeometry {
  const nose = [0.85, 0.02, 0] as const;
  const tail = [-0.55, 0.04, 0] as const;
  const tailLeft = [-0.68, 0.03, 0.16] as const;
  const tailRight = [-0.68, 0.03, -0.16] as const;
  const back = [0.05, 0.16, 0] as const;
  const belly = [0.05, -0.1, 0] as const;
  const left = [0.1, 0.03, 0.13] as const;
  const right = [0.1, 0.03, -0.13] as const;
  return triangles([
    nose, left, back, nose, back, right, nose, belly, left, nose, right, belly,
    back, left, tail, back, tail, right, belly, tail, left, belly, right, tail,
    tail, tailLeft, tailRight, tail, tailRight, tailLeft,
  ]);
}

/** Half the body's width, where the wings hinge. */
export const WING_ROOT = 0.11;

/**
 * One wing, hinged along local x at the origin and reaching out along +z (side 1) or −z
 * (side −1), a little swept back. About 1 world unit long, so a bird spans about 2.2.
 */
export function wingGeometry(side: 1 | -1): THREE.BufferGeometry {
  const z = (value: number) => value * side;
  const front = [0.3, 0, 0] as const;
  const rear = [-0.22, 0, 0] as const;
  const elbow = [0.18, 0.02, z(0.55)] as const;
  const tip = [-0.3, 0.04, z(1.02)] as const;
  const trailing = [-0.3, 0.01, z(0.5)] as const;
  const faces: (readonly [number, number, number])[] = [front, elbow, rear, rear, elbow, trailing, trailing, elbow, tip];
  return triangles(side === 1 ? faces : faces.map((_, i) => faces[i - (i % 3) + (2 - (i % 3))] as readonly [number, number, number]));
}

/** A fixed hash, so decorations land in the same places on every load. */
function scatterRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The lake beside the field: where it lies and how wide it is, for a field of this size. */
export function lakeOf(halfWidth: number, halfDepth: number): { x: number; z: number; radius: number; level: number } {
  return { x: halfWidth + 12, z: -halfDepth * 0.15, radius: 6, level: -0.35 };
}

/** The flat meadow reaches this far past the flight field before the hills begin. */
export const MEADOW_MARGIN = 5;

/**
 * Height of the valley floor at (x, z): flat meadow under the flight field and a little
 * beyond, then hills rising all round, with a basin for the lake. Decorative only.
 */
export function valleyHeight(x: number, z: number, halfWidth: number, halfDepth: number): number {
  const dx = Math.max(Math.abs(x) - (halfWidth + MEADOW_MARGIN), 0);
  const dz = Math.max(Math.abs(z) - (halfDepth + MEADOW_MARGIN), 0);
  const out = Math.sqrt(dx * dx + dz * dz);
  const rise = 1 - Math.exp(-out / 11);
  const ridge = 0.6 + 0.4 * Math.sin(Math.atan2(z, x) * 5 + 0.7) * Math.cos(Math.atan2(z, x) * 3 - 1.1);
  const ripple = 0.25 * Math.sin(x * 0.31 + 1.7) * Math.cos(z * 0.27 - 0.4) + 0.15 * Math.sin((x + z) * 0.53);
  // The lake lies in a lowland carved out of the hills: flat near its shore, rising behind it.
  const lake = lakeOf(halfWidth, halfDepth);
  const fromLake = Math.hypot(x * 0.8 - lake.x * 0.8, z - lake.z);
  const carve = 1 - smooth((fromLake - lake.radius - 1.5) / 7);
  const bed = -1.1 * (1 - smooth(fromLake / lake.radius));
  const land = rise * 11 * ridge + ripple * (0.15 + rise * 2.4) - 0.05;
  return land * (1 - carve) + bed * carve;
}

const smooth = (t: number): number => {
  const u = Math.min(Math.max(t, 0), 1);
  return u * u * (3 - 2 * u);
};

/** A faceted valley around a field of the given size, with heights baked in and colours left to `paintValley`. */
export function valleyGeometry(width: number, depth: number): THREE.BufferGeometry {
  const size = Math.max(width, depth) * 4.5;
  const plane = new THREE.PlaneGeometry(size, size, 96, 96);
  plane.rotateX(-Math.PI / 2);
  const position = plane.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    position.setY(i, valleyHeight(position.getX(i), position.getZ(i), width / 2, depth / 2));
  }
  const faceted = plane.toNonIndexed();
  plane.dispose();
  faceted.computeVertexNormals();
  faceted.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(faceted.getAttribute("position").count * 3), 3));
  return faceted;
}

/**
 * Colours the valley: each facet by its height and steepness, then the meadow blended in at
 * each corner, so the field's edge is a soft band rather than the facets' sawtooth. The band
 * marks the field now that no outline is drawn.
 */
export function paintValley(geometry: THREE.BufferGeometry, palette: StagePalette, field: { readonly width: number; readonly depth: number }): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  const [meadow, edge, low, high, cliff, mixed] = [palette.meadow, palette.meadowEdge, palette.groundLow, palette.groundHigh, palette.cliff, null].map(
    (value) => new THREE.Color(value ?? "#000000"),
  ) as [THREE.Color, THREE.Color, THREE.Color, THREE.Color, THREE.Color, THREE.Color];
  const corners = new THREE.Color();
  const [halfWidth, halfDepth] = [field.width / 2, field.depth / 2];
  for (let face = 0; face < position.count; face += 3) {
    const height = (position.getY(face) + position.getY(face + 1) + position.getY(face + 2)) / 3;
    mixed.copy(low).lerp(high, Math.min(Math.max(height / 7, 0), 1));
    const steep = 1 - normal.getY(face);
    if (steep > 0.25) mixed.lerp(cliff, Math.min((steep - 0.25) * 1.6, 0.85));
    for (let corner = 0; corner < 3; corner++) {
      // Signed distance of this corner outside the field's rectangle: negative inside.
      const outside = Math.max(Math.abs(position.getX(face + corner)) - halfWidth, Math.abs(position.getZ(face + corner)) - halfDepth);
      corners.copy(mixed);
      if (outside < 4) {
        const meadowShare = 1 - smooth((outside + 0.5) / 3.5);
        const edgeShare = Math.max(0, 1 - Math.abs(outside - 0.6) / 1.6) * 0.5;
        corners.lerp(meadow, meadowShare).lerp(edge, edgeShare);
      }
      color.setXYZ(face + corner, corners.r, corners.g, corners.b);
    }
  }
  color.needsUpdate = true;
}

/** Where trees and rocks stand: outside the meadow and the lake, on gentle ground, the same every time. */
export function scatter(width: number, depth: number, kind: "tree" | "rock"): { x: number; z: number; y: number; scale: number; turn: number }[] {
  const [halfWidth, halfDepth] = [width / 2, depth / 2];
  const random = scatterRandom(kind === "tree" ? 0x7ee5 : 0x60c4);
  const lake = lakeOf(halfWidth, halfDepth);
  const spots: { x: number; z: number; y: number; scale: number; turn: number }[] = [];
  const reach = Math.max(halfWidth, halfDepth) + 34;
  const wanted = kind === "tree" ? 150 : 46;
  for (let tries = 0; spots.length < wanted && tries < wanted * 40; tries++) {
    const x = (random() * 2 - 1) * reach;
    const z = (random() * 2 - 1) * reach;
    const clear = Math.max(Math.abs(x) - halfWidth, Math.abs(z) - halfDepth);
    if (clear < (kind === "tree" ? MEADOW_MARGIN + 1.5 : 2.5)) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.radius + 1.8) continue;
    const y = valleyHeight(x, z, halfWidth, halfDepth);
    const slope = Math.abs(valleyHeight(x + 0.8, z, halfWidth, halfDepth) - y) + Math.abs(valleyHeight(x, z + 0.8, halfWidth, halfDepth) - y);
    if (slope > (kind === "tree" ? 0.9 : 1.6)) continue;
    // Trees gather in groves: a spot near the last one is likelier to keep it.
    if (kind === "tree" && spots.length > 0 && random() < 0.35) {
      const last = spots[spots.length - 1];
      if (last && Math.hypot(last.x - x, last.z - z) > 9) continue;
    }
    spots.push({ x, z, y, scale: 0.7 + random() * 0.7, turn: random() * Math.PI * 2 });
  }
  return spots;
}

/** A tree's crown and trunk, standing on the origin. */
export function crownGeometry(): THREE.BufferGeometry {
  return new THREE.ConeGeometry(1.15, 2.6, 6, 1).translate(0, 2.55, 0);
}

export function trunkGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.16, 0.24, 1.3, 5).translate(0, 0.65, 0);
}

export function rockGeometry(): THREE.BufferGeometry {
  return new THREE.DodecahedronGeometry(0.8, 0).scale(1.3, 0.7, 1).translate(0, 0.25, 0);
}

/** The lake's surface: a ragged disc, flat at its water level. */
export function waterGeometry(radius: number): THREE.BufferGeometry {
  const random = scatterRandom(0x1a4e);
  const disc = new THREE.CircleGeometry(radius, 20);
  const position = disc.getAttribute("position");
  for (let i = 1; i < position.count; i++) {
    const stretch = 0.85 + random() * 0.3;
    position.setXY(i, position.getX(i) * stretch * 1.25, position.getY(i) * stretch);
  }
  disc.rotateX(-Math.PI / 2);
  disc.computeVertexNormals();
  return disc;
}

/** The sky: a dome seen from inside, coloured by `paintSky`. */
export function skyGeometry(radius: number): THREE.BufferGeometry {
  const dome = new THREE.SphereGeometry(radius, 32, 16);
  dome.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(dome.getAttribute("position").count * 3), 3));
  return dome;
}

/** From the palette's sky at the horizon (and below it) to its zenith overhead. */
export function paintSky(geometry: THREE.BufferGeometry, palette: StagePalette, radius: number): void {
  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  const [horizon, zenith, mixed] = [new THREE.Color(palette.sky), new THREE.Color(palette.skyZenith), new THREE.Color()];
  for (let i = 0; i < position.count; i++) {
    const up = Math.max(position.getY(i) / radius, 0);
    mixed.copy(horizon).lerp(zenith, smooth(up * 1.6));
    color.setXYZ(i, mixed.r, mixed.g, mixed.b);
  }
  color.needsUpdate = true;
}
