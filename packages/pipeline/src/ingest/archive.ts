/**
 * An arXiv source download, unpacked in memory and nowhere else (every-paper.md §3.1). arXiv sends
 * either a gzipped tar of the paper's files or a single gzipped file. Nothing from it is ever run or
 * written to disk: regular files only, no links, no path that climbs out, and limits on the number
 * and size of files, so a hostile archive is refused rather than followed.
 */
import { gunzipSync } from "node:zlib";

export interface ArchiveFile {
  /** Its path inside the archive, normalised: no leading slash, no "." or ".." segments. */
  readonly path: string;
  readonly bytes: Uint8Array;
}

export const ARCHIVE_LIMITS = Object.freeze({ files: 2000, fileBytes: 20_000_000, totalBytes: 80_000_000 });

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}

const textOf = (bytes: Uint8Array, start: number, length: number): string => {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return new TextDecoder("utf-8").decode(end < 0 ? slice : slice.subarray(0, end));
};

/** A path from inside an archive, or null when it would climb out or is empty. */
export function safePath(raw: string): string | null {
  const parts: string[] = [];
  for (const part of raw.replaceAll("\\", "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  return parts.length === 0 ? null : parts.join("/");
}

/** The regular files of a ustar or GNU tar, in order. Links, devices and paths that climb out are refused. */
export function readTar(bytes: Uint8Array): ArchiveFile[] {
  const files: ArchiveFile[] = [];
  let total = 0;
  let longName: string | null = null;
  for (let offset = 0; offset + 512 <= bytes.length; ) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(textOf(header, 124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0) throw new ArchiveError(`a tar header at byte ${offset} gives no size`);
    const type = String.fromCharCode(header[156] ?? 48);
    const prefix = textOf(header, 345, 155);
    const name = longName ?? (prefix ? `${prefix}/${textOf(header, 0, 100)}` : textOf(header, 0, 100));
    longName = null;
    const body = offset + 512;
    if (body + size > bytes.length) throw new ArchiveError(`${name} runs past the end of the archive`);
    if (type === "L") longName = textOf(bytes, body, size);
    else if (type === "0" || type === "\0" || type === "7") {
      const path = safePath(name);
      if (path === null) throw new ArchiveError(`the archive holds a path that climbs out of it: ${name}`);
      if (size > ARCHIVE_LIMITS.fileBytes) throw new ArchiveError(`${path} is larger than ${ARCHIVE_LIMITS.fileBytes} bytes`);
      total += size;
      if (total > ARCHIVE_LIMITS.totalBytes) throw new ArchiveError(`the archive holds more than ${ARCHIVE_LIMITS.totalBytes} bytes`);
      files.push({ path, bytes: bytes.slice(body, body + size) });
      if (files.length > ARCHIVE_LIMITS.files) throw new ArchiveError(`the archive holds more than ${ARCHIVE_LIMITS.files} files`);
    } else if (type === "1" || type === "2" || type === "3" || type === "4" || type === "6") {
      throw new ArchiveError(`the archive holds a link or device, ${name}, which is never followed`);
    }
    // Directories ("5"), pax headers ("x", "g") and anything else hold no file of their own.
    offset = body + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** An arXiv source download as files: a gzipped tar, or one gzipped file, named after the paper. */
export function unpackSource(download: Uint8Array, fallbackName: string): ArchiveFile[] {
  const isGzip = download[0] === 0x1f && download[1] === 0x8b;
  const raw = isGzip ? new Uint8Array(gunzipSync(download, { maxOutputLength: ARCHIVE_LIMITS.totalBytes })) : download;
  const isTar = raw.length >= 512 && textOf(raw, 257, 5) === "ustar";
  if (isTar) return readTar(raw);
  if (raw.length > ARCHIVE_LIMITS.fileBytes) throw new ArchiveError(`the source is larger than ${ARCHIVE_LIMITS.fileBytes} bytes`);
  const isPdf = textOf(raw, 0, 5) === "%PDF-";
  return [{ path: isPdf ? `${fallbackName}.pdf` : `${fallbackName}.tex`, bytes: raw }];
}
