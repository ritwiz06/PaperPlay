/**
 * A restricted XML reader for a paper's JATS (every-paper.md §3.1). Elements, attributes, text,
 * CDATA and comments only: a DOCTYPE is skipped, never read, and only XML's five named entities
 * and numeric ones are decoded, so no external entity or DTD is ever loaded. Limits on depth and
 * size refuse a hostile document instead of following it.
 */

export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}
export type XmlNode = XmlElement | string;

export const XML_LIMITS = Object.freeze({ bytes: 30_000_000, depth: 200 });

export class XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlError";
  }
}

const NAMED: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return NAMED[entity] ?? whole;
  });
}

export function parseXml(source: string): XmlElement {
  if (source.length > XML_LIMITS.bytes) throw new XmlError(`the document is longer than ${XML_LIMITS.bytes} characters`);
  const root: { name: string; attributes: Record<string, string>; children: XmlNode[] } = { name: "#document", attributes: {}, children: [] };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1] ?? root;
  while (i < source.length) {
    const open = source.indexOf("<", i);
    if (open < 0) {
      const tail = source.slice(i);
      if (tail.trim()) top().children.push(decodeEntities(tail));
      break;
    }
    if (open > i) top().children.push(decodeEntities(source.slice(i, open)));
    if (source.startsWith("<!--", open)) {
      const close = source.indexOf("-->", open + 4);
      i = close < 0 ? source.length : close + 3;
    } else if (source.startsWith("<![CDATA[", open)) {
      const close = source.indexOf("]]>", open + 9);
      if (close < 0) throw new XmlError("an unclosed CDATA section");
      top().children.push(source.slice(open + 9, close));
      i = close + 3;
    } else if (source.startsWith("<?", open)) {
      const close = source.indexOf("?>", open + 2);
      i = close < 0 ? source.length : close + 2;
    } else if (source.startsWith("<!", open)) {
      // A DOCTYPE, its internal subset included, is skipped and never read.
      let depth = 0;
      let at = open + 2;
      for (; at < source.length; at++) {
        if (source[at] === "[") depth++;
        else if (source[at] === "]") depth--;
        else if (source[at] === ">" && depth <= 0) break;
      }
      i = at + 1;
    } else if (source[open + 1] === "/") {
      const close = source.indexOf(">", open);
      if (close < 0) throw new XmlError("an unclosed end tag");
      const name = source.slice(open + 2, close).trim();
      const element = stack.pop();
      if (!element || element.name !== name) throw new XmlError(`</${name}> closes <${element?.name ?? "nothing"}>`);
      i = close + 1;
    } else {
      let at = open + 1;
      let quote: string | null = null;
      for (; at < source.length; at++) {
        const char = source[at];
        if (quote) {
          if (char === quote) quote = null;
        } else if (char === '"' || char === "'") quote = char;
        else if (char === ">") break;
      }
      if (at >= source.length) throw new XmlError("an unclosed start tag");
      const raw = source.slice(open + 1, at);
      const selfClosing = raw.endsWith("/");
      const inner = selfClosing ? raw.slice(0, -1) : raw;
      const name = /^[^\s/>]+/.exec(inner)?.[0] ?? "";
      if (!name) throw new XmlError(`a tag with no name at ${open}`);
      const attributes: Record<string, string> = {};
      for (const match of inner.slice(name.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attributes[match[1] ?? ""] = decodeEntities(match[3] ?? match[4] ?? "");
      const element = { name, attributes, children: [] as XmlNode[] };
      top().children.push(element);
      if (!selfClosing) {
        stack.push(element);
        if (stack.length > XML_LIMITS.depth) throw new XmlError(`the document nests deeper than ${XML_LIMITS.depth}`);
      }
      i = at + 1;
    }
  }
  if (stack.length > 1) throw new XmlError(`<${top().name}> is never closed`);
  const element = root.children.find((child): child is XmlElement => typeof child !== "string");
  if (!element) throw new XmlError("the document has no element");
  return element;
}

/** The element's name without its namespace prefix. */
export const localName = (element: XmlElement): string => element.name.slice(element.name.indexOf(":") + 1);

export const elementsOf = (element: XmlElement): XmlElement[] => element.children.filter((child): child is XmlElement => typeof child !== "string");

/** Every descendant element with this local name, in document order. */
export function descendants(element: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = [];
  const visit = (node: XmlElement) => {
    for (const child of elementsOf(node)) {
      if (localName(child) === name) found.push(child);
      visit(child);
    }
  };
  visit(element);
  return found;
}

export const firstOf = (element: XmlElement, name: string): XmlElement | undefined => descendants(element, name)[0];

/** All the text inside an element, in order. */
export function textOf(node: XmlNode): string {
  return typeof node === "string" ? node : node.children.map(textOf).join("");
}
