import { beforeAll, describe, expect, it } from "vitest";

/**
 * Integration test over the real service layer and the real database.
 *
 * The adapter is forced to PGlite in memory, so the schema, the check
 * constraints, the partial unique index and the transactions under test are the
 * same statements production runs. Nothing here is mocked: appendEvent, filePlate,
 * updatePlate, recordDecision, retirePlate and verifyPlate are the functions the
 * HTTP routes and the MCP tools call.
 */

process.env.PGLITE_DIR = ":memory:";
process.env.OPENPLATE_OFFLINE = "1";

import { getRepository } from "@/lib/db";
import { appendEvent, assessPlate, filePlate, recordDecision, retirePlate, updatePlate, verifyPlate } from "@/lib/service";
import { newShareCode } from "@/lib/session";
import { isShareCode } from "@/lib/validation";
import { GENESIS_SEAL } from "@/lib/integrity/chain";
import type { AuditEvent, Jurisdiction, UseKind } from "@/lib/types";

const OWNER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_OWNER = "11111111-2222-4333-8444-555555555555";

beforeAll(async () => {
  const repository = await getRepository();
  await repository.init();
});

describe("store adapter", () => {
  it("reports the adapter it actually opened", async () => {
    const repository = await getRepository();
    expect(repository.kind).toBe("pglite");
  });

  it("answers a health probe by really querying", async () => {
    const repository = await getRepository();
    const health = await repository.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.detail).toContain("term rules seeded");
  });

  it("seeds the term rules idempotently", async () => {
    const repository = await getRepository();
    const first = await repository.listJurisdictionRules();
    const second = await repository.listJurisdictionRules();
    expect(first).toHaveLength(6);
    expect(second).toHaveLength(first.length);
    expect(first.find((rule) => rule.id === "us")?.publicationCutoffYears).toBe(95);
  });
});

describe("share codes", () => {
  it("produces codes that pass the route's own validator", () => {
    for (let index = 0; index < 50; index += 1) {
      const code = newShareCode();
      expect(isShareCode(code)).toBe(true);
      expect(code).toHaveLength(12);
    }
  });

  it("does not repeat", () => {
    const codes = new Set(Array.from({ length: 200 }, () => newShareCode()));
    expect(codes.size).toBe(200);
  });
});

