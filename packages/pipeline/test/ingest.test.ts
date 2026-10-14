import { gzipSync } from "node:zlib";
import { licenceOf, SourceText } from "@paperplay/contracts";
import { describe, expect, it } from "vitest";
import { ArchiveError, extractJats, extractLatex, fetchArxiv, fetchPmc, parseArxivId, parseXml, readTar, registerAndText, safePath, unpackSource, XmlError, type Fetch } from "../src/ingest/index.ts";

// Ingest (every-paper.md §3.1): a source unpacked in memory and read by restricted readers that run
// nothing and expand nothing; every equation's span in the text holds exactly its LaTeX. The
// network here is a fake one.

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

/** A tar holding the given entries, each a regular file unless given another type. */
function tar(entries: readonly { readonly name: string; readonly body?: string; readonly type?: string }[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (const entry of entries) {
    const body = encode(entry.body ?? "");
    const header = new Uint8Array(512);
    header.set(encode(entry.name).slice(0, 100), 0);
    header.set(encode(body.length.toString(8).padStart(11, "0")), 124);
    header[156] = (entry.type ?? "0").charCodeAt(0);
    header.set(encode("ustar"), 257);
    blocks.push(header, body, new Uint8Array((512 - (body.length % 512)) % 512));
  }
  blocks.push(new Uint8Array(1024));
  const out = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
  let at = 0;
  for (const block of blocks) {
    out.set(block, at);
    at += block.length;
  }
  return out;
}

const PAPER = String.raw`\documentclass{article}
\newcommand{\R}{\mathcal{R}_0}
\title{A \emph{small} SIR model}
\author{Ada Lovelace \and Alan Turing}
\begin{document}
\maketitle
\begin{abstract}We study an epidemic; 50\% recover.\end{abstract}
\section{Model}
\input{model}
\end{document}`;
const MODEL = String.raw`The model is % a comment that must go
\begin{align}
\frac{dS}{dt} &= -\beta S I, \label{eq:s}\\
\frac{dI}{dt} &= \beta S I - \gamma I. \label{eq:i}
\end{align}
By \eqref{eq:i}, the threshold is $\R>1$ \cite{km27}.
\begin{tabular}{ll} $\beta$ & 0.3 \\ $\gamma$ & 0.1 \end{tabular}`;

describe("[R09] the arXiv source's archive", () => {
  it("unpacks a gzipped tar's regular files, and a single gzipped file as the paper's .tex", () => {
    const files = unpackSource(gzipSync(tar([{ name: "main.tex", body: PAPER }, { name: "figs/", type: "5" }, { name: "model.tex", body: MODEL }])), "2101.00001");
    expect(files.map((file) => file.path)).toEqual(["main.tex", "model.tex"]);
    expect(unpackSource(gzipSync(encode(PAPER)), "2101.00001").map((file) => file.path)).toEqual(["2101.00001.tex"]);
  });

  it("refuses a path that climbs out of the archive, and any link, never following either", () => {
    expect(safePath("a/./b/../../c")).toBeNull();
    expect(safePath("/sections/intro.tex")).toBe("sections/intro.tex");
    expect(() => readTar(tar([{ name: "../../etc/passwd", body: "x" }]))).toThrow(ArchiveError);
    expect(() => readTar(tar([{ name: "link.tex", type: "2" }]))).toThrow(/a link or device/);
  });
});

describe("[R09] the restricted LaTeX reader", () => {
  const paper = extractLatex([
    { path: "main.tex", bytes: encode(PAPER) },
    { path: "model.tex", bytes: encode(MODEL) },
  ]);

  it("reads the title, the authors, the sections, and \\input from inside the archive", () => {
    expect(paper.title).toBe("A small SIR model");
    expect(paper.authors).toEqual(["Ada Lovelace", "Alan Turing"]);
    expect(paper.sections.map((section) => section.title)).toEqual(["Title", "Abstract", "Model"]);
    expect(paper.text).toContain("The model is");
    expect(paper.text).not.toContain("a comment that must go");
  });

  it("keeps each display equation's LaTeX at its span, numbers it, and resolves references to it", () => {
    expect(paper.equations).toHaveLength(1);
    const [equation] = paper.equations;
    expect(equation?.labels).toEqual(["eq:s", "eq:i"]);
    expect(equation?.number).toBe("1–2");
    expect(paper.text.slice(equation?.start, equation?.end)).toBe(equation?.latex);
    expect(paper.text).toContain("By (2), the threshold is $\\R>1$ [citation].");
  });

  it("keeps a table cell's math exactly as written, so no number is mangled", () => {
    const table = extractLatex([{ path: "t.tex", bytes: encode(String.raw`\documentclass{article}\begin{document}\begin{tabular}{lll} $\varLambda$ & Recruitment & $1.658\times10^6$ \\ $N_0$ & Population & 9.18 \times 10^7 \end{tabular}\end{document}`) }]);
    expect(table.text).toContain("$\\varLambda$ | Recruitment | $1.658\\times10^6$\n$N_0$ | Population | 9.18 × 10^7");
  });

  it("lists the paper's macros without expanding them, and keeps a table's rows", () => {
    expect(paper.macros).toEqual([{ name: "\\R", definition: "\\mathcal{R}_0" }]);
    expect(paper.text).toContain("$\\beta$ | 0.3\n$\\gamma$ | 0.1");
  });
});

const ARTICLE = `<?xml version="1.0"?>
<!DOCTYPE article [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<pmc-articleset><article xmlns:mml="http://www.w3.org/1998/Math/MathML" xmlns:xlink="http://www.w3.org/1999/xlink">
<front><journal-meta><journal-title-group><journal-title>PLoS ONE</journal-title></journal-title-group></journal-meta>
<article-meta><article-id pub-id-type="pmcid">PMC1234567</article-id><article-id pub-id-type="doi">10.1/x</article-id>
<title-group><article-title>An SIR model &amp; its threshold &xxe;</article-title></title-group>
<contrib-group><contrib contrib-type="author"><name><surname>Doe</surname><given-names>Jane</given-names></name></contrib></contrib-group>
<pub-date pub-type="epub"><year>2021</year></pub-date>
<permissions><license xlink:href="https://creativecommons.org/licenses/by/4.0/"><license-p>An open access article.</license-p></license></permissions>
<abstract><p>We model an epidemic.</p></abstract></article-meta></front>
<body><sec><title>Model</title><p>The rate <inline-formula><mml:math><mml:mi>β</mml:mi></mml:math></inline-formula> gives
<disp-formula id="e1"><label>(1)</label><mml:math><mml:mfrac><mml:mrow><mml:mi>d</mml:mi><mml:mi>S</mml:mi></mml:mrow><mml:mrow><mml:mi>d</mml:mi><mml:mi>t</mml:mi></mml:mrow></mml:mfrac><mml:mo>=</mml:mo><mml:mo>−</mml:mo><mml:mi>β</mml:mi><mml:mi>S</mml:mi><mml:mi>I</mml:mi></mml:math></disp-formula>
<xref ref-type="bibr" rid="r1">[1]</xref>.</p>
<disp-formula id="e2"><label>(2)</label><alternatives><tex-math><![CDATA[\\begin{document}$$\\dot{I} = \\beta S I - \\gamma I$$\\end{document}]]></tex-math></alternatives></disp-formula>
<table-wrap><label>Table 1</label><caption><p>Parameters</p></caption><table><tr><th>Symbol</th><th>Value</th></tr><tr><td>γ</td><td>0.1</td></tr></table></table-wrap>
</sec></body><back><ref-list><ref id="r1">A reference</ref></ref-list></back></article></pmc-articleset>`;

describe("[R09] the restricted XML and JATS readers", () => {
  it("skips a DOCTYPE and never expands an entity it declares", () => {
    const root = parseXml(ARTICLE);
    expect(JSON.stringify(root)).not.toContain("passwd");
    expect(JSON.stringify(root)).toContain("&xxe;");
    expect(() => parseXml("<a><b></a>")).toThrow(XmlError);
  });

  it("reads the article's title, author, licence, equations and tables, the TeX alternative first", () => {
    const paper = extractJats(ARTICLE);
    expect(paper.title).toBe("An SIR model & its threshold &xxe;");
    expect(paper.authors).toEqual(["Jane Doe"]);
    expect(paper.licence.url).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(paper.equations.map((equation) => [equation.number, equation.latex])).toEqual([
      ["1", "\\frac{d S}{d t} = − β S I"],
      ["2", "\\dot{I} = \\beta S I - \\gamma I"],
    ]);
    for (const equation of paper.equations) expect(paper.text.slice(equation.start, equation.end)).toBe(equation.latex);
    expect(paper.text).toContain("Table 1: Parameters\nSymbol | Value\nγ | 0.1");
    expect(paper.text).not.toContain("A reference");
  });
});

describe("licences and fetching", () => {
  it("names a licence from its URL as Creative Commons and arXiv write it", () => {
    expect(licenceOf("http://creativecommons.org/licenses/by/4.0/")).toBe("cc-by");
    expect(licenceOf("https://creativecommons.org/licenses/by-nc-nd/4.0/")).toBe("cc-by-nc-nd");
    expect(licenceOf("http://arxiv.org/licenses/nonexclusive-distrib/1.0/")).toBe("arxiv-nonexclusive");
    expect(licenceOf("http://creativecommons.org/publicdomain/zero/1.0/")).toBe("cc0");
    expect(licenceOf(null)).toBe("unknown");
    expect(parseArxivId("arxiv:2101.01234v2")).toEqual({ id: "2101.01234", version: 2 });
    expect(() => parseArxivId("2101.01234")).toThrow(/with its version/);
  });

  /** A network that answers each URL it knows, with a copy of its bytes: a Node Buffer's own may share a pooled block. */
  const network =
    (pages: Readonly<Record<string, Uint8Array | string>>): Fetch =>
    (url) => {
      const page = pages[url];
      const bytes = typeof page === "string" ? encode(page) : page;
      return Promise.resolve({ ok: bytes !== undefined, status: bytes ? 200 : 404, arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes ?? new Uint8Array()).buffer), text: () => Promise.resolve(page === undefined ? "" : String(page)) });
    };

  it("fetches an arXiv paper's record and source, and registers it with its licence; CC BY text is kept", async () => {
    const record = `<OAI-PMH><GetRecord><record><metadata><arXiv><id>2101.00001</id><created>2021-01-04</created><authors><author><keyname>Lovelace</keyname><forenames>Ada</forenames></author></authors><title>A small
  SIR model</title><categories>q-bio.PE</categories><license>http://creativecommons.org/licenses/by/4.0/</license></arXiv></metadata></record></GetRecord></OAI-PMH>`;
    const fetched = await fetchArxiv(
      network({
        "https://export.arxiv.org/oai2?verb=GetRecord&identifier=oai:arXiv.org:2101.00001&metadataPrefix=arXiv": record,
        "https://arxiv.org/src/2101.00001v1": gzipSync(tar([{ name: "main.tex", body: PAPER }, { name: "model.tex", body: MODEL }])),
      }),
      "2101.00001v1",
    );
    const { entry, text } = registerAndText(fetched, "2026-10-14T00:00:00.000Z");
    expect(entry).toMatchObject({ sourceId: "arxiv-2101.00001v1", title: "A small SIR model", authors: ["Ada Lovelace"], year: 2021, licence: "cc-by", textKept: true, route: "arxiv-source" });
    expect(SourceText.safeParse(text).success).toBe(true);
  });

  it("fetches a PMC article through E-utilities, and refuses one whose full text is not open", async () => {
    const fetched = await fetchPmc(network({ "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=1234567&retmode=xml": ARTICLE }), "PMC1234567");
    expect(fetched).toMatchObject({ sourceId: "pmc-PMC1234567", route: "pmc-eutils", licence: "cc-by", year: 2021, venue: "PLoS ONE", identifiers: { pmcid: "PMC1234567", doi: "10.1/x" } });
    await expect(fetchPmc(network({ "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=7654321&retmode=xml": "<pmc-articleset><article><front/></article></pmc-articleset>" }), "PMC7654321")).rejects.toThrow(/not open/);
  });
});
