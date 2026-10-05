import { createHash } from "node:crypto";
import { canonicalJson } from "../integrity/chain";
import { circulationBand, intendedUse, termRule } from "../terms";
import type {
  AttributionElement,
  ClearanceBand,
  ClearanceFactor,
  ClearanceInput,
  ClearanceResult,
  Restriction,
  TermArithmetic,
} from "../types";

export const ENGINE_NAME = "openplate-clearance";
export const ENGINE_VERSION = "1.1.0";

/**
 * The clearance engine.
 *
 * One pure function, called from exactly three places: the plate detail page,
 * POST /api/plates/:id/assess, and the assess_plate MCP tool. There is no second
 * copy of this arithmetic anywhere in the product, so a verdict can never
 * disagree with itself between the browser, the REST API and an agent.
 *
 * It separates two questions that most people conflate:
 *
 *   1. Is the artwork itself out of copyright? That is arithmetic on published
 *      terms and the creator's dates.
 *   2. May I print the file I am looking at? That depends on what the
 *      institution asserts about the reproduction it is publishing, which is
 *      frequently a separate and stricter thing.
 *
 * A museum will happily publish a photograph of a painting that died in 1890
 * while telling you the photograph is copyrighted. That is not a contradiction,
 * it is the whole reason this product exists, and the two answers are reported
 * separately instead of being averaged into one meaningless number.
 *
 * The engine never asserts a legal conclusion. It reports what the institution
 * said, does the arithmetic, and hands the reader a band plus the sentences
 * behind it.
 */

const FACTOR_WEIGHTS = {
  institution_claim: 0.2,
  creator_term: 0.26,
  age_rule: 0.14,
  reproduction_restriction: 0.2,
  use_scale: 0.12,
  attribution_completeness: 0.08,
} as const;

