/**
 * No personal data leaves this machine unless the owner opted in (ADR-0039). An API that asks for
 * a contact address, NCBI's E-utilities and arXiv's, gets PAPERPLAY_CONTACT_EMAIL from
 * apps/api/.env, which the owner sets and which is unset by default; unset, no outbound request
 * carries an address. Every fetch of a source goes through `outboundFetch`.
 */
import { withContact, type Fetch } from "@paperplay/pipeline/ingest";
import { ENV_FILE, envValue } from "./models/live.ts";

export const CONTACT_NAME = "PAPERPLAY_CONTACT_EMAIL";

/** The owner's contact address, or null when it is not set. One that is not an address is refused, not sent. */
export function readContact(file: string = ENV_FILE): string | null {
  const value = envValue(CONTACT_NAME, file);
  if (value.length === 0) return null;
  if (!/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(value)) throw new Error(`${CONTACT_NAME} in ${file} is not an email address; it is sent to no one`);
  return value;
}

/** The network every source is fetched over, with the owner's address only where it is set. */
export function outboundFetch(file: string = ENV_FILE): Fetch {
  return withContact((url, init) => fetch(url, init), readContact(file));
}
