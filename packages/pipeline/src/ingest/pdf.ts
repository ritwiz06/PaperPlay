/**
 * A PDF's text, the last of ingest's routes (every-paper.md §3.1; ADR-0038), read by pdfjs with
 * everything that could load or fetch turned off: no fonts loaded, no network, no forms, only the
 * bytes given. A PDF keeps no structure, so the text is laid out as the reader finds it,
 * page by page, and each page is a section: an anchor's section names its page, and its offsets
 * are characters into the text. Mathematical letters are folded to plain ones (𝛽 to β), so quotes
 * match, and a word broken across a line is joined.
 *
 * Display equations are recovered as far as a PDF allows: a numbered block of short, mathematical
 * lines, with a derivative split over two lines ("dS" above "dt = …") put back as "dS/dt = …".
 * One the PDF has drawn rather than written (a matrix built of bracket glyphs, glyphs with no text
 * behind them, a fraction split over lines) is refused, by number and reason, never guessed at.
 */
import type { ExtractedPaper, TextEquation, TextSection } from "./latex.ts";

/** Limits on what a PDF may ask of the reader. */
export const PDF_LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, pages: 200 });

export class PdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfError";
  }
}

/** A display equation the PDF does not let us read, and why. */
export interface RefusedEquation {
  readonly number: string;
  readonly page: number;
  readonly reason: string;
}

export interface PdfPaper extends ExtractedPaper {
  readonly pages: number;
  readonly refused: readonly RefusedEquation[];
}

/** Glyphs that draw a bracket's pieces, as a matrix or a tall bracket is drawn: structure the text has lost. */
const DRAWN = /[⎛-⎭]/;
/** Glyphs with no text behind them: a replacement character, the private use area, an unmapped font id. */
const UNREADABLE = /[�-]|\(cid:\d+\)/;
/** An equation's number on its own, or at the end of its last line. */
const NUMBER = /(?:^|\s)\((\d{1,3}[a-z]?)\)\.?\s*$/;

/** Whether a line reads as prose: several words of letters, as math rarely has. */
const prose = (line: string): boolean => (line.match(/\b[A-Za-z]{3,}\b/g) ?? []).length >= 5 || /:\s*$/.test(line);

/**
 * The display equations among a page's lines: each numbered block of non-prose lines above its
 * number, recovered or refused. Pure, so it is tested line by line.
 */
export function equationsOf(lines: readonly string[]): { readonly recovered: readonly { readonly number: string; readonly text: string; readonly first: number; readonly last: number }[]; readonly refused: readonly { readonly number: string; readonly reason: string }[] } {
  const recovered: { number: string; text: string; first: number; last: number }[] = [];
  const refused: { number: string; reason: string }[] = [];
  let taken = -1;
  lines.forEach((line, index) => {
    const numbered = NUMBER.exec(line);
    if (!numbered || index <= taken) return;
    const number = numbered[1] ?? "";
    const own = line.slice(0, numbered.index).trim();
    // Upwards from the number, while the lines read as mathematics and not as prose.
    let first = index;
    if (own === "" || !prose(own)) {
      while (first - 1 > taken && !prose(lines[first - 1] ?? "") && (lines[first - 1] ?? "").trim() !== "") first--;
    }
    const block = [...lines.slice(first, index), own].map((part) => part.trim()).filter((part) => part !== "");
    taken = index;
    if (block.length === 0) return;
    const joined = block.join("\n");
    if (DRAWN.test(joined)) {
      refused.push({ number, reason: "it is drawn with bracket glyphs, as a matrix or a tall bracket is, so its layout is lost" });
      return;
    }
    if (UNREADABLE.test(joined)) {
      refused.push({ number, reason: "its glyphs have no text behind them" });
      return;
    }
    // A derivative split over two lines: "dS" above "dt = …" becomes "dS/dt = …".
    const parts: string[] = [];
    for (let at = 0; at < block.length; at++) {
      const top = /^d\s*([A-Za-z][A-Za-z0-9_]*)$/.exec(block[at] ?? "");
      const bottom = /^d\s*([a-z])\s*=(.*)$/.exec(block[at + 1] ?? "");
      if (top && bottom) {
        parts.push(`d${top[1] ?? ""}/d${bottom[1] ?? ""} =${bottom[2] ?? ""}`);
        at++;
      } else parts.push(block[at] ?? "");
    }
    // Every line must state a relation or carry one on with an operator; a line that does neither
    // is half of a fraction or a term the layout split, and which half cannot be told.
    if (parts.some((part) => !/[=<>≤≥≈]/.test(part) && !/^[+\-–−×·]/.test(part))) {
      refused.push({ number, reason: "a fraction or a term is split across lines, so which part is above which is lost" });
      return;
    }
    recovered.push({ number, text: parts.join("\n"), first, last: index });
  });
  return { recovered, refused };
}

