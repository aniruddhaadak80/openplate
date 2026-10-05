import { assessClearance, ENGINE_NAME, ENGINE_VERSION } from "./engine/clearance";
import { computeSeal, GENESIS_SEAL, verifyChain } from "./integrity/chain";
import { getRepository, isDurableEnvironment } from "./db";
import { readWork } from "./sources";
import { corroborateCreator } from "./sources/wikidata";
import { newShareCode } from "./session";
import { NotFoundError } from "./api-helpers";
import type {
  AuditEvent,
  AuditEventType,
  ChainVerification,
  ClearanceInput,
  ClearanceResult,
  Jurisdiction,
  PlateRow,
  TermSettings,
  UseKind,
  Work,
} from "./types";

/**
 * The domain layer.
 *
 * Every mutation in the product goes through exactly these functions: the REST
 * routes, the server-rendered pages and the MCP tools all call them, and none of
 * them touch SQL. That is what makes "the agent used the same path as the UI" a
 * structural fact rather than a claim in a README.
 */

export function currentYear(): number {
  return new Date().getUTCFullYear();
}

async function headOf(entityId: string): Promise<{ seq: number; seal: string }> {
  const repository = await getRepository();
  const events = await repository.listEvents(entityId);
  const last = events[events.length - 1];
  return last ? { seq: last.seq, seal: last.seal } : { seq: 0, seal: GENESIS_SEAL };
}

/**
 * Append one event to a plate's chain and return it with its new seal. The head
 * is re-read immediately before the append so the sequence and prevSeal are
 * always the true current ones rather than a cached guess.
 */
export async function appendEvent(
  entityId: string,
  eventType: AuditEventType,
  payload: Record<string, unknown>,
): Promise<{ event: AuditEvent; seal: string }> {
  const head = await headOf(entityId);
  const createdAt = new Date().toISOString();
  const seq = head.seq + 1;
  const seal = computeSeal(head.seal, { seq, eventType, entityId, createdAt, payload });
  return {
    seal,
    event: { entityId, seq, eventType, payload, prevSeal: head.seal, seal, createdAt },
  };
}

export interface PlateView {
  plate: PlateRow;
  work: Work;
  assessment: ClearanceResult;
  events: AuditEvent[];
  verification: ChainVerification;
}

/**
 * Build the assessment for a plate.
 *
 * The creator's life dates are corroborated against Wikidata only when the
 * institution did not publish them, and a failure there degrades to the
 * institution's own record rather than blocking the verdict.
 */
export async function assessPlate(
  plate: PlateRow,
  overrides: Partial<Pick<ClearanceInput, "use" | "jurisdiction" | "circulation" | "asOfYear">> = {},
  options: { corroborate?: boolean } = {},
): Promise<ClearanceResult> {
  const work = plate.workSnapshot;
  const enrichment = options.corroborate
    ? await corroborateCreator(work.creator, { enabled: true })
    : { creator: work.creator, deathYearSource: "unresolved" as const, conflict: false, attribution: "", upstreamId: null };

  const effectiveWork: Work = {
    ...work,
    creator: enrichment.creator,
  };

  const result = assessClearance({
    work: effectiveWork,
    use: overrides.use ?? plate.use,
    jurisdiction: overrides.jurisdiction ?? plate.jurisdiction,
    circulation: overrides.circulation ?? plate.circulation,
    asOfYear: overrides.asOfYear ?? currentYear(),
  });

  if (enrichment.deathYearSource === "wikidata") {
    result.cautions.push(
      `No death year was published by the institution; ${enrichment.upstreamId ?? "Wikidata"} supplied ${enrichment.creator.deathYear}.`,
    );
  }

  return result;
}

export async function verifyPlate(entityId: string): Promise<ChainVerification> {
  const repository = await getRepository();
  const events = await repository.listEvents(entityId);
  const result = verifyChain(events);
  return {
    entityId,
    ok: result.ok,
    brokenAtSeq: result.brokenAtSeq,
    reason: result.reason,
    eventCount: result.eventCount,
    headSeal: result.headSeal,
    genesisSeal: GENESIS_SEAL,
  };
}

