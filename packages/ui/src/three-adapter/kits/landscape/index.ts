/**
 * The landscape kit's Three.js half (ADR-0047): the loss surface as terrain, coloured from low to
 * high, a ball for each optimizer with its trail, and a dark ring round the What-if's ball, so the
 * two are told apart by more than colour. It draws landscape frames only, and can import nothing
 * that holds simulation state.
 */
import * as THREE from "three";
import type { LandscapeFrame, LandscapePalette, TerrainShape } from "../../../stage-core/kits/landscape/index.ts";
import { BALL_RADIUS, TRAIL_POINTS } from "../../../stage-core/kits/landscape/index.ts";
import type { StageScene, ThreeKit } from "../../scene.ts";

type Role = "here" | "there";

/** The landscape's own Three.js objects, beside the stage's. Only `applyFrame` changes them. */
export interface LandscapeParts {
  readonly terrainMaterial: THREE.MeshStandardMaterial;
  readonly groundMaterial: THREE.MeshStandardMaterial;
  readonly ballMaterials: Readonly<Record<Role, THREE.MeshStandardMaterial>>;
  readonly trailMaterials: Readonly<Record<Role, THREE.LineBasicMaterial>>;
  readonly ringMaterial: THREE.MeshBasicMaterial;
  readonly ballMeshes: Readonly<Record<Role, THREE.Mesh>>;
  readonly trailLines: Readonly<Record<Role, THREE.Line>>;
  readonly ballRing: THREE.Mesh;
  /** What the terrain was last built and painted for, so unchanged frames rebuild nothing. */
  readonly shown: { palette: string | null; terrain: string | null; mesh: THREE.Mesh | null };
}

type LandscapeStage = StageScene<LandscapeParts, LandscapeFrame>;

const ROLES: readonly Role[] = ["here", "there"];

function createLandscape(scene: THREE.Scene): LandscapeParts {
  const groundMaterial = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 64).rotateX(-Math.PI / 2).translate(0, -0.05, 0), groundMaterial);
  ground.receiveShadow = true;
  scene.add(ground);
  const ballMaterials = { here: new THREE.MeshStandardMaterial({ roughness: 0.45 }), there: new THREE.MeshStandardMaterial({ roughness: 0.45 }) };
  const trailMaterials = { here: new THREE.LineBasicMaterial(), there: new THREE.LineBasicMaterial() };
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
  const ballMeshes: Record<Role, THREE.Mesh> = { here: new THREE.Mesh(ballGeometry, ballMaterials.here), there: new THREE.Mesh(ballGeometry, ballMaterials.there) };
  const trailOf = (role: Role): THREE.Line => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, trailMaterials[role]);
    line.frustumCulled = false;
    return line;
  };
  const trailLines: Record<Role, THREE.Line> = { here: trailOf("here"), there: trailOf("there") };
  const ringMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ballRing = new THREE.Mesh(new THREE.TorusGeometry(BALL_RADIUS * 1.35, BALL_RADIUS * 0.18, 8, 32).rotateX(Math.PI / 2), ringMaterial);
  for (const role of ROLES) {
    ballMeshes[role].castShadow = true;
    ballMeshes[role].visible = false;
    trailLines[role].visible = false;
    scene.add(ballMeshes[role], trailLines[role]);
  }
  ballRing.visible = false;
  scene.add(ballRing);
  return {
    terrainMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
    groundMaterial,
    ballMaterials,
    trailMaterials,
    ringMaterial,
    ballMeshes,
    trailLines,
    ballRing,
    shown: { palette: null, terrain: null, mesh: null },
  };
}

function paint(stage: LandscapeStage, palette: LandscapePalette): void {
  if (stage.shown.palette === palette.name) return;
  stage.groundMaterial.color.set(palette.ground);
  stage.ballMaterials.here.color.set(palette.here);
  stage.ballMaterials.there.color.set(palette.there);
  stage.trailMaterials.here.color.set(palette.here);
  stage.trailMaterials.there.color.set(palette.there);
  stage.ringMaterial.color.set(palette.ring);
  stage.shown.palette = palette.name;
}

/** The terrain, built once from the frame's grid: a plane of its heights, each vertex in its colour. */
function showTerrain(stage: LandscapeStage, terrain: TerrainShape): void {
  if (stage.shown.terrain === terrain.key) return;
  if (stage.shown.mesh) {
    stage.scene.remove(stage.shown.mesh);
    stage.shown.mesh.geometry.dispose();
  }
  const geometry = new THREE.PlaneGeometry(terrain.width, terrain.depth, terrain.columns, terrain.rows).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  // The plane's vertices run row by row from its far edge, as the grid's do.
  for (let i = 0; i < position.count; i++) {
    position.setY(i, terrain.heights[i] ?? 0);
    color.set(terrain.colors[i] ?? "#000000");
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, stage.terrainMaterial);
  mesh.receiveShadow = true;
  stage.scene.add(mesh);
  stage.shown.terrain = terrain.key;
  stage.shown.mesh = mesh;
}

/** Shows one frame of the landscape: its colours, its terrain, and each ball and trail where the frame puts them. */
function drawLandscape(stage: LandscapeStage, frame: LandscapeFrame): void {
  paint(stage, frame.palette);
  showTerrain(stage, frame.terrain);
  for (const role of ROLES) {
    const ball = frame.balls.find((entry) => entry.role === role);
    const mesh = stage.ballMeshes[role];
    mesh.visible = ball !== undefined;
    if (ball) mesh.position.set(...ball.position);
    if (role === "there") {
      stage.ballRing.visible = ball !== undefined;
      if (ball) stage.ballRing.position.set(...ball.position);
    }
    const trail = frame.trails.find((entry) => entry.role === role);
    const line = stage.trailLines[role];
    line.visible = trail !== undefined && trail.points.length > 1;
    if (trail) {
      const attribute = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const count = Math.min(trail.points.length, TRAIL_POINTS);
      for (let i = 0; i < count; i++) attribute.setXYZ(i, ...(trail.points[i] ?? [0, 0, 0]));
      attribute.needsUpdate = true;
      line.geometry.setDrawRange(0, count);
    }
  }
}

function disposeLandscape(parts: LandscapeParts): void {
  for (const material of [parts.terrainMaterial, parts.groundMaterial, parts.ballMaterials.here, parts.ballMaterials.there, parts.trailMaterials.here, parts.trailMaterials.there, parts.ringMaterial]) material.dispose();
}

export const landscapeThree: ThreeKit<LandscapeParts, LandscapeFrame> = Object.freeze({
  id: "landscape",
  create: createLandscape,
  draw: drawLandscape,
  dispose: disposeLandscape,
  words: Object.freeze({
    fallback: "Your browser has WebGL turned off or cannot start it, so the loss surface and its balls cannot be drawn here. The update rule's steps and measurements do not depend on drawing it.",
    lost: "The browser took back this world's graphics, as it can when a tab sits in the background. Only the drawing stopped: the optimizer's run and its measurements carry on.",
  }),
});
