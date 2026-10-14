/**
 * A paper's LaTeX as plain text, sections and equations (every-paper.md §3.1). A restricted reader,
 * never TeX: it runs nothing, expands none of the paper's own macros (it lists their definitions
 * instead), and reads `\input` only from inside the paper's own archive. Display equations keep
 * their LaTeX, in the text and in a table with their labels and numbers, so an anchor can quote one
 * and a transcription can cite it. Tables keep their rows, since a paper's parameters often live
 * there. Every position is a character offset into the text it returns.
 */
import type { ArchiveFile } from "./archive.ts";

export interface TextSection {
  readonly id: string;
  readonly title: string;
  /** Its span in the text, [start, end). */
  readonly start: number;
  readonly end: number;
}

export interface TextEquation {
  readonly id: string;
  /** Its \label names, if any. */
  readonly labels: readonly string[];
  /** The number LaTeX would print, when the environment is numbered: "3", or "3–5" for several rows. */
  readonly number: string | null;
  readonly latex: string;
  readonly sectionId: string;
  readonly start: number;
  readonly end: number;
}

export interface Macro {
  readonly name: string;
  readonly definition: string;
}

export interface ExtractedPaper {
  readonly title: string | null;
  readonly authors: readonly string[];
  readonly text: string;
  readonly sections: readonly TextSection[];
  readonly equations: readonly TextEquation[];
  /** The paper's own macros, as defined, never expanded. */
  readonly macros: readonly Macro[];
  /** The file the paper starts from. */
  readonly mainFile: string;
}

export class LatexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LatexError";
  }
}

const MAX_INPUT_DEPTH = 8;
const DISPLAY_ENVS = new Set(["equation", "align", "eqnarray", "gather", "multline", "flalign", "alignat", "displaymath", "dmath", "subequations"]);
const ROWS_ENVS = new Set(["align", "eqnarray", "gather", "flalign", "alignat"]);
const TABLE_ENVS = new Set(["tabular", "tabularx", "longtable", "tabulary", "supertabular"]);
const LIST_ENVS = new Set(["itemize", "enumerate", "description"]);
const SKIP_ENVS = new Set(["thebibliography", "comment", "tikzpicture", "picture", "filecontents"]);
const DROP_COMMANDS = new Set([
  "maketitle", "tableofcontents", "bibliography", "bibliographystyle", "vspace", "hspace", "noindent", "centering", "includegraphics",
  "newpage", "clearpage", "small", "footnotesize", "large", "Large", "normalsize", "tiny", "huge", "smallskip", "medskip", "bigskip",
  "linewidth", "textwidth", "hline", "cline", "toprule", "midrule", "bottomrule", "label", "nonumber", "notag", "protect", "indent",
  "setlength", "addtolength", "pagestyle", "thispagestyle", "keywords", "date", "thanks", "affiliation", "affil", "address", "email",
  "orcid", "acknowledgments", "phantom", "linebreak", "pagebreak", "newline", "par", "appendix", "printbibliography", "addbibresource",
]);
const SECTION_COMMANDS = new Set(["section", "subsection", "subsubsection", "chapter"]);
const CITE_COMMANDS = /^(cite|citep|citet|citealp|citeauthor|citeyear|parencite|textcite|autocite|nocite)$/;
const REF_COMMANDS = /^(ref|eqref|cref|Cref|autoref|pageref|nameref)$/;
const ESCAPES: Readonly<Record<string, string>> = { "&": "&", "%": "%", _: "_", "#": "#", $: "$", "{": "{", "}": "}", " ": " ", ",": " ", ";": " ", ":": " ", "!": "", "\\": "\n", "-": "" };

/** A source's text with its comments removed, `\%` kept. */
export function stripComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "\\") {
          i++;
          continue;
        }
        if (line[i] === "%") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

/** The index just past the group that opens at `open` ("{" or "["), counting nesting, or -1. */
export function closeOf(source: string, open: number): number {
  const opening = source[open];
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : "";
  if (!closing) return -1;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === opening) depth++;
    else if (char === closing && --depth === 0) return i + 1;
  }
  return -1;
}

/** The next argument after `from`: optional [..] groups skipped when `skipOptional`, then a {..} group. */
function argument(source: string, from: number, skipOptional = true): { readonly text: string; readonly end: number } | null {
  let at = from;
  for (;;) {
    while (at < source.length && /\s/.test(source[at] ?? "")) at++;
    if (skipOptional && source[at] === "[") {
      const end = closeOf(source, at);
      if (end < 0) return null;
      at = end;
      continue;
    }
    break;
  }
  if (source[at] !== "{") return null;
  const end = closeOf(source, at);
  return end < 0 ? null : { text: source.slice(at + 1, end - 1), end };
}

