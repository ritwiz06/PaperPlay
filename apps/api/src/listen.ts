/**
 * The API's start (ADR-0059): on 127.0.0.1 and the port from PAPERPLAY_API_PORT; a port another
 * process holds is said plainly, with who holds it, and the API exits without a stack trace; once
 * listening it is recorded as PaperPlay's, so `npm run stop` can stop it, an older PaperPlay server
 * still running is named, and the URL is said.
 */
import type { FastifyInstance } from "fastify";
import { apiPort, HOST, urlOf, webPort } from "../../../scripts/machine/ports.ts";
import { busyMessage, ensurePortFree, holdersOf, registerServer, staleWarnings } from "../../../scripts/machine/servers.ts";

export async function listen(app: FastifyInstance, role: string, calls: string): Promise<void> {
  const port = apiPort();
  await ensurePortFree(port, "the API", "PAPERPLAY_API_PORT");
  try {
    await app.listen({ host: HOST, port });
  } catch (error) {
    // Taken in the moment between the check and the listen: the same plain message.
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    console.error(busyMessage(port, "the API", "PAPERPLAY_API_PORT", holdersOf(port)));
    process.exit(1);
  }
  registerServer(role, port);
  for (const warning of staleWarnings()) console.log(warning);
  console.log(`PaperPlay API: ${urlOf(port)}, with ${calls}; the app at ${urlOf(webPort(), "/create")} reaches it through /api.`);
}
