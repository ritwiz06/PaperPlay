/**
 * A generated mechanism's sandbox driver (ADR-0058): the script both sandboxes run beside a module,
 * as a string. Nothing here runs a module; the pipeline and the web app each do, in their own sandbox.
 */
export { BLOCKED_GLOBALS, driverScript, MODULE_FILE, moduleLine, WORKER_PORT } from "./driver.ts";
