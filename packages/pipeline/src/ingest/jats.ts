/**
 * A PubMed Central article's JATS XML as plain text, sections and equations, in the same shape as
 * a LaTeX source gives (every-paper.md §3.1). Equations keep the article's own TeX where PMC gives
 * it; otherwise their MathML is written out linearly, as TeX-like text. Tables keep their rows,
 * wherever they sit, the floats PMC gathers at the end included. The licence is read as the
 * article states it.
 */
import type { ExtractedPaper, TextEquation, TextSection } from "./latex.ts";
import { descendants, elementsOf, firstOf, localName, parseXml, textOf, type XmlElement, type XmlNode } from "./xml.ts";

export interface JatsPaper extends ExtractedPaper {
  readonly journal: string | null;
  readonly year: number | null;
  /** The licence's link, such as https://creativecommons.org/licenses/by/4.0/, and its words. */
  readonly licence: { readonly url: string | null; readonly text: string | null };
  readonly identifiers: Readonly<Record<string, string>>;
}

const ACCENTS: Readonly<Record<string, string>> = { "˙": "\\dot", "¨": "\\ddot", "¯": "\\bar", "^": "\\hat", "~": "\\tilde", "→": "\\vec" };

/** MathML as linear, TeX-like text. Its own TeX annotation wins where it has one. */
export function mathText(node: XmlNode): string {
  if (typeof node === "string") return node.trim();
  const name = localName(node);
  const kids = elementsOf(node);
  const all = (): string => node.children.map(mathText).filter(Boolean).join(" ");
  switch (name) {
    case "semantics": {
      const tex = kids.find((kid) => localName(kid) === "annotation" && /tex/i.test(kid.attributes.encoding ?? ""));
      return tex ? textOf(tex).trim() : mathText(kids[0] ?? "");
    }
    case "annotation":
    case "annotation-xml":
      return "";
    case "mfrac":
      return `\\frac{${mathText(kids[0] ?? "")}}{${mathText(kids[1] ?? "")}}`;
    case "msub":
      return `${mathText(kids[0] ?? "")}_{${mathText(kids[1] ?? "")}}`;
    case "msup":
      return `${mathText(kids[0] ?? "")}^{${mathText(kids[1] ?? "")}}`;
    case "msubsup":
      return `${mathText(kids[0] ?? "")}_{${mathText(kids[1] ?? "")}}^{${mathText(kids[2] ?? "")}}`;
    case "msqrt":
      return `\\sqrt{${all()}}`;
    case "mroot":
      return `\\sqrt[${mathText(kids[1] ?? "")}]{${mathText(kids[0] ?? "")}}`;
    case "mover":
    case "munder": {
      const mark = textOf(kids[1] ?? "").trim();
      const accent = ACCENTS[mark];
      return accent ? `${accent}{${mathText(kids[0] ?? "")}}` : `${mathText(kids[0] ?? "")}${name === "mover" ? "^" : "_"}{${mark}}`;
    }
    case "mfenced": {
      const open = node.attributes.open ?? "(";
      const close = node.attributes.close ?? ")";
      return `${open}${kids.map(mathText).join(node.attributes.separators ?? ", ")}${close}`;
    }
    case "mtable":
      return kids.map((row) => elementsOf(row).map(mathText).join(" & ")).join(" \\\\\n");
    case "mspace":
      return " ";
    default:
      return all();
  }
}

