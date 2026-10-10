import * as THREE from "three";
import { instanced } from "../../scene.ts";
import { birdBodyGeometry, crownGeometry, rockGeometry, trunkGeometry, wingGeometry } from "./geometry.ts";

/** The primitive allows at most 400 birds; the instanced meshes hold that many. */
export const BIRD_CAPACITY = 400;
/** Points a trail may hold; the session hands over a short history (ten states) plus where the bird is drawn. */
export const TRAIL_POINTS = 12;
/** A trail's width at the bird, in world units; it tapers to nothing at its oldest point. */
export const TRAIL_WIDTH = 0.55;

/** The valley kit's own Three.js objects, beside the stage's. Only `applyFrame` changes them. */
export interface ValleyParts {
  /** Each bird's body; its wings follow it, left then right. */
  readonly birds: THREE.InstancedMesh;
  readonly wings: readonly [THREE.InstancedMesh, THREE.InstancedMesh];
  readonly trails: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly markers: Map<string, THREE.Object3D>;
  readonly birdMaterial: THREE.MeshStandardMaterial;
  readonly beaconMaterial: THREE.MeshStandardMaterial;
  readonly obstacleMaterial: THREE.MeshStandardMaterial;
  /** A rock with a bird at it. The same kind of material as obstacleMaterial, so it needs no new shader. */
  readonly touchedMaterial: THREE.MeshStandardMaterial;
  readonly groundMaterial: THREE.MeshStandardMaterial;
  readonly waterMaterial: THREE.MeshStandardMaterial;
  readonly crownMaterial: THREE.MeshStandardMaterial;
  readonly trunkMaterial: THREE.MeshStandardMaterial;
  readonly rockMaterial: THREE.MeshStandardMaterial;
  /** What the valley was last built and painted for, so unchanged frames rebuild nothing. */
  readonly shown: {
    palette: string | null;
    field: string | null;
    ground: THREE.Mesh | null;
    /** The lake, the trees and the rocks, rebuilt with the ground. */
    scenery: THREE.Group | null;
  };
}

/** The birds, their wings and trails, and the valley's materials, for one stage. */
export function createValley(scene: THREE.Scene): ValleyParts {
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

  return {
    birds,
    wings,
    trails,
    markers: new Map(),
    birdMaterial,
    beaconMaterial: new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveIntensity: 0.25 }),
    obstacleMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    touchedMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, emissiveIntensity: 0.55 }),
    groundMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }),
    waterMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.25, metalness: 0.05 }),
    crownMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    trunkMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    rockMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }),
    shown: { palette: null, field: null, ground: null, scenery: null },
  };
}

/** Frees the valley's materials; the stage frees its geometries. */
export function disposeValley(parts: ValleyParts): void {
  const owned = [
    parts.birdMaterial,
    parts.trails.material,
    parts.beaconMaterial,
    parts.obstacleMaterial,
    parts.touchedMaterial,
    parts.groundMaterial,
    parts.waterMaterial,
    parts.crownMaterial,
    parts.trunkMaterial,
    parts.rockMaterial,
  ];
  for (const material of owned) material.dispose();
}

/** Builds the lake, trees and rocks for a field, as instanced meshes under one group. */
export function sceneryFor(
  stage: Pick<ValleyParts, "waterMaterial" | "crownMaterial" | "trunkMaterial" | "rockMaterial">,
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
