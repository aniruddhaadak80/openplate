import type {
  AuditEvent,
  Jurisdiction,
  PlateRow,
  PlateStatus,
  TermSettings,
  UseKind,
  Work,
} from "../types";
import type {
  JurisdictionRuleRow,
  PlatePatch,
  Repository,
  SqlClient,
  StoreKind,
} from "./repository";
import { applySchema, seedJurisdictionRules } from "./schema";

/**
 * One SQL implementation, two adapters.
 *
 * node-postgres and PGlite both answer query(text, params) -> { rows }, so every
 * statement, mapping and transaction is written once and parameterised throughout.
 * No value is ever concatenated into SQL text, including the dynamic filter and
 * sort clauses, which are chosen from closed sets rather than passed through.
 */

const PLATE_COLUMNS = `
  p.id, p.owner_id, p.share_code, p.idempotency_key, p.work_id, p.institution,
  p.title, p.creator_name, p.work_snapshot, p.use_kind, p.jurisdiction, p.circulation,
  p.note, p.status, p.decision, p.decision_note, p.decision_at, p.decision_band,
  p.decision_score, p.decision_seal, p.seal, p.created_at, p.updated_at, p.deleted_at
`;

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    // Postgres renders timestamptz without a zone suffix when it round-trips
    // through a driver that returns text, which means UTC.
    const normalised = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
    const parsed = new Date(normalised);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return String(value);
}

function asIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return asIso(value);
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function asJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function mapPlate(row: Record<string, unknown>): PlateRow {
  const snapshot = asJson<Work>(row.work_snapshot);
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    shareCode: String(row.share_code),
    idempotencyKey: row.idempotency_key === null ? null : String(row.idempotency_key),
    workId: String(row.work_id),
    institution: row.institution as PlateRow["institution"],
    title: String(row.title),
    creatorName: String(row.creator_name),
    workSnapshot: snapshot,
    use: row.use_kind as UseKind,
    jurisdiction: row.jurisdiction as Jurisdiction,
    circulation: asNumber(row.circulation),
    note: String(row.note ?? ""),
    status: row.status as PlateStatus,
    decision: row.decision === null ? null : (row.decision as PlateRow["decision"]),
    decisionNote: row.decision_note === null ? null : String(row.decision_note),
    decisionAt: asIsoOrNull(row.decision_at),
    decisionBand: row.decision_band === null ? null : (row.decision_band as PlateRow["decisionBand"]),
    decisionScore: row.decision_score === null ? null : asNumber(row.decision_score),
    decisionSeal: row.decision_seal === null ? null : String(row.decision_seal),
    seal: String(row.seal),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    deletedAt: asIsoOrNull(row.deleted_at),
  };
}

function mapEvent(row: Record<string, unknown>): AuditEvent {
  return {
    entityId: String(row.entity_id),
    seq: asNumber(row.seq),
    eventType: row.event_type as AuditEvent["eventType"],
    payload: asJson<Record<string, unknown>>(row.payload) ?? {},
    prevSeal: String(row.prev_seal),
    seal: String(row.seal),
    createdAt: asIso(row.created_at),
  };
}

const PATCH_COLUMNS: Record<keyof PlatePatch, string> = {
  use: "use_kind",
  jurisdiction: "jurisdiction",
  circulation: "circulation",
  note: "note",
  status: "status",
  decision: "decision",
  decisionNote: "decision_note",
  decisionAt: "decision_at",
  decisionBand: "decision_band",
  decisionScore: "decision_score",
  decisionSeal: "decision_seal",
  seal: "seal",
};