/** An equation's text: its TeX alternative, or its MathML written out, or its plain text. */
function formulaText(formula: XmlElement): string {
  const tex = firstOf(formula, "tex-math");
  if (tex) {
    const raw = textOf(tex).trim();
    const body = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(raw)?.[1] ?? raw;
    return body.replace(/^\s*\$+|\$+\s*$/g, "").replace(/^\\\[|\\\]$/g, "").trim();
  }
  const math = firstOf(formula, "math");
  if (math) return mathText(math).replace(/\s+/g, " ").trim();
  return textOf(formula).replace(/\s+/g, " ").trim();
}

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function extractJats(source: string): JatsPaper {
  const article = parseXml(source);
  const front = firstOf(article, "article-meta") ?? article;
  const journalMeta = firstOf(article, "journal-meta");
  let text = "";
  const sections: { id: string; title: string; start: number }[] = [];
  const equations: TextEquation[] = [];
  const used = new Set<string>();
  let pendingBreak = false;

  const write = (chunk: string): void => {
    const cleaned = chunk.replace(/\s+/g, " ");
    if (!cleaned.trim()) {
      if (cleaned && text && !/\s$/.test(text)) text += " ";
      return;
    }
    if (pendingBreak && text) text = `${text.trimEnd()}\n\n`;
    pendingBreak = false;
    text += text && /\s$/.test(text) ? cleaned.trimStart() : cleaned;
  };
  const paragraph = (): void => {
    pendingBreak = true;
  };
  const block = (): number => {
    if (text) text = `${text.trimEnd()}\n\n`;
    pendingBreak = false;
    return text.length;
  };
  const section = (title: string): void => {
    let id = `s${sections.length + 1}-${slug(title) || "section"}`;
    while (used.has(id)) id += "x";
    used.add(id);
    sections.push({ id, title, start: block() });
    text += title;
    paragraph();
  };
  const sectionId = (): string => sections.at(-1)?.id ?? "front";

  const table = (wrap: XmlElement): void => {
    const caption = firstOf(wrap, "caption");
    const label = firstOf(wrap, "label");
    block();
    const named = label ? textOf(label).trim() : "";
    write(`${/^table\b/i.test(named) ? named : `Table${named ? ` ${named}` : ""}`}: ${caption ? textOf(caption).replace(/\s+/g, " ").trim() : ""}`);
    for (const row of descendants(wrap, "tr")) {
      const cells = elementsOf(row).map((cell) => inline(cell).replace(/\s+/g, " ").trim());
      text += `\n${cells.join(" | ")}`;
    }
    const foot = firstOf(wrap, "table-wrap-foot");
    if (foot) text += `\n${textOf(foot).replace(/\s+/g, " ").trim()}`;
    paragraph();
  };

  /** An element's text with its inline formulas as $…$. */
  const inline = (node: XmlNode): string => {
    if (typeof node === "string") return node;
    const name = localName(node);
    if (name === "inline-formula") return `$${formulaText(node)}$`;
    if (name === "xref" && node.attributes["ref-type"] === "bibr") return "[citation]";
    if (name === "math") return `$${mathText(node)}$`;
    return node.children.map(inline).join("");
  };

  const walk = (element: XmlElement): void => {
    for (const child of elementsOf(element)) {
      const name = localName(child);
      if (name === "sec" || name === "app") {
        const title = firstOf(child, "title");
        section(title ? textOf(title).replace(/\s+/g, " ").trim() : "Section");
        walk(child);
      } else if (name === "title" || name === "label") {
        continue;
      } else if (name === "p") {
        paragraph();
        for (const part of child.children) {
          if (typeof part !== "string" && localName(part) === "disp-formula") formula(part);
          else if (typeof part !== "string" && localName(part) === "table-wrap") table(part);
          else write(inline(part));
        }
        paragraph();
      } else if (name === "disp-formula") {
        formula(child);
      } else if (name === "table-wrap") {
        table(child);
      } else if (name === "fig") {
        const caption = firstOf(child, "caption");
        if (caption) {
          paragraph();
          write(`Figure: ${textOf(caption)}`);
          paragraph();
        }
      } else if (name === "list") {
        for (const item of descendants(child, "list-item")) {
          paragraph();
          write(`- ${inline(item)}`);
        }
        paragraph();
      } else if (name !== "ref-list" && name !== "fn-group" && name !== "ack") {
        walk(child);
      }
    }
  };

  const formula = (element: XmlElement): void => {
    const latex = formulaText(element);
    const label = firstOf(element, "label");
    const start = block();
    text += latex;
    equations.push({
      id: `eq${equations.length + 1}`,
      labels: element.attributes.id ? [element.attributes.id] : [],
      number: label ? textOf(label).replace(/[()]/g, "").trim() || null : null,
      latex,
      sectionId: sectionId(),
      start,
      end: text.length,
    });
    paragraph();
  };

  const titleNode = firstOf(front, "article-title");
  const title = titleNode ? textOf(titleNode).replace(/\s+/g, " ").trim() : null;
  if (title) {
    sections.push({ id: "front", title: "Title", start: 0 });
    used.add("front");
    text += title;
    paragraph();
  }
  const abstract = firstOf(front, "abstract");
  if (abstract) {
    section("Abstract");
    walk(abstract);
  }
  const body = firstOf(article, "body");
  if (body) walk(body);
  const back = firstOf(article, "back");
  if (back) for (const appendix of descendants(back, "app-group")) walk(appendix);
  const floats = firstOf(article, "floats-group");
  if (floats) {
    section("Tables and figures");
    walk(floats);
  }

  const finalText = text.trimEnd();
  const spans: TextSection[] = sections.map((entry, index) => ({ ...entry, end: Math.min(sections[index + 1]?.start ?? finalText.length, finalText.length) }));
  const authors = descendants(front, "contrib")
    .filter((contrib) => (contrib.attributes["contrib-type"] ?? "author") === "author")
    .map((contrib) => {
      const name = firstOf(contrib, "name");
      if (!name) return textOf(firstOf(contrib, "collab") ?? contrib).trim();
      return [textOf(firstOf(name, "given-names") ?? ""), textOf(firstOf(name, "surname") ?? "")].map((part) => part.trim()).filter(Boolean).join(" ");
    })
    .filter((name) => name.length > 0);
  const licence = firstOf(front, "license");
  const licenceRef = firstOf(front, "license_ref");
  const year = descendants(front, "pub-date")
    .map((date) => Number(textOf(firstOf(date, "year") ?? "")))
    .find((value) => Number.isInteger(value) && value > 1000);
  const identifiers = Object.fromEntries(descendants(front, "article-id").map((id) => [id.attributes["pub-id-type"] ?? "id", textOf(id).trim()]));
  return {
    title,
    authors,
    text: finalText,
    sections: spans.filter((span) => span.end > span.start),
    equations,
    macros: [],
    mainFile: "article.xml",
    journal: journalMeta ? textOf(firstOf(journalMeta, "journal-title") ?? "").trim() || null : null,
    year: year ?? null,
    licence: {
      url: licence?.attributes["xlink:href"] ?? (licenceRef ? textOf(licenceRef).trim() : null),
      text: licence ? textOf(licence).replace(/\s+/g, " ").trim() : null,
    },
    identifiers,
  };
}
