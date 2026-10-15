/**
 * The live client's fetch, on node:https (ADR-0030's amendment). Node's own fetch gives up on any
 * reply whose headers take more than 300 seconds, before the adapter's timeout (configured at 600)
 * can, and a reasoning model on a long paper takes longer. This one has no limit of its own: the
 * adapter's timeout, through the abort signal, is the only one. It reads the whole body before it
 * answers, so that timeout covers the body too.
 */
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export interface NodeFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export function nodeFetch(url: string, init: NodeFetchInit = {}): Promise<Response> {
  const target = new URL(url);
  const request = target.protocol === "https:" ? httpsRequest : target.protocol === "http:" ? httpRequest : null;
  if (!request) return Promise.reject(new TypeError(`${target.protocol} is not a protocol the gateway's client speaks`));
  return new Promise((resolve, reject) => {
    const outgoing = request(target, { method: init.method ?? "GET", headers: { ...init.headers }, ...(init.signal ? { signal: init.signal } : {}) }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
      incoming.on("error", reject);
      incoming.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = incoming.statusCode ?? 0;
        resolve(new Response(status === 204 || status === 304 ? null : Buffer.concat(chunks), { status, statusText: incoming.statusMessage ?? "", headers }));
      });
    });
    outgoing.on("error", reject);
    if (init.body !== undefined) outgoing.write(init.body);
    outgoing.end();
  });
}
