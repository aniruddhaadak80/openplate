/**
 * Normalised domain types.
 *
 * Three upstream institutions publish three different shapes. Everything that
 * leaves this file is one shape: a `Work`, always carrying who answered, when it
 * was fetched, and which upstream record it came from. That provenance travels
 * with the data all the way to the credit line, so nothing in the product can
 * quietly present a record as current when it is a sealed fallback sample.
 */

export type Institution = "met" | "cle";

export type SourceStatus = "live" | "fallback";

export interface Provenance {
  /** Which provider answered this request. */
  provider: string;
  /** live = fetched from the institution now, fallback = sealed offline sample. */
  status: SourceStatus;
  /** ISO timestamp of the fetch attempt. */
  fetchedAt: string;
  /** The record identifier at the institution, e.g. "met:316666". */
  upstreamId: string;
  /** Human attribution line to render next to the work. */
  attribution: string;
  /** Where the terms of use live. */
  termsUrl: string;
  /** Round-trip time in milliseconds, when the answer came off the network. */
  latencyMs?: number;
}

export interface WorkImage {
  url: string;
  width: number | null;
  height: number | null;
  /** Descriptive text for the artwork, used as the image's alt text. */
  alt: string;
}

export interface Creator {
  name: string;
  /** Years as reported by the institution, parsed out of its display strings. */
  birthYear: number | null;
  deathYear: number | null;
  /** Wikidata QID when the institution publishes a cross-reference. */
  wikidataId: string | null;
  /** True when the institution itself flagged the creator as unknown. */
  anonymous: boolean;
}

export interface Work {
  /** Stable key for this repository: "met:316666", "cle:127147". */
  id: string;
  institution: Institution;
  /** The institution's own numeric or accession identifier. */
  upstreamId: string;
  title: string;
  culture: string | null;
  period: string | null;
  creator: Creator;
  /** Machine-readable completion year when the institution publishes one. */
  madeYear: number | null;
  /** The institution's own date label, kept verbatim for the credit line. */
  madeLabel: string | null;
  medium: string | null;
  classification: string | null;
  /**
   * The institution's rights statement for the reproduction it is showing,
   * verbatim. This is the text the engine parses for restriction markers.
   */
  rightsStatement: string | null;
  /**
   * The institution's own verdict on rights. tri-state on purpose: `null` means
   * the institution published no claim, which is not the same as "free".
   */
  institutionCleared: boolean | null;
  /** The license string, where the institution publishes one ("CC0"). */
  licenseLabel: string | null;
  institutionCreditLine: string | null;
  accessionNumber: string | null;
  department: string | null;
  image: WorkImage | null;
  pageUrl: string;
  /** When the institution last touched its own metadata. */
  metadataUpdatedAt: string | null;
  provenance: Provenance;
}

export interface SearchOutcome {
  query: string;
  total: number;
  works: Work[];
  /** One entry per provider that was asked, including any that failed. */
  provenance: Provenance[];
  /** True when every provider failed and the sealed sample is standing in. */
  degraded: boolean;
}

export type UseKind =
  | "personal"
  | "editorial"
  | "educational"
  | "commercial"
  | "merchandise"
  | "broadcast";

export type Jurisdiction = "us" | "eu" | "uk" | "ca" | "au" | "jp";

export type ClearanceBand = "clear" | "clear_with_credit" | "review" | "blocked";

export type FactorId =
  | "institution_claim"
  | "creator_term"
  | "age_rule"
  | "reproduction_restriction"
  | "use_scale"
  | "attribution_completeness";

export type FactorStatus = "satisfied" | "unresolved" | "failing";

export interface ClearanceFactor {
  id: FactorId;
  label: string;
  /** Share of the final score, 0..1. The six weights sum to exactly 1. */
  weight: number;
  /** The value the institution actually supplied. */
  raw: string;
  /** The factor reduced to 0..1. */
  normalized: number;
  /** weight x normalized, the factor's points out of 100. */
  contribution: number;
  status: FactorStatus;
  /** The sentence a reader would need in order to trust the number. */
  evidence: string;
}

