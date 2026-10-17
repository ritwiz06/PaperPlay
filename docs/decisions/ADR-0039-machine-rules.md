# ADR-0039: No personal data out, and live jobs never beside a gate

- Status: accepted. The owner's rules (2026-10-16), after two of my mistakes: the owner's email
  address sent in a request header to journals.plos.org, and gates run while live jobs loaded the
  machine. The mechanisms are mine.
- Date: 2026-10-16
- Decided by: the owner, the rules; me, how they are held.

## Context

Downloading the hepatitis C paper's PDF by hand, I put the owner's address in a User-Agent header;
it reached a service the owner did not choose and cannot be taken back. Separately, the gate failed
twice in its browser tests, each world's first frame later than its 5 seconds, while a live job and
a capture browser shared the machine; and I left loops waiting on a live job long after it ended.

## Decision

1. **No personal data in any outbound request unless the owner opted in.** An API that asks for a
   contact address (NCBI's E-utilities, as its `tool` and `email` parameters; arXiv, in the user
   agent) gets `PAPERPLAY_CONTACT_EMAIL` from `apps/api/.env`, which the owner sets and which is
   unset by default. Unset, no request carries an address. One that is not an address is refused,
   never sent.
   - Every source fetch goes through `outboundFetch` (`apps/api/src/contact.ts`), which adds the
     address with `withContact` only when it is set; `/create`'s jobs, `pipeline:live serve`,
     `npm run ingest` and the routing set all use it.
   - `apps/api/test/outbound.test.ts` holds it: every route's requests carry no address in a URL
     or a header when none is set, and carry it only to the APIs that ask when it is; the model
     gateway's requests carry the key and no address; and no source file holds an address.
   - The bundle secret check guards the address as it guards keys.
2. **Live jobs and gates never share the machine** (`scripts/machine/locks.ts`):
   - `npm run pipeline:live` holds a live lock for as long as a command that calls the gateway runs
     (`rescore` and `report` call nothing and hold none); `npm run check:gate` holds a gate lock;
   - each refuses to start while the other's lock is held, naming the process and since when; land
     refuses first of all, before it runs the gate or pushes;
   - the locks are files in the repository's common git directory, so every worktree sees them; each
     names its process, so a lock left by a process that has ended is cleared when next read.
3. **The first-frame timeouts stay as they are.** A gate that misses a frame under load is run again
   on a quiet machine, never given longer to wait.

Both rules are in CLAUDE.md's boundaries, 9 and 10.

## Consequences

- A live job and a gate cannot be started together by mistake on this machine, from any worktree.
  Two live commands may run together; so may two gates, which share nothing but the machine.
- `pipeline:live serve` holds its lock while it runs, idle or not: land waits for it to be stopped.
- An owner who wants NCBI to know who calls sets one line in `apps/api/.env`.