export async function withTransaction<T>(client: SqlClient, run: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    const result = await run();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function insertEvents(
  client: SqlClient,
  schema: string,
  ownerId: string,
  events: AuditEvent[],
): Promise<void> {
  for (const event of events) {
    await client.query(
      `insert into ${schema}.audit_events
         (entity_id, entity_kind, owner_id, seq, event_type, payload, prev_seal, seal, created_at)
       values ($1,'plate',$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.entityId,
        ownerId,
        event.seq,
        event.eventType,
        JSON.stringify(event.payload),
        event.prevSeal,
        event.seal,
        event.createdAt,
      ],
    );
  }
}

async function readPlate(
  client: SqlClient,
  schema: string,
  ownerId: string,
  id: string,
  includeDeleted: boolean,
): Promise<PlateRow | null> {
  const deletedFilter = includeDeleted ? "" : " and p.deleted_at is null";
  const result = await client.query<Record<string, unknown>>(
    `select ${PLATE_COLUMNS} from ${schema}.plates p
      where p.id = $1 and p.owner_id = $2${deletedFilter}`,
    [id, ownerId],
  );
  return result.rows[0] ? mapPlate(result.rows[0]) : null;
}

export function createSqlRepository(client: SqlClient, kind: StoreKind, schema: string): Repository {
  let ready = false;

  async function ensureReady(): Promise<void> {
    if (ready) return;
    await applySchema(client, schema);
    await seedJurisdictionRules(client, schema);
    ready = true;
  }

  const repository: Repository = {
    kind,
    schema,

    async init() {
      await ensureReady();
    },

    /**
     * A real round trip against the configured store, not a static object: it
     * probes the connection, reads a reference table and counts live rows, so a
     * deployment that cannot actually reach its database reports itself down.
     */
    async healthCheck() {
      const checkedAt = new Date().toISOString();
      try {
        await ensureReady();
        const probe = await client.query<{ n: number }>("select 1 as n");
        if (probe.rows[0]?.n !== 1) {
          return { ok: false, detail: "SELECT 1 did not return 1", checkedAt };
        }
        const rules = await client.query<{ n: number }>(
          `select count(*)::int as n from ${schema}.jurisdiction_rules`,
        );
        const plates = await client.query<{ n: number }>(`select count(*)::int as n from ${schema}.plates`);
        const events = await client.query<{ n: number }>(`select count(*)::int as n from ${schema}.audit_events`);
        return {
          ok: true,
          detail: `SELECT 1 succeeded on ${schema}; ${rules.rows[0]?.n ?? 0} term rules seeded; ${plates.rows[0]?.n ?? 0} plates stored; ${events.rows[0]?.n ?? 0} sealed audit events`,
          checkedAt,
        };
      } catch (error) {
        return {
          ok: false,
          detail: error instanceof Error ? error.message : "database probe failed",
          checkedAt,
        };
      }
    },

    async listJurisdictionRules() {
      await ensureReady();
      const result = await client.query<Record<string, unknown>>(
        `select id, label, life_plus_years, publication_cutoff_years, note
           from ${schema}.jurisdiction_rules order by label asc`,
      );
      return result.rows.map<JurisdictionRuleRow>((row) => ({
        id: String(row.id) as Jurisdiction,
        label: String(row.label),
        lifePlusYears: asNumber(row.life_plus_years),
        publicationCutoffYears:
          row.publication_cutoff_years === null ? null : asNumber(row.publication_cutoff_years),
        note: String(row.note),
      }));
    },

    async getTermSettings(ownerId) {
      await ensureReady();
      const result = await client.query<Record<string, unknown>>(
        `select owner_id, jurisdiction, default_use, default_circulation, preferred_institution, updated_at
           from ${schema}.term_settings where owner_id = $1`,
        [ownerId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        jurisdiction: String(row.jurisdiction) as Jurisdiction,
        defaultUse: String(row.default_use) as UseKind,
        defaultCirculation: asNumber(row.default_circulation),
        preferredInstitution:
          row.preferred_institution === null ? null : (String(row.preferred_institution) as PlateRow["institution"]),
        updatedAt: asIso(row.updated_at),
      } satisfies TermSettings;
    },

    async saveTermSettings(ownerId, settings) {
      await ensureReady();
      const result = await client.query<Record<string, unknown>>(
        `insert into ${schema}.term_settings
           (owner_id, jurisdiction, default_use, default_circulation, preferred_institution, updated_at)
         values ($1,$2,$3,$4,$5, now())
         on conflict (owner_id) do update set
           jurisdiction = excluded.jurisdiction,
           default_use = excluded.default_use,
           default_circulation = excluded.default_circulation,
           preferred_institution = excluded.preferred_institution,
           updated_at = now()
         returning jurisdiction, default_use, default_circulation, preferred_institution, updated_at`,
        [
          ownerId,
          settings.jurisdiction,
          settings.defaultUse,
          settings.defaultCirculation,
          settings.preferredInstitution,
        ],
      );
      const row = result.rows[0];
      return {
        jurisdiction: String(row.jurisdiction) as Jurisdiction,
        defaultUse: String(row.default_use) as UseKind,
        defaultCirculation: asNumber(row.default_circulation),
        preferredInstitution:
          row.preferred_institution === null ? null : (String(row.preferred_institution) as PlateRow["institution"]),
        updatedAt: asIso(row.updated_at),
      } satisfies TermSettings;
    },

    async countPlates(ownerId) {
      await ensureReady();
      const result = await client.query<{ n: number }>(
        `select count(*)::int as n from ${schema}.plates where owner_id = $1 and deleted_at is null`,
        [ownerId],
      );
      return result.rows[0]?.n ?? 0;
    },

    async listPlates(ownerId, query) {
      await ensureReady();
      const filters = ["p.owner_id = $1"];
      const params: unknown[] = [ownerId];

      if (!query.includeDeleted) filters.push("p.deleted_at is null");
      if (query.status) {
        params.push(query.status);
        filters.push(`p.status = $${params.length}`);
      }
      if (query.use) {
        params.push(query.use);
        filters.push(`p.use_kind = $${params.length}`);
      }
      if (query.jurisdiction) {
        params.push(query.jurisdiction);
        filters.push(`p.jurisdiction = $${params.length}`);
      }
      if (query.search && query.search.trim().length > 0) {
        params.push(`%${query.search.trim().slice(0, 80)}%`);
        const index = params.length;
        filters.push(`(p.title ilike $${index} or p.creator_name ilike $${index})`);
      }

      const limitParam = params.push(query.limit);
      const offsetParam = params.push(query.offset);
      const result = await client.query<Record<string, unknown>>(
        `select ${PLATE_COLUMNS} from ${schema}.plates p
          where ${filters.join(" and ")}
          order by p.created_at desc, p.id asc
          limit $${limitParam} offset $${offsetParam}`,
        params,
      );
      return result.rows.map(mapPlate);
    },

    async getPlate(ownerId, id, includeDeleted = false) {
      await ensureReady();
      return readPlate(client, schema, ownerId, id, includeDeleted);
    },

    async findPlateByShareCode(shareCode) {
      await ensureReady();
      const result = await client.query<Record<string, unknown>>(
        `select ${PLATE_COLUMNS} from ${schema}.plates p where p.share_code = $1 limit 1`,
        [shareCode],
      );
      return result.rows[0] ? mapPlate(result.rows[0]) : null;
    },

    async findPlateByIdempotencyKey(ownerId, key) {
      await ensureReady();
      const result = await client.query<Record<string, unknown>>(
        `select ${PLATE_COLUMNS} from ${schema}.plates p
          where p.owner_id = $1 and p.idempotency_key = $2 and p.deleted_at is null
          limit 1`,
        [ownerId, key],
      );
      return result.rows[0] ? mapPlate(result.rows[0]) : null;
    },

    async createPlate(record, events) {
      await ensureReady();
      return withTransaction(client, async () => {
        await client.query(
          `insert into ${schema}.plates (
             id, owner_id, share_code, idempotency_key, work_id, institution, title, creator_name,
             work_snapshot, use_kind, jurisdiction, circulation, note, status, seal
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14)`,
          [
            record.id,
            record.ownerId,
            record.shareCode,
            record.idempotencyKey,
            record.workId,
            record.institution,
            record.title,
            record.creatorName,
            JSON.stringify(record.workSnapshot),
            record.use,
            record.jurisdiction,
            record.circulation,
            record.note,
            record.seal,
          ],
        );
        await insertEvents(client, schema, record.ownerId, events);
        const stored = await readPlate(client, schema, record.ownerId, record.id, false);
        if (!stored) throw new Error("plate insert did not return a readable row");
        return stored;
      });
    },

    async updatePlate(ownerId, id, patch, events) {
      await ensureReady();
      const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
      if (entries.length === 0) return readPlate(client, schema, ownerId, id, false);

      return withTransaction(client, async () => {
        const assignments: string[] = [];
        const params: unknown[] = [id, ownerId];
        for (const [key, value] of entries) {
          const column = PATCH_COLUMNS[key as keyof PlatePatch];
          if (!column) continue;
          params.push(value);
          assignments.push(`${column} = $${params.length}`);
        }
        if (assignments.length === 0) return readPlate(client, schema, ownerId, id, false);
        assignments.push("updated_at = now()");
        const result = await client.query(
          `update ${schema}.plates set ${assignments.join(", ")}
            where id = $1 and owner_id = $2 and deleted_at is null
            returning id`,
          params,
        );
        if (result.rows.length === 0) return null;
        await insertEvents(client, schema, ownerId, events);
        return readPlate(client, schema, ownerId, id, false);
      });
    },

    /**
     * A plate is retired, never erased. The row keeps its snapshot, its decision
     * and its chain, so a docket that was already shared can still be re-verified
     * and the audit trail still replays from genesis.
     */
    async retirePlate(ownerId, id, seal, events) {
      await ensureReady();
      return withTransaction(client, async () => {
        const result = await client.query(
          `update ${schema}.plates
              set deleted_at = now(), updated_at = now(), status = 'retired', seal = $3
            where id = $1 and owner_id = $2 and deleted_at is null
            returning id`,
          [id, ownerId, seal],
        );
        if (result.rows.length === 0) return null;
        await insertEvents(client, schema, ownerId, events);
        // Read back without the deleted_at filter, or a successful retirement
        // would report itself missing.
        return readPlate(client, schema, ownerId, id, true);
      });
    },

    async listEvents(entityId) {
      await ensureReady();
      const result = await client.query<Record<string, unknown>>(
        `select entity_id, seq, event_type, payload, prev_seal, seal, created_at
           from ${schema}.audit_events
          where entity_id = $1
          order by seq asc`,
        [entityId],
      );
      return result.rows.map(mapEvent);
    },
  };

  return repository;
}