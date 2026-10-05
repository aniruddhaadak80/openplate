import { createHash } from "node:crypto";

/**
 * Canonical JSON and the per-plate SHA-384 hash chain.
 *
 * The point of the chain is that a later reader can replay it and find the first
 * event that was altered. That only works if serialisation is canonical, so
 * object keys are sorted recursively and undefined members are dropped. Arrays
 * are semantically ordered and are deliberately left alone: reordering them would
 * change the meaning of a payload rather than normalise it.
 *
 * seal_n = SHA-384( UTF-8(prevSeal) || canonicalJson(event_n) )
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const member = canonicalize(source[key]);
      if (member !== undefined) result[key] = member;
    }
    return result;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** The first event of every chain links to this fixed, documented value. */
export const GENESIS_SEAL = createHash("sha384")
  .update("openplate/chain/genesis/v1", "utf8")
  .digest("hex");

export interface SealedEvent {
  seq: number;
  eventType: string;
  entityId: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

/**
 * The exact object that gets hashed. It is a closed set of members so a future
 * field added to an event type cannot silently change the meaning of a seal
 * already written to the database.
 */
function sealable(event: SealedEvent): Record<string, unknown> {
  return {
    seq: event.seq,
    eventType: event.eventType,
    entityId: event.entityId,
    createdAt: event.createdAt,
    payload: canonicalize(event.payload),
  };
}

export function computeSeal(prevSeal: string, event: SealedEvent): string {
  return createHash("sha384")
    .update(
      Buffer.concat([
        Buffer.from(prevSeal, "utf8"),
        Buffer.from(canonicalJson(sealable(event)), "utf8"),
      ]),
    )
    .digest("hex");
}

/**
 * Replay a chain from genesis and report the first link that does not hold.
 * A tampered payload, a rewritten seal, a missing event and a reordered chain
 * all fail here, each at its own sequence number.
 */
export function verifyChain(
  events: readonly {
    seq: number;
    eventType: string;
    entityId: string;
    payload: Record<string, unknown>;
    prevSeal: string;
    seal: string;
    createdAt: string;
  }[],
): {
  ok: boolean;
  eventCount: number;
  brokenAtSeq: number | null;
  reason: string | null;
  headSeal: string;
} {
  if (events.length === 0) {
    return {
      ok: true,
      eventCount: 0,
      brokenAtSeq: null,
      reason: null,
      headSeal: GENESIS_SEAL,
    };
  }

  let expectedPrev = GENESIS_SEAL;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.seq !== index + 1) {
      return {
        ok: false,
        eventCount: events.length,
        brokenAtSeq: event.seq,
        reason: `expected sequence ${index + 1} but found ${event.seq}`,
        headSeal: expectedPrev,
      };
    }
    if (event.prevSeal !== expectedPrev) {
      return {
        ok: false,
        eventCount: events.length,
        brokenAtSeq: event.seq,
        reason: "previous seal does not match the seal of the preceding event",
        headSeal: expectedPrev,
      };
    }
    const recomputed = computeSeal(event.prevSeal, {
      seq: event.seq,
      eventType: event.eventType,
      entityId: event.entityId,
      createdAt: event.createdAt,
      payload: event.payload,
    });
    if (recomputed !== event.seal) {
      return {
        ok: false,
        eventCount: events.length,
        brokenAtSeq: event.seq,
        reason: "stored seal does not match the seal recomputed from the event",
        headSeal: expectedPrev,
      };
    }
    expectedPrev = event.seal;
  }

  return {
    ok: true,
    eventCount: events.length,
    brokenAtSeq: null,
    reason: null,
    headSeal: expectedPrev,
  };
}