import type {
  AuditEvent,
  AuditEventType,
  ClearanceBand,
  Institution,
  Jurisdiction,
  PlateDecision,
  PlateRow,
  PlateStatus,
  TermSettings,
  UseKind,
  Work,
} from "../types";

/**
 * The persistence contract.
 *
 * One interface, two adapters, one implementation. Local development runs the
 * embedded PGlite build of Postgres so the schema, constraints, partial indexes
 * and transactions exercised on a laptop are literally the ones that run in
 * production; only the durability differs, which is exactly why the selector in
 * ./index.ts refuses to start a production build without a hosted database.
 */

/** The query surface both node-postgres and PGlite satisfy. */
export interface SqlClient {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export type StoreKind = "postgres" | "pglite";

export interface NewPlateRecord {
  id: string;
  ownerId: string;
  shareCode: string;
  idempotencyKey: string | null;
  workId: string;
  institution: Institution;
  title: string;
  creatorName: string;
  workSnapshot: Work;
  use: UseKind;
  jurisdiction: Jurisdiction;
  circulation: number;
  note: string;
  seal: string;
}

export type PlatePatch = Partial<
  Pick<
    PlateRow,
    | "use"
    | "jurisdiction"
    | "circulation"
    | "note"
    | "status"
    | "decision"
    | "decisionNote"
    | "decisionAt"
    | "decisionBand"
    | "decisionScore"
    | "decisionSeal"
    | "seal"
  >
>;

export interface PlateQuery {
  limit: number;
  offset: number;
  status?: PlateStatus;
  use?: UseKind;
  jurisdiction?: Jurisdiction;
  includeDeleted: boolean;
  /** Free text over title and creator, for the docket's own filter box. */
  search?: string;
}

export interface JurisdictionRuleRow {
  id: Jurisdiction;
  label: string;
  lifePlusYears: number;
  publicationCutoffYears: number | null;
  note: string;
}

export interface Repository {
  readonly kind: StoreKind;
  readonly schema: string;
  init(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; detail: string; checkedAt: string }>;
  listJurisdictionRules(): Promise<JurisdictionRuleRow[]>;
  getTermSettings(ownerId: string): Promise<TermSettings | null>;
  saveTermSettings(ownerId: string, settings: Omit<TermSettings, "updatedAt">): Promise<TermSettings>;
  countPlates(ownerId: string): Promise<number>;
  listPlates(ownerId: string, query: PlateQuery): Promise<PlateRow[]>;
  getPlate(ownerId: string, id: string, includeDeleted?: boolean): Promise<PlateRow | null>;
  findPlateByShareCode(shareCode: string): Promise<PlateRow | null>;
  findPlateByIdempotencyKey(ownerId: string, key: string): Promise<PlateRow | null>;
  createPlate(record: NewPlateRecord, events: AuditEvent[]): Promise<PlateRow>;
  updatePlate(ownerId: string, id: string, patch: PlatePatch, events: AuditEvent[]): Promise<PlateRow | null>;
  retirePlate(ownerId: string, id: string, seal: string, events: AuditEvent[]): Promise<PlateRow | null>;
  listEvents(entityId: string): Promise<AuditEvent[]>;
}

export type { AuditEvent, AuditEventType, ClearanceBand, PlateDecision, PlateRow, PlateStatus };