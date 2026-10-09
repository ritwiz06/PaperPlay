/**
 * The worlds a gate requires as reviewed (gates.json `reviewedWorlds`): each must parse as a
 * WorldSpec with status "reviewed", so it holds no placeholder anchor and no pending source.
 * G2 cannot pass while the flocking world is a draft (owner, 2026-10-09).
 */
import { isPlaceholder, WorldSpec, type AnchorRef } from "@paperplay/contracts";

/** Every anchor in a value, wherever it sits. */
function anchorsIn(value: unknown, found: AnchorRef[] = []): AnchorRef[] {
  if (Array.isArray(value)) for (const item of value) anchorsIn(item, found);
  else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "anchors" && Array.isArray(child)) found.push(...(child as AnchorRef[]));
      else anchorsIn(child, found);
    }
  }
  return found;
}

/** Why a world is not yet reviewed, in words; empty when it is. */
export function reviewProblems(path: string, json: unknown): string[] {
  const parsed = WorldSpec.safeParse(json);
  if (!parsed.success) return [`${path} is not a valid WorldSpec: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`];
  const spec = parsed.data;
  if (spec.status === "reviewed") return [];
  const placeholders = anchorsIn(spec).filter(isPlaceholder).length;
  const pending = "pending" in spec.source ? ", and its source is pending" : "";
  return [`${path} is a draft: it holds ${placeholders} placeholder ${placeholders === 1 ? "anchor" : "anchors"}${pending}. Review it against the source map first.`];
}