export async function getPlateView(
  ownerId: string,
  plateId: string,
  options: { includeDeleted?: boolean; corroborate?: boolean } = {},
): Promise<PlateView> {
  const repository = await getRepository();
  const plate = await repository.getPlate(ownerId, plateId, options.includeDeleted ?? false);
  if (!plate) throw new NotFoundError("That plate is not in your docket.");
  const [assessment, events, verification] = await Promise.all([
    assessPlate(plate, {}, { corroborate: options.corroborate ?? true }),
    repository.listEvents(plate.id),
    verifyPlate(plate.id),
  ]);
  return { plate, work: plate.workSnapshot, assessment, events, verification };
}

export interface FilePlateInput {
  workId: string;
  use: UseKind;
  jurisdiction: Jurisdiction;
  circulation: number;
  note: string;
  idempotencyKey: string | null;
}

export interface FilePlateResult {
  plate: PlateRow;
  assessment: ClearanceResult;
  events: AuditEvent[];
  verification: ChainVerification;
  /** True when an idempotency key matched a plate that already existed. */
  deduplicated: boolean;
}

/**
 * Pin a real work to an intended use.
 *
 * The work is re-read live rather than trusted from the request body, so a plate
 * can only ever be created against a record an institution actually publishes.
 * The snapshot that gets stored is what the credit line will be built from later,
 * even if the institution changes its record tomorrow.
 */
export async function filePlate(ownerId: string, input: FilePlateInput): Promise<FilePlateResult> {
  const repository = await getRepository();

  if (input.idempotencyKey) {
    const existing = await repository.findPlateByIdempotencyKey(ownerId, input.idempotencyKey);
    if (existing) {
      return {
        plate: existing,
        assessment: await assessPlate(existing, {}, { corroborate: false }),
        events: await repository.listEvents(existing.id),
        verification: await verifyPlate(existing.id),
        deduplicated: true,
      };
    }
  }

  const work = await readWork(input.workId);
  if (!work) throw new NotFoundError("That institution has no record with that identifier.");

  const id = crypto.randomUUID();
  const sharedCode = newShareCode();

  const { event, seal } = await appendEvent(id, "filed", {
    workId: work.id,
    title: work.title,
    creator: work.creator.name,
    institution: work.institution,
    use: input.use,
    jurisdiction: input.jurisdiction,
    circulation: input.circulation,
    rightsStatement: work.rightsStatement,
    institutionCleared: work.institutionCleared,
    shareCode: sharedCode,
  });

  const plate = await repository.createPlate(
    {
      id,
      ownerId,
      shareCode: sharedCode,
      idempotencyKey: input.idempotencyKey,
      workId: work.id,
      institution: work.institution,
      title: work.title,
      creatorName: work.creator.name,
      workSnapshot: work,
      use: input.use,
      jurisdiction: input.jurisdiction,
      circulation: input.circulation,
      note: input.note,
      seal,
    },
    [event],
  );

  return {
    plate,
    assessment: await assessPlate(plate, {}, { corroborate: true }),
    events: [event],
    verification: await verifyPlate(plate.id),
    deduplicated: false,
  };
}

export async function updatePlate(
  ownerId: string,
  plateId: string,
  patch: { use?: UseKind; jurisdiction?: Jurisdiction; circulation?: number; note?: string },
): Promise<PlateView> {
  const repository = await getRepository();
  const existing = await repository.getPlate(ownerId, plateId, false);
  if (!existing) throw new NotFoundError("That plate is not in your docket.");

  const before = {
    use: existing.use,
    jurisdiction: existing.jurisdiction,
    circulation: existing.circulation,
    note: existing.note,
  };
  const next = { ...before, ...patch };

  const { event, seal } = await appendEvent(existing.id, "updated", {
    before,
    after: next,
    changed: Object.keys(patch).sort(),
  });

  const plate = await repository.updatePlate(ownerId, plateId, { ...patch, seal }, [event]);
  if (!plate) throw new NotFoundError("That plate is not in your docket.");

  const [assessment, events, verification] = await Promise.all([
    assessPlate(plate, {}, { corroborate: false }),
    repository.listEvents(plate.id),
    verifyPlate(plate.id),
  ]);
  return { plate, work: plate.workSnapshot, assessment, events, verification };
}

