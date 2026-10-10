/**
 * The town kit's Three.js half (ADR-0029): a green town with a plaza, houses round it and a ring
 * of trees, and its figures, each a body and a head, coloured by the compartment it is counted
 * in, with a ring under each ill one. It draws town frames only, and can import nothing that
 * holds simulation state.
 */
import * as THREE from "three";
import type { TownFrame, TownPalette } from "../../../stage-core/kits/town/index.ts";
import { FIGURES, FIGURE_HEIGHT, HOUSE_RADIUS } from "../../../stage-core/kits/town/index.ts";
import { instanced, type StageScene, type ThreeKit } from "../../scene.ts";

/** The town's own Three.js objects, beside the stage's. Only `applyFrame` changes them. */
export interface TownParts {
  readonly bodies: THREE.InstancedMesh;
  readonly heads: THREE.InstancedMesh;
  readonly illRings: THREE.InstancedMesh;
  readonly figureMaterial: THREE.MeshStandardMaterial;
  readonly ringMaterial: THREE.MeshBasicMaterial;
  readonly groundMaterial: THREE.MeshStandardMaterial;
  readonly plazaMaterial: THREE.MeshStandardMaterial;
  readonly wallMaterial: THREE.MeshStandardMaterial;
  readonly roofMaterial: THREE.MeshStandardMaterial;
  readonly foliageMaterial: THREE.MeshStandardMaterial;
  readonly trunkMaterial: THREE.MeshStandardMaterial;
  /** What the town was last built and painted for, so unchanged frames rebuild nothing. */
  readonly shown: { palette: string | null; houses: THREE.Group | null };
}

type TownStage = StageScene<TownParts, TownFrame>;

/** The ground's radius, in world units: beyond the fog's far edge. */
const GROUND_RADIUS = 220;

/** A fixed hash for the trees' places, so the town looks the same on every load. */
function hashed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ground, the plaza and a ring of trees beyond the houses: scenery, built once. */
function scenery(scene: THREE.Scene, parts: Omit<TownParts, "bodies" | "heads" | "illRings" | "shown">): void {
  // The ground runs on past where the fog is complete, so its edge never shows.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_RADIUS, 64).rotateX(-Math.PI / 2), parts.groundMaterial);
  ground.receiveShadow = true;
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32).rotateX(-Math.PI / 2).translate(0, 0.02, 0), parts.plazaMaterial);
  plaza.receiveShadow = true;
  scene.add(ground, plaza);

  const random = hashed(0x7ee5);
  const spots: { x: number; z: number; scale: number }[] = [];
  // A ring of trees just beyond the houses, then woods thinning out toward the fog.
  for (let k = 0; k < 40; k++) {
    const angle = (k / 40) * 2 * Math.PI + random() * 0.12;
    const radius = HOUSE_RADIUS + 4 + random() * 7;
    spots.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, scale: 0.7 + random() * 0.6 });
  }
  for (let k = 0; k < 140; k++) {
    const angle = random() * 2 * Math.PI;
    const radius = HOUSE_RADIUS + 12 + Math.sqrt(random()) * 60;
    spots.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, scale: 0.8 + random() * 0.9 });
  }
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 2.4, 6).translate(0, 2.3, 0), parts.foliageMaterial, spots.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 5).translate(0, 0.6, 0), parts.trunkMaterial, spots.length);
  const matrix = new THREE.Matrix4();
  spots.forEach((spot, index) => {
    matrix.makeScale(spot.scale, spot.scale, spot.scale).setPosition(spot.x, 0, spot.z);
    crowns.setMatrixAt(index, matrix);
    trunks.setMatrixAt(index, matrix);
  });
  for (const mesh of [crowns, trunks]) {
    mesh.castShadow = true;
    scene.add(mesh);
  }
}

