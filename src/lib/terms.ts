import type { Jurisdiction, UseKind } from "./types";

/**
 * Copyright term rules, stated as data.
 *
 * These are published term lengths, not legal advice, and the product says so
 * everywhere it shows them. Keeping them in one table means the engine, the
 * /terms screen, the export docket and the agent tools all quote the same
 * numbers, and adding a jurisdiction is a data change rather than a code change.
 *
 * `lifePlusYears` is the term measured from the end of the calendar year in
 * which the creator died. `publicationCutoffYears` applies only where a
 * jurisdiction clears works by age regardless of the creator's death: in the
 * United States a work published with a notice is protected for 95 years, so
 * anything published more than 95 years ago is out of copyright whatever the
 * creator's dates say.
 */
export interface TermRule {
  id: Jurisdiction;
  label: string;
  lifePlusYears: number;
  /** Years from publication, or null where no such rule applies. */
  publicationCutoffYears: number | null;
  note: string;
}

export const TERM_RULES: readonly TermRule[] = [
  {
    id: "us",
    label: "United States",
    lifePlusYears: 70,
    publicationCutoffYears: 95,
    note: "Life plus 70. Works published more than 95 years ago with a copyright notice have also passed into the public domain.",
  },
  {
    id: "eu",
    label: "European Union",
    lifePlusYears: 70,
    publicationCutoffYears: null,
    note: "Life plus 70, applied uniformly across member states by the InfoSoc directive.",
  },
  {
    id: "uk",
    label: "United Kingdom",
    lifePlusYears: 70,
    publicationCutoffYears: null,
    note: "Life plus 70 under the Copyright, Designs and Patents Act 1988.",
  },
  {
    id: "ca",
    label: "Canada",
    lifePlusYears: 50,
    publicationCutoffYears: null,
    note: "Life plus the shorter of 50 years or the end of the 20th century; the product applies the 50-year term.",
  },
  {
    id: "au",
    label: "Australia",
    lifePlusYears: 70,
    publicationCutoffYears: null,
    note: "Life plus 70.",
  },
  {
    id: "jp",
    label: "Japan",
    lifePlusYears: 70,
    publicationCutoffYears: null,
    note: "Life plus 70 for works of authors who died after a 1947 reform; earlier works follow the rule in force when they were made.",
  },
] as const;

export function termRule(id: Jurisdiction): TermRule {
  const found = TERM_RULES.find((rule) => rule.id === id);
  if (!found) throw new Error(`Unknown jurisdiction: ${id}`);
  return found;
}

/**
 * How exposed an intended use is. The band is the single biggest input a
 * reader controls, which is why it is a first-class control in the product
 * rather than a hidden default.
 */
export interface UseRule {
  id: UseKind;
  label: string;
  /** Plain description of what the visitor is about to do with the image. */
  meaning: string;
  /** Baseline permissiveness before circulation is taken into account. */
  base: number;
  /** Whether a credit line is obligatory in this use. */
  attributionRequired: boolean;
}

export const USE_RULES: readonly UseRule[] = [
  {
    id: "personal",
    label: "Personal",
    meaning: "Your own screen or a private file that is never distributed.",
    base: 1,
    attributionRequired: false,
  },
  {
    id: "editorial",
    label: "Editorial",
    meaning: "Reporting, criticism and comment about the work itself.",
    base: 0.95,
    attributionRequired: true,
  },
  {
    id: "educational",
    label: "Educational",
    meaning: "Teaching material inside a course, lesson or internal deck.",
    base: 0.9,
    attributionRequired: true,
  },
  {
    id: "commercial",
    label: "Commercial",
    meaning: "Paid work: a client deck, a newsletter, a product listing.",
    base: 0.6,
    attributionRequired: true,
  },
  {
    id: "merchandise",
    label: "Merchandise",
    meaning: "Putting the image on something you sell: print, apparel, stock art.",
    base: 0.35,
    attributionRequired: true,
  },
  {
    id: "broadcast",
    label: "Broadcast",
    meaning: "Television, streaming or any published broadcast.",
    base: 0.2,
    attributionRequired: true,
  },
] as const;

export function intendedUse(id: UseKind): UseRule {
  const found = USE_RULES.find((rule) => rule.id === id);
  if (!found) throw new Error(`Unknown intended use: ${id}`);
  return found;
}

/** Circulation bands, chosen so the four steps read as a real decision. */
export interface CirculationBand {
  id: string;
  label: string;
  max: number;
  penalty: number;
}

export const CIRCULATION_BANDS: readonly CirculationBand[] = [
  { id: "room", label: "A desk", max: 100, penalty: 1 },
  { id: "newsletter", label: "A newsletter run", max: 10_000, penalty: 0.85 },
  { id: "publication", label: "A publication", max: 250_000, penalty: 0.65 },
  { id: "broadcast", label: "Open to the internet", max: Number.POSITIVE_INFINITY, penalty: 0.45 },
] as const;

export function circulationBand(circulation: number): CirculationBand {
  for (const band of CIRCULATION_BANDS) {
    if (circulation <= band.max) return band;
  }
  return CIRCULATION_BANDS[CIRCULATION_BANDS.length - 1];
}

export const DISCLAIMER =
  "OpenPlate reports what a museum's own records say and does the arithmetic on published copyright terms. It is a research desk, not legal advice, and it does not replace a rights clearance for a paying client. When the verdict is REVIEW or BLOCKED, write to the institution or to a rights adviser before you print.";