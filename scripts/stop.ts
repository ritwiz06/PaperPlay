/**
 * npm run stop: stops PaperPlay's own servers and background runs on this machine, the ones it
 * recorded when it started them (ADR-0059), and nothing else. Another app's server, such as Replay
 * World's, is never touched.
 */
import { stopServers } from "./machine/servers.ts";

const said = await stopServers();
console.log(said.length > 0 ? said.join("\n") : "PaperPlay: none of its servers or background runs is running.");
