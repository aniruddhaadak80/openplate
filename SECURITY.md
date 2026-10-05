# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Open a private report on GitHub: **Security → Report a vulnerability** on
<https://github.com/aniruddhaadak80/openplate>. That reaches the maintainer
without publishing the detail.

Include, where you can:

- what an attacker can do, and what they need in order to do it;
- the request or the steps to reproduce, with the cookie or share code redacted if
  one is involved;
- whether any real visitor record was affected.

Expect an acknowledgement within a few days. Fixes for confirmed problems ship as
a patch release, and the report is credited unless you would rather it were not.

## What the threat model actually is

OpenPlate has **no accounts**. Anyone who can reach the app can create an anonymous
session and file plates into it. That shapes everything below.

### Ownership boundary

Every plate belongs to an unguessable v4 UUID held in an HTTP-only, SameSite=Lax
cookie, minted in `src/proxy.ts`. Every read and every write is filtered by that
id in SQL, so one visitor cannot read or mutate another's plates. The only
deliberate exception is the share route `/d/<shareCode>`: a share code is a
capability, drawn from a 31-character alphabet with ambiguous characters removed,
twelve characters long, and resolves to exactly one docket. Codes are not
sequential and are not guessable from a plate id or an owner id.

### Abuse controls, and their honest limits

Writes are rate limited in process: 30 mutations per minute per owner, 120 reads
per minute per IP. **On serverless this is best-effort.** A deployment runs many
short-lived instances, so an in-memory counter reliably stops one runaway client
and does not stop a distributed one. Anything needing a hard limit wants a shared
store (Upstash Redis, Vercel KV, or platform-edge rate limiting), which this
project deliberately does not assume exists. Do not rely on this control as a
security boundary.

### Input handling

All input is validated before it reaches SQL or the engine: identifiers are matched
against closed patterns, strings are length-bounded and stripped of control
characters, enums are checked against closed sets, and pagination is clamped. Every
query is parameterised; the only dynamic SQL is a filter clause assembled from
values that passed an enum check first.

### What is not stored

No secrets, no API keys, no third-party credentials. Plate notes are user-authored
free text and are stored as plain text, so do not paste anything confidential into
the note field. No visitor record is rendered as raw HTML: the interface emits
React text nodes, so user content cannot inject markup.

### Upstream calls

Outbound requests are time-bounded, retried a bounded number of times, and go only
to the three configured institutions. Upstream error messages are surfaced to the
client as a provider name and a status; internal detail is not. Stack traces and
environment variables are never returned to a client: an unexpected error becomes
a bare `internal_error`.

### Integrity, and what it does not prove

Each plate carries an append-only SHA-384 hash chain, replayable from a fixed
genesis value, and `GET /api/plates/<id>/verify` reports the first broken link.
This detects *tampering after the fact*. It does **not** prove a decision was
correct, and it does not prevent someone with database write access from rewriting
an entire chain consistently — it only makes a partial edit detectable. Treat the
chain as evidence, not as a guarantee.

### Scope limits

This project is a research tool. It reports what institutions publish and does
arithmetic on published copyright term lengths. **It is not legal advice**, and a
`clear` verdict is not a legal opinion. Users who need real clearance should
contact the institution or a rights adviser.

## Supported versions

Only the latest release on `main` is supported. There is no LTS branch.