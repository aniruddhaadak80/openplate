# Contributing to OpenPlate

Thanks for looking. This project is deliberately small and specific, so the most
useful contributions are usually the kind that make a claim more honest rather
than the kind that add a feature.

## The one rule

**Every claim the product makes must be backed by something real.**

That means: no control that does not work, no number that is not computed from
data an institution actually published, no "coming soon", no decorative handler,
and no state that quietly lives in `localStorage` while the interface implies a
backend. If you find one of these, an issue is more useful than a patch, because
it is a statement about the product's contract.

## Getting it running

```bash
npm install
npm run dev
```

That is the whole setup. There is no database to provision and no API key to
obtain: without `DATABASE_URL` the app runs on an embedded PGlite build of
Postgres, and all three upstream institutions are keyless public endpoints.

## Before you open a pull request

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest: engine, hash chain, full CRUD over a real database
npm run build        # the production bundle
npm run smoke        # Playwright: the primary journey through visible controls
```

All five must be green. Please do not suppress a lint rule or delete a test to get
there: fix the implementation. If a rule genuinely fights the codebase, say so in
the pull request and explain the alternative you considered.

## Where things live

| Path | Responsibility |
| --- | --- |
| `src/lib/engine/clearance.ts` | The deterministic engine. Pure, versioned, no I/O. |
| `src/lib/integrity/chain.ts` | Canonical JSON and the SHA-384 seal chain. |
| `src/lib/service.ts` | The domain layer every entry point calls. |
| `src/lib/sources/` | Upstream adapters and the sealed offline sample. |
| `src/lib/db/` | Repository interface, schema, and the two adapters. |
| `src/lib/terms.ts` | Published copyright term lengths and use bands. |
| `src/app/api/` | REST and the JSON-RPC MCP endpoint. |
| `tests/` | Unit and integration tests. |
| `e2e/` | Browser journey. |

## Adding a jurisdiction

Add it to `TERM_RULES` in `src/lib/terms.ts`. Everything else follows: the schema
seeds it, `/terms` renders it from the database, the engine reads it, the
validation enum accepts it, and the MCP manifest publishes it. Add a test that
proves the arithmetic differs from a neighbouring term length.

## Adding a factor to the engine

A factor needs four things, and the tests should fail until all four exist:

1. A weight in `FACTOR_WEIGHTS`. The six weights must sum to exactly 1.
2. A status of `satisfied`, `unresolved` or `failing`. An unresolved factor must
   lower confidence, because a verdict computed from a field nobody published is
   not a verdict.
3. Evidence: a sentence a sceptical reader could check.
4. A test covering the normal case, the boundary, and the case where the input is
   missing.

Do not average the institution's claim into the score and hope it comes out
right. If the institution says a record is in copyright, the answer is `blocked`,
and the score is only there to explain how close the other factors got.

## Changing the chain format

The seal algorithm is public and load-bearing: seals already written into
somebody's database must keep verifying. `seal_n = SHA-384(UTF-8(prevSeal) ||
canonicalJson(event_n))` with recursively sorted keys is pinned by a known vector
in `tests/chain.test.ts`. Changing it is a breaking change and needs a migration
and a version bump, not an edit.

## Commit and pull request conventions

Small commits, one concern each. Write the subject as an imperative sentence
under 72 characters. In the pull request body:

- say what behaviour changed, and what a user would notice;
- paste the `npm run test` summary line;
- for anything touching `clearance.ts`, include the before and after score for
  one real record, so a reviewer can see the arithmetic move;
- for anything touching an upstream adapter, name the institution and say whether
  the change was verified against the live API.

## Reporting a security problem

Please do not open a public issue. See [SECURITY.md](SECURITY.md) for the contact
route and what makes a report useful.

## Code of conduct

Be straightforward and courteous. Assume the other person is trying to help. Review
the code, not the person.