/**
 * Record the decision.
 *
 * The band, the score and the seal of the verdict that was actually read are
 * stored with the decision, so a docket records what was concluded at the time
 * instead of quietly re-reporting a different verdict once the terms move.
 */
export async function recordDecision(
  ownerId: string,
  plateId: string,
  decision: "approved" | "conditional" | "rejected",
  note: string,
): Promise<PlateView> {
  const repository = await getRepository();
  const existing = await repository.getPlate(ownerId, plateId, false);
  if (!existing) throw new NotFoundError("That plate is not in your docket.");
  if (existing.status === "retired") throw new NotFoundError("That plate has been retired.");

  const assessment = await assessPlate(existing, {}, { corroborate: false });
  const decidedAt = new Date().toISOString();

  const { event, seal } = await appendEvent(existing.id, "decision_recorded", {
    decision,
    note,
    band: assessment.band,
    score: assessment.score,
    engine: ENGINE_NAME,
    engineVersion: ENGINE_VERSION,
    digest: assessment.digest,
    decidedAt,
  });

  const plate = await repository.updatePlate(
    ownerId,
    plateId,
    {
      decision,
      decisionNote: note,
      decisionAt: decidedAt,
      decisionBand: assessment.band,
      decisionScore: assessment.score,
      decisionSeal: seal,
      status: "decided",
      seal,
    },
    [event],
  );
  if (!plate) throw new NotFoundError("That plate is not in your docket.");

  const [events, verification] = await Promise.all([
    repository.listEvents(plate.id),
    verifyPlate(plate.id),
  ]);
  return { plate, work: plate.workSnapshot, assessment, events, verification };
}

/**
 * Retire a plate. The row survives as a tombstone with its snapshot, decision and
 * chain, so an already-shared docket still replays and a replayed chain never has
 * a hole in it.
 */
export async function retirePlate(ownerId: string, plateId: string): Promise<PlateView> {
  const repository = await getRepository();
  const existing = await repository.getPlate(ownerId, plateId, false);
  if (!existing) throw new NotFoundError("That plate is not in your docket.");

  const { event, seal } = await appendEvent(existing.id, "retired", {
    workId: existing.workId,
    title: existing.title,
    decision: existing.decision,
    decisionBand: existing.decisionBand,
    // No timestamp here on purpose: the event's own createdAt already records it,
    // and a second clock reading would be one more thing to keep in agreement.
    tombstone: true,
  });

  const plate = await repository.retirePlate(ownerId, plateId, seal, [event]);
  if (!plate) throw new NotFoundError("That plate is not in your docket.");

  const [assessment, events, verification] = await Promise.all([
    assessPlate(plate, {}, { corroborate: false }),
    repository.listEvents(plate.id),
    verifyPlate(plate.id),
  ]);
  return { plate, work: plate.workSnapshot, assessment, events, verification };
}

export async function getShareView(shareCode: string): Promise<PlateView> {
  const repository = await getRepository();
  const plate = await repository.findPlateByShareCode(shareCode);
  if (!plate) throw new NotFoundError("No docket has that share code.");
  const [assessment, events, verification] = await Promise.all([
    assessPlate(plate, {}, { corroborate: false }),
    repository.listEvents(plate.id),
    verifyPlate(plate.id),
  ]);
  return { plate, work: plate.workSnapshot, assessment, events, verification };
}

export async function readTermSettings(ownerId: string): Promise<TermSettings> {
  const repository = await getRepository();
  const stored = await repository.getTermSettings(ownerId);
  return (
    stored ?? {
      jurisdiction: "us",
      defaultUse: "editorial",
      defaultCirculation: 10_000,
      preferredInstitution: null,
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function writeTermSettings(
  ownerId: string,
  settings: Omit<TermSettings, "updatedAt">,
): Promise<TermSettings> {
  const repository = await getRepository();
  return repository.saveTermSettings(ownerId, settings);
}

export async function storeHealth() {
  const repository = await getRepository();
  const probe = await repository.healthCheck();
  return {
    ...probe,
    kind: repository.kind,
    schema: repository.schema,
    durable: isDurableEnvironment(),
  };
}
