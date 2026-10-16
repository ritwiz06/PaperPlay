import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { equationsOf, extractPdf, fromOwnerPdf, PdfError, registerAndText } from "../src/ingest/index.ts";
import { anchorOf } from "../src/transcribe/convert.ts";

// PDF ingest (ADR-0038), on the hepatitis C paper's PDF as PLOS ONE publishes it under CC BY
// (fixtures/sources/pdf/), and on equations written out line by line: text page by page, each page
// a section that anchors name; display equations recovered where the text holds them, and refused,
// by number and reason, where the PDF draws them.

const root = join(import.meta.dirname, "..", "..", "..");
const bytes = new Uint8Array(readFileSync(join(root, "fixtures", "sources", "pdf", "pmc-PMC12334037.pdf")));

describe("[R09] PDF ingest", () => {
  it("recovers a numbered system, a derivative's two lines put back, and leaves prose alone", () => {
    const lines = ["is governed by the following system of ordinary differential equations (ODEs):", "dS", "dt = b – (μ + λ)S,", "dI", "dt = λS – rI.", "(3)", "Since the model deals with a population, we show that all solutions stay positive."];
    expect(equationsOf(lines)).toEqual({ recovered: [{ number: "3", text: "dS/dt = b – (μ + λ)S,\ndI/dt = λS – rI.", first: 1, last: 5 }], refused: [] });
    expect(equationsOf(["N = S + I + R. (1)"]).recovered.map((equation) => [equation.number, equation.text])).toEqual([["1", "N = S + I + R."]]);
  });

  it("refuses, saying why, an equation drawn with bracket glyphs, one with glyphs behind no text, and a fraction split over lines", () => {
    expect(equationsOf(["F =", "⎛", "⎜", "b𝛽1 0", "⎞", ". (6)"]).refused).toEqual([{ number: "6", reason: "it is drawn with bracket glyphs, as a matrix or a tall bracket is, so its layout is lost" }]);
    expect(equationsOf(["x = � + 1 (2)"]).refused).toEqual([{ number: "2", reason: "its glyphs have no text behind them" }]);
    expect(equationsOf(["E0 = ( b", "μ , 0, 0, 0, 0) . (5)"]).refused).toEqual([{ number: "5", reason: "a fraction or a term is split across lines, so which part is above which is lost" }]);
  });

  it("reads the hepatitis C paper's PDF page by page, its letters folded and its broken words joined", async () => {
    const paper = await extractPdf(bytes);
    expect(paper.pages).toBe(19);
    expect(paper.sections.map((section) => section.id)).toEqual(Array.from({ length: 19 }, (_, index) => `page-${index + 1}`));
    for (const [index, section] of paper.sections.entries()) {
      expect(section.end).toBeGreaterThan(section.start);
      if (index > 0) expect(section.start).toBe((paper.sections[index - 1]?.end ?? 0) + 2);
    }
    expect(paper.title).toBe("Modeling the effects of treatment adherence challenges on the transmission dynamics of hepatitis C virus");
    // 𝛽 (mathematical italic) folded to β, and "Recov-" above "ered" joined.
    expect(paper.text).toContain("β1, β2, β3 correspond to the transmission rates");
    expect(paper.text).not.toContain("𝛽");
    expect(paper.text).toContain("Recovered individuals (R) lose immunity at rate φ");
    expect(paper.text).toContain("Disease transmission rate (I) β1 0.214 (0-3)");
  });

  it("recovers the model's system and the force of infection, and refuses the four equations the PDF draws", async () => {
    const paper = await extractPdf(bytes);
    expect(paper.equations.map((equation) => [equation.number, equation.sectionId])).toEqual([["1", "page-2"], ["2", "page-2"], ["3", "page-3"], ["8", "page-6"], ["9", "page-6"]]);
    expect(paper.equations.find((equation) => equation.number === "3")?.latex.split("\n")[0]).toBe("dS/dt = b – (μ + λ)S + φR,");
    // Each written into the text as recovered, so its span holds exactly its text, its number after.
    for (const equation of paper.equations) {
      expect(paper.text.slice(equation.start, equation.end)).toBe(equation.latex);
      expect(paper.text.slice(equation.end, equation.end + (equation.number ?? "").length + 3)).toBe(` (${equation.number ?? ""})`);
    }
    expect(paper.refused.map((equation) => [equation.number, equation.page])).toEqual([["4", 3], ["5", 4], ["6", 4], ["7", 4]]);
  });

  it("becomes a register entry and a text like any source, its licence unknown and its text never kept, its anchors on pages", async () => {
    const fetched = await fromOwnerPdf(bytes, "hcv.pdf");
    const { entry, text } = registerAndText(fetched, "2026-10-16T12:00:00.000Z");
    expect(entry).toMatchObject({ route: "owner-pdf", licence: "unknown", textKept: false, identifiers: { file: "hcv.pdf" } });
    expect(entry.sourceId).toMatch(/^pdf-[0-9a-f]{16}$/);
    const anchor = anchorOf(text, "Recruitment rate b 0.01 (0.009-0.06)");
    expect(anchor?.sectionId).toBe("page-9");
    expect(anchor && text.text.slice(anchor.charStart, anchor.charEnd)).toBe("Recruitment rate b 0.01 (0.009-0.06)");
  });

  it("refuses a file that is not a PDF, before reading anything", async () => {
    await expect(extractPdf(new TextEncoder().encode("<html>not a paper</html>"))).rejects.toThrow(PdfError);
  });
});
