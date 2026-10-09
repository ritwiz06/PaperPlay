/**
 * Imported first, before any schema parses: the deploy's Content-Security-Policy forbids eval
 * (ADR-0017), so Zod must not compile its parsers with `new Function`, nor probe whether it can.
 * Its interpreted parsers give the same results.
 */
import { config } from "zod";

config({ jitless: true });
