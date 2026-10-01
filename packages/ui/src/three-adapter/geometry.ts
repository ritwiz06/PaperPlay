import * as THREE from "three";
import type { StagePalette } from "../stage-core/index.ts";

/** A low-poly bird, nose along local +x, about one world unit from wingtip to wingtip. */
export function birdGeometry(): THREE.BufferGeometry {
  const nose = [0.46, 0, 0];
  const tail = [-0.27, 0.01, 0];
  const left = [-0.19, 0.07, 0.49];
  const right = [-0.19, 0.07, -0.49];
  const back = [-0.05, 0.11, 0];
  const belly = [-0.05, -0.05, 0];
  const faces = [nose, left, back, nose, back, right, nose, belly, left, nose, right, belly, back, left, tail, back, tail, right, belly, tail, left, belly, right, tail];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(faces.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Height of the valley floor at (x, z). Flat and gently rippled under the flight field,
 * rising into hills beyond it. Decorative only: nothing in the simulation reads it.
 */
export function valleyHeight(x: number, z: number, halfWidth: number, halfDepth: number): number {
  const margin = 7;
  const dx = Math.max(Math.abs(x) - (halfWidth + margin), 0);
  const dz = Math.max(Math.abs(z) - (halfDepth + margin), 0);
  const rise = 1 - Math.exp(-Math.sqrt(dx * dx + dz * dz) / 14);
  const ripple = 0.35 * Math.sin(x * 0.31 + 1.7) * Math.cos(z * 0.27 - 0.4) + 0.2 * Math.sin((x + z) * 0.53);
  return rise * 7 + ripple * (0.25 + rise * 2.4) - 0.05;
}

/** A faceted valley around a field of the given size, with heights baked in and colours left to `paintValley`. */
export function valleyGeometry(width: number, depth: number): THREE.BufferGeometry {
  const size = Math.max(width, depth) * 4.5;
  const plane = new THREE.PlaneGeometry(size, size, 72, 72);
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

/** Colours each facet by its height and steepness from the palette's ground colours. */
export function paintValley(geometry: THREE.BufferGeometry, palette: StagePalette): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const color = geometry.getAttribute("color");
  const [low, high, cliff, mixed] = [new THREE.Color(palette.groundLow), new THREE.Color(palette.groundHigh), new THREE.Color(palette.cliff), new THREE.Color()];
  for (let face = 0; face < position.count; face += 3) {
    const height = (position.getY(face) + position.getY(face + 1) + position.getY(face + 2)) / 3;
    mixed.copy(low).lerp(high, Math.min(Math.max(height / 6, 0), 1));
    const steep = 1 - normal.getY(face);
    if (steep > 0.25) mixed.lerp(cliff, Math.min((steep - 0.25) * 1.6, 0.85));
    for (let corner = 0; corner < 3; corner++) color.setXYZ(face + corner, mixed.r, mixed.g, mixed.b);
  }
  color.needsUpdate = true;
}
