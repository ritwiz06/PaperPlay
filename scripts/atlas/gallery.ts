/**
 * The atlas's gallery (ADR-0050): one page, grouped by world and then by level, each shot captioned
 * with its route, its level's title, its control, its readout and any known issue, and marked where
 * it changed since the previous atlas. The page is plain HTML with its styles and a little script
 * for the size filter and the enlarged view; it loads only its own files and two Google fonts, so
 * it works opened from the atlas's folder and published as an artifact alike.
 */

export type Size = "desktop" | "phone";
export const SIZES: Readonly<Record<Size, { readonly width: number; readonly height: number }>> = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};

/** The states the atlas shoots every level in, in the order a learner meets them. */
export const LEVEL_STATES = ["opened", "moved", "prediction", "fork-running", "fork-finished", "journal", "depth"] as const;
export type LevelState = (typeof LEVEL_STATES)[number];

export const STATE_NAMES: Readonly<Record<LevelState | "page" | "storyboard", string>> = {
  opened: "Opened",
  moved: "After moving the control",
  prediction: "Prediction asked",
  "fork-running": "Fork running",
  "fork-finished": "Fork finished",
  journal: "Journal open",
  depth: "Depth switched to Advanced",
  page: "Page",
  storyboard: "Storyboard",
};

export type Change =
  | { readonly kind: "first" }
  | { readonly kind: "new" }
  | { readonly kind: "same" }
  | { readonly kind: "changed"; readonly fraction: number }
  | { readonly kind: "not-compared"; readonly why: string };

export interface Shot {
  /** world/level/state/size, or world/page-name/size: the same key in every atlas. */
  readonly key: string;
  /** The world's id, or "routes" for a page that is not a world. */
  readonly world: string;
  readonly route: string;
  readonly size: Size;
  readonly state: LevelState | "page" | "storyboard";
  /** What the shot shows, in words: a page's name, or a storyboard's job. */
  readonly label: string;
  /** The shot's own file, relative to the atlas's folder. */
  readonly file: string;
  /** The strip it is published in, when the level's shots are joined into one picture. */
  readonly strip: { readonly file: string; readonly index: number; readonly count: number } | null;
  readonly width: number;
  readonly height: number;
  readonly level: { readonly order: number; readonly title: string } | null;
  /** The level's control as it stood: its label and its value. */
  readonly control: string | null;
  /** The level's readout as it stood, or the fork's measured result. */
  readonly readout: string | null;
  /** Issues: the level's known ones and what the atlas found in this shot. */
  readonly issues: readonly string[];
  readonly sha256: string;
  readonly change: Change;
}

export interface Clip {
  readonly world: string;
  readonly level: number;
  readonly size: Size;
  readonly file: string;
  readonly seconds: number;
  readonly frames: number;
}

export interface AtlasWorld {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly status: "verified" | "draft" | "generated";
  readonly family: string;
  readonly paper: string;
  readonly levels: readonly { readonly order: number; readonly title: string; readonly bonus: boolean }[];
  /** Issues of the whole world. */
  readonly issues: readonly string[];
}

export interface EarlierSet {
  readonly world: string;
  /** When the set was taken, and by what. */
  readonly label: string;
  readonly files: readonly { readonly file: string; readonly caption: string }[];
}

export interface Atlas {
  readonly schemaVersion: "atlas/1";
  readonly date: string;
  readonly commit: string;
  /** The atlas this one is compared with, by its folder's name, or null for the first. */
  readonly previous: string | null;
  readonly worlds: readonly AtlasWorld[];
  readonly shots: readonly Shot[];
  readonly clips: readonly Clip[];
  readonly earlier: readonly EarlierSet[];
}

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);

const STATUS_NAMES = { verified: "Verified", draft: "Draft", generated: "Generated" } as const;

export function changeWords(change: Change, previous: string | null): string | null {
  switch (change.kind) {
    case "first":
    case "same":
      return null;
    case "new":
      return previous ? `New since ${previous}` : null;
    case "changed":
      return `Changed since ${previous ?? "the last atlas"}: ${(change.fraction * 100).toFixed(change.fraction < 0.01 ? 2 : 1)}% of pixels`;
    case "not-compared":
      return `Not compared: ${change.why}`;
  }
}

