import * as THREE from "three";
import type { BaseFrame, RingPose, StagePalette } from "../stage-core/index.ts";
import { SKY_RADIUS, type BaseScene, type StageScene } from "./scene.ts";
import { paintSky } from "./sky.ts";

const target = new THREE.Vector3();

/** Fog starts this far beyond the field's centre and is complete this far beyond it, wherever the camera stands. */
const FOG_BAND = [4, 92] as const;

/** Half the width of a ring's band, in world units. */
const RING_HALF_WIDTH = 0.12;

/** The sky, the fog and the light, whatever the kit draws beneath them. */
function paint(stage: BaseScene, palette: StagePalette): void {
  if (stage.painted.palette === palette.name) return;
  (stage.scene.background as THREE.Color).set(palette.sky);
  (stage.scene.fog as THREE.Fog).color.set(palette.sky);
  stage.hemisphere.color.set(palette.sun);
  stage.hemisphere.groundColor.set(palette.shade);
  stage.sun.color.set(palette.sun);
  stage.sunDisc.material.color.set(palette.sunDisc);
  paintSky(stage.sky.geometry, palette, SKY_RADIUS);
  stage.painted.palette = palette.name;
}

function showRings(stage: BaseScene, rings: readonly RingPose[]): void {
  const wanted = new Map<string, RingPose>(rings.map((ring) => [ring.key, ring]));
  for (const [key, mesh] of stage.rings) {
    if (wanted.has(key)) continue;
    stage.scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    stage.rings.delete(key);
  }
  for (const [key, ring] of wanted) {
    let mesh = stage.rings.get(key);
    if (!mesh) {
      const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
      mesh = new THREE.Mesh(new THREE.RingGeometry(1, 1, 1), material);
      mesh.userData.radius = Number.NaN;
      stage.rings.set(key, mesh);
      stage.scene.add(mesh);
    }
    // A new radius gets a new band, so the band keeps its width whatever the radius.
    if (mesh.userData.radius !== ring.radius) {
      mesh.geometry.dispose();
      const inner = Math.max(ring.radius - RING_HALF_WIDTH, 0);
      mesh.geometry = new THREE.RingGeometry(inner, ring.radius + RING_HALF_WIDTH, 96).rotateX(-Math.PI / 2);
      mesh.userData.radius = ring.radius;
    }
    mesh.material.color.set(ring.color);
    mesh.position.set(...ring.position);
  }
}

/**
 * Makes the scene show one frame. It reads only the frame description: positions,
 * orientations, colours and camera all come from the stage core, never from simulation state.
 * The stage sets the camera, the fog, the sky and the light; its kit draws everything else.
 */
export function applyFrame<Parts extends object, Frame extends BaseFrame>(stage: StageScene<Parts, Frame>, frame: Frame): void {
  const { camera } = frame;
  Object.assign(stage.camera, { fov: camera.fovDeg, aspect: camera.aspect, near: camera.near, far: camera.far });
  stage.camera.position.set(...camera.eye);
  stage.camera.up.set(...camera.up);
  stage.camera.lookAt(...camera.target);
  // The frame's own projection, so an off-centre view (the HUD's free window) draws exactly as framed.
  stage.camera.projectionMatrix.fromArray(camera.projection);
  stage.camera.projectionMatrixInverse.copy(stage.camera.projectionMatrix).invert();
  const fog = stage.scene.fog as THREE.Fog;
  const centre = stage.camera.position.distanceTo(target.set(...camera.target));
  fog.near = centre + FOG_BAND[0];
  fog.far = centre + FOG_BAND[1];

  stage.kit.draw(stage, frame);
  paint(stage, frame.palette);
  showRings(stage, frame.rings);
}
