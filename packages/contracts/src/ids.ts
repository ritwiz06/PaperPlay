import { z } from "zod";

/** A stable identifier: starts with a letter or digit, then letters, digits and . _ : - only. */
export const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "must be a plain identifier");

/** A SHA-256 digest as 64 lowercase hex characters. */
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "must be a lowercase hex SHA-256 digest");
