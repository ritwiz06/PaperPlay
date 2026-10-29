/**
 * Where PaperPlay's servers listen (ADR-0059): one address, 127.0.0.1, and ports from settings, so
 * another app on this machine never shares one. "localhost" may resolve to ::1 for one program and
 * to 127.0.0.1 for another, and two servers then hold "the same" port at once; every PaperPlay
 * server binds 127.0.0.1 by number, and every URL it prints names it.
 *
 * - PAPERPLAY_WEB_PORT, the web app (default 5180);
 * - PAPERPLAY_API_PORT, the local API (default 8787);
 * - PAPERPLAY_TEST_WEB_PORT and PAPERPLAY_TEST_BUILT_PORT, the browser tests' own development
 *   server and built app (defaults 4317 and 4318), apart from the ones a person has open.
 * No other file names these ports.
 */

/** The one address every PaperPlay server binds and every URL names. */
export const HOST = "127.0.0.1";

const DEFAULTS = Object.freeze({ PAPERPLAY_WEB_PORT: 5180, PAPERPLAY_API_PORT: 8787, PAPERPLAY_TEST_WEB_PORT: 4317, PAPERPLAY_TEST_BUILT_PORT: 4318 });
export type PortSetting = keyof typeof DEFAULTS;

/** A port from its setting, or its default; a setting that is not a port from 1024 to 65535 is refused, by name. */
export function portOf(setting: PortSetting, env: Readonly<Record<string, string | undefined>> = process.env): number {
  const given = env[setting];
  if (given === undefined || given.trim() === "") return DEFAULTS[setting];
  const port = Number(given);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new RangeError(`${setting} is "${given}": it must be a whole number from 1024 to 65535`);
  return port;
}

export const webPort = (env?: Readonly<Record<string, string | undefined>>): number => portOf("PAPERPLAY_WEB_PORT", env);
export const apiPort = (env?: Readonly<Record<string, string | undefined>>): number => portOf("PAPERPLAY_API_PORT", env);
export const testWebPort = (env?: Readonly<Record<string, string | undefined>>): number => portOf("PAPERPLAY_TEST_WEB_PORT", env);
export const testBuiltPort = (env?: Readonly<Record<string, string | undefined>>): number => portOf("PAPERPLAY_TEST_BUILT_PORT", env);

/** A URL on a PaperPlay server: always the address by number, never "localhost". */
export const urlOf = (port: number, path = "/"): string => `http://${HOST}:${port}${path.startsWith("/") ? path : `/${path}`}`;
