/**
 * The provenance check (every-paper.md §3.4, item 8): every real anchor in a world quotes its source
 * exactly, at its offsets, inside the section it names. A reviewer cannot overturn it (R10).
 */
import { anchorLists, isPlaceholder, type AnchorRef, type SourceText } from "@paperplay/contracts";

export interface ProvenanceProblem {
  readonly path: string;
  readonly message: string;
}

export function checkProvenance(spec: unknown, source: SourceText): ProvenanceProblem[] {
  const problems: ProvenanceProblem[] = [];
  for (const list of anchorLists(spec, [])) {
    list.anchors.forEach((raw, index) => {
      const anchor = raw as AnchorRef;
      const path = [...list.path, index].join(".");
      if (isPlaceholder(anchor)) return;
      if (anchor.sourceId !== source.sourceId) {
        problems.push({ path, message: `points at ${anchor.sourceId}, not ${source.sourceId}` });
        return;
      }
      const held = source.text.slice(anchor.charStart, anchor.charEnd);
      if (held !== anchor.quote) problems.push({ path, message: `its quote is not the source's text at ${anchor.charStart}–${anchor.charEnd}` });
      const section = source.sections.find((candidate) => candidate.id === anchor.sectionId);
      if (!section) problems.push({ path, message: `the source has no section ${anchor.sectionId}` });
      else if (!(section.start <= anchor.charStart && anchor.charEnd <= section.end)) problems.push({ path, message: `its span lies outside section ${anchor.sectionId}` });
    });
  }
  return problems;
}
