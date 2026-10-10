import * as THREE from "three";
import type { FlockFrame, MarkerPose, TrailPose, ValleyPalette } from "../../../stage-core/kits/valley/index.ts";
import { disposeGeometries, type StageScene } from "../../scene.ts";
import { lakeOf, paintValley, scatter, valleyGeometry, waterGeometry, WING_ROOT } from "./geometry.ts";
import { BIRD_CAPACITY, sceneryFor, TRAIL_POINTS, TRAIL_WIDTH, type ValleyParts } from "./scene.ts";

type ValleyStage = StageScene<ValleyParts, FlockFrame>;

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const scratch = {
  matrix: new THREE.Matrix4(),
  position: new THREE.Vector3(),
  rotation: new THREE.Quaternion(),
  bank: new THREE.Quaternion(),
  size: new THREE.Vector3(),
  color: new THREE.Color(),
  sky: new THREE.Color(),
  wing: new THREE.Matrix4(),
  hinge: new THREE.Matrix4(),
  flap: new THREE.Matrix4(),
};
const beaconPole = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6).translate(0, 1.3, 0);
const beaconHead = new THREE.OctahedronGeometry(0.3, 0).translate(0, 2.85, 0);
const beaconRing = new THREE.RingGeometry(0.95, 1.2, 24).rotateX(-Math.PI / 2).translate(0, 0.05, 0);
const rock = new THREE.IcosahedronGeometry(1.1, 0).scale(1.2, 0.75, 1).translate(0, 0.45, 0);

/**
 * Rebuilds the valley, the lake, the trees and the rocks when the field's size changes. The
 * field itself is the meadow painted on the ground, with a soft band at its edge, so no
 * outline or posts are drawn; birds still fade out before the edge they wrap across.
 */
function showField(stage: ValleyStage, field: FlockFrame["field"]): void {
  const key = `${field.width}x${field.depth}@${field.altitude}`;
  if (stage.shown.field === key) return;
  for (const old of [stage.shown.ground, stage.shown.scenery]) {
    if (!old) continue;
    stage.scene.remove(old);
    disposeGeometries(old);
  }
  const ground = new THREE.Mesh(valleyGeometry(field.width, field.depth), stage.groundMaterial);
  ground.receiveShadow = true;
  const lake = lakeOf(field.width / 2, field.depth / 2);
  const scenery = sceneryFor(stage, {
    lake: { ...lake, geometry: waterGeometry(lake.radius) },
    trees: scatter(field.width, field.depth, "tree"),
    rocks: scatter(field.width, field.depth, "rock"),
  });
  stage.scene.add(ground, scenery);
  stage.shown.ground = ground;
  stage.shown.scenery = scenery;
  stage.shown.field = key;
  stage.shown.palette = null;
}

/** The valley's own colours: its markers, its scenery and its ground. The stage paints the sky and the light. */
function paint(stage: ValleyStage, palette: ValleyPalette, field: FlockFrame["field"]): void {
  if (stage.shown.palette === palette.name) return;
  stage.beaconMaterial.color.set(palette.beacon);
  stage.beaconMaterial.emissive.set(palette.beacon);
  stage.obstacleMaterial.color.set(palette.obstacle);
  stage.touchedMaterial.color.set(palette.touched);
  stage.touchedMaterial.emissive.set(palette.touched);
  stage.waterMaterial.color.set(palette.water);
  stage.crownMaterial.color.set(palette.foliage);
  stage.trunkMaterial.color.set(palette.trunk);
  stage.rockMaterial.color.set(palette.rock);
  if (stage.shown.ground) paintValley(stage.shown.ground.geometry, palette, field);
  stage.shown.palette = palette.name;
}

function makeMarker(kind: "beacon" | "obstacle", stage: ValleyStage): THREE.Object3D {
  const group = new THREE.Group();
  const parts = kind === "beacon" ? [beaconPole, beaconHead, beaconRing] : [rock];
  for (const geometry of parts) {
    const mesh = new THREE.Mesh(geometry, kind === "beacon" ? stage.beaconMaterial : stage.obstacleMaterial);
    // A rock casts no shadow, like the valley's own rocks. Drawing one into a new stage's
    // shadow map stalled level 5's fork for 1.7 s on SwiftShader (2026-10-09, session 6).
    mesh.castShadow = kind === "beacon";
    mesh.receiveShadow = kind === "obstacle";
    group.add(mesh);
  }
  return group;
}