export interface Restriction {
  kind: "copyright_symbol" | "estate" | "rights_society" | "licensed" | "unknown";
  holder: string | null;
  /** The exact substring that triggered this restriction. */
  matchedText: string;
  /** Offset into the rights statement, so the UI can underline it in place. */
  index: number;
  clause: string;
}

export interface AttributionElement {
  element: "title" | "creator" | "date" | "institution" | "credit_line";
  present: boolean;
  value: string | null;
}

export interface TermArithmetic {
  basis: "life_plus_term" | "publication_age" | "unresolved";
  creatorDeathYear: number | null;
  termYears: number;
  /** The first year in which the term expires: deathYear + termYears. */
  requiredThrough: number | null;
  yearsElapsed: number | null;
  satisfied: boolean | null;
  note: string;
}

export interface ClearanceInput {
  work: Work;
  use: UseKind;
  jurisdiction: Jurisdiction;
  /** Estimated audience for the intended use. */
  circulation: number;
  /** The year the verdict is being taken in. Overridable so tests stay fixed. */
  asOfYear: number;
}

export interface ClearanceResult {
  engine: string;
  version: string;
  /** 0..100. */
  score: number;
  band: ClearanceBand;
  /** 0..1. Drops whenever a factor could not be resolved from real data. */
  confidence: number;
  factors: ClearanceFactor[];
  termArithmetic: TermArithmetic;
  restrictions: Restriction[];
  attributionElements: AttributionElement[];
  requiredCreditLine: string;
  shortCitation: string;
  blockers: string[];
  cautions: string[];
  /** Content fingerprint of the inputs and the result. */
  digest: string;
  /** Echo of the inputs, so a verdict can be reproduced from the record. */
  inputs: {
    workId: string;
    use: UseKind;
    jurisdiction: Jurisdiction;
    circulation: number;
    asOfYear: number;
    engineVersion: string;
  };
}

export type PlateStatus = "draft" | "decided" | "retired";

export type Decision = "approved" | "conditional" | "rejected";

/** Alias used by the persistence layer, which speaks in nouns. */
export type PlateDecision = Decision;

export interface PlateRow {
  id: string;
  ownerId: string;
  /** Stable public code for the share route. */
  shareCode: string;
  idempotencyKey: string | null;
  workId: string;
  institution: Institution;
  title: string;
  creatorName: string;
  /** Denormalised so a retired plate still renders its own credit line. */
  workSnapshot: Work;
  use: UseKind;
  jurisdiction: Jurisdiction;
  circulation: number;
  note: string;
  status: PlateStatus;
  decision: Decision | null;
  decisionNote: string | null;
  decisionAt: string | null;
  /** Cached band at decision time, so the docket records what was concluded. */
  decisionBand: ClearanceBand | null;
  decisionScore: number | null;
  decisionSeal: string | null;
  /** Head of the plate's hash chain. */
  seal: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type AuditEventType =
  | "filed"
  | "updated"
  | "decision_recorded"
  | "retired"
  | "verified";

export interface AuditEvent {
  entityId: string;
  seq: number;
  eventType: AuditEventType;
  payload: Record<string, unknown>;
  prevSeal: string;
  seal: string;
  createdAt: string;
}

export interface ChainVerification {
  entityId: string;
  ok: boolean;
  /** The sequence number of the first event that failed, or null when intact. */
  brokenAtSeq: number | null;
  reason: string | null;
  eventCount: number;
  headSeal: string;
  genesisSeal: string;
}

export interface TermSettings {
  jurisdiction: Jurisdiction;
  defaultUse: UseKind;
  defaultCirculation: number;
  /** Institution the visitor searches first. */
  preferredInstitution: Institution | null;
  updatedAt: string;
}

export interface StoreHealth {
  ok: boolean;
  kind: string;
  schema: string;
  detail: string;
  checkedAt: string;
  durable: boolean;
}

/** The stable error envelope every API route returns on failure. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level detail, present on validation failures. */
    fields?: Record<string, string>;
  };
}