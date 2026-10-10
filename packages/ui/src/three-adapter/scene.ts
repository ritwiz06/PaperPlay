import * as THREE from "three";
import type { BaseFrame } from "../stage-core/index.ts";
import { skyGeometry } from "./sky.ts";

/** Frees the GPU buffers of every geometry under `root`. */
export function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((object) => {
    const geometry: unknown = (object as { geometry?: unknown }).geometry;
    if (geometry instanceof THREE.BufferGeometry) geometry.dispose();
  });
}

/** The sky dome's radius: inside the camera's far plane, beyond everything else. */
export const SKY_RADIUS = 330;

/**
 * A scene kit's Three.js half (ADR-0026): the meshes and materials that draw its layers, built
 * once per stage. It reads only frames, never simulation state, and adds no new kind of material
 * mid-run, so a new stage compiles every shader it needs before its first frames (2026-10-09).
 */
/** The names a kit's own Three.js objects must not take: the stage's own, which they would shadow. */
export type Unshadowed<Parts> = { readonly [K in keyof Parts & (keyof BaseScene | "kit")]: never };

export interface ThreeKit<Parts extends object = object, Frame extends BaseFrame = BaseFrame> {
  /** The scene kit's id, as its pure half names it. */
  readonly id: string;
  /** Builds the kit's meshes and materials, adding to the scene what it draws from the start. */
  create(scene: THREE.Scene): Parts & Unshadowed<Parts>;
  /** Shows one frame's layers: the kit's ground, forms and markers, and the kit's own colours. */
  draw(stage: StageScene<Parts, Frame>, frame: Frame): void;
  /** Frees the materials `create` made; the stage frees every geometry itself. */
  dispose(parts: Parts): void;
  /** Why the world cannot be drawn without WebGL, and what carries on when the browser takes the drawing away. */
  readonly words: { readonly fallback: string; readonly lost: string };
}

/** The Three.js objects every stage owns, whatever its kit. Only `applyFrame` changes them. */
export interface BaseScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Flat bands by key: a selected thing's reach, the keyboard cursor. */
  readonly rings: Map<string, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>;
  readonly sky: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly sunDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly hemisphere: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  /** The palette the sky and lights were last painted in, so unchanged frames repaint nothing. */
  readonly painted: { palette: string | null };
  dispose(): void;
}

/** A stage: the objects every stage owns, the kit's own, and the kit that draws them. */
export type StageScene<Parts extends object = object, Frame extends BaseFrame = BaseFrame> = BaseScene & Parts & { readonly kit: ThreeKit<Parts, Frame> };

/** An instanced mesh whose instances are all hidden and white until a frame places and colours them. */
export function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < count; i++) mesh.setColorAt(i, white);
  mesh.count = 0;
  return mesh;
}

export function createStageScene<Parts extends object, Frame extends BaseFrame>(kit: ThreeKit<Parts, Frame>): StageScene<Parts, Frame> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0xffffff, 62, 150);

  const camera = new THREE.PerspectiveCamera();

  // The kit's objects come before the lights and the sky, as they always have, so every object
  // keeps its place in the order Three.js breaks drawing ties by.
  const parts = kit.create(scene);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x888888, 1.3);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-20, 38, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0006;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
  scene.add(hemisphere, sun, sun.target);

  // The sky and the sun's disc sit outside the fog, so the horizon stays the fog's own colour.
  const sky = new THREE.Mesh(skyGeometry(SKY_RADIUS), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(11, 32), new THREE.MeshBasicMaterial({ fog: false, depthWrite: false }));
  sunDisc.position.copy(sun.position).normalize().multiplyScalar(SKY_RADIUS * 0.9);
  sunDisc.lookAt(0, 0, 0);
  sunDisc.renderOrder = -1;
  scene.add(sky, sunDisc);

  const rings: BaseScene["rings"] = new Map();
  return {
    ...parts,
    scene,
    camera,
    rings,
    sky,
    sunDisc,
    hemisphere,
    sun,
    painted: { palette: null },
    kit,
    dispose() {
      disposeGeometries(scene);
      kit.dispose(parts);
      for (const material of [sky.material, sunDisc.material, ...[...rings.values()].map((ring) => ring.material)]) material.dispose();
    },
  };
}
