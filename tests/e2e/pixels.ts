import type { Page } from "@playwright/test";

/** Luminance variance and distinct colours of a PNG, decoded by the browser itself. */
export async function pixelStats(page: Page, png: Buffer): Promise<{ variance: number; colours: number }> {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2D context to read the screenshot");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    let squares = 0;
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luminance;
      squares += luminance * luminance;
      colours.add((r << 16) | (g << 8) | b);
    }
    const pixels = data.length / 4;
    const mean = sum / pixels;
    return { variance: squares / pixels - mean * mean, colours: colours.size };
  }, png.toString("base64"));
}
