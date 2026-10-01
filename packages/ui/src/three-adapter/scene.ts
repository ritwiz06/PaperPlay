import * as THREE from "three";
import { birdGeometry } from "./geometry.ts";

/** Frees the GPU buffers of every geometry under `root`. */
export function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((object) => {
    const geometry: unknown = (object as { geometry?: unknown }).geometry;
    if (geometry instanceof THREE.BufferGeometry) geometry.dispose();
  });
}

/** The primitive allows at most 400 birds; the instanced mesh holds that many. */
export const BIRD_CAPACITY = 400;

/** The Three.js objects one stage owns. Only `applyFrame` changes them. */
export interface StageScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly birds: THREE.InstancedMesh;
  readonly markers: Map<string, THREE.Object3D>;
  /** Flat bands by key: a selected bird's reach, the keyboard cursor. */
  readonly rings: Map<string, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>;
  readonly fieldMaterial: THREE.LineBasicMaterial;
  readonly postMaterial: THREE.MeshStandardMaterial;
  readonly beaconMaterial: THREE.MeshStandardMaterial;
  readonly obstacleMaterial: THREE.MeshStandardMaterial;
  readonly groundMaterial: THREE.MeshStandardMaterial;
  readonly hemisphere: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  /** What the scene was last built and painted for, so unchanged frames rebuild nothing. */
  readonly shown: { palette: string | null; field: string | null; ground: THREE.Mesh | null; outline: THREE.Group | null };
  dispose(): void;
}

export function createStageScene(): StageScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0xffffff, 62, 150);

  const camera = new THREE.PerspectiveCamera();

  const birdMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.75, side: THREE.DoubleSide });
  const birds = new THREE.InstancedMesh(birdGeometry(), birdMaterial, BIRD_CAPACITY);
  birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  birds.frustumCulled = false;
  birds.castShadow = true;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < BIRD_CAPACITY; i++) birds.setColorAt(i, white);
  birds.count = 0;
  scene.add(birds);

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x888888, 1.3);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-20, 38, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0006;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 120 });
  scene.add(hemisphere, sun, sun.target);

  const materials = {
    fieldMaterial: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 }),
    postMaterial: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    beaconMaterial: new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 0.25 }),
    obstacleMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    groundMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }),
  };

  const rings: StageScene["rings"] = new Map();
  return {
    scene,
    camera,
    birds,
    markers: new Map(),
    rings,
    ...materials,
    hemisphere,
    sun,
    shown: { palette: null, field: null, ground: null, outline: null },
    dispose() {
      disposeGeometries(scene);
      for (const material of [birdMaterial, ...Object.values(materials), ...[...rings.values()].map((ring) => ring.material)]) material.dispose();
    },
  };
}
