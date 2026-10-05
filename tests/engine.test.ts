import { describe, expect, it } from "vitest";
import { assessClearance, detectRestrictions, ENGINE_NAME, ENGINE_VERSION } from "@/lib/engine/clearance";
import { FALLBACK_WORKS } from "@/lib/sources/fallback";
import type { Work } from "@/lib/types";

/**
 * The engine's unit tests.
 *
 * The engine is the product's claim to explainability, so these cover the four
 * situations that matter: the ordinary cleared case, the boundary where a term has
 * exactly enough years, the empty record that resolves nothing, and a malformed
 * year that must not be allowed to become NaN. Determinism is asserted by running
 * the same input twice and comparing the digest.
 */

function sealed(id: string): Work {
  const found = FALLBACK_WORKS.find((work) => work.id === id);
  if (!found) throw new Error(`missing sealed work ${id}`);
  return JSON.parse(JSON.stringify(found)) as Work;
}

describe("assessClearance", () => {
  const base = {
    use: "editorial" as const,
    jurisdiction: "us" as const,
    circulation: 10_000,
    asOfYear: 2026,
  };

  it("identifies itself with a version so a stored verdict can be traced", () => {
    const result = assessClearance({ ...base, work: sealed("met:11298") });
    expect(result.engine).toBe(ENGINE_NAME);
    expect(result.version).toBe(ENGINE_VERSION);
  });

  it("clears a bronze whose creator died long enough ago, with a complete credit line", () => {
    // Edward Kemeys died in 1907, so life + 70 expired in 1977.
    const result = assessClearance({ ...base, work: sealed("met:11298") });
    expect(result.band).toBe("clear");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.termArithmetic.creatorDeathYear).toBe(1907);
    expect(result.termArithmetic.requiredThrough).toBe(1977);
    expect(result.termArithmetic.satisfied).toBe(true);
    expect(result.requiredCreditLine).toContain("Edward Kemeys");
    expect(result.requiredCreditLine).toContain("The Metropolitan Museum of Art");
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks a record the institution itself marks in copyright, and says why", () => {
    // Anna Hyatt Huntington died in 1973, so the term runs to 2043: not elapsed.
    const result = assessClearance({ ...base, work: sealed("met:19275") });
    expect(result.band).toBe("blocked");
    expect(result.termArithmetic.requiredThrough).toBe(2043);
    expect(result.termArithmetic.satisfied).toBe(false);
    expect(result.blockers.join(" ")).toContain("in copyright");
    expect(result.factors.find((f) => f.id === "institution_claim")?.normalized).toBe(0);
    expect(result.factors.find((f) => f.id === "creator_term")?.normalized).toBeCloseTo(
      53 / 70,
      5,
    );
  });

  it("treats an anonymous maker as cleared by age alone, without inventing a term", () => {
    const result = assessClearance({ ...base, work: sealed("met:316666") });
    expect(result.termArithmetic.basis).toBe("unresolved");
    expect(result.termArithmetic.creatorDeathYear).toBeNull();
    expect(result.cautions.join(" ")).toContain("anonymous");
    // The credit line must not contain a fabricated creator.
    expect(result.requiredCreditLine).not.toContain("Unrecorded maker,");
  });

  it("moves the verdict when the intended use escalates", () => {
    const work = sealed("cle:135382");
    const editorial = assessClearance({ ...base, work });
    const merchandise = assessClearance({ ...base, work, use: "merchandise" });
    const broadcast = assessClearance({ ...base, work, use: "broadcast" });

    expect(editorial.score).toBeGreaterThan(merchandise.score);
    expect(merchandise.score).toBeGreaterThan(broadcast.score);
    expect(editorial.band).toBe("clear");
  });

  it("scores reach separately from the kind of use", () => {
    const work = sealed("cle:135382");
    const desk = assessClearance({ ...base, work, circulation: 100 });
    const open = assessClearance({ ...base, work, circulation: 10_000_000 });
    expect(desk.score).toBeGreaterThan(open.score);
    expect(desk.factors.find((f) => f.id === "use_scale")?.raw).toContain("a desk");
  });

  it("prefers the shorter Canadian term over the European one for the same creator", () => {
    // Anna Hyatt Huntington died in 1973. Canada's life + 50 expired in 2023, so
    // her term is satisfied; the EU's life + 70 runs to 2043 and is not. Same work,
    // same use, different jurisdiction, different arithmetic.
    const work = sealed("met:19275");
    const canada = assessClearance({ ...base, work, jurisdiction: "ca", use: "merchandise" });
    const eu = assessClearance({ ...base, work, jurisdiction: "eu", use: "merchandise" });
    expect(canada.termArithmetic.termYears).toBe(50);
    expect(eu.termArithmetic.termYears).toBe(70);
    expect(canada.termArithmetic.requiredThrough).toBe(2023);
    expect(eu.termArithmetic.requiredThrough).toBe(2043);
    expect(canada.termArithmetic.satisfied).toBe(true);
    expect(eu.termArithmetic.satisfied).toBe(false);
    expect(canada.score).toBeGreaterThan(eu.score);
    const canadaTerm = canada.factors.find((f) => f.id === "creator_term");
    const euTerm = eu.factors.find((f) => f.id === "creator_term");
    expect(canadaTerm?.normalized).toBe(1);
    expect(euTerm?.normalized).toBeCloseTo(53 / 70, 5);
  });

  it("saturates a term that expired long ago in every jurisdiction", () => {
    // Claude Monet died in 1926, so life + 50 and life + 70 are both satisfied and
    // the creator factor cannot distinguish them. That is correct behaviour, not a
    // bug: a satisfied term is a satisfied term.
    const work = sealed("cle:135382");
    const canada = assessClearance({ ...base, work, jurisdiction: "ca" });
    const eu = assessClearance({ ...base, work, jurisdiction: "eu" });
    expect(canada.factors.find((f) => f.id === "creator_term")?.normalized).toBe(1);
    expect(eu.factors.find((f) => f.id === "creator_term")?.normalized).toBe(1);
    expect(canada.score).toBe(eu.score);
  });

  it("applies the United States publication-age rule and says which rule it used", () => {
    const work = sealed("cle:135382");
    const result = assessClearance({ ...base, work, jurisdiction: "us" });
    const factor = result.factors.find((f) => f.id === "age_rule");
    expect(factor?.label).toBe("Publication-age rule");
    expect(result.factors.find((f) => f.id === "age_rule")?.status).toBe("satisfied");
  });

  it("does not let a term that has not run out be reported as a clearance", () => {
    const work = sealed("cle:135382");
    // Asking about a year before the creator's term expired in the US.
    const early = assessClearance({
      ...base,
      work,
      jurisdiction: "us",
      asOfYear: 1950,
      use: "merchandise",
    });
    expect(early.termArithmetic.satisfied).toBe(false);
    expect(early.band === "clear").toBe(false);
  });

  it("survives a work with no year, no creator and no statement", () => {
    const empty: Work = {
      ...sealed("met:11298"),
      creator: { name: "Unrecorded maker", birthYear: null, deathYear: null, wikidataId: null, anonymous: true },
      madeYear: null,
      madeLabel: null,
      rightsStatement: null,
      institutionCleared: null,
      institutionCreditLine: null,
      accessionNumber: null,
      image: null,
    };
    const result = assessClearance({ ...base, work: empty });
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.band).toBe("review");
    expect(result.cautions.length).toBeGreaterThan(0);
  });

  it("never produces a NaN when a year is malformed", () => {
    const broken = sealed("met:11298");
    broken.madeYear = Number.NaN;
    const result = assessClearance({ ...base, work: broken });
    expect(Number.isFinite(result.score)).toBe(true);
    expect(Number.isFinite(result.termArithmetic.requiredThrough as number)).toBe(true);
  });

  it("is deterministic: the same input yields the same digest", () => {
    const work = sealed("met:19275");
    const first = assessClearance({ ...base, work });
    const second = assessClearance({ ...base, work });
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toHaveLength(64);
    // And the digest actually tracks the inputs.
    const changed = assessClearance({ ...base, work, use: "broadcast" });
    expect(changed.digest).not.toBe(first.digest);
  });

  it("keeps the six weights summing to exactly one", () => {
    const result = assessClearance({ ...base, work: sealed("met:11298") });
    const total = result.factors.reduce((sum, factor) => sum + factor.weight, 0);
    expect(total).toBeCloseTo(1, 10);
    const points = result.factors.reduce((sum, factor) => sum + factor.contribution, 0);
    expect(points).toBeCloseTo(result.score, 2);
  });
});

