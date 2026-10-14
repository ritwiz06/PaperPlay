# ADR-0030: The model provider, ASU Research Computing's Voyager gateway

- Status: accepted. Supersedes ADR-0024's approval of the Anthropic SDK (its item 5); the LaTeX
  parser and the PDF text extractor stay approved.
- Date: 2026-10-14
- Decided by: the owner chose the provider, the key's place, recording and replay, the probe,
  the fallback, and where generation may run. The adapter's form is mine, as the owner asked.

## Context

The pipeline needs language models for its reading, transcribing, planning, explaining,
reviewing and routing stages. ASU Research Computing runs Voyager, an OpenAI-compatible gateway
to several vendors' models, free to use for university work. The key was in a `.env` at the
repository's root; the brief keeps secrets in `apps/api/.env` only.

## Decision

1. **The provider is Voyager,** at `https://openai.rc.asu.edu/v1`, OpenAI-compatible. Its key is
   `VOYAGER_API_KEY`:
   - it lives only in `apps/api/.env`, mode 600, which `.gitignore` covers. On 2026-10-14 it moved
     there from the repository's root; `apps/api/.env.example` names it with no value;
   - none of the repository's 2,565 objects, reachable or not, holds its value, scanned without
     printing it;
   - the key has the `sk_` format.
2. **The bundle secret check** (`scripts/check-bundle.ts`, `scripts/bundle/secrets.ts`) runs in
   `npm run build`, so the gate's build step, CI and the deploy all fail on a leak. The bundle may
   not hold a key in the `sk_` or `sk-` format, a key variable's name, the gateway's host, or,
   where `apps/api/.env` is present, any of its key values. A finding names the file and the
   rule, never the text.
3. **One adapter, on plain `fetch`,** not the `openai` package:
   - the pipeline needs two calls, chat completions and the model list, so the package's surface
     buys little;
   - the adapter owns its timeouts, retries with backoff and rate limiting, and the package's own
     retries would stack on them;
   - every call must be recorded and replayed byte for byte, which is simplest where the request
     and response are plain JSON the adapter builds and reads itself;
   - no new dependency, and nothing that could read the key from the environment by default.
4. **The adapter's duties:**
   - per-stage model ids in configuration, never in code;
   - a timeout per call, retries with exponential backoff on 429, 5xx and network errors, and a
     rate limit;
   - a per-job token budget, counted from the gateway's usage and recorded in the job's trace.
     Usage is free; the budget stays;
   - **every call recorded:** the model, a hash of the prompt, and the response.
5. **Tests and CI replay recordings and never call Voyager.** Only `npm run pipeline:live` makes a
   live call; it is never run by the gate or CI.
6. **A capability probe,** for each candidate model: does it honour JSON-schema structured output
   on this gateway? Where it does not, the fallback is plain JSON, validated by Zod, retried once
   with the validation error. Models the gateway marks "Testing in progress" are skipped.
7. **Generation runs only locally,** or on a server the owner controls. The static build on Vercel
   never holds the key, the API, or a working `/create`; the public site only plays worlds built
   beforehand.

## Consequences

- **ADR-0024's "per-job token and cost budget" becomes a token budget:** the gateway charges
  nothing, but a runaway job still stops.
- **A second vendor is reachable through the same adapter,** so the second transcription
  (ADR-0024, item 2) can come from a different vendor's model than the first.
- **Recordings are evidence:** a recorded run replays in tests, so a stage's behaviour on a paper
  is fixed until it is re-recorded on purpose.
- **What the bundle check cannot see:** a secret in a form none of its rules names, when
  `apps/api/.env` is absent, as on CI.
