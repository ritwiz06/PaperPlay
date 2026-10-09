import { describe, expect, it } from "vitest";
import { encodeArgs, playwrightFfmpegPath } from "../capture/ffmpeg.ts";
import { parseCaptureOptions } from "../capture/options.ts";

describe("Playwright's own ffmpeg", () => {
  const base = { revision: "1011", home: "/home/ada", coreDir: "/repo/node_modules/playwright-core" } as const;

  it("is found where Playwright installs it on each platform", () => {
    expect(playwrightFfmpegPath({ ...base, platform: "darwin", env: {}, home: "/Users/ada" })).toBe(
      "/Users/ada/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac",
    );
    expect(playwrightFfmpegPath({ ...base, platform: "linux", env: {} })).toBe("/home/ada/.cache/ms-playwright/ffmpeg-1011/ffmpeg-linux");
    expect(playwrightFfmpegPath({ ...base, platform: "linux", env: { XDG_CACHE_HOME: "/cache" } })).toBe(
      "/cache/ms-playwright/ffmpeg-1011/ffmpeg-linux",
    );
    expect(playwrightFfmpegPath({ ...base, platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\ada\\AppData\\Local" }, home: "C:\\Users\\ada" })).toBe(
      "C:\\Users\\ada\\AppData\\Local\\ms-playwright\\ffmpeg-1011\\ffmpeg-win64.exe",
    );
  });

  it("honours PLAYWRIGHT_BROWSERS_PATH, including 0 for browsers kept inside node_modules", () => {
    expect(playwrightFfmpegPath({ ...base, platform: "linux", env: { PLAYWRIGHT_BROWSERS_PATH: "/opt/pw" } })).toBe("/opt/pw/ffmpeg-1011/ffmpeg-linux");
    expect(playwrightFfmpegPath({ ...base, platform: "linux", env: { PLAYWRIGHT_BROWSERS_PATH: "0" } })).toBe(
      "/repo/node_modules/playwright-core/.local-browsers/ffmpeg-1011/ffmpeg-linux",
    );
  });

  it("refuses a platform Playwright has no ffmpeg for", () => {
    expect(() => playwrightFfmpegPath({ ...base, platform: "aix", env: {} })).toThrow(/aix/);
  });
});

describe("the encoder's arguments", () => {
  const args = encodeArgs({ fps: 30, output: "captures/demo.webm" });
  const after = (flag: string) => args[args.indexOf(flag) + 1];

  it("read JPEG frames from stdin at a fixed frame rate, never at wall-clock rate", () => {
    // pipe:0, not "-": Playwright's build has no "-" protocol, and exits at once without it.
    expect(args.slice(args.indexOf("-f"), args.indexOf("-i") + 2)).toEqual(["-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "30", "-i", "pipe:0"]);
  });

  it("write VP8 WebM, single-threaded and bit-exact, so the same frames make the same file", () => {
    expect(after("-c:v")).toBe("mjpeg");
    expect(args.lastIndexOf("-c:v")).toBeGreaterThan(args.indexOf("-i"));
    expect(args[args.lastIndexOf("-c:v") + 1]).toBe("libvpx");
    expect(after("-threads")).toBe("1");
    expect(after("-fflags")).toBe("+bitexact");
    expect(after("-flags:v")).toBe("+bitexact");
    expect(after("-map_metadata")).toBe("-1");
    expect(args.at(-1)).toBe("captures/demo.webm");
  });
});

describe("the capture's options", () => {
  it("writes only the videos by default, and a lossless PNG sequence too with --frames", () => {
    expect(parseCaptureOptions([])).toEqual({ frames: false });
    expect(parseCaptureOptions(["--frames"])).toEqual({ frames: true });
  });

  it("refuses anything else, rather than ignore a typo", () => {
    expect(() => parseCaptureOptions(["--frame"])).toThrow(/--frame/);
    expect(() => parseCaptureOptions(["--frames", "extra"])).toThrow(/extra/);
  });
});
