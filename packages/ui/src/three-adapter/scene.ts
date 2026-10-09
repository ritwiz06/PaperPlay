import * as THREE from "three";
import { birdBodyGeometry, crownGeometry, rockGeometry, skyGeometry, trunkGeometry, wingGeometry } from "./geometry.ts";

/** Frees the GPU buffers of every geometry under `root`. */
export function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((object) => {
    const geometry: unknown = (object as { geometry?: unknown }).geometry;
    if (geometry instanceof THREE.BufferGeometry) geometry.dispose();
  });
}

/** The primitive allows at most 400 birds; the instanced meshes hold that many. */
export const BIRD_CAPACITY = 400;
/** Points a trail may hold; the session hands over a short history (ten states) plus where the bird is drawn. */
export const TRAIL_POINTS = 12;
/** A trail's width at the bird, in world units; it tapers to nothing at its oldest point. */
export const TRAIL_WIDTH = 0.55;
/** The sky dome's radius: inside the camera's far plane, beyond everything else. */
export const SKY_RADIUS = 330;

/** The Three.js objects one stage owns. Only `applyFrame` changes them. */
export interface StageScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Each bird's body; its wings follow it, left then right. */
  readonly birds: THREE.InstancedMesh;
  readonly wings: readonly [THREE.InstancedMesh, THREE.InstancedMesh];
  readonly trails: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly markers: Map<string, THREE.Object3D>;
  /** Flat bands by key: a selected bird's reach, the keyboard cursor. */
  readonly rings: Map<string, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>;
  readonly beaconMaterial: THREE.MeshStandardMaterial;
  readonly obstacleMaterial: THREE.MeshStandardMaterial;
  readonly groundMaterial: THREE.MeshStandardMaterial;
  readonly waterMaterial: THREE.MeshStandardMaterial;
  readonly crownMaterial: THREE.MeshStandardMaterial;
  readonly trunkMaterial: THREE.MeshStandardMaterial;
  readonly rockMaterial: THREE.MeshStandardMaterial;
  readonly sky: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly sunDisc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly hemisphere: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  /** What the scene was last built and painted for, so unchanged frames rebuild nothing. */
  readonly shown: {
    palette: string | null;
    field: string | null;
    ground: THREE.Mesh | null;
    /** The lake, the trees and the rocks, rebuilt with the ground. */
    scenery: THREE.Group | null;
  };
  dispose(): void;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < count; i++) mesh.setColorAt(i, white);
  mesh.count = 0;
  return mesh;
}

export function createStageScene(): StageScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0xffffff, 62, 150);

  const camera = new THREE.PerspectiveCamera();

  const birdMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.75, side: THREE.DoubleSide });
  const birds = instanced(birdBodyGeometry(), birdMaterial, BIRD_CAPACITY);
  const wings = [instanced(wingGeometry(1), birdMaterial, BIRD_CAPACITY), instanced(wingGeometry(-1), birdMaterial, BIRD_CAPACITY)] as const;
  for (const part of [birds, ...wings]) {
    part.castShadow = true;
    scene.add(part);
  }

  // Trails: flat ribbons, two triangles a segment, each corner with its own colour and opacity.
  const trailGeometry = new THREE.BufferGeometry();
  const segments = BIRD_CAPACITY * (TRAIL_POINTS - 1);
  trailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(segments * 6 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(segments * 6 * 4), 4).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setDrawRange(0, 0);
  const trails = new THREE.Mesh(trailGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  trails.frustumCulled = false;
  scene.add(trails);

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

  const materials = {
    beaconMaterial: new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 0.25 }),
    obstacleMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    groundMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }),
    waterMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.25, metalness: 0.05 }),
    crownMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    trunkMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    rockMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }),
  };

  const rings: StageScene["rings"] = new Map();
  return {
    scene,
    camera,
    birds,
    wings,
    trails,
    markers: new Map(),
    rings,
    ...materials,
    sky,
    sunDisc,
    hemisphere,
    sun,
    shown: { palette: null, field: null, ground: null, scenery: null },
    dispose() {
      disposeGeometries(scene);
      const owned = [birdMaterial, trails.material, sky.material, sunDisc.material, ...Object.values(materials), ...[...rings.values()].map((ring) => ring.material)];
      for (const material of owned) material.dispose();
    },
  };
}

/** Builds the lake, trees and rocks for a field, as instanced meshes under one group. */
export function sceneryFor(
  stage: Pick<StageScene, "waterMaterial" | "crownMaterial" | "trunkMaterial" | "rockMaterial">,
  spots: {
    readonly lake: { readonly x: number; readonly z: number; readonly level: number; readonly geometry: THREE.BufferGeometry };
    readonly trees: readonly { x: number; y: number; z: number; scale: number; turn: number }[];
    readonly rocks: readonly { x: number; y: number; z: number; scale: number; turn: number }[];
  },
): THREE.Group {
  const group = new THREE.Group();
  const water = new THREE.Mesh(spots.lake.geometry, stage.waterMaterial);
  water.position.set(spots.lake.x, spots.lake.level, spots.lake.z);
  water.receiveShadow = true;
  group.add(water);

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (mesh: THREE.InstancedMesh, list: typeof spots.trees, squash = 1) => {
    list.forEach((spot, index) => {
      rotation.setFromAxisAngle(up, spot.turn);
      matrix.compose(new THREE.Vector3(spot.x, spot.y - 0.1, spot.z), rotation, new THREE.Vector3(spot.scale, spot.scale * squash, spot.scale));
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  place(new THREE.InstancedMesh(trunkGeometry(), stage.trunkMaterial, spots.trees.length), spots.trees);
  const crowns = new THREE.InstancedMesh(crownGeometry(), stage.crownMaterial, spots.trees.length);
  place(crowns, spots.trees);
  // Crowns vary a little in shade, so a grove reads as many trees.
  const shade = new THREE.Color();
  spots.trees.forEach((spot, index) => crowns.setColorAt(index, shade.setScalar(0.86 + ((spot.turn * 7.13) % 1) * 0.22)));
  place(new THREE.InstancedMesh(rockGeometry(), stage.rockMaterial, spots.rocks.length), spots.rocks, 0.8);
  return group;
}