function clamp(value: number, low = 0, high = 1): number {
  if (Number.isNaN(value)) return low;
  return Math.min(high, Math.max(low, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface RestrictionRule {
  kind: Restriction["kind"];
  pattern: RegExp;
  holderPattern: RegExp | null;
  clause: string;
}

/**
 * Markers that appear in real institution rights statements. The Picasso records
 * at The Met read "Ac 2026 Estate of Pablo Picasso / Artists Rights Society
 * (ARS), New York"; each of those phrases is matched below and reported with the
 * offset it was found at, so the product can underline the exact words that
 * caused the verdict rather than paraphrasing them.
 */
const RESTRICTION_RULES: readonly RestrictionRule[] = [
  {
    kind: "estate",
    pattern: /\bEstate of\s+[A-Z][^/,;(]{2,60}/g,
    holderPattern: /\bEstate of\s+([A-Z][^/,;(]{2,60})/,
    clause:
      "The named rights holder is an estate rather than the creator. An estate enforces the same term and adds its own permissions on top.",
  },
  {
    kind: "rights_society",
    pattern: /\bArtists'? Rights Society\b(?:\s*\(ARS\))?|\bADAGP\b|\bSACM\b|\bPictoright\b|\bVG Bild-Kunst\b/gi,
    holderPattern: /\b(Artists'? Rights Society(?:\s*\(ARS\))?|ADAGP|SACM|Pictoright|VG Bild-Kunst)\b/i,
    clause:
      "A collecting society administers these rights and licenses them on the creator's behalf. Commercial and broadcast uses are normally licensed, not free.",
  },
  {
    kind: "licensed",
    pattern: /\bLicens(?:e|ed|ing)\b|\bLicensing\b|\bpermission of\b/gi,
    holderPattern: null,
    clause:
      "The record describes a licensed use rather than an unrestricted one, so the permission travels with a specific agreement.",
  },
  {
    kind: "copyright_symbol",
    pattern: /©/g,
    holderPattern: null,
    clause:
      "A copyright symbol is present. In practice this asserts rights over the reproduction being published, which is a separate right from the artwork.",
  },
];

/** Statement text with no rights markers at all is treated as unknown, not free. */
const COPYRIGHT_WORD_PATTERN = /\bcopyright\b/gi;

export function detectRestrictions(statement: string | null): Restriction[] {
  if (!statement) return [];
  const found: Restriction[] = [];
  for (const rule of RESTRICTION_RULES) {
    // Each rule owns its own regex with the global flag, so lastIndex never
    // leaks between calls.
    rule.pattern.lastIndex = 0;
    let match = rule.pattern.exec(statement);
    while (match !== null) {
      const matchedText = match[0].trim();
      let holder: string | null = null;
      if (rule.holderPattern) {
        const holderMatch = rule.holderPattern.exec(matchedText);
        holder = holderMatch ? holderMatch[1].trim() : null;
      }
      found.push({
        kind: rule.kind,
        holder,
        matchedText,
        index: match.index,
        clause: rule.clause,
      });
      match = rule.pattern.exec(statement);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function buildAttribution(input: ClearanceInput): AttributionElement[] {
  const { work } = input;
  const institution =
    work.institution === "met"
      ? "The Metropolitan Museum of Art"
      : "The Cleveland Museum of Art";
  return [
    { element: "title", present: work.title.trim().length > 0, value: work.title },
    {
      element: "creator",
      present: !work.creator.anonymous && work.creator.name.trim().length > 0,
      value: work.creator.anonymous ? null : work.creator.name,
    },
    {
      element: "date",
      present: work.madeYear !== null,
      value: work.madeYear !== null ? String(work.madeYear) : work.madeLabel,
    },
    { element: "institution", present: true, value: institution },
    {
      element: "credit_line",
      present: Boolean(work.institutionCreditLine && work.institutionCreditLine.trim()),
      value: work.institutionCreditLine,
    },
  ];
}

export function buildCreditLine(input: ClearanceInput, restrictions: Restriction[]): string {
  const { work } = input;
  const institution =
    work.institution === "met"
      ? "The Metropolitan Museum of Art"
      : "The Cleveland Museum of Art";
  const parts: string[] = [];
  if (work.title) parts.push(`"${work.title.replace(/"/g, "'")}"`);
  if (!work.creator.anonymous && work.creator.name) parts.push(work.creator.name);
  if (work.madeYear !== null) parts.push(String(work.madeYear));
  else if (work.madeLabel) parts.push(work.madeLabel);
  parts.push(institution);
  if (work.institutionCreditLine) parts.push(work.institutionCreditLine.trim());
  parts.push(work.pageUrl);

  const license = work.licenseLabel ? ` Licensed ${work.licenseLabel}.` : "";
  const reproduction =
    restrictions.length > 0
      ? " Reproduction rights are asserted by the institution above and are not cleared by this line alone."
      : "";

  return `${parts.join(", ")}.${license}${reproduction}`;
}

function buildShortCitation(input: ClearanceInput): string {
  const { work } = input;
  const surname = work.creator.anonymous
    ? "Unknown maker"
    : work.creator.name.split(/\s+/).slice(-1)[0];
  const year = work.madeYear !== null ? `, ${work.madeYear}` : work.madeLabel ? `, ${work.madeLabel}` : "";
  const short = work.accessionNumber ?? work.upstreamId;
  return `${surname}${year}. ${work.title}. ${work.institution === "met" ? "The Met" : "Cleveland Museum of Art"} (${short}).`;
}

function decideBand(
  score: number,
  confidence: number,
  institutionCleared: boolean | null,
  restrictions: Restriction[],
  attributionComplete: boolean,
  termSatisfied: boolean | null,
): ClearanceBand {
  // The institution's own negative claim is decisive and never averaged away: if
  // the record says the work is in copyright, this desk will not talk you out of
  // it, it will just explain why.
  if (institutionCleared === false) return "blocked";

  let band: ClearanceBand;
  if (score >= 80 && restrictions.length === 0 && attributionComplete) band = "clear";
  else if (score >= 60) band = "clear_with_credit";
  else if (score >= 38) band = "review";
  else band = "blocked";

  // A low-confidence arithmetic result is never a clearance.
  if (confidence < 0.5 && band !== "blocked") band = "review";

  // The institution clearing a work whose creator term has plainly not run out
  // is a contradiction in the source data. Flag it rather than picking a side.
  if (institutionCleared === true && termSatisfied === false) return "review";

  return band;
}

export function assessClearance(input: ClearanceInput): ClearanceResult {
  const { work, use, jurisdiction, circulation, asOfYear } = input;
  const rule = termRule(jurisdiction);
  const useDefinition = intendedUse(use);
  const reach = circulationBand(circulation);

  const institutionName =
    work.institution === "met"
      ? "The Metropolitan Museum of Art"
      : "The Cleveland Museum of Art";

  const restrictions = detectRestrictions(work.rightsStatement);
  const hasCopyrightWord = work.rightsStatement
    ? COPYRIGHT_WORD_PATTERN.test(work.rightsStatement)
    : false;
  COPYRIGHT_WORD_PATTERN.lastIndex = 0;

  const attribution = buildAttribution(input);
  const missingAttribution = attribution.filter((element) => !element.present);
  const attributionNormalized = attribution.filter((element) => element.present).length / attribution.length;

  // ---- factor 1: what the institution itself claims -------------------------
  const institutionNormalized =
    work.institutionCleared === true ? 1 : work.institutionCleared === false ? 0 : 0.35;
  const institutionStatus: ClearanceFactor["status"] =
    work.institutionCleared === true
      ? "satisfied"
      : work.institutionCleared === false
        ? "failing"
        : "unresolved";
  const institutionRaw = work.institutionCleared
    ? `${institutionName} marks this record ${work.licenseLabel ? work.licenseLabel : "public domain"}`
    : "institution published no rights claim";

  // ---- factor 2: life plus term --------------------------------------------
  const deathYear = work.creator.deathYear;
  const yearsElapsed = deathYear === null ? null : asOfYear - deathYear;
  const termSatisfied = yearsElapsed === null ? null : yearsElapsed >= rule.lifePlusYears;
  let termArithmetic: TermArithmetic;
  if (deathYear === null) {
    termArithmetic = {
      basis: "unresolved",
      creatorDeathYear: null,
      termYears: rule.lifePlusYears,
      requiredThrough: null,
      yearsElapsed: null,
      satisfied: null,
      note: `No death year is published for this creator, so a life-plus-term calculation is not possible from the record alone. ${rule.note}`,
    };
  } else {
    const requiredThrough = deathYear + rule.lifePlusYears;
    const remaining = requiredThrough - asOfYear;
    const howSettled =
      remaining <= 0
        ? `the term expired in ${requiredThrough}, ${asOfYear - requiredThrough} years ago`
        : `the term does not run out until ${requiredThrough}, which is ${remaining} years away`;
    termArithmetic = {
      basis: "life_plus_term",
      creatorDeathYear: deathYear,
      termYears: rule.lifePlusYears,
      requiredThrough,
      yearsElapsed,
      satisfied: termSatisfied,
      note: `${rule.label}: death ${deathYear} + ${rule.lifePlusYears} years = ${requiredThrough}. In ${asOfYear}, ${howSettled}.`,
    };
  }

  const creatorTermNormalized =
    deathYear === null ? 0.5 : clamp(yearsElapsed! / rule.lifePlusYears);

  // ---- factor 3: age / publication rule ------------------------------------
  const cutoffYears = rule.publicationCutoffYears;
  const ageHorizon = cutoffYears ?? rule.lifePlusYears + 20;
  const yearsSinceWork = work.madeYear === null ? null : asOfYear - work.madeYear;
  const ageSatisfied = yearsSinceWork === null ? null : yearsSinceWork >= ageHorizon;
  const ageNormalized = yearsSinceWork === null ? 0.5 : clamp(yearsSinceWork / ageHorizon);
  const ageStatus: ClearanceFactor["status"] =
    yearsSinceWork === null ? "unresolved" : ageSatisfied ? "satisfied" : "failing";
  const ageRaw =
    work.madeYear === null
      ? "institution published no machine-readable year for the work"
      : cutoffYears !== null
        ? `completed ${work.madeYear}, published ${cutoffYears} years before ${asOfYear} clears it`
        : `completed ${work.madeYear}, ${yearsSinceWork} years ago`;

  // ---- factor 4: reproduction restrictions ---------------------------------
  const restrictionPenalty = clamp(restrictions.length * 0.45);
  const restrictionNormalized = 1 - restrictionPenalty;
  const restrictionStatus: ClearanceFactor["status"] =
    restrictions.length === 0 ? "satisfied" : "failing";
  const restrictionRaw =
    restrictions.length === 0
      ? work.rightsStatement
        ? `no rights marker in "${work.rightsStatement}"`
        : "institution published no reproduction statement"
      : restrictions.map((restriction) => restriction.matchedText).join(", ");

  // ---- factor 5: how exposed the intended use is ---------------------------
  const useNormalized = clamp(useDefinition.base * reach.penalty);
  const useStatus: ClearanceFactor["status"] = useNormalized >= 0.75 ? "satisfied" : useNormalized >= 0.45 ? "unresolved" : "failing";

  // ---- factor 6: can a credit line even be written? -------------------------
  const attributionStatus: ClearanceFactor["status"] =
    missingAttribution.length === 0 ? "satisfied" : missingAttribution.length <= 2 ? "unresolved" : "failing";

  const factors: ClearanceFactor[] = [
    {
      id: "institution_claim",
      label: "Institution's own claim",
      weight: FACTOR_WEIGHTS.institution_claim,
      raw: institutionRaw,
      normalized: institutionNormalized,
      contribution: round2(FACTOR_WEIGHTS.institution_claim * institutionNormalized * 100),
      status: institutionStatus,
      evidence: work.institutionCleared
        ? `${institutionName} publishes ${work.licenseLabel ? `a ${work.licenseLabel} licence` : "a public-domain flag"} for this record.`
        : work.institutionCleared === false
          ? `${institutionName} publishes this record as in copyright. That claim covers the reproduction it is showing you.`
          : `${institutionName} published no rights claim for this record, so nothing here can be treated as cleared.`,
    },
    {
      id: "creator_term",
      label: "Creator's copyright term",
      weight: FACTOR_WEIGHTS.creator_term,
      raw:
        deathYear === null
          ? "no death year published"
          : `${deathYear} + ${rule.lifePlusYears} = ${deathYear + rule.lifePlusYears}`,
      normalized: creatorTermNormalized,
      contribution: round2(FACTOR_WEIGHTS.creator_term * creatorTermNormalized * 100),
      status: deathYear === null ? "unresolved" : termSatisfied ? "satisfied" : "failing",
      evidence: termArithmetic.note,
    },
    {
      id: "age_rule",
      label: cutoffYears !== null ? "Publication-age rule" : "Age of the work",
      weight: FACTOR_WEIGHTS.age_rule,
      raw: ageRaw,
      normalized: ageNormalized,
      contribution: round2(FACTOR_WEIGHTS.age_rule * ageNormalized * 100),
      status: ageStatus,
      evidence:
        yearsSinceWork === null
          ? "Without a completion year the age rule cannot be applied."
          : cutoffYears !== null
            ? `${rule.note}`
            : `Older than any plausible life-plus-term reading, which needs ${rule.lifePlusYears} years after the creator's death.`,
    },
    {
      id: "reproduction_restriction",
      label: "Reproduction restrictions",
      weight: FACTOR_WEIGHTS.reproduction_restriction,
      raw: restrictionRaw,
      normalized: restrictionNormalized,
      contribution: round2(FACTOR_WEIGHTS.reproduction_restriction * restrictionNormalized * 100),
      status: restrictionStatus,
      evidence:
        restrictions.length > 0
          ? restrictions.map((restriction) => restriction.clause).join(" ")
          : work.rightsStatement
            ? `Read in full and found no estate, society, licence or copyright marker: "${work.rightsStatement}".`
            : "No reproduction statement was published, which is treated as unknown rather than as permission.",
    },
    {
      id: "use_scale",
      label: "Exposure of the intended use",
      weight: FACTOR_WEIGHTS.use_scale,
      raw: `${useDefinition.label} at ${reach.label.toLowerCase()}`,
      normalized: useNormalized,
      contribution: round2(FACTOR_WEIGHTS.use_scale * useNormalized * 100),
      status: useStatus,
      evidence: `${useDefinition.meaning} Reach is entered as ${circulation.toLocaleString("en-US")} (${reach.label.toLowerCase()}).${
        useDefinition.attributionRequired ? " This use requires a credit line." : " No credit line is required for private use."
      }`,
    },
    {
      id: "attribution_completeness",
      label: "Credit line completeness",
      weight: FACTOR_WEIGHTS.attribution_completeness,
      raw:
        missingAttribution.length === 0
          ? "title, creator, date, institution and credit line all present"
          : `missing ${missingAttribution.map((element) => element.element.replace("_", " ")).join(", ")}`,
      normalized: attributionNormalized,
      contribution: round2(FACTOR_WEIGHTS.attribution_completeness * attributionNormalized * 100),
      status: attributionStatus,
      evidence:
        missingAttribution.length === 0
          ? "Every element of a credit line is available from the institution's own record."
          : `You will have to supply ${missingAttribution
              .map((element) => element.element.replace("_", " "))
              .join(", ")} yourself before the credit line is complete.`,
    },
  ];

  const score = round2(factors.reduce((total, factor) => total + factor.contribution, 0));

  const unresolved = factors.filter((factor) => factor.status === "unresolved");
  let confidence = 1 - unresolved.length * 0.15;
  if (work.institutionCleared === null) confidence -= 0.1;
  if (work.rightsStatement === null) confidence -= 0.1;
  if (restrictions.some((restriction) => restriction.holder === null)) confidence -= 0.05;
  confidence = clamp(confidence, 0.05, 1);

  const band = decideBand(
    score,
    confidence,
    work.institutionCleared,
    restrictions,
    missingAttribution.length === 0,
    termSatisfied,
  );

  const blockers: string[] = [];
  const cautions: string[] = [];

  if (work.institutionCleared === false) {
    blockers.push(
      `${institutionName} publishes this record as in copyright, so the reproduction it is showing you is not cleared to print.`,
    );
  }
  for (const restriction of restrictions) {
    blockers.push(`${restriction.clause}${restriction.holder ? ` Holder: ${restriction.holder}.` : ""}`);
  }
  if (work.institutionCleared === null) {
    cautions.push("This institution published no rights claim, so there is nothing to rely on.");
  }
  if (work.institutionCleared === true && termSatisfied === false) {
    cautions.push(
      `The institution clears this record, but under ${rule.label} the creator's term runs to ${
        deathYear === null ? "an unknown year" : deathYear + rule.lifePlusYears
      }. Ask the institution which basis it is using.`,
    );
  }
  if (deathYear === null) {
    cautions.push(
      work.creator.anonymous
        ? "The creator is recorded as anonymous, so this is cleared by age alone."
        : "No death year is published for this creator, so the term arithmetic rests on the work's age.",
    );
  }
  if (hasCopyrightWord && restrictions.length === 0) {
    cautions.push("The reproduction statement mentions copyright without naming a holder.");
  }
  if (work.rightsStatement === null) {
    cautions.push("No reproduction statement was published with this record.");
  }
  if (useDefinition.attributionRequired && missingAttribution.length > 0) {
    cautions.push("This use needs a credit line, and the record cannot supply every element of one.");
  }

  const inputs: ClearanceResult["inputs"] = {
    workId: work.id,
    use,
    jurisdiction,
    circulation,
    asOfYear,
    engineVersion: ENGINE_VERSION,
  };

  const requiredCreditLine = buildCreditLine(input, restrictions);
  const shortCitation = buildShortCitation(input);

  // A content fingerprint of the exact inputs and the factors they produced, so a
  // verdict can be compared against a later run without storing a second engine.
  const digest = createHash("sha256")
    .update(
      canonicalJson({
        engine: ENGINE_NAME,
        version: ENGINE_VERSION,
        inputs,
        factors: factors.map((factor) => ({
          id: factor.id,
          normalized: factor.normalized,
          status: factor.status,
        })),
        band,
        creditLine: requiredCreditLine,
      }),
      "utf8",
    )
    .digest("hex");

  return {
    engine: ENGINE_NAME,
    version: ENGINE_VERSION,
    score,
    band,
    confidence: round2(confidence),
    factors,
    termArithmetic,
    restrictions,
    attributionElements: attribution,
    requiredCreditLine,
    shortCitation,
    blockers,
    cautions,
    digest,
    inputs,
  };
}

export const BAND_LABELS: Record<ClearanceBand, string> = {
  clear: "Clear",
  clear_with_credit: "Clear with credit",
  review: "Needs review",
  blocked: "Blocked",
};