import { buildServer } from "./server.ts";

const port = Number(process.env.PORT ?? 8787);
const app = buildServer();
await app.listen({ host: "127.0.0.1", port });
console.log(`PaperPlay API listening on http://127.0.0.1:${port}`);
