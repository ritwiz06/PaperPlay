import { HOST, testBuiltPort } from "../../scripts/machine/ports.ts";

/** The production build the tests run against, served as Vercel serves it, on its port from settings (ADR-0059). */
export const BUILT = `http://${HOST}:${testBuiltPort()}`;
