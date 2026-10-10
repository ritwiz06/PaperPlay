import { readdirSync, readFileSync } from "node:fs";
import type { Agent, FlockState } from "@paperplay/primitives";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMERA, describeFrame, dusk, orbit, valleyDay, type FrameDescription, type StagePalette } from "../src/stage-core/index.ts";
import { applyFrame, BIRD_CAPACITY, createStageScene, TRAIL_WIDTH } from "../src/three-adapter/index.ts";

const agents: Agent[] = [
  { x: 8, y: 24, vx: 0, vy: 2 },
  { x: 16, y: 16, vx: 2, vy: 0 },
  { x: 0, y: 16, vx: 1, vy: 1 },
];
const world = (extra: Partial<FlockState> = {}): FlockState => ({
  width: 32,
  height: 32,
  stepIndex: 0,
  agents,
  beacons: [],
  obstacles: [],
  ...extra,
});
const frameOf = (state: FlockState, palette: StagePalette = valleyDay, camera = DEFAULT_CAMERA): FrameDescription =>
  describeFrame({ previous: state, current: state, alpha: 0, timestep: 1 / 60 }, camera, palette);

const hex = (color: THREE.Color): string => `#${color.getHexString()}`;

function expectClose(actual: ArrayLike<number>, expected: ArrayLike<number>, digits: number): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) expect(actual[i]).toBeCloseTo(expected[i] ?? Number.NaN, digits);
}

