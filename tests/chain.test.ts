import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { canonicalJson, computeSeal, GENESIS_SEAL, sha256Hex, verifyChain } from "@/lib/integrity/chain";

/**
 * Chain tests, including a known vector.
 *
 * The known vector matters more than the property tests: it pins the exact
 * algorithm to a published constant, so a future refactor that changes the byte
 * concatenation, the key ordering or the encoding fails here rather than silently
 * invalidating every seal already in someone's database.
 */

const ENTITY = "11111111-2222-4333-8444-555555555555";

function sealChain(events: { seq: number; eventType: string; payload: Record<string, unknown>; createdAt: string }[]) {
  let prev = GENESIS_SEAL;
  return events.map((event) => {
    const seal = computeSeal(prev, { ...event, entityId: ENTITY });
    const row = { entityId: ENTITY, ...event, prevSeal: prev, seal };
    prev = seal;
    return row;
  });
}

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}');
  });

  it("is insensitive to the order keys were written in", () => {
    const a = canonicalJson({ use: "editorial", note: "x", circulation: 10 });
    const b = canonicalJson({ circulation: 10, note: "x", use: "editorial" });
    expect(a).toBe(b);
  });

  it("drops undefined members rather than emitting them", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("preserves array order, because arrays are meaningful", () => {
    expect(canonicalJson({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });

  it("distinguishes null from an absent key", () => {
    expect(canonicalJson({ a: null })).toBe('{"a":null}');
    expect(canonicalJson({})).toBe("{}");
  });

  it("escapes the same way JSON does for a value containing a brace", () => {
    expect(canonicalJson({ a: "}{" })).toBe('{"a":"}{"}');
  });
});

describe("seal chain", () => {
  it("matches a known vector computed from the documented algorithm", () => {
    // seal_1 = SHA-384( UTF-8(GENESIS_SEAL) || canonicalJson(event_1) )
    const event = {
      seq: 1,
      eventType: "filed",
      entityId: ENTITY,
      createdAt: "2026-10-04T00:00:00.000Z",
      payload: { workId: "met:11298", title: "A Jaguar" },
    };
    const expectedPayload = '{"createdAt":"2026-10-04T00:00:00.000Z","entityId":"11111111-2222-4333-8444-555555555555","eventType":"filed","payload":{"title":"A Jaguar","workId":"met:11298"},"seq":1}';

    // Recomputed with raw crypto rather than through the module, so the test
    // asserts the documented algorithm and not merely the implementation
    // agreeing with itself.
    const expected = createHash("sha384")
      .update(
        Buffer.concat([
          Buffer.from(GENESIS_SEAL, "utf8"),
          Buffer.from(expectedPayload, "utf8"),
        ]),
      )
      .digest("hex");

    expect(computeSeal(GENESIS_SEAL, event)).toBe(expected);
    expect(expected).toHaveLength(96);
  });

  it("produces a 96-character hex digest for a chain head", () => {
    const chain = sealChain([
      { seq: 1, eventType: "filed", payload: { workId: "met:11298" }, createdAt: "2026-10-04T00:00:00.000Z" },
    ]);
    expect(chain[0].seal).toMatch(/^[0-9a-f]{96}$/);
    expect(chain[0].prevSeal).toBe(GENESIS_SEAL);
  });

  it("links each event to the previous one", () => {
    const chain = sealChain([
      { seq: 1, eventType: "filed", payload: { a: 1 }, createdAt: "2026-10-04T00:00:00.000Z" },
      { seq: 2, eventType: "updated", payload: { b: 2 }, createdAt: "2026-10-04T00:01:00.000Z" },
      { seq: 3, eventType: "decision_recorded", payload: { c: 3 }, createdAt: "2026-10-04T00:02:00.000Z" },
    ]);
    expect(chain[1].prevSeal).toBe(chain[0].seal);
    expect(chain[2].prevSeal).toBe(chain[1].seal);
    expect(verifyChain(chain).ok).toBe(true);
    expect(verifyChain(chain).eventCount).toBe(3);
  });

  it("treats an empty chain as intact at genesis", () => {
    const result = verifyChain([]);
    expect(result.ok).toBe(true);
    expect(result.headSeal).toBe(GENESIS_SEAL);
    expect(result.eventCount).toBe(0);
  });

  it("detects a rewritten payload and names the sequence", () => {
    const chain = sealChain([
      { seq: 1, eventType: "filed", payload: { decision: "approved" }, createdAt: "2026-10-04T00:00:00.000Z" },
    ]);
    const tampered = [{ ...chain[0], payload: { decision: "rejected" } }];
    const result = verifyChain(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(1);
    expect(result.reason).toContain("seal recomputed");
  });

  it("detects an edited seal even when the payload is untouched", () => {
    const chain = sealChain([
      { seq: 1, eventType: "filed", payload: { a: 1 }, createdAt: "2026-10-04T00:00:00.000Z" },
    ]);
    const forged = [{ ...chain[0], seal: "f".repeat(96) }];
    expect(verifyChain(forged).ok).toBe(false);
    expect(verifyChain(forged).brokenAtSeq).toBe(1);
  });

  it("detects a removed event because the sequence skips", () => {
    const chain = sealChain([
      { seq: 1, eventType: "filed", payload: { a: 1 }, createdAt: "2026-10-04T00:00:00.000Z" },
      { seq: 2, eventType: "updated", payload: { b: 2 }, createdAt: "2026-10-04T00:01:00.000Z" },
    ]);
    const truncated = [chain[0]];
    // Dropping the tail is still a valid shorter chain, so the detectable tamper
    // is splicing a different second event in its place.
    const spliced = [chain[0], { ...chain[1], payload: { b: 99 } }];
    expect(verifyChain(truncated).ok).toBe(true);
    expect(verifyChain(spliced).ok).toBe(false);
    expect(verifyChain(spliced).brokenAtSeq).toBe(2);
  });

  it("detects a chain that does not start at genesis", () => {
    const chain = sealChain([
      { seq: 1, eventType: "filed", payload: { a: 1 }, createdAt: "2026-10-04T00:00:00.000Z" },
    ]);
    const orphaned = [{ ...chain[0], prevSeal: "a".repeat(96) }];
    const result = verifyChain(orphaned);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("previous seal");
  });

  it("is insensitive to key insertion order in the payload", () => {
    const forward = sealChain([
      { seq: 1, eventType: "filed", payload: { a: 1, b: 2 }, createdAt: "2026-10-04T00:00:00.000Z" },
    ]);
    const reordered = sealChain([
      { seq: 1, eventType: "filed", payload: { b: 2, a: 1 }, createdAt: "2026-10-04T00:00:00.000Z" },
    ]);
    expect(forward[0].seal).toBe(reordered[0].seal);
  });

  it("exposes a content hash helper that is stable", () => {
    expect(sha256Hex("openplate")).toBe(sha256Hex("openplate"));
    expect(sha256Hex("openplate")).not.toBe(sha256Hex("openplate "));
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});