/** The picture of one shot: its own file, or its slice of a strip, cropped by object-position. */
function picture(shot: Shot, published: boolean): string {
  const ratio = `${shot.width} / ${shot.height}`;
  if (published && shot.strip) {
    const at = shot.strip.count > 1 ? (shot.strip.index / (shot.strip.count - 1)) * 100 : 0;
    return `<img src="${escapeHtml(shot.strip.file)}" alt="" loading="lazy" decoding="async" style="aspect-ratio: ${ratio}; object-position: ${at.toFixed(4)}% 0">`;
  }
  return `<img src="${escapeHtml(shot.file)}" alt="" loading="lazy" decoding="async" style="aspect-ratio: ${ratio}">`;
}

function tile(shot: Shot, previous: string | null, published: boolean): string {
  const change = changeWords(shot.change, previous);
  const marks = [shot.change.kind === "changed" ? "changed" : "", shot.change.kind === "new" ? "new" : "", shot.issues.length > 0 ? "issue" : ""].filter(Boolean).join(" ");
  const caption = [
    `<span class="tile-state">${escapeHtml(shot.state === "page" || shot.state === "storyboard" ? shot.label : STATE_NAMES[shot.state])}</span>`,
    `<span class="tile-route">${escapeHtml(shot.route)}</span>`,
    shot.level ? `<span class="tile-level">Level ${shot.level.order}: ${escapeHtml(shot.level.title)}</span>` : "",
    shot.control ? `<span class="tile-line"><b>Control</b> ${escapeHtml(shot.control)}</span>` : "",
    shot.readout ? `<span class="tile-line"><b>Readout</b> ${escapeHtml(shot.readout)}</span>` : "",
    ...shot.issues.map((issue) => `<span class="chip chip-issue">${escapeHtml(issue)}</span>`),
    change ? `<span class="chip chip-${shot.change.kind}">${escapeHtml(change)}</span>` : "",
  ]
    .filter(Boolean)
    .join("");
  return `<figure class="tile tile-${shot.size}" data-size="${shot.size}" data-marks="${marks}">
<button type="button" class="tile-open" aria-label="Enlarge: ${escapeHtml(shot.label)}, ${shot.size}">${picture(shot, published)}</button>
<figcaption>${caption}</figcaption>
</figure>`;
}

function sizeRow(shots: readonly Shot[], size: Size, previous: string | null, published: boolean, clip: Clip | undefined): string {
  if (shots.length === 0) return "";
  const { width, height } = SIZES[size];
  const video = clip
    ? `<figure class="tile tile-${size} tile-clip" data-size="${size}" data-marks=""><video src="${escapeHtml(clip.file)}" controls muted loop playsinline preload="metadata" style="aspect-ratio: ${width} / ${height}"></video><figcaption><span class="tile-state">Clip, ${clip.seconds} s</span><span class="tile-line">Played, its control moved to the top of its range and back.</span></figcaption></figure>`
    : "";
  return `<div class="size-row" data-size="${size}">
<p class="size-name">${width} × ${height}</p>
<div class="strip-scroll">${shots.map((shot) => tile(shot, previous, published)).join("\n")}${video}</div>
</div>`;
}

const byState = (a: Shot, b: Shot): number => LEVEL_STATES.indexOf(a.state as LevelState) - LEVEL_STATES.indexOf(b.state as LevelState);