describe("Three.js stage adapter", () => {
  it("draws one instance per bird at its position, nose along its heading, and hides spare instances", () => {
    const stage = createStageScene();
    const frame = frameOf(world());
    applyFrame(stage, frame);

    expect(stage.birds.count).toBe(3);
    // Instance matrices live in a 32-bit GPU buffer, so compare to float32 precision.
    const [matrix, position, rotation, size] = [new THREE.Matrix4(), new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
    frame.birds.forEach((bird, index) => {
      stage.birds.getMatrixAt(index, matrix);
      matrix.decompose(position, rotation, size);
      if (bird.fade === 0) return;
      expectClose(position.toArray(), bird.position, 5);
      const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
      expect(nose.x).toBeCloseTo(Math.cos(-bird.yaw), 5);
      expect(nose.z).toBeCloseTo(Math.sin(-bird.yaw), 5);
    });
  });

  it("rolls a bird about its own nose by its bank angle", () => {
    const stage = createStageScene();
    const frame = frameOf(world());
    const banked: FrameDescription = { ...frame, birds: frame.birds.map((bird) => ({ ...bird, yaw: 0, bank: 0.4 })) };
    applyFrame(stage, banked);

    const [matrix, position, rotation, size] = [new THREE.Matrix4(), new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
    stage.birds.getMatrixAt(1, matrix);
    matrix.decompose(position, rotation, size);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(up.y).toBeCloseTo(Math.cos(0.4), 5);
    expect(up.z).toBeCloseTo(Math.sin(0.4), 5);
  });

  it("shrinks a bird to nothing and blends it into the sky as it fades at an edge", () => {
    const stage = createStageScene();
    const frame = frameOf(world());
    applyFrame(stage, frame);

    const edgeBird = frame.birds.findIndex((bird) => bird.fade === 0);
    expect(edgeBird).toBe(2);
    const matrix = new THREE.Matrix4();
    stage.birds.getMatrixAt(edgeBird, matrix);
    expect(matrix.determinant()).toBeCloseTo(0, 12);
    const color = new THREE.Color();
    stage.birds.getColorAt(edgeBird, color);
    expect(hex(color)).toBe(valleyDay.sky);
    stage.birds.getColorAt(1, color);
    expect(hex(color)).toBe(valleyDay.bird);
  });

  it("scales each bird by its size, so a selected bird is drawn larger", () => {
    const stage = createStageScene();
    const frame = frameOf(world());
    applyFrame(stage, { ...frame, birds: frame.birds.map((bird, index) => (index === 1 ? { ...bird, size: 1.6 } : bird)) });
    const [matrix, position, rotation, size] = [new THREE.Matrix4(), new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
    stage.birds.getMatrixAt(1, matrix);
    matrix.decompose(position, rotation, size);
    expectClose(size.toArray(), [1.6, 1.6, 1.6], 5);
  });

  it("draws each ring as a flat band at its position and radius, in its colour, and drops rings no longer described", () => {
    const stage = createStageScene();
    const frame = frameOf(world());
    applyFrame(stage, {
      ...frame,
      rings: [
        { key: "reach", position: [0, 3.2, 0], radius: 9, color: valleyDay.reach },
        { key: "cursor", position: [-6, 0, 4], radius: 1.2, color: valleyDay.cursor },
      ],
    });
    const reach = stage.rings.get("reach");
    expect(reach?.position.toArray()).toEqual([0, 3.2, 0]);
    expect(hex((reach?.material as THREE.MeshBasicMaterial).color)).toBe(valleyDay.reach);
    const band = (reach?.geometry as THREE.RingGeometry).parameters;
    expect((band.innerRadius + band.outerRadius) / 2).toBeCloseTo(9, 9);
    expect(stage.rings.get("cursor")?.position.toArray()).toEqual([-6, 0, 4]);

    applyFrame(stage, { ...frame, rings: [{ key: "reach", position: [1, 3.2, 1], radius: 4, color: valleyDay.reach }] });
    expect(stage.rings.get("reach")).toBe(reach);
    expect(((reach?.geometry as THREE.RingGeometry).parameters.innerRadius + (reach?.geometry as THREE.RingGeometry).parameters.outerRadius) / 2).toBeCloseTo(4, 9);
    expect(stage.rings.has("cursor")).toBe(false);

    applyFrame(stage, frame);
    expect(stage.rings.size).toBe(0);
    expect(reach?.parent).toBeNull();
  });

  it("keeps the fog band the same distance beyond the field's centre however far the camera stands", () => {
    const stage = createStageScene();
    const fogFromCentre = (camera: typeof DEFAULT_CAMERA) => {
      const frame = frameOf(world(), valleyDay, camera);
      applyFrame(stage, frame);
      const fog = stage.scene.fog as THREE.Fog;
      const centre = Math.hypot(...frame.camera.eye.map((value, axis) => value - (frame.camera.target[axis] ?? 0)));
      return [fog.near - centre, fog.far - centre];
    };
    const near = fogFromCentre(DEFAULT_CAMERA);
    expect(near[0]).toBeCloseTo(4, 9);
    expect(near[1]).toBeCloseTo(92, 9);
    const far = fogFromCentre({ ...DEFAULT_CAMERA, distance: 96, aspect: 0.5 });
    expect(far[0]).toBeCloseTo(near[0] ?? Number.NaN, 9);
    expect(far[1]).toBeCloseTo(near[1] ?? Number.NaN, 9);
  });

  it("holds as many birds as the primitive allows", () => {
    const stage = createStageScene();
    const many: Agent[] = Array.from({ length: BIRD_CAPACITY }, (_, i) => ({ x: 4 + (i % 20), y: 4 + Math.floor(i / 20), vx: 1, vy: 0 }));
    applyFrame(stage, frameOf(world({ agents: many })));
    expect(BIRD_CAPACITY).toBe(400);
    expect(stage.birds.count).toBe(400);
  });

  it("lights a rock while a bird is at it, with a material of the same kind, so no new shader is needed, and casts no rock shadow", () => {
    const stage = createStageScene();
    const rocky = world({ obstacles: [{ id: "rock-1", x: 20, y: 10 }, { id: "rock-2", x: 4, y: 4 }] });
    const lit = describeFrame({ previous: rocky, current: rocky, alpha: 0, timestep: 1 / 60 }, DEFAULT_CAMERA, valleyDay, { touched: ["rock-2"] });
    applyFrame(stage, lit);
    const parts = (key: string) => (stage.markers.get(key)?.children ?? []).filter((part): part is THREE.Mesh => part instanceof THREE.Mesh);
    expect(parts("rock-1").map((part) => part.material)).toEqual([stage.obstacleMaterial]);
    expect(parts("rock-2").map((part) => part.material)).toEqual([stage.touchedMaterial]);
    expect(hex(stage.touchedMaterial.color)).toBe(valleyDay.touched);
    expect(hex(stage.touchedMaterial.emissive)).toBe(valleyDay.touched);
    // The same kind of material with the same settings shares one shader program.
    const settings = (material: THREE.MeshStandardMaterial) => [material.type, material.flatShading, material.side, material.vertexColors, material.transparent];
    expect(settings(stage.touchedMaterial)).toEqual(settings(stage.obstacleMaterial));
    // A rock in the shadow pass stalled a new stage for 1.7 s (2026-10-09); rocks cast none.
    expect([...parts("rock-1"), ...parts("rock-2")].every((part) => !part.castShadow && part.receiveShadow)).toBe(true);

    applyFrame(stage, frameOf(rocky));
    expect(parts("rock-2").map((part) => part.material)).toEqual([stage.obstacleMaterial]);
  });

  it("adds, moves and removes beacons and obstacles by key", () => {
    const stage = createStageScene();
    applyFrame(stage, frameOf(world({ beacons: [{ id: "beacon-1", x: 4, y: 28 }], obstacles: [{ id: "rock-1", x: 20, y: 10 }] })));
    const beacon = stage.markers.get("beacon-1");
    expect(beacon?.position.toArray()).toEqual([-12, 0, 12]);
    expect(stage.markers.get("rock-1")?.position.toArray()).toEqual([4, 0, -6]);

    applyFrame(stage, frameOf(world({ beacons: [{ id: "beacon-1", x: 10, y: 10 }] })));
    expect(stage.markers.get("beacon-1")).toBe(beacon);
    expect(beacon?.position.toArray()).toEqual([-6, 0, -6]);
    expect(stage.markers.has("rock-1")).toBe(false);

    applyFrame(stage, frameOf(world()));
    expect(stage.markers.size).toBe(0);
    expect(beacon?.parent).toBeNull();
  });

  it("points the camera exactly where the frame says: its matrices match the stage core's", () => {
    const stage = createStageScene();
    const frame = frameOf(world(), valleyDay, orbit(DEFAULT_CAMERA, 1.1, -0.2));
    applyFrame(stage, frame);
    stage.camera.updateMatrixWorld();

    expectClose(stage.camera.position.toArray(), frame.camera.eye, 9);
    expectClose(stage.camera.projectionMatrix.elements, frame.camera.projection, 9);
    expectClose(stage.camera.matrixWorldInverse.elements, frame.camera.view, 9);
  });

  it("draws an off-centre view exactly as the frame frames it, inside the HUD's free window", () => {
    const stage = createStageScene();
    const window = { left: 0.33, top: 0.09, width: 0.66, height: 0.88 };
    const frame = frameOf(world(), valleyDay, { ...orbit(DEFAULT_CAMERA, 0.4, 0), window });
    applyFrame(stage, frame);
    stage.camera.updateMatrixWorld();

    expectClose(stage.camera.projectionMatrix.elements, frame.camera.projection, 9);
    expectClose(stage.camera.projectionMatrixInverse.clone().multiply(stage.camera.projectionMatrix).elements, new THREE.Matrix4().elements, 9);
  });

  it("repaints the sky, fog, valley and markers when the palette changes", () => {
    const stage = createStageScene();
    applyFrame(stage, frameOf(world({ beacons: [{ id: "beacon-1", x: 4, y: 28 }] })));
    expect(hex(stage.scene.background as THREE.Color)).toBe(valleyDay.sky);

    applyFrame(stage, frameOf(world({ beacons: [{ id: "beacon-1", x: 4, y: 28 }] }), dusk));
    expect(hex(stage.scene.background as THREE.Color)).toBe(dusk.sky);
    expect(hex((stage.scene.fog as THREE.Fog).color)).toBe(dusk.sky);
    expect(hex(stage.waterMaterial.color)).toBe(dusk.water);
    expect(hex(stage.crownMaterial.color)).toBe(dusk.foliage);
    expect(hex(stage.sunDisc.material.color)).toBe(dusk.sunDisc);
    expect(hex(stage.beaconMaterial.color)).toBe(dusk.beacon);
  });

  it("hinges each wing at its bird's side and raises it by the flap angle, both wings alike", () => {
    const stage = createStageScene();
    const frame = frameOf(world());
    applyFrame(stage, { ...frame, birds: frame.birds.map((bird) => ({ ...bird, yaw: 0, bank: 0, flap: 0.5 })) });
    const [body, wing, tip] = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Vector3()];
    stage.birds.getMatrixAt(1, body);
    const centre = new THREE.Vector3().setFromMatrixPosition(body);
    for (const [index, side] of [[0, 1], [1, -1]] as const) {
      stage.wings[index].getMatrixAt(1, wing);
      tip.set(-0.3, 0.04, 1.02 * side).applyMatrix4(wing);
      expect(tip.y - centre.y, `wing ${index}`).toBeCloseTo(0.03 + Math.sin(0.5) * 1.02 + Math.cos(0.5) * 0.04, 4);
      expect(Math.sign(tip.z - centre.z)).toBe(side);
    }
    expect(stage.wings.map((part) => part.count)).toEqual([3, 3]);
  });

  it("draws each trail as a flat ribbon that tapers and fades from nothing at the oldest point to its full width and opacity at the bird", () => {
    const stage = createStageScene();
    const frame = frameOf(world());
    applyFrame(stage, { ...frame, trails: [{ points: [[0, 3, 0], [1, 3, 0], [2, 3, 0]], color: valleyDay.bird, fade: 1 }] });
    // Two segments, two triangles each.
    expect(stage.trails.geometry.drawRange.count).toBe(12);
    const [position, color] = [stage.trails.geometry.getAttribute("position"), stage.trails.geometry.getAttribute("color")];
    const vertices = [...Array(12).keys()].map((i) => ({ x: position.getX(i), z: position.getZ(i), alpha: color.getW(i) }));
    const atOldest = vertices.filter((v) => Math.abs(v.x) < 1e-6);
    const atBird = vertices.filter((v) => Math.abs(v.x - 2) < 1e-6);
    expect(Math.max(...atOldest.map((v) => Math.abs(v.z)))).toBeCloseTo(0, 6);
    expect(Math.max(...atOldest.map((v) => v.alpha))).toBe(0);
    expect(Math.max(...atBird.map((v) => v.z)) - Math.min(...atBird.map((v) => v.z))).toBeCloseTo(TRAIL_WIDTH, 5);
    expect(Math.max(...atBird.map((v) => v.alpha))).toBeCloseTo(0.85, 5);
    for (const v of vertices) expect(position.getY(vertices.indexOf(v))).toBeCloseTo(3, 6);
  });

  it("puts the meadow under the flight field, and the lake, trees and rocks only outside it", () => {
    const stage = createStageScene();
    applyFrame(stage, frameOf(world()));
    const ground = stage.shown.ground;
    if (!ground) throw new Error("no ground was built");
    const [position, color] = [ground.geometry.getAttribute("position"), ground.geometry.getAttribute("color")];
    let checked = 0;
    for (let vertex = 0; vertex < position.count; vertex += 3) {
      if (Math.abs(position.getX(vertex)) > 10 || Math.abs(position.getZ(vertex)) > 10) continue;
      expect(`#${new THREE.Color(color.getX(vertex), color.getY(vertex), color.getZ(vertex)).getHexString()}`).toBe(valleyDay.meadow);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
    const scenery = stage.shown.scenery;
    if (!scenery) throw new Error("no scenery was built");
    const matrix = new THREE.Matrix4();
    let placed = 0;
    scenery.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix);
        const spot = new THREE.Vector3().setFromMatrixPosition(matrix);
        expect(Math.max(Math.abs(spot.x), Math.abs(spot.z)), "a tree or rock on the field").toBeGreaterThan(16 + 2);
        placed++;
      }
    });
    expect(placed).toBeGreaterThan(100);
    expect(scenery.children.some((child) => child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh))).toBe(true);
  });

  it("colours the sky from the palette's horizon up to its zenith", () => {
    const stage = createStageScene();
    applyFrame(stage, frameOf(world()));
    const [position, color] = [stage.sky.geometry.getAttribute("position"), stage.sky.geometry.getAttribute("color")];
    const top = [...Array(position.count).keys()].reduce((best, i) => (position.getY(i) > position.getY(best) ? i : best), 0);
    const low = [...Array(position.count).keys()].find((i) => Math.abs(position.getY(i)) < 1e-6) ?? 0;
    expect(`#${new THREE.Color(color.getX(top), color.getY(top), color.getZ(top)).getHexString()}`).toBe(valleyDay.skyZenith);
    expect(`#${new THREE.Color(color.getX(low), color.getY(low), color.getZ(low)).getHexString()}`).toBe(valleyDay.sky);
  });

  it("never imports simulation code: it can only draw what a frame description tells it", () => {
    const dir = new URL("../src/three-adapter/", import.meta.url);
    const sources = readdirSync(dir).filter((file) => file.endsWith(".ts")).map((file) => readFileSync(new URL(file, dir), "utf8"));
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) expect(source).not.toMatch(/@paperplay\/(primitives|contracts)/);
  });
});
