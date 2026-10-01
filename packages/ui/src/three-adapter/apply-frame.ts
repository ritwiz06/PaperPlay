import * as THREE from "three";
import type { FrameDescription, MarkerPose, StagePalette } from "../stage-core/index.ts";
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
  stage.camera.updateProjectionMatrix();

  showField(stage, frame.field);
  paint(stage, frame.palette);

  const count = Math.min(frame.birds.length, BIRD_CAPACITY);
  scratch.sky.set(frame.palette.sky);
  for (let i = 0; i < count; i++) {
    const bird = frame.birds[i];
    if (!bird) continue;
    scratch.rotation.setFromAxisAngle(Y, bird.yaw).multiply(scratch.bank.setFromAxisAngle(X, bird.bank));
    scratch.size.setScalar(bird.fade);
    scratch.matrix.compose(scratch.position.set(...bird.position), scratch.rotation, scratch.size);
    stage.birds.setMatrixAt(i, scratch.matrix);
    stage.birds.setColorAt(i, scratch.color.set(bird.color).lerp(scratch.sky, 1 - bird.fade));
  }
  stage.birds.count = count;
  stage.birds.instanceMatrix.needsUpdate = true;
  if (stage.birds.instanceColor) stage.birds.instanceColor.needsUpdate = true;

  showMarkers(stage, frame.beacons, frame.obstacles);
}
