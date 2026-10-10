import * as THREE from "three";
import type { StagePalette } from "../stage-core/index.ts";

const smooth = (t: number): number => {
  const u = Math.min(Math.max(t, 0), 1);
  return u * u * (3 - 2 * u);
};

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