function showMarkers(stage: ValleyStage, beacons: readonly MarkerPose[], obstacles: readonly MarkerPose[]): void {
  const wanted = new Map<string, { pose: MarkerPose; kind: "beacon" | "obstacle" }>();
  for (const pose of beacons) wanted.set(pose.key, { pose, kind: "beacon" });
  for (const pose of obstacles) wanted.set(pose.key, { pose, kind: "obstacle" });
  for (const [key, marker] of stage.markers) {
    if (!wanted.has(key)) {
      stage.scene.remove(marker);
      stage.markers.delete(key);
    }
  }
  for (const [key, { pose, kind }] of wanted) {
    let marker = stage.markers.get(key);
    if (!marker) {
      marker = makeMarker(kind, stage);
      stage.markers.set(key, marker);
      stage.scene.add(marker);
    }
    marker.position.set(...pose.position);
    if (kind === "obstacle") {
      const material = pose.touched === true ? stage.touchedMaterial : stage.obstacleMaterial;
      for (const part of marker.children) if (part instanceof THREE.Mesh) part.material = material;
    }
  }
}

/** A trail's opacity at its newest end; it fades to nothing at its oldest. */
const TRAIL_OPACITY = 0.85;

function showTrails(stage: ValleyStage, trails: readonly TrailPose[]): void {
  const position = stage.trails.geometry.getAttribute("position") as THREE.BufferAttribute;
  const color = stage.trails.geometry.getAttribute("color") as THREE.BufferAttribute;
  let vertex = 0;
  const put = (x: number, y: number, z: number, alpha: number) => {
    position.setXYZ(vertex, x, y, z);
    color.setXYZW(vertex, scratch.color.r, scratch.color.g, scratch.color.b, alpha);
    vertex++;
  };
  for (const trail of trails.slice(0, BIRD_CAPACITY)) {
    scratch.color.set(trail.color);
    const points = trail.points.slice(-TRAIL_POINTS);
    const last = points.length - 1;
    for (let k = 0; k < last; k++) {
      const [a, b] = [points[k], points[k + 1]];
      if (!a || !b) continue;
      // Across the segment, on the ground plane, so the ribbon reads from above.
      const [dx, dz] = [b[0] - a[0], b[2] - a[2]];
      const length = Math.hypot(dx, dz) || 1;
      const [px, pz] = [-dz / length, dx / length];
      // Width and opacity grow quickly from the oldest point, so the part behind the bird reads.
      const [ta, tb] = [Math.sqrt(k / last), Math.sqrt((k + 1) / last)];
      const [wa, wb] = [(TRAIL_WIDTH / 2) * ta, (TRAIL_WIDTH / 2) * tb];
      const [fa, fb] = [ta * TRAIL_OPACITY * trail.fade, tb * TRAIL_OPACITY * trail.fade];
      put(a[0] + px * wa, a[1], a[2] + pz * wa, fa);
      put(a[0] - px * wa, a[1], a[2] - pz * wa, fa);
      put(b[0] + px * wb, b[1], b[2] + pz * wb, fb);
      put(b[0] + px * wb, b[1], b[2] + pz * wb, fb);
      put(a[0] - px * wa, a[1], a[2] - pz * wa, fa);
      put(b[0] - px * wb, b[1], b[2] - pz * wb, fb);
    }
  }
  stage.trails.geometry.setDrawRange(0, vertex);
  position.needsUpdate = true;
  color.needsUpdate = true;
}

/**
 * Shows one frame of the valley: its ground, its colours, the birds with their wings and trails,
 * and the beacons and rocks. It reads only the frame description: positions, orientations and
 * colours all come from the stage core, never from simulation state.
 */
export function applyValley(stage: ValleyStage, frame: FlockFrame): void {
  showField(stage, frame.field);
  paint(stage, frame.palette, frame.field);

  const count = Math.min(frame.birds.length, BIRD_CAPACITY);
  const [left, right] = stage.wings;
  scratch.sky.set(frame.palette.sky);
  for (let i = 0; i < count; i++) {
    const bird = frame.birds[i];
    if (!bird) continue;
    scratch.rotation.setFromAxisAngle(Y, bird.yaw).multiply(scratch.bank.setFromAxisAngle(X, bird.bank));
    scratch.size.setScalar(bird.fade * bird.size);
    scratch.matrix.compose(scratch.position.set(...bird.position), scratch.rotation, scratch.size);
    scratch.color.set(bird.color).lerp(scratch.sky, 1 - bird.fade);
    stage.birds.setMatrixAt(i, scratch.matrix);
    stage.birds.setColorAt(i, scratch.color);
    // Each wing hinges at the body's side and swings about the bird's own nose: up is positive.
    for (const [wing, side] of [[left, 1], [right, -1]] as const) {
      scratch.hinge.makeTranslation(0, 0.03, WING_ROOT * side);
      scratch.flap.makeRotationX(-bird.flap * side);
      wing.setMatrixAt(i, scratch.wing.multiplyMatrices(scratch.matrix, scratch.hinge).multiply(scratch.flap));
      wing.setColorAt(i, scratch.color);
    }
  }
  for (const part of [stage.birds, left, right]) {
    part.count = count;
    part.instanceMatrix.needsUpdate = true;
    if (part.instanceColor) part.instanceColor.needsUpdate = true;
  }
  showTrails(stage, frame.trails);

  showMarkers(stage, frame.beacons, frame.obstacles);
}
