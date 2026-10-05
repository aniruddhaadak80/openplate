import type { ClearanceBand, FactorStatus } from "./types";

/**
 * One spot ink per verdict state.
 *
 * Centralised so a band can never be one colour on the plate page and another on
 * the export, and so the mapping can be checked in one place. Each colour was
 * picked to clear WCAG AA against the dark room ground.
 */
export const BAND_INK: Record<ClearanceBand, { fg: string; border: string; label: string }> = {
  clear: { fg: "var(--color-clear)", border: "var(--color-clear)", label: "Clear" },
  clear_with_credit: { fg: "var(--color-credited)", border: "var(--color-credited)", label: "Clear with credit" },
  review: { fg: "var(--color-review)", border: "var(--color-review)", label: "Needs review" },
  blocked: { fg: "var(--color-blocked)", border: "var(--color-blocked)", label: "Blocked" },
};

export const STATUS_INK: Record<FactorStatus, { fg: string; label: string }> = {
  satisfied: { fg: "var(--color-clear)", label: "satisfied" },
  unresolved: { fg: "var(--color-review)", label: "unresolved" },
  failing: { fg: "var(--color-blocked)", label: "failing" },
};

export function bandInk(band: ClearanceBand) {
  return BAND_INK[band];
}

/** The institution's own claim, described in the reader's language. */
export function institutionClaimText(cleared: boolean | null, licence: string | null): string {
  if (cleared === true) return licence ? `Cleared (${licence})` : "Cleared by the institution";
  if (cleared === false) return "In copyright per the institution";
  return "No claim published";
}

export function formatReach(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toISOString().slice(0, 10);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return `${parsed.toISOString().slice(0, 10)} ${parsed.toISOString().slice(11, 19)}Z`;
}

export function institutionName(institution: "met" | "cle"): string {
  return institution === "met" ? "The Met" : "Cleveland Museum of Art";
}

export function institutionFullName(institution: "met" | "cle"): string {
  return institution === "met"
    ? "The Metropolitan Museum of Art"
    : "The Cleveland Museum of Art";
}

export function shortSeal(seal: string): string {
  return seal.length > 20 ? `${seal.slice(0, 10)}…${seal.slice(-6)}` : seal;
}