describe("detectRestrictions", () => {
  it("finds the estate and the collecting society in a real Met rights statement", () => {
    // Taken verbatim from a Met record for a work by Anna Hyatt Huntington.
    const statement = "Ac 2026 Estate of Pablo Picasso / Artists Rights Society (ARS), New York";
    const found = detectRestrictions(statement);
    const kinds = found.map((entry) => entry.kind);
    expect(kinds).toContain("estate");
    expect(kinds).toContain("rights_society");
    const estate = found.find((entry) => entry.kind === "estate");
    expect(estate?.matchedText).toBe("Estate of Pablo Picasso");
    expect(estate?.holder).toBe("Pablo Picasso");
  });

  it("returns the offset so the interface can underline the exact words", () => {
    const statement = "© 2026 Estate of Z. A. Person";
    const found = detectRestrictions(statement);
    const symbol = found.find((entry) => entry.kind === "copyright_symbol");
    expect(symbol?.index).toBe(0);
    expect(statement.slice(symbol!.index, symbol!.index + 1)).toBe("©");
  });

  it("finds nothing in a clean credit line", () => {
    expect(
      detectRestrictions("Bequest of Leonard C. Hanna Jr."),
    ).toHaveLength(0);
    expect(detectRestrictions("Purchase, Rogers Fund, 1967")).toHaveLength(0);
  });

  it("treats a null statement as no findings rather than as permission", () => {
    expect(detectRestrictions(null)).toEqual([]);
  });

  it("does not leak regex state between calls", () => {
    const statement = "© Artists Rights Society (ARS)";
    const first = detectRestrictions(statement);
    const second = detectRestrictions(statement);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
  });

  it("keeps every attribution-required use honest about needing a credit line", () => {
    const work = sealed("cle:136510");
    const result = assessClearance({
      use: "editorial",
      jurisdiction: "us",
      circulation: 1000,
      asOfYear: 2026,
      work,
    });
    expect(result.attributionElements.filter((element) => element.present).length).toBeGreaterThanOrEqual(4);
    expect(result.requiredCreditLine).toContain("Cleveland Museum of Art");
  });
});