function worldSection(world: AtlasWorld, atlas: Atlas, published: boolean): string {
  const shots = atlas.shots.filter((shot) => shot.world === world.id);
  const pages = shots.filter((shot) => shot.level === null);
  const earlier = atlas.earlier.filter((set) => set.world === world.id);
  const levels = world.levels.map((level) => {
    const own = shots.filter((shot) => shot.level?.order === level.order).sort(byState);
    const known = [...new Set(own.flatMap((shot) => shot.issues))];
    const control = own.find((shot) => shot.state === "opened")?.control ?? own[0]?.control ?? "";
    const label = control.split(":")[0] ?? "";
    return `<article class="level" id="${escapeHtml(world.id)}-level-${level.order}">
<h3>Level ${level.order}${level.bonus ? " (bonus)" : ""}: ${escapeHtml(level.title)}</h3>
<p class="level-meta"><span class="mono">${escapeHtml(world.route)}</span>${label ? ` · its control: ${escapeHtml(label)}` : ""}${known.length > 0 ? ` · <span class="issue-count">${known.length} known ${known.length === 1 ? "issue" : "issues"}</span>` : ""}</p>
${(["desktop", "phone"] as const)
  .map((size) =>
    sizeRow(
      own.filter((shot) => shot.size === size),
      size,
      atlas.previous,
      published,
      atlas.clips.find((clip) => clip.world === world.id && clip.level === level.order && clip.size === size),
    ),
  )
  .join("\n")}
</article>`;
  });
  return `<section class="world" id="${escapeHtml(world.id)}" aria-labelledby="${escapeHtml(world.id)}-title">
<header class="world-head">
<h2 id="${escapeHtml(world.id)}-title">${escapeHtml(world.title)}</h2>
<p class="world-meta"><span class="status status-${world.status}">${STATUS_NAMES[world.status]}</span> <span class="mono">${escapeHtml(world.route)}</span> · ${escapeHtml(world.family)} · <cite>${escapeHtml(world.paper)}</cite></p>
${world.issues.length > 0 ? `<ul class="world-issues">${world.issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}
</header>
${pages.length > 0 ? `<article class="level"><h3>Its job's storyboard</h3><p class="level-meta"><span class="mono">/create</span>, the job's own events played back</p>${(["desktop", "phone"] as const).map((size) => sizeRow(pages.filter((shot) => shot.size === size), size, atlas.previous, published, undefined)).join("\n")}</article>` : ""}
${levels.join("\n")}
${
  earlier.length > 0
    ? `<details class="earlier"><summary>Earlier shots, ${earlier.length} ${earlier.length === 1 ? "set" : "sets"} from before the atlas</summary>${earlier
        .map(
          (set) =>
            `<h4>${escapeHtml(set.label)}</h4><div class="strip-scroll">${set.files
              .map((file) => `<figure class="tile tile-earlier"><img src="${escapeHtml(file.file)}" alt="" loading="lazy" decoding="async"><figcaption><span class="tile-state">${escapeHtml(file.caption)}</span></figcaption></figure>`)
              .join("")}</div>`,
        )
        .join("")}</details>`
    : ""
}
</section>`;
}

function routesSection(atlas: Atlas, published: boolean): string {
  const shots = atlas.shots.filter((shot) => shot.world === "routes");
  if (shots.length === 0) return "";
  const names = [...new Set(shots.map((shot) => shot.label))];
  return `<section class="world" id="routes" aria-labelledby="routes-title">
<header class="world-head"><h2 id="routes-title">Pages that are not worlds</h2><p class="world-meta">The library, the page that makes a world, the lab bench and the page for a path with nothing on it.</p></header>
${names
  .map((name) => {
    const own = shots.filter((shot) => shot.label === name);
    return `<article class="level"><h3>${escapeHtml(name)}</h3><p class="level-meta"><span class="mono">${escapeHtml(own[0]?.route ?? "")}</span></p>${(["desktop", "phone"] as const).map((size) => sizeRow(own.filter((shot) => shot.size === size), size, atlas.previous, published, undefined)).join("\n")}</article>`;
  })
  .join("\n")}
</section>`;
}

const STYLE = `
/* A review sheet: a quiet bar of filters, then each world's levels as rows of shots, captions under each. */
:root {
  --cream: #f8faee; --ink: #172b2b; --dark: #132b2b; --aqua: #62cbc2; --lime: #d4f581; --line: #d2ddd3; --sub: #526a66;
  --bg: var(--cream); --panel: #ffffff; --text: var(--ink); --muted: var(--sub); --rule: var(--line);
  --issue-bg: #fbe3d6; --issue-text: #7a2d10; --changed-bg: var(--lime); --changed-text: var(--ink); --new-bg: #d7f1ee; --new-text: #0f4a45;
  --font-ui: "Fredoka", ui-rounded, system-ui, sans-serif; --font-text: "Literata", Georgia, serif; --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark; --bg: #102424; --panel: #172b2b; --text: #eef3e4; --muted: #a9bdb6; --rule: #2f4a47;
    --issue-bg: #4a2414; --issue-text: #ffd9c4; --changed-bg: #4b5a1f; --changed-text: #f2fbd9; --new-bg: #19413d; --new-text: #c8f1ec;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark; --bg: #102424; --panel: #172b2b; --text: #eef3e4; --muted: #a9bdb6; --rule: #2f4a47;
  --issue-bg: #4a2414; --issue-text: #ffd9c4; --changed-bg: #4b5a1f; --changed-text: #f2fbd9; --new-bg: #19413d; --new-text: #c8f1ec;
}
body { background: var(--bg); color: var(--text); font-family: var(--font-ui); font-size: 15px; line-height: 1.45; }
.atlas { max-width: 96rem; margin: 0 auto; padding-inline: 20px; padding-block: 24px 64px; }
h1, h2, h3, h4 { text-wrap: balance; margin: 0; font-weight: 600; }
h1 { font-size: 1.9rem; line-height: 1.15; }
h2 { font-size: 1.45rem; }
h3 { font-size: 1.08rem; }
h4 { font-size: 0.95rem; margin-top: 12px; }
cite { font-family: var(--font-text); font-style: italic; }
.mono { font-family: var(--font-mono); font-size: 0.86em; }
.intro { max-width: 62ch; color: var(--muted); margin: 6px 0 0; }
.summary { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 14px 0 0; padding: 0; list-style: none; font-variant-numeric: tabular-nums; }
.summary b { font-size: 1.15rem; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin: 18px -20px 0; padding: 10px 20px; background: var(--bg); border-bottom: 1px solid var(--rule); }
.bar fieldset { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; border: 0; }
.bar legend { float: left; margin-right: 6px; color: var(--muted); font-size: 0.9rem; line-height: 30px; }
.bar label { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border: 1.5px solid var(--rule); border-radius: 999px; cursor: pointer; font-size: 0.9rem; }
.bar input { position: absolute; opacity: 0; pointer-events: none; }
.bar label:has(input:checked) { background: var(--text); border-color: var(--text); color: var(--bg); }
.bar label:has(input:focus-visible) { outline: 3px solid var(--aqua); outline-offset: 2px; }
.index { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; padding: 0; list-style: none; font-size: 0.92rem; }
.index a { color: var(--text); text-underline-offset: 3px; }
.world { margin-top: 40px; padding-top: 20px; border-top: 2px solid var(--text); }
.world, .level { scroll-margin-top: calc(env(safe-area-inset-top, 0px) + 140px); }
.world-meta, .level-meta { margin: 4px 0 0; color: var(--muted); font-size: 0.92rem; }
.status { display: inline-block; padding: 0 9px; border: 1.5px solid var(--text); border-radius: 999px; color: var(--ink); font-weight: 600; font-size: 0.85rem; }
.status-verified { background: var(--lime); }
.status-draft { background: var(--cream); border-style: dashed; }
.status-generated { background: var(--aqua); }
.world-issues { margin: 10px 0 0; padding-left: 1.2rem; max-width: 80ch; color: var(--issue-text); }
.issue-count { color: var(--issue-text); font-weight: 600; }
.level { margin-top: 26px; }
.size-row { margin-top: 10px; }
.size-name { margin: 0 0 6px; color: var(--muted); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
.strip-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x proximity; }
.tile { flex: none; margin: 0; scroll-snap-align: start; display: grid; gap: 6px; align-content: start; }
.tile-desktop { width: 300px; }
.tile-phone { width: 150px; }
.tile-earlier { width: 260px; }
.tile-open { display: block; width: 100%; padding: 0; border: 1.5px solid var(--rule); border-radius: 8px; overflow: hidden; background: var(--rule); cursor: zoom-in; }
.tile-open:focus-visible { outline: 3px solid var(--aqua); outline-offset: 2px; }
.tile img, .tile video { display: block; width: 100%; max-width: 100%; height: auto; object-fit: cover; }
.tile-earlier img { border: 1.5px solid var(--rule); border-radius: 8px; }
.tile video { border: 1.5px solid var(--rule); border-radius: 8px; background: var(--dark); }
.tile[data-marks~="changed"] .tile-open { border-color: #8aa63a; box-shadow: 0 0 0 2px var(--lime); }
.tile[data-marks~="new"] .tile-open { border-color: var(--aqua); }
figcaption { display: grid; gap: 3px; font-size: 0.8rem; line-height: 1.35; overflow-wrap: anywhere; }
.tile-state { font-weight: 600; font-size: 0.86rem; }
.tile-route { font-family: var(--font-mono); font-size: 0.74rem; color: var(--muted); }
.tile-level { color: var(--muted); }
.tile-line b { font-weight: 600; color: var(--muted); margin-right: 3px; }
.chip { display: block; padding: 2px 7px; border-radius: 6px; font-size: 0.76rem; }
.chip-issue { background: var(--issue-bg); color: var(--issue-text); }
.chip-changed { background: var(--changed-bg); color: var(--changed-text); }
.chip-new { background: var(--new-bg); color: var(--new-text); }
.chip-not-compared { border: 1px dashed var(--rule); color: var(--muted); }
.earlier { margin-top: 26px; }
.earlier summary { cursor: pointer; font-weight: 600; }
body[data-size="desktop"] [data-size="phone"], body[data-size="phone"] [data-size="desktop"] { display: none; }
body[data-show="changed"] .tile:not([data-marks~="changed"]):not([data-marks~="new"]),
body[data-show="issue"] .tile:not([data-marks~="issue"]) { display: none; }
dialog { width: min(96vw, 1500px); max-height: 94vh; padding: 0; border: 0; border-radius: 12px; background: var(--panel); color: var(--text); }
dialog::backdrop { background: rgb(10 24 24 / 0.72); }
.dialog-body { display: grid; gap: 12px; padding: 14px; }
.dialog-picture { overflow: auto; max-height: 76vh; }
.dialog-picture img { display: block; width: 100%; max-width: 100%; height: auto; object-fit: cover; }
.dialog-picture.phone img { width: min(100%, 420px); margin: 0 auto; }
.dialog-close { justify-self: end; height: 34px; padding: 0 14px; border: 1.5px solid var(--text); border-radius: 999px; background: transparent; color: var(--text); font: inherit; cursor: pointer; }
.dialog-close:focus-visible { outline: 3px solid var(--aqua); outline-offset: 2px; }
.dialog-caption figcaption { font-size: 0.92rem; }
@media (max-width: 640px) {
  .atlas { padding-inline: 16px; }
  .bar { position: static; margin-inline: -16px; padding-inline: 16px; }
  .world, .level { scroll-margin-top: 8px; }
  .tile-desktop { width: 240px; }
  .tile-phone { width: 130px; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
`;

const SCRIPT = `
(() => {
  const body = document.body;
  for (const input of document.querySelectorAll(".bar input")) {
    input.addEventListener("change", () => { body.dataset[input.name] = input.value; });
  }
  const dialog = document.getElementById("enlarged");
  const picture = dialog.querySelector(".dialog-picture");
  const caption = dialog.querySelector(".dialog-caption");
  document.addEventListener("click", (event) => {
    const open = event.target.closest(".tile-open");
    if (!open) return;
    const tile = open.closest(".tile");
    const image = open.querySelector("img").cloneNode();
    image.loading = "eager";
    picture.replaceChildren(image);
    picture.className = "dialog-picture " + (tile.dataset.size || "");
    caption.replaceChildren(tile.querySelector("figcaption").cloneNode(true));
    dialog.showModal();
  });
  dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
})();
`;

/**
 * The gallery's content, as the artifact's publish wraps it: its title, fonts, styles, page and
 * script, with no html, head or body tags. `published` uses the strips, so the artifact holds a
 * few hundred files rather than a thousand; the atlas's own folder uses each shot's file.
 */
export function galleryContent(atlas: Atlas, { published }: { readonly published: boolean }): string {
  const levels = atlas.worlds.reduce((sum, world) => sum + world.levels.length, 0);
  const changed = atlas.shots.filter((shot) => shot.change.kind === "changed").length;
  const added = atlas.shots.filter((shot) => shot.change.kind === "new").length;
  const issues = atlas.shots.filter((shot) => shot.issues.length > 0).length;
  const comparison = atlas.previous
    ? `<li><b>${changed}</b> changed and <b>${added}</b> new since the atlas of ${escapeHtml(atlas.previous)}</li>`
    : `<li>The first atlas: nothing earlier to compare with</li>`;
  return `<title>PaperPlay UI atlas, ${escapeHtml(atlas.date)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=Literata:ital,wght@0,400;1,400&display=swap">
<style>${STYLE}</style>
<main class="atlas">
<header>
<h1>PaperPlay UI atlas, ${escapeHtml(atlas.date)}</h1>
<p class="intro">Every route, world and level, in every state a learner reaches, at ${SIZES.desktop.width} × ${SIZES.desktop.height} and ${SIZES.phone.width} × ${SIZES.phone.height}, from commit <span class="mono">${escapeHtml(atlas.commit.slice(0, 7))}</span>. Shots of a world open still, with reduced motion, so they compare from one atlas to the next; the clips play. Select a shot to enlarge it.</p>
<ul class="summary">
<li><b>${atlas.worlds.length}</b> worlds</li>
<li><b>${levels}</b> levels</li>
<li><b>${atlas.shots.length}</b> shots</li>
<li><b>${atlas.clips.length}</b> clips</li>
<li><b>${issues}</b> shots with a known issue</li>
${comparison}
</ul>
</header>
<nav class="bar" aria-label="Filters and worlds">
<fieldset><legend>Sizes</legend>
<label><input type="radio" name="size" value="both" checked>Both</label>
<label><input type="radio" name="size" value="desktop">${SIZES.desktop.width} × ${SIZES.desktop.height}</label>
<label><input type="radio" name="size" value="phone">${SIZES.phone.width} × ${SIZES.phone.height}</label>
</fieldset>
<fieldset><legend>Show</legend>
<label><input type="radio" name="show" value="all" checked>Every shot</label>
<label><input type="radio" name="show" value="changed">Changed or new</label>
<label><input type="radio" name="show" value="issue">With an issue</label>
</fieldset>
<ul class="index">${atlas.worlds.map((world) => `<li><a href="#${escapeHtml(world.id)}">${escapeHtml(world.title)}${world.status === "generated" ? ` <span class="mono">${escapeHtml(world.id.replace(/^.*?-(\d{4}-\d{2}-\d{2}(?:-\d+)?)$/, "$1"))}</span>` : ""}</a></li>`).join("")}<li><a href="#routes">Other pages</a></li></ul>
</nav>
${atlas.worlds.map((world) => worldSection(world, atlas, published)).join("\n")}
${routesSection(atlas, published)}
</main>
<dialog id="enlarged" aria-label="Enlarged shot">
<div class="dialog-body">
<button type="button" class="dialog-close">Close</button>
<div class="dialog-picture"></div>
<div class="dialog-caption"></div>
</div>
</dialog>
<script>${SCRIPT}</script>
`;
}

/** The same content as a page of its own, to open from the atlas's folder. */
export const galleryPage = (atlas: Atlas): string =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body data-size="both" data-show="all">\n${galleryContent(atlas, { published: false })}</body>\n</html>\n`;