function decode(file: ArchiveFile): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
  } catch {
    return new TextDecoder("latin1").decode(file.bytes);
  }
}

/** The file a paper starts from: the one with \documentclass and \begin{document}, preferring main.tex or the largest. */
export function mainFileOf(files: readonly ArchiveFile[]): ArchiveFile {
  const candidates = files.filter((file) => file.path.endsWith(".tex")).filter((file) => {
    const text = stripComments(decode(file));
    return /\\documentclass/.test(text) && /\\begin\s*\{document\}/.test(text);
  });
  if (candidates.length === 0) throw new LatexError("the source has no .tex file with \\documentclass and \\begin{document}");
  return candidates.find((file) => /(^|\/)(main|ms|paper)\.tex$/.test(file.path)) ?? [...candidates].sort((a, b) => b.bytes.length - a.bytes.length)[0] ?? (candidates[0] as ArchiveFile);
}

/** Replaces \input and \include with the named file's text, from the archive only, to a fixed depth. */
function resolveInputs(source: string, files: ReadonlyMap<string, string>, directory: string, depth: number): string {
  return source.replace(/\\(input|include|subfile)\s*(?:\{([^}]+)\}|([^\s{}]+))/g, (whole, _command: string, braced?: string, bare?: string) => {
    const raw = (braced ?? bare ?? "").trim();
    if (depth >= MAX_INPUT_DEPTH) return "";
    const names = [raw, `${raw}.tex`].flatMap((name) => [name, directory ? `${directory}/${name}` : name]);
    const found = names.map((name) => name.replace(/^\.\//, "")).find((name) => files.has(name));
    if (found === undefined) return whole.startsWith("\\input") && raw.endsWith(".bbl") ? "" : "";
    return resolveInputs(stripComments(files.get(found) ?? ""), files, found.includes("/") ? found.slice(0, found.lastIndexOf("/")) : "", depth + 1);
  });
}

/** The paper's own macros, from \newcommand, \renewcommand, \def and \DeclareMathOperator, as written. */
export function macrosOf(source: string): Macro[] {
  const macros: Macro[] = [];
  const pattern = /\\(?:(?:re)?newcommand\*?|providecommand\*?|DeclareMathOperator\*?)\s*\{?\s*(\\[A-Za-z@]+)\s*\}?|\\def\s*(\\[A-Za-z@]+)/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1] ?? match[2] ?? "";
    let at = (match.index ?? 0) + match[0].length;
    while (source[at] === "[") at = closeOf(source, at);
    if (at < 0) continue;
    const body = argument(source, at, false);
    if (body) macros.push({ name, definition: body.text.trim() });
  }
  return macros;
}

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/\\[a-z]+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** The rows of a table environment's body, its cells joined by " | ". */
function tableRows(body: string, plain: (latex: string) => string): string {
  return body
    .split(/\\\\(?:\s*\[[^\]]*\])?/)
    .map((row) =>
      row
        .split(/(?<!\\)&/)
        .map((cell) => plain(cell).replace(/\s+/g, " ").trim())
        .join(" | "),
    )
    .filter((row) => row.replaceAll("|", "").trim().length > 0)
    .join("\n");
}

/** Writes the text, tracking whitespace, the current section and the positions it hands out. */
class Writer {
  text = "";
  private pendingSpace = false;
  private pendingBreak = 0;

  word(chunk: string): void {
    if (chunk.length === 0) return;
    if (this.pendingBreak > 0 && this.text.length > 0) this.text += this.pendingBreak > 1 ? "\n\n" : "\n";
    else if (this.pendingSpace && this.text.length > 0 && !/\s$/.test(this.text)) this.text += " ";
    this.pendingBreak = 0;
    this.pendingSpace = false;
    this.text += chunk;
  }
  space(): void {
    this.pendingSpace = true;
  }
  newline(paragraph = false): void {
    this.pendingBreak = Math.max(this.pendingBreak, paragraph ? 2 : 1);
  }
  /** Starts a block on a fresh line and returns where it starts. */
  block(): number {
    if (this.text.length > 0) this.text += this.pendingBreak > 1 ? "\n\n" : "\n";
    this.pendingBreak = 0;
    this.pendingSpace = false;
    return this.text.length;
  }
}

