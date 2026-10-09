import * as THREE from "three";
import type { FrameDescription, MarkerPose, RingPose, StagePalette } from "../stage-core/index.ts";
import { paintValley, valleyGeometry } from "./geometry.ts";
import { BIRD_CAPACITY, disposeGeometries, type StageScene } from "./scene.ts";

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
};
const beaconPole = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6).translate(0, 1.3, 0);
const beaconHead = new THREE.OctahedronGeometry(0.3, 0).translate(0, 2.85, 0);
const beaconRing = new THREE.RingGeometry(0.95, 1.2, 24).rotateX(-Math.PI / 2).translate(0, 0.05, 0);
const rock = new THREE.IcosahedronGeometry(1.1, 0).scale(1.2, 0.75, 1).translate(0, 0.45, 0);

/** Rebuilds the valley and the outlined flight field when the field's size changes. */
function showField(stage: StageScene, field: FrameDescription["field"]): void {
  const key = `${field.width}x${field.depth}@${field.altitude}`;
  if (stage.shown.field === key) return;
  for (const old of [stage.shown.ground, stage.shown.outline]) {
    if (!old) continue;
    stage.scene.remove(old);
    disposeGeometries(old);
  }
  const ground = new THREE.Mesh(valleyGeometry(field.width, field.depth), stage.groundMaterial);
  ground.receiveShadow = true;

  // The torus the birds fly on, drawn as a bounded field: an outline on the ground and four posts.
  const [w, d] = [field.width / 2, field.depth / 2];
  const corners = [new THREE.Vector3(-w, 0.08, -d), new THREE.Vector3(w, 0.08, -d), new THREE.Vector3(w, 0.08, d), new THREE.Vector3(-w, 0.08, d)];
  const outline = new THREE.Group();
  outline.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), stage.fieldMaterial));
  for (const corner of corners) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, field.altitude + 1, 6), stage.postMaterial);
    post.position.set(corner.x, (field.altitude + 1) / 2, corner.z);
    post.castShadow = true;
    outline.add(post);
  }
  stage.scene.add(ground, outline);
  stage.shown.ground = ground;
  stage.shown.outline = outline;
  stage.shown.field = key;
  stage.shown.palette = null;
}

function paint(stage: StageScene, palette: StagePalette): void {
  if (stage.shown.palette === palette.name) return;
  (stage.scene.background as THREE.Color).set(palette.sky);
  (stage.scene.fog as THREE.Fog).color.set(palette.sky);
  stage.hemisphere.color.set(palette.sun);
  stage.hemisphere.groundColor.set(palette.shade);
  stage.sun.color.set(palette.sun);
  stage.fieldMaterial.color.set(palette.field);
  stage.postMaterial.color.set(palette.field);
  stage.beaconMaterial.color.set(palette.beacon);
  stage.beaconMaterial.emissive.set(palette.beacon);
  stage.obstacleMaterial.color.set(palette.obstacle);
  if (stage.shown.ground) paintValley(stage.shown.ground.geometry, palette);
  stage.shown.palette = palette.name;
}

function makeMarker(kind: "beacon" | "obstacle", stage: StageScene): THREE.Object3D {
  const group = new THREE.Group();
  const parts = kind === "beacon" ? [beaconPole, beaconHead, beaconRing] : [rock];
  for (const geometry of parts) {
    const mesh = new THREE.Mesh(geometry, kind === "beacon" ? stage.beaconMaterial : stage.obstacleMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = kind === "obstacle";
    group.add(mesh);
  }
  return group;
}

function showMarkers(stage: StageScene, beacons: readonly MarkerPose[], obstacles: readonly MarkerPose[]): void {
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
  }
}

/** Fog starts this far beyond the field's centre and is complete this far beyond it, wherever the camera stands. */
const FOG_BAND = [4, 92] as const;

/** Half the width of a ring's band, in world units. */
const RING_HALF_WIDTH = 0.12;

function showRings(stage: StageScene, rings: readonly RingPose[]): void {
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
 */
export function applyFrame(stage: StageScene, frame: FrameDescription): void {
  const { camera } = frame;
  Object.assign(stage.camera, { fov: camera.fovDeg, aspect: camera.aspect, near: camera.near, far: camera.far });
  stage.camera.position.set(...camera.eye);
  stage.camera.up.set(...camera.up);
  stage.camera.lookAt(...camera.target);
  // The frame's own projection, so an off-centre view (the HUD's free window) draws exactly as framed.
  stage.camera.projectionMatrix.fromArray(camera.projection);
  stage.camera.projectionMatrixInverse.copy(stage.camera.projectionMatrix).invert();
  const fog = stage.scene.fog as THREE.Fog;
  const centre = stage.camera.position.distanceTo(scratch.position.set(...camera.target));
  fog.near = centre + FOG_BAND[0];
  fog.far = centre + FOG_BAND[1];

  showField(stage, frame.field);
  paint(stage, frame.palette);

  const count = Math.min(frame.birds.length, BIRD_CAPACITY);
  scratch.sky.set(frame.palette.sky);
  for (let i = 0; i < count; i++) {
    const bird = frame.birds[i];
    if (!bird) continue;
    scratch.rotation.setFromAxisAngle(Y, bird.yaw).multiply(scratch.bank.setFromAxisAngle(X, bird.bank));
    scratch.size.setScalar(bird.fade * bird.size);
    scratch.matrix.compose(scratch.position.set(...bird.position), scratch.rotation, scratch.size);
    stage.birds.setMatrixAt(i, scratch.matrix);
    stage.birds.setColorAt(i, scratch.color.set(bird.color).lerp(scratch.sky, 1 - bird.fade));
  }
  stage.birds.count = count;
  stage.birds.instanceMatrix.needsUpdate = true;
  if (stage.birds.instanceColor) stage.birds.instanceColor.needsUpdate = true;

  showMarkers(stage, frame.beacons, frame.obstacles);
  showRings(stage, frame.rings);
}