describe("the core CRUD loop", () => {
  it("files, reads back, updates, assesses, decides, verifies and retires", async () => {
    const repository = await getRepository();

    // 1. create
    const created = await filePlate(OWNER, {
      workId: "met:11298",
      use: "editorial" as UseKind,
      jurisdiction: "us" as Jurisdiction,
      circulation: 10_000,
      note: "Integration test",
      idempotencyKey: "integration-0001",
    });

    expect(created.deduplicated).toBe(false);
    expect(created.plate.title).toBe("A Jaguar");
    expect(created.plate.status).toBe("draft");
    expect(created.plate.decision).toBeNull();
    expect(created.verification.ok).toBe(true);
    expect(created.events[0].prevSeal).toBe(GENESIS_SEAL);
    expect(created.plate.seal).toBe(created.events[0].seal);

    const plateId = created.plate.id;

    // 2. read back
    const read = await repository.getPlate(OWNER, plateId);
    expect(read?.title).toBe("A Jaguar");
    expect(read?.note).toBe("Integration test");
    expect(read?.workSnapshot.id).toBe("met:11298");
    // The snapshot keeps the credit-line inputs even if the institution changes.
    expect(read?.workSnapshot.creator.deathYear).toBe(1907);

    // 3. update, and the verdict moves with the input
    const updated = await updatePlate(OWNER, plateId, { use: "merchandise", circulation: 250_000 });
    expect(updated.plate.use).toBe("merchandise");
    expect(updated.plate.circulation).toBe(250_000);
    expect(updated.verification.ok).toBe(true);
    expect(updated.verification.eventCount).toBe(2);
    expect(updated.assessment.score).toBeLessThan(created.assessment.score);

    // 4. assess the same plate a different way without saving it. A work whose
    // term expired decades ago stays "clear" even for broadcast, so the honest
    // assertion is that the score moved and that nothing was written.
    const hypothetical = await assessPlate(updated.plate, { use: "broadcast" });
    expect(hypothetical.score).toBeLessThan(updated.assessment.score);
    expect(updated.plate.use).toBe("merchandise");
    // The hypothetical is recomputed, not stored: re-reading returns the saved one.
    const reread = await repository.getPlate(OWNER, plateId);
    expect(reread?.use).toBe("merchandise");
    expect((await repository.listEvents(plateId)).length).toBe(2);

    // 5. record the decision, sealed with the verdict that was read
    const decided = await recordDecision(OWNER, plateId, "approved", "Term satisfied and the credit line is complete.");
    expect(decided.plate.decision).toBe("approved");
    expect(decided.plate.decisionBand).toBe(updated.assessment.band);
    expect(decided.plate.decisionScore).toBe(updated.assessment.score);
    expect(decided.plate.decisionSeal).toBe(decided.events[decided.events.length - 1].seal);
    expect(decided.verification.ok).toBe(true);
    expect(decided.verification.eventCount).toBe(3);

    // 6. verify the chain replay
    const verification = await verifyPlate(plateId);
    expect(verification.ok).toBe(true);
    expect(verification.brokenAtSeq).toBeNull();
    expect(verification.eventCount).toBe(3);
    expect(verification.headSeal).toBe(decided.plate.seal);

    // 7. retire as a tombstone
    const retired = await retirePlate(OWNER, plateId);
    expect(retired.plate.deletedAt).not.toBeNull();
    expect(retired.plate.status).toBe("retired");
    // Still readable when asked for explicitly, still verifiable.
    expect(retired.verification.ok).toBe(true);
    expect(retired.verification.eventCount).toBe(4);

    // Gone from the default listing.
    expect(await repository.getPlate(OWNER, plateId)).toBeNull();
    expect(await repository.getPlate(OWNER, plateId, true)).not.toBeNull();
    expect(await repository.countPlates(OWNER)).toBe(0);
  });

  it("is idempotent when the same key is replayed", async () => {
    const first = await filePlate(OWNER, {
      workId: "cle:135382",
      use: "editorial",
      jurisdiction: "eu",
      circulation: 5000,
      note: "idempotency",
      idempotencyKey: "replay-me-000001",
    });
    const second = await filePlate(OWNER, {
      workId: "cle:135382",
      use: "editorial",
      jurisdiction: "eu",
      circulation: 5000,
      note: "idempotency",
      idempotencyKey: "replay-me-000001",
    });
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.plate.id).toBe(first.plate.id);
  });

  it("refuses to make one visitor's plate readable by another", async () => {
    const repository = await getRepository();
    const mine = await filePlate(OWNER, {
      workId: "met:316666",
      use: "personal",
      jurisdiction: "uk",
      circulation: 1,
      note: "",
      idempotencyKey: null,
    });
    expect(await repository.getPlate(OTHER_OWNER, mine.plate.id)).toBeNull();
    expect(await repository.getPlate(OWNER, mine.plate.id)).not.toBeNull();
    // The share code is the one deliberate capability URL, and it resolves to the
    // same single record rather than to a list.
    expect((await repository.findPlateByShareCode(mine.plate.shareCode))?.id).toBe(mine.plate.id);
  });

  it("returns nothing for a plate that does not exist", async () => {
    const repository = await getRepository();
    expect(
      await repository.getPlate(OWNER, "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
    expect(await repository.findPlateByShareCode("aaaaaaaaaaaa")).toBeNull();
  });
});

describe("validation at the storage layer", () => {
  it("refuses an impossible circulation", async () => {
    const repository = await getRepository();
    const id = crypto.randomUUID();
    const { event, seal } = await appendEvent(id, "filed", { workId: "met:11298" });
    await expect(
      repository.createPlate(
        {
          id,
          ownerId: OWNER,
          shareCode: newShareCode(),
          idempotencyKey: null,
          workId: "met:11298",
          institution: "met",
          title: "Bad",
          creatorName: "Nobody",
          workSnapshot: { id: "met:11298" } as never,
          use: "editorial",
          jurisdiction: "us",
          circulation: 0,
          note: "",
          seal,
        },
        [event],
      ),
    ).rejects.toThrow();
  });

  it("refuses a decision with no band", async () => {
    const repository = await getRepository();
    const id = crypto.randomUUID();
    const { event, seal } = await appendEvent(id, "filed", { workId: "met:11298" });
    const plate = await repository.createPlate(
      {
        id,
        ownerId: OWNER,
        shareCode: newShareCode(),
        idempotencyKey: null,
        workId: "met:11298",
        institution: "met",
        title: "Half a decision",
        creatorName: "Nobody",
        workSnapshot: { id: "met:11298" } as never,
        use: "editorial",
        jurisdiction: "us",
        circulation: 100,
        note: "",
        seal,
      },
      [event],
    );
    await expect(
      repository.updatePlate(OWNER, plate.id, { decision: "approved" as never }, []),
    ).rejects.toThrow();
  });

  it("stores term settings and reads them back", async () => {
    const repository = await getRepository();
    expect(await repository.getTermSettings(OTHER_OWNER)).toBeNull();
    const saved = await repository.saveTermSettings(OTHER_OWNER, {
      jurisdiction: "ca",
      defaultUse: "merchandise",
      defaultCirculation: 7500,
      preferredInstitution: "cle",
    });
    expect(saved.jurisdiction).toBe("ca");
    const reread = await repository.getTermSettings(OTHER_OWNER);
    expect(reread?.defaultUse).toBe("merchandise");
    expect(reread?.preferredInstitution).toBe("cle");
  });
});

describe("audit trail", () => {
  it("records one event per action, in order, all linked", async () => {
    const repository = await getRepository();
    const created = await filePlate(OWNER, {
      workId: "met:19275",
      use: "editorial",
      jurisdiction: "us",
      circulation: 1000,
      note: "audit",
      idempotencyKey: null,
    });
    await updatePlate(OWNER, created.plate.id, { note: "audit, amended" });
    await recordDecision(OWNER, created.plate.id, "rejected", "Institution marks it in copyright.");

    const events: AuditEvent[] = await repository.listEvents(created.plate.id);
    expect(events.map((event) => event.eventType)).toEqual([
      "filed",
      "updated",
      "decision_recorded",
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3]);

    let prev = GENESIS_SEAL;
    for (const event of events) {
      expect(event.prevSeal).toBe(prev);
      prev = event.seal;
    }
    expect((await verifyPlate(created.plate.id)).ok).toBe(true);

    // A blocked record must record a rejected decision without complaint.
    expect(created.assessment.band).toBe("blocked");
  });

  it("survives a simulated database tamper and reports where it broke", async () => {
    const repository = await getRepository();
    const created = await filePlate(OWNER, {
      workId: "cle:136510",
      use: "educational",
      jurisdiction: "au",
      circulation: 300,
      note: "tamper",
      idempotencyKey: null,
    });
    expect((await verifyPlate(created.plate.id)).ok).toBe(true);

    const events = await repository.listEvents(created.plate.id);
    // The genesis event is what a record of the filing consists of.
    expect(events[0].payload.title).toBe("Water Lilies (Agapanthus)");
    expect(events[0].payload.workId).toBe("cle:136510");
    expect(events[0].payload.jurisdiction).toBe("au");

    // Now show that the verifier catches a rewritten payload, which is exactly
    // what somebody with SQL access could do to a stored audit row.
    const { verifyChain } = await import("@/lib/integrity/chain");
    const tampered = [
      { ...events[0], payload: { ...events[0].payload, jurisdiction: "us" } },
      ...events.slice(1),
    ];
    const result = verifyChain(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(1);
    expect(result.reason).toContain("seal recomputed");
  });
});