/** Reads a paper's LaTeX source files into text, sections and equations. */
export function extractLatex(files: readonly ArchiveFile[]): ExtractedPaper {
  const main = mainFileOf(files);
  const sources = new Map(files.filter((file) => /\.(tex|ltx|sty|bbl)$/.test(file.path)).map((file) => [file.path, decode(file)] as const));
  const directory = main.path.includes("/") ? main.path.slice(0, main.path.lastIndexOf("/")) : "";
  const whole = resolveInputs(stripComments(decode(main)), sources, directory, 0);
  const begin = /\\begin\s*\{document\}/.exec(whole);
  const end = /\\end\s*\{document\}/.exec(whole);
  if (!begin) throw new LatexError(`${main.path} has no \\begin{document}`);
  const preamble = whole.slice(0, begin.index);
  const body = whole.slice(begin.index + begin[0].length, end && end.index > begin.index ? end.index : whole.length);
  const titleArg = (/\\title\s*/.exec(preamble) ?? /\\title\s*/.exec(body))?.index;
  const titleSource = titleArg === undefined ? null : argument(preamble.includes("\\title") ? preamble : body, titleArg + "\\title".length);
  const authorSources = [...(preamble + body).matchAll(/\\author\s*/g)].map((match) => argument(preamble + body, (match.index ?? 0) + "\\author".length)?.text ?? "");

  // Equation numbers and labels first, so references can name them.
  const numbers = new Map<string, string>();
  let counter = 0;
  const numberedOf = (env: string, content: string): { labels: string[]; number: string | null } => {
    const labels = [...content.matchAll(/\\label\s*\{([^}]+)\}/g)].map((match) => match[1] ?? "");
    const starred = env.endsWith("*") || env === "displaymath";
    if (starred) return { labels, number: null };
    const base = env.replace(/\*$/, "");
    if (base === "subequations") return { labels, number: null };
    if (ROWS_ENVS.has(base)) {
      const rows = content.split(/\\\\/).filter((row) => row.trim().length > 0 && !/\\(nonumber|notag)\b/.test(row));
      if (rows.length === 0) return { labels, number: null };
      const first = counter + 1;
      counter += rows.length;
      for (const row of content.split(/\\\\/)) {
        const label = /\\label\s*\{([^}]+)\}/.exec(row)?.[1];
        if (label) numbers.set(label, String(first + rows.findIndex((candidate) => candidate === row)));
      }
      return { labels, number: rows.length === 1 ? String(first) : `${first}–${counter}` };
    }
    counter += 1;
    for (const label of labels) numbers.set(label, String(counter));
    return { labels, number: String(counter) };
  };

  const writer = new Writer();
  const sections: { id: string; title: string; start: number }[] = [];
  const equations: TextEquation[] = [];
  const usedIds = new Set<string>();
  const openSection = (title: string): void => {
    let id = `s${sections.length + 1}-${slug(title) || "section"}`.replace(/-$/, "");
    while (usedIds.has(id)) id += "x";
    usedIds.add(id);
    writer.newline(true);
    sections.push({ id, title, start: writer.block() });
    writer.word(title);
    writer.newline(true);
  };
  const currentSection = (): string => sections.at(-1)?.id ?? "front";

  /** LaTeX to plain words, for a title or a table's cell: math kept exactly as written, other commands dropped, their arguments kept. */
  const plain = (latex: string): string =>
    latex
      .split(/(\$[^$]*\$)/)
      .map((part) => (part.startsWith("$") && part.endsWith("$") && part.length > 1 ? part : plainText(part)))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  const plainText = (latex: string): string =>
    latex
      .replace(/\\(?:textbf|textit|emph|text|textrm|textsc|texttt|underline|mathrm|mbox|textsf)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\\(?:cite[a-z]*)\s*(?:\[[^\]]*\])*\{[^}]*\}/g, "[citation]")
      .replace(/\\([&%_#${} ])/g, "$1")
      .replace(/\\(times|cdot|pm)\b/g, (_command, name: string) => ({ times: "×", cdot: "·", pm: "±" })[name] ?? "")
      .replace(/\\[A-Za-z]+\*?\s*/g, (command) => (/^\\(var)?(alpha|beta|gamma|delta|epsilon|mu|nu|sigma|tau|lambda|kappa|rho|omega|phi|psi|theta|eta|xi|pi|chi|zeta|Lambda|Gamma|Delta|Omega|Phi|Psi|Theta|Sigma|Pi)\b/.test(command) ? command : ""))
      .replace(/[{}]/g, "")
      .replace(/~/g, " ")
      .replace(/\s+/g, " ");

  if (titleSource) {
    sections.push({ id: "front", title: "Title", start: writer.block() });
    usedIds.add("front");
    writer.word(plain(titleSource.text));
    writer.newline(true);
  }

  const walk = (source: string): void => {
    let i = 0;
    let textRun = "";
    const flush = () => {
      for (const piece of textRun.split(/(\n\s*\n)/)) {
        if (/^\n\s*\n$/.test(piece)) writer.newline(true);
        else
          for (const word of piece
            .replace(/``|''/g, '"')
            .replace(/---/g, "—")
            .replace(/--/g, "–")
            .replace(/~/g, " ")
            .split(/\s+/)) {
            if (word) {
              writer.space();
              writer.word(word);
            }
          }
      }
      if (/\s$/.test(textRun)) writer.space();
      textRun = "";
    };
    const display = (latex: string, env: string, content: string) => {
      flush();
      const { labels, number } = numberedOf(env, content);
      const cleaned = latex.replace(/\\label\s*\{[^}]*\}/g, "").replace(/\\(nonumber|notag)\b/g, "").trim();
      const start = writer.block();
      writer.word(cleaned);
      equations.push({ id: `eq${equations.length + 1}`, labels, number, latex: cleaned, sectionId: currentSection(), start, end: writer.text.length });
      writer.newline();
    };
    while (i < source.length) {
      const char = source[i] ?? "";
      if (char === "$") {
        const isDouble = source[i + 1] === "$";
        const close = source.indexOf(isDouble ? "$$" : "$", i + (isDouble ? 2 : 1));
        if (close < 0) {
          textRun += char;
          i++;
          continue;
        }
        if (isDouble) {
          display(source.slice(i + 2, close), "displaymath", source.slice(i + 2, close));
          i = close + 2;
        } else {
          textRun += source.slice(i, close + 1);
          i = close + 1;
        }
        continue;
      }
      if (char === "{" || char === "}") {
        i++;
        continue;
      }
      if (char !== "\\") {
        textRun += char;
        i++;
        continue;
      }
      // A command.
      const next = source[i + 1] ?? "";
      if (next === "[" || next === "(") {
        const closer = next === "[" ? "\\]" : "\\)";
        const close = source.indexOf(closer, i + 2);
        if (close < 0) {
          i += 2;
          continue;
        }
        if (next === "[") display(source.slice(i + 2, close), "displaymath", source.slice(i + 2, close));
        else textRun += `$${source.slice(i + 2, close)}$`;
        i = close + 2;
        continue;
      }
      if (!/[A-Za-z@]/.test(next)) {
        textRun += ESCAPES[next] ?? next;
        i += 2;
        continue;
      }
      const name = /^[A-Za-z@]+\*?/.exec(source.slice(i + 1))?.[0] ?? "";
      const bare = name.replace(/\*$/, "");
      let after = i + 1 + name.length;
      if (bare === "begin") {
        const envArg = argument(source, after, false);
        if (!envArg) {
          i = after;
          continue;
        }
        const env = envArg.text.trim();
        const base = env.replace(/\*$/, "");
        const closer = `\\end{${env}}`;
        let depth = 1;
        let at = envArg.end;
        let close = -1;
        const opener = `\\begin{${env}}`;
        while (depth > 0) {
          const nextOpen = source.indexOf(opener, at);
          const nextClose = source.indexOf(closer, at);
          if (nextClose < 0) break;
          if (nextOpen >= 0 && nextOpen < nextClose) {
            depth++;
            at = nextOpen + opener.length;
          } else {
            depth--;
            close = nextClose;
            at = nextClose + closer.length;
          }
        }
        if (close < 0) close = source.length;
        let content = source.slice(envArg.end, close);
        i = Math.min(close + closer.length, source.length);
        if (base === "alignat") content = content.replace(/^\s*\{[^}]*\}/, "");
        if (DISPLAY_ENVS.has(base)) {
          if (base === "subequations") walk(content);
          else display(content, env, content);
        } else if (TABLE_ENVS.has(base)) {
          flush();
          const columns = argument(content, 0, true);
          writer.block();
          writer.word(tableRows(columns ? content.slice(columns.end) : content, plain));
          writer.newline(true);
        } else if (LIST_ENVS.has(base)) {
          flush();
          walk(content.replace(/\\item\s*(\[[^\]]*\])?/g, (_item, label?: string) => `\n\n- ${label ? `${label.slice(1, -1)} ` : ""}`));
          writer.newline(true);
        } else if (base === "abstract") {
          flush();
          openSection("Abstract");
          walk(content);
        } else if (!SKIP_ENVS.has(base)) {
          flush();
          walk(content);
          writer.newline(true);
        }
        continue;
      }
      if (SECTION_COMMANDS.has(bare)) {
        const titleArg = argument(source, after);
        flush();
        openSection(plain(titleArg?.text ?? bare));
        i = titleArg?.end ?? after;
        continue;
      }
      if (bare === "paragraph" || bare === "subparagraph") {
        const titleArg = argument(source, after);
        flush();
        writer.newline(true);
        writer.word(`${plain(titleArg?.text ?? "")}.`);
        i = titleArg?.end ?? after;
        continue;
      }
      if (CITE_COMMANDS.test(bare)) {
        const arg = argument(source, after);
        textRun += "[citation]";
        i = arg?.end ?? after;
        continue;
      }
      if (REF_COMMANDS.test(bare)) {
        const arg = argument(source, after);
        const labels = (arg?.text ?? "").split(",").map((label) => label.trim());
        textRun += labels.map((label) => (numbers.has(label) ? `(${numbers.get(label) ?? ""})` : `[${label}]`)).join(", ");
        i = arg?.end ?? after;
        continue;
      }
      if (bare === "footnote") {
        const arg = argument(source, after);
        textRun += " (footnote: ";
        flush();
        walk(arg?.text ?? "");
        textRun += ") ";
        i = arg?.end ?? after;
        continue;
      }
      if (bare === "caption") {
        const arg = argument(source, after);
        flush();
        writer.newline(true);
        writer.word("Caption:");
        writer.space();
        walk(arg?.text ?? "");
        writer.newline(true);
        i = arg?.end ?? after;
        continue;
      }
      if (bare === "href") {
        const target = argument(source, after, false);
        const label = target ? argument(source, target.end, false) : null;
        textRun += label?.text ?? target?.text ?? "";
        i = label?.end ?? target?.end ?? after;
        continue;
      }
      if (/^(title|author|newcommand|renewcommand|providecommand|def|DeclareMathOperator|usepackage|documentclass|bibliographystyle)$/.test(bare)) {
        // Front matter and definitions: read separately, never printed in the body.
        if (bare === "def") {
          const macro = /^\\[A-Za-z@]+[^{]*/.exec(source.slice(after));
          after += macro?.[0].length ?? 0;
        } else {
          const nameArg = source[after] === "{" || /^\s*\\/.test(source.slice(after)) ? argument(source, after, true) : null;
          after = nameArg?.end ?? after;
        }
        while (source[after] === "[") after = closeOf(source, after);
        const definition = argument(source, after, false);
        i = definition?.end ?? after;
        continue;
      }
      if (DROP_COMMANDS.has(bare)) {
        // Drop the command and any arguments it takes on this line.
        let at = after;
        while (source[at] === "[" || source[at] === "{") at = closeOf(source, at) < 0 ? at + 1 : closeOf(source, at);
        if (bare === "appendix") {
          flush();
          openSection("Appendix");
        }
        if (bare === "par" || bare === "newline") textRun += bare === "par" ? "\n\n" : "\n";
        i = at;
        continue;
      }
      // Any other command: its name dropped, the text of its braced arguments kept.
      i = after;
      while (source[i] === "[") i = closeOf(source, i) < 0 ? i + 1 : closeOf(source, i);
      if (source[i] === "{") {
        const arg = argument(source, i, false);
        if (arg) {
          flush();
          walk(arg.text);
          i = arg.end;
        }
      } else textRun += " ";
    }
    flush();
  };

  walk(body);
  const text = writer.text.trimEnd();
  if (sections.length === 0 || (sections[0]?.start ?? 0) > 0) sections.unshift({ id: "front", title: "Opening", start: 0 });
  const spans: TextSection[] = sections.map((section, index) => ({ ...section, end: Math.min(sections[index + 1]?.start ?? text.length, text.length) }));
  return {
    title: titleSource ? plain(titleSource.text) : null,
    authors: authorSources.flatMap((author) => author.split(/\\and|,|\\\\/).map(plain).filter((name) => name.length > 1 && name.length < 80)).slice(0, 40),
    text,
    sections: spans.filter((section) => section.end > section.start),
    equations: equations.map((equation) => ({ ...equation, end: Math.min(equation.end, text.length) })),
    macros: macrosOf(preamble + body),
    mainFile: main.path,
  };
}