function createTown(scene: THREE.Scene): TownParts {
  const figureMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.8 });
  const bodies = instanced(new THREE.CylinderGeometry(0.22, 0.3, FIGURE_HEIGHT * 0.62, 8).translate(0, FIGURE_HEIGHT * 0.31, 0), figureMaterial, FIGURES);
  const heads = instanced(new THREE.SphereGeometry(0.22, 12, 8).translate(0, FIGURE_HEIGHT * 0.82, 0), figureMaterial, FIGURES);
  for (const part of [bodies, heads]) {
    part.castShadow = true;
    scene.add(part);
  }
  const ringMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const illRings = instanced(new THREE.RingGeometry(0.38, 0.6, 20).rotateX(-Math.PI / 2).translate(0, 0.04, 0), ringMaterial, FIGURES);
  scene.add(illRings);
  const parts = {
    figureMaterial,
    ringMaterial,
    groundMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }),
    plazaMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    wallMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85 }),
    roofMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }),
    foliageMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
    trunkMaterial: new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
  };
  scenery(scene, parts);
  return { bodies, heads, illRings, ...parts, shown: { palette: null, houses: null } };
}

function paint(stage: TownStage, palette: TownPalette): void {
  if (stage.shown.palette === palette.name) return;
  stage.groundMaterial.color.set(palette.ground);
  stage.plazaMaterial.color.set(palette.plaza);
  stage.wallMaterial.color.set(palette.wall);
  stage.roofMaterial.color.set(0xffffff);
  stage.foliageMaterial.color.set(palette.foliage);
  stage.trunkMaterial.color.set(palette.trunk);
  stage.ringMaterial.color.set(palette.ring);
  stage.shown.palette = palette.name;
}

/** The houses, built once from the frame's own poses: walls, and a roof coloured per house. */
function showHouses(stage: TownStage, frame: TownFrame): void {
  if (stage.shown.houses) return;
  const group = new THREE.Group();
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1.5, 2).translate(0, 0.75, 0), stage.wallMaterial, frame.houses.length);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 1.2, 4).rotateY(Math.PI / 4).translate(0, 2.1, 0), stage.roofMaterial, frame.houses.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  frame.houses.forEach((house, index) => {
    matrix.makeRotationY(house.yaw).setPosition(...house.position);
    walls.setMatrixAt(index, matrix);
    roofs.setMatrixAt(index, matrix);
    roofs.setColorAt(index, color.set(house.roof));
  });
  for (const mesh of [walls, roofs]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  stage.scene.add(group);
  stage.shown.houses = group;
}

const scratch = { matrix: new THREE.Matrix4(), rotation: new THREE.Quaternion(), position: new THREE.Vector3(), size: new THREE.Vector3(1, 1, 1), color: new THREE.Color() };
const UP = new THREE.Vector3(0, 1, 0);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Shows one frame of the town: its colours, its houses, and each figure where the frame puts it. */
function drawTown(stage: TownStage, frame: TownFrame): void {
  paint(stage, frame.palette);
  showHouses(stage, frame);
  const count = Math.min(frame.figures.length, FIGURES);
  for (let i = 0; i < count; i++) {
    const figure = frame.figures[i];
    if (!figure) continue;
    scratch.rotation.setFromAxisAngle(UP, figure.yaw);
    scratch.matrix.compose(scratch.position.set(...figure.position), scratch.rotation, scratch.size);
    scratch.color.set(figure.color);
    for (const part of [stage.bodies, stage.heads]) {
      part.setMatrixAt(i, scratch.matrix);
      part.setColorAt(i, scratch.color);
    }
    stage.illRings.setMatrixAt(i, figure.ring ? scratch.matrix : HIDDEN);
  }
  for (const part of [stage.bodies, stage.heads, stage.illRings]) {
    part.count = count;
    part.instanceMatrix.needsUpdate = true;
    if (part.instanceColor) part.instanceColor.needsUpdate = true;
  }
}

function disposeTown(parts: TownParts): void {
  const owned = [parts.figureMaterial, parts.ringMaterial, parts.groundMaterial, parts.plazaMaterial, parts.wallMaterial, parts.roofMaterial, parts.foliageMaterial, parts.trunkMaterial];
  for (const material of owned) material.dispose();
}

export const townThree: ThreeKit<TownParts, TownFrame> = Object.freeze({
  id: "town",
  create: createTown,
  draw: drawTown,
  dispose: disposeTown,
  words: Object.freeze({
    fallback: "Your browser has WebGL turned off or cannot start it, so the town and its people cannot be drawn here. The model's equations and measurements do not depend on drawing it.",
    lost: "The browser took back this world's graphics, as it can when a tab sits in the background. Only the drawing stopped: the model's run and its measurements carry on.",
  }),
});