/** A page's lines as pdfjs gives its text: each item's string, a line ending where pdfjs marks one. */
function linesOf(items: readonly { readonly str?: string; readonly hasEOL?: boolean }[]): string[] {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    line += item.str;
    if (item.hasEOL) {
      lines.push(line);
      line = "";
    }
  }
  if (line.trim() !== "") lines.push(line);
  return lines.map((text) => text.normalize("NFKC").replace(/\s+$/, ""));
}

/** Joins a word broken at a line's end: "Recov-" above "ered" is "Recovered"; a line ending in a dash before a capital is left. */
function joined(lines: readonly string[]): string {
  return lines.reduce((text, line, index) => (index === 0 ? line : /[a-z]-$/.test(text) && /^[a-z]/.test(line) ? `${text.slice(0, -1)}${line}` : `${text}\n${line}`), "");
}

/** Reads a PDF's text, page by page, with its display equations recovered or refused. */
export async function extractPdf(bytes: Uint8Array): Promise<PdfPaper> {
  if (bytes.length > PDF_LIMITS.bytes) throw new PdfError(`the PDF is ${bytes.length} bytes, more than the ${PDF_LIMITS.bytes} the reader takes`);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new PdfError("the file is not a PDF: it does not begin %PDF-");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Only the bytes given: no font loaded, no fetch, no range or stream requests, no XFA forms.
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableRange: true,
    disableAutoFetch: true,
    disableStream: true,
    enableXfa: false,
    isOffscreenCanvasSupported: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  const document = await task.promise;
  try {
    if (document.numPages > PDF_LIMITS.pages) throw new PdfError(`the PDF has ${document.numPages} pages, more than the ${PDF_LIMITS.pages} the reader takes`);
    const info = (await document.getMetadata().catch(() => null))?.info as { Title?: unknown; Author?: unknown } | undefined;
    let text = "";
    const sections: TextSection[] = [];
    const equations: TextEquation[] = [];
    const refused: RefusedEquation[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const lines = linesOf((await page.getTextContent()).items as { str?: string; hasEOL?: boolean }[]);
      page.cleanup();
      const found = equationsOf(lines);
      const sectionId = `page-${number}`;
      // Each recovered equation is written into the page's text as recovered, then its number, so
      // its span holds exactly its text; a refused one keeps the PDF's own lines.
      const written: string[] = [];
      for (let at = 0; at < lines.length; ) {
        const equation = found.recovered.find((candidate) => candidate.first === at);
        if (equation) {
          written.push(`${equation.text} (${equation.number})`);
          at = equation.last + 1;
        } else written.push(lines[at++] ?? "");
      }
      const start = text.length + (text.length > 0 ? 2 : 0);
      const body = joined(written);
      text = text.length > 0 ? `${text}\n\n${body}` : body;
      sections.push({ id: sectionId, title: `Page ${number}`, start, end: text.length });
      let from = start;
      for (const equation of found.recovered) {
        const at = text.indexOf(`${equation.text} (${equation.number})`, from);
        if (at < 0) continue;
        from = at + equation.text.length;
        equations.push({ id: `${sectionId}-eq${equation.number}`, labels: [], number: equation.number, latex: equation.text, sectionId, start: at, end: at + equation.text.length });
      }
      for (const equation of found.refused) refused.push({ ...equation, page: number });
    }
    if (text.trim() === "") throw new PdfError("the PDF holds no text: it may be scanned images, which the reader does not read");
    const title = typeof info?.Title === "string" && info.Title.trim() ? info.Title.trim() : null;
    const authors = typeof info?.Author === "string" && info.Author.trim() ? info.Author.split(/\s*(?:,|;|\band\b)\s*/).filter(Boolean) : [];
    return { title, authors, text, sections, equations, macros: [], mainFile: "paper.pdf", pages: document.numPages, refused };
  } finally {
    await task.destroy();
  }
}
