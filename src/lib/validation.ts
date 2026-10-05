import type { Jurisdiction, PlateStatus, UseKind } from "./types";

/**
 * Input validation.
 *
 * Every value that arrives from a browser, an agent or a URL is bounded here
 * before it reaches the database or the engine. Returns either a clean typed
 * value or a field-keyed reason, so the API can answer 422 with something a form
 * can render next to the offending input.
 */

export const MAX_NOTE = 2000;
export const MAX_QUERY = 80;
export const MAX_CIRCULATION = 50_000_000;

const USE_VALUES: readonly UseKind[] = [
  "personal",
  "editorial",
  "educational",
  "commercial",
  "merchandise",
  "broadcast",
];

const JURISDICTION_VALUES: readonly Jurisdiction[] = ["us", "eu", "uk", "ca", "au", "jp"];

const WORK_ID_RE = /^(met:[0-9]{1,12}|cle:[A-Za-z0-9._-]{1,32})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHARE_CODE_RE = /^[a-z2-9]{12}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,120}$/;

export type FieldErrors = Record<string, string>;

export class ValidationError extends Error {
  constructor(readonly fields: FieldErrors) {
    super("The request body failed validation.");
    this.name = "ValidationError";
  }
}

export function isUseKind(value: unknown): value is UseKind {
  return typeof value === "string" && (USE_VALUES as readonly string[]).includes(value);
}

export function isJurisdiction(value: unknown): value is Jurisdiction {
  return typeof value === "string" && (JURISDICTION_VALUES as readonly string[]).includes(value);
}

const PLATE_STATUS_VALUES = ["draft", "decided", "retired"] as const;

export function isPlateStatus(value: unknown): value is PlateStatus {
  return typeof value === "string" && (PLATE_STATUS_VALUES as readonly string[]).includes(value);
}

/**
 * True when the string contains a C0/C7 control character. Checked by code point
 * rather than with a regex so no lint rule has to be silenced to express it.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function asBoundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  if (hasControlCharacter(trimmed)) return null;
  return trimmed;
}

/**
 * An optional free-text field.
 *
 * Empty is a legitimate value: "no note" and "clear the note" are both things a
 * form must be able to express, so a blank string is accepted rather than being
 * mistaken for a malformed value. Only non-empty text that is too long or carries
 * control characters is rejected.
 */
function optionalText(
  value: unknown,
  max: number,
  label: string,
  fields: FieldErrors,
): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    fields[label] = `The ${label} must be text.`;
    return "";
  }
  if (value.trim().length === 0) return "";
  const cleaned = asBoundedText(value, max);
  if (cleaned === null) {
    fields[label] = `The ${label} must be between 1 and ${max} characters, with no control characters.`;
    return "";
  }
  return cleaned;
}

export interface CreatePlateInput {
  workId: string;
  use: UseKind;
  jurisdiction: Jurisdiction;
  circulation: number;
  note: string;
  idempotencyKey: string | null;
}

export function parseCreatePlate(body: unknown): CreatePlateInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError({ body: "Expected a JSON object." });
  }
  const raw = body as Record<string, unknown>;
  const fields: FieldErrors = {};

  const workId = typeof raw.workId === "string" ? raw.workId.trim() : "";
  if (!WORK_ID_RE.test(workId)) {
    fields.workId = "Pick a work from a search result; the identifier looks malformed.";
  }

  const use = raw.use;
  if (!isUseKind(use)) {
    fields.use = "Choose what you are going to do with the image.";
  }

  const jurisdiction = raw.jurisdiction;
  if (!isJurisdiction(jurisdiction)) {
    fields.jurisdiction = "Choose the jurisdiction whose term applies.";
  }

  let circulation = Number.NaN;
  if (typeof raw.circulation === "number") circulation = raw.circulation;
  else if (typeof raw.circulation === "string" && raw.circulation.trim() !== "") {
    circulation = Number(raw.circulation);
  }
  if (!Number.isFinite(circulation) || circulation < 1 || circulation > MAX_CIRCULATION) {
    fields.circulation = "Reach must be a number between 1 and 50,000,000.";
  }

  const note = optionalText(raw.note, MAX_NOTE, "note", fields);

  let idempotencyKey: string | null = null;
  if (raw.idempotencyKey !== undefined && raw.idempotencyKey !== null && raw.idempotencyKey !== "") {
    if (typeof raw.idempotencyKey === "string" && IDEMPOTENCY_RE.test(raw.idempotencyKey)) {
      idempotencyKey = raw.idempotencyKey;
    } else {
      fields.idempotencyKey = "An idempotency key must be 8-120 letters, digits, dots, colons or dashes.";
    }
  }

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);

  return {
    workId,
    use: use as UseKind,
    jurisdiction: jurisdiction as Jurisdiction,
    circulation: Math.round(circulation),
    note: note ?? "",
    idempotencyKey,
  };
}

