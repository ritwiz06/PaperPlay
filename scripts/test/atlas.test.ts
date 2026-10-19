import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changeWords, escapeHtml, galleryContent, galleryPage, type Atlas, type Shot } from "../atlas/gallery.ts";
import { KNOWN_ISSUES } from "../atlas/known-issues.ts";

// The atlas's gallery (ADR-0050): grouped by world and then level, each shot captioned with its
// route, its level's title, its control, its readout and any known issue, and marked where it
// changed since the previous atlas. The run itself drives a browser, so `npm run atlas` is not a
// test; what it writes is.
const root = join(import.meta.dirname, "..", "..");
const library = JSON.parse(readFileSync(join(root, "apps", "web", "src", "library", "worlds.json"), "utf8")) as { worlds: { id: string; levels: { order: number }[] }[] };

const shot = (over: Partial<Shot>): Shot => ({
  key: "momentum-valley/1/opened/desktop",
  world: "momentum-valley",
  route: "/world/momentum",
  size: "desktop",
  state: "opened",
  label: "Level 1, opened",
  file: "shots/momentum-valley--1--opened--desktop.jpg",
  strip: { file: "strips/momentum-valley--1--desktop.jpg", index: 0, count: 7 },
  width: 1440,
  height: 900,
  level: { order: 1, title: "Momentum crosses the valley" },
  control: "Momentum: 0.9",
  readout: "The ball is still high up the slope",
  issues: [],
  sha256: "0".repeat(64),
  change: { kind: "same" },
  ...over,
});

const atlas: Atlas = {
  schemaVersion: "atlas/1",
  date: "2026-10-18",
  commit: "b37c7dcec68a44cadf109901993ae06035ddd2d0",
  previous: "2026-10-11",
  worlds: [
    {
      id: "momentum-valley",
      title: "Momentum Valley",
      route: "/world/momentum",
      status: "verified",
      family: "Learning",
      paper: "On the importance of initialization and momentum in deep learning",
      levels: [
        { order: 1, title: "Momentum crosses the valley", bonus: false },
        { order: 2, title: "Speed builds up", bonus: false },
      ],
      issues: ["The camera frames the surface to the right of the level card."],
    },
  ],
  shots: [
    shot({}),
    shot({ key: "momentum-valley/1/fork-finished/desktop", state: "fork-finished", strip: { file: "strips/momentum-valley--1--desktop.jpg", index: 4, count: 7 }, readout: "The longest step: this world 1.03, what if 0.43.", change: { kind: "changed", fraction: 0.031 } }),
    shot({ key: "momentum-valley/2/opened/phone", size: "phone", width: 390, height: 844, level: { order: 2, title: "Speed builds up" }, issues: ["Axe: color-contrast, Elements must meet contrast <ratios> (1 element)"], change: { kind: "new" } }),
    shot({ key: "routes/-library/desktop", world: "routes", route: "/library", state: "page", label: "Library", level: null, control: null, readout: null, strip: null }),
  ],
  clips: [{ world: "momentum-valley", level: 1, size: "desktop", file: "clips/momentum-valley--1--desktop.webm", seconds: 6, frames: 90 }],
  earlier: [{ world: "momentum-valley", label: "2026-10-17, before review", files: [{ file: "earlier/momentum-valley/a/desktop-1-opened.png", caption: "desktop 1 opened" }] }],
};

describe("the atlas's gallery", () => {
  const page = galleryContent(atlas, { published: true });

  it("groups by world and then by level, in the levels' order, the pages that are not worlds after", () => {
    const world = page.indexOf('id="momentum-valley"');
    const first = page.indexOf('id="momentum-valley-level-1"');
    const second = page.indexOf('id="momentum-valley-level-2"');
    const routes = page.indexOf('id="routes"');
    expect([world, first, second, routes].every((at) => at > 0)).toBe(true);
    expect(world < first && first < second && second < routes).toBe(true);
  });

  it("captions each shot with its route, its level's title, its control, its readout and its issues, escaped", () => {
    for (const text of ["/world/momentum", "Level 1: Momentum crosses the valley", "Momentum: 0.9", "The ball is still high up the slope", "Fork finished"]) expect(page).toContain(text);
    expect(page).toContain(escapeHtml("Axe: color-contrast, Elements must meet contrast <ratios> (1 element)"));
    expect(page).not.toContain("<ratios>");
    expect(page).toContain("The camera frames the surface to the right of the level card.");
  });

  it("marks what changed and what is new since the previous atlas, and says nothing of what is the same", () => {
    expect(page).toContain("Changed since 2026-10-11: 3.1% of pixels");
    expect(page).toContain("New since 2026-10-11");
    expect(changeWords({ kind: "same" }, "2026-10-11")).toBeNull();
    expect(changeWords({ kind: "first" }, null)).toBeNull();
    expect(galleryContent({ ...atlas, previous: null }, { published: true })).toContain("The first atlas: nothing earlier to compare with");
  });

  it("crops a published shot from its level's strip, and the atlas's own page uses each shot's file", () => {
    expect(page).toContain('src="strips/momentum-valley--1--desktop.jpg"');
    expect(page).toContain("object-position: 66.6667% 0");
    const local = galleryPage(atlas);
    expect(local.startsWith("<!doctype html>")).toBe(true);
    expect(local).toContain('src="shots/momentum-valley--1--opened--desktop.jpg"');
    expect(local).not.toContain("strips/");
  });

  it("loads nothing but its own files and Google's fonts", () => {
    const external = [...page.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((match) => new URL(match[1] ?? "").host);
    expect(new Set(external)).toEqual(new Set(["fonts.googleapis.com", "fonts.gstatic.com"]));
    expect(page).toContain('src="clips/momentum-valley--1--desktop.webm"');
    expect(page).toContain("2026-10-17, before review");
  });
});

describe("the atlas's known issues", () => {
  it("each name a world the library lists, and a level it has", () => {
    for (const known of KNOWN_ISSUES) {
      const world = library.worlds.find((entry) => entry.id === known.world);
      expect(world, known.world).toBeDefined();
      if (known.level !== null) expect(world?.levels.map((level) => level.order), `${known.world} level ${known.level}`).toContain(known.level);
    }
  });
});