export type PlatePatchInput = Partial<Pick<CreatePlateInput, "use" | "jurisdiction" | "circulation" | "note">>;

export function parsePlatePatch(body: unknown): PlatePatchInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError({ body: "Expected a JSON object." });
  }
  const raw = body as Record<string, unknown>;
  const fields: FieldErrors = {};
  const patch: PlatePatchInput = {};

  if (raw.use !== undefined) {
    if (isUseKind(raw.use)) patch.use = raw.use;
    else fields.use = "Unknown intended use.";
  }
  if (raw.jurisdiction !== undefined) {
    if (isJurisdiction(raw.jurisdiction)) patch.jurisdiction = raw.jurisdiction;
    else fields.jurisdiction = "Unknown jurisdiction.";
  }
  if (raw.circulation !== undefined) {
    const circulation = typeof raw.circulation === "number" ? raw.circulation : Number(raw.circulation);
    if (Number.isFinite(circulation) && circulation >= 1 && circulation <= MAX_CIRCULATION) {
      patch.circulation = Math.round(circulation);
    } else {
      fields.circulation = "Reach must be a number between 1 and 50,000,000.";
    }
  }
  if (raw.note !== undefined) {
    patch.note = optionalText(raw.note, MAX_NOTE, "note", fields);
  }

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
  if (Object.keys(patch).length === 0) {
    throw new ValidationError({ body: "Nothing to change: send at least one of use, jurisdiction, circulation or note." });
  }
  return patch;
}

export function parseDecision(body: unknown): { decision: "approved" | "conditional" | "rejected"; note: string } {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError({ body: "Expected a JSON object." });
  }
  const raw = body as Record<string, unknown>;
  const fields: FieldErrors = {};
  const decision = raw.decision;
  if (decision !== "approved" && decision !== "conditional" && decision !== "rejected") {
    fields.decision = "Record the decision as approved, conditional or rejected.";
  }
  const note = optionalText(raw.note, MAX_NOTE, "rationale", fields);

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
  return { decision: decision as "approved" | "conditional" | "rejected", note };
}

export function parseTermSettings(body: unknown): {
  jurisdiction: Jurisdiction;
  defaultUse: UseKind;
  defaultCirculation: number;
  preferredInstitution: "met" | "cle" | null;
} {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError({ body: "Expected a JSON object." });
  }
  const raw = body as Record<string, unknown>;
  const fields: FieldErrors = {};
  if (!isJurisdiction(raw.jurisdiction)) fields.jurisdiction = "Unknown jurisdiction.";
  if (!isUseKind(raw.defaultUse)) fields.defaultUse = "Unknown intended use.";

  const circulation = typeof raw.defaultCirculation === "number" ? raw.defaultCirculation : Number(raw.defaultCirculation);
  if (!Number.isFinite(circulation) || circulation < 1 || circulation > MAX_CIRCULATION) {
    fields.defaultCirculation = "Default reach must be a number between 1 and 50,000,000.";
  }

  let preferredInstitution: "met" | "cle" | null = null;
  if (raw.preferredInstitution !== undefined && raw.preferredInstitution !== null && raw.preferredInstitution !== "") {
    if (raw.preferredInstitution === "met" || raw.preferredInstitution === "cle") {
      preferredInstitution = raw.preferredInstitution;
    } else {
      fields.preferredInstitution = "Search either institution or neither.";
    }
  }

  if (Object.keys(fields).length > 0) throw new ValidationError(fields);
  return {
    jurisdiction: raw.jurisdiction as Jurisdiction,
    defaultUse: raw.defaultUse as UseKind,
    defaultCirculation: Math.round(circulation),
    preferredInstitution,
  };
}

export function isWorkId(value: unknown): value is string {
  return typeof value === "string" && WORK_ID_RE.test(value);
}

export function isPlateId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isShareCode(value: unknown): value is string {
  return typeof value === "string" && SHARE_CODE_RE.test(value);
}

export function parseSearchQuery(raw: string | null): string {
  if (!raw) return "";
  return raw.trim().slice(0, MAX_QUERY).replace(/[ -]/g, "");
}

export function parseBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
