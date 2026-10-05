import { BAND_LABELS, ENGINE_NAME, ENGINE_VERSION } from "./engine/clearance";
import { DISCLAIMER, intendedUse, TERM_RULES, termRule } from "./terms";
import { siteUrl, SITE } from "./config";
import type { PlateRow } from "./types";
import type { PlateView } from "./service";

/**
 * The takeaway artifact.
 *
 * A publisher does not want a score, they want a line they can paste under a
 * picture and a piece of paper they can hand to a client. So the export is a
 * dated docket: the credit line, the arithmetic behind it, the decision, the
 * restriction text, and the seal that lets someone re-verify all of it later.
 *
 * Three renderings of one function: a stable share route, a downloadable JSON
 * document for tooling, and a CSV row for a spreadsheet. They cannot drift apart
 * because they all read the same view.
 */

export type DocketFormat = "json" | "csv" | "md";

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function renderDocketJson(view: PlateView) {
  const { plate, assessment, verification, work } = view;
  return {
    product: SITE.name,
    generatedAt: new Date().toISOString(),
    docketUrl: `${siteUrl()}/d/${plate.shareCode}`,
    plate: {
      id: plate.id,
      shareCode: plate.shareCode,
      status: plate.status,
      use: plate.use,
      jurisdiction: plate.jurisdiction,
      circulation: plate.circulation,
      note: plate.note,
      filedAt: plate.createdAt,
      updatedAt: plate.updatedAt,
      retiredAt: plate.deletedAt,
    },
    work: {
      id: work.id,
      institution: work.institution,
      accessionNumber: work.accessionNumber,
      title: work.title,
      creator: work.creator,
      madeYear: work.madeYear,
      madeLabel: work.madeLabel,
      medium: work.medium,
      pageUrl: work.pageUrl,
      rightsStatement: work.rightsStatement,
      institutionClaim: work.institutionCleared,
      licenseLabel: work.licenseLabel,
      creditLine: work.institutionCreditLine,
      provenance: work.provenance,
    },
    clearance: {
      engine: assessment.engine,
      version: assessment.version,
      score: assessment.score,
      band: assessment.band,
      bandLabel: BAND_LABELS[assessment.band],
      confidence: assessment.confidence,
      termArithmetic: assessment.termArithmetic,
      factors: assessment.factors,
      restrictions: assessment.restrictions,
      attributionElements: assessment.attributionElements,
      requiredCreditLine: assessment.requiredCreditLine,
      shortCitation: assessment.shortCitation,
      blockers: assessment.blockers,
      cautions: assessment.cautions,
      digest: assessment.digest,
      inputs: assessment.inputs,
    },
    decision: plate.decision
      ? {
          outcome: plate.decision,
          rationale: plate.decisionNote,
          recordedAt: plate.decisionAt,
          band: plate.decisionBand,
          score: plate.decisionScore,
          seal: plate.decisionSeal,
        }
      : null,
    integrity: {
      ok: verification.ok,
      eventCount: verification.eventCount,
      genesisSeal: verification.genesisSeal,
      headSeal: verification.headSeal,
      brokenAtSeq: verification.brokenAtSeq,
      events: view.events.map((event) => ({
        seq: event.seq,
        type: event.eventType,
        at: event.createdAt,
        prevSeal: event.prevSeal,
        seal: event.seal,
      })),
    },
    disclaimer: DISCLAIMER,
    terms: termRule(plate.jurisdiction),
  };
}

export function renderDocketCsv(view: PlateView): string {
  const { plate, assessment, work, verification } = view;
  const header = [
    "share_code",
    "work_id",
    "institution",
    "accession",
    "title",
    "creator",
    "made_year",
    "use",
    "jurisdiction",
    "term_years",
    "circulation",
    "score",
    "band",
    "confidence",
    "decision",
    "decision_at",
    "decision_seal",
    "plate_seal",
    "chain_ok",
    "event_count",
    "required_credit_line",
    "restrictions",
    "source_page",
  ];
  const row = [
    plate.shareCode,
    work.id,
    work.institution,
    work.accessionNumber,
    work.title,
    work.creator.name,
    work.madeYear,
    plate.use,
    plate.jurisdiction,
    termRule(plate.jurisdiction).lifePlusYears,
    plate.circulation,
    assessment.score,
    assessment.band,
    assessment.confidence,
    plate.decision,
    plate.decisionAt,
    plate.decisionSeal,
    plate.seal,
    verification.ok,
    verification.eventCount,
    assessment.requiredCreditLine,
    assessment.restrictions.map((restriction) => restriction.matchedText).join("; "),
    work.pageUrl,
  ];
  return [header, row].map((line) => line.map(csvCell).join(",")).join("\n");
}

export function renderDocketMarkdown(view: PlateView): string {
  const { plate, assessment, work, verification } = view;
  const rule = termRule(plate.jurisdiction);
  const lines: string[] = [];

  lines.push(`# ${SITE.name} clearance docket ${plate.shareCode}`);
  lines.push("");
  lines.push(`**${work.title}**`);
  lines.push("");
  lines.push(`- Institution: ${work.institution === "met" ? "The Metropolitan Museum of Art" : "The Cleveland Museum of Art"} (${work.accessionNumber ?? work.upstreamId})`);
  lines.push(`- Creator: ${work.creator.anonymous ? "unrecorded" : `${work.creator.name}${work.creator.deathYear ? ` (d. ${work.creator.deathYear})` : ""}`}`);
  lines.push(`- Made: ${work.madeLabel ?? work.madeYear ?? "not published"}`);
  lines.push(`- Intended use: ${intendedUse(plate.use).label}, reach ${plate.circulation.toLocaleString("en-US")}`);
  lines.push(`- Jurisdiction: ${rule.label} (life + ${rule.lifePlusYears})`);
  lines.push(`- Verdict: **${BAND_LABELS[assessment.band]}** at ${assessment.score}/100, confidence ${assessment.confidence}`);
  lines.push("");
  lines.push("## Credit line");
  lines.push("");
  lines.push(assessment.requiredCreditLine);
  lines.push("");
  lines.push(`Short form: ${assessment.shortCitation}`);
  lines.push("");
  lines.push("## Factors");
  lines.push("");
  lines.push("| Factor | Weight | Value | Points | Status |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const factor of assessment.factors) {
    lines.push(
      `| ${factor.label} | ${factor.weight} | ${factor.raw} | ${factor.contribution} | ${factor.status} |`,
    );
  }
  lines.push("");
  if (assessment.restrictions.length > 0) {
    lines.push("## Reproduction restrictions found");
    lines.push("");
    for (const restriction of assessment.restrictions) {
      lines.push(`- \`${restriction.matchedText}\` — ${restriction.clause}`);
    }
    lines.push("");
  }
  if (assessment.blockers.length > 0) {
    lines.push("## Blockers");
    lines.push("");
    for (const blocker of assessment.blockers) lines.push(`- ${blocker}`);
    lines.push("");
  }
  if (plate.decision) {
    lines.push("## Decision");
    lines.push("");
    lines.push(`- Outcome: ${plate.decision}`);
    lines.push(`- Recorded: ${plate.decisionAt}`);
    lines.push(`- Band at the time: ${plate.decisionBand} (${plate.decisionScore}/100)`);
    lines.push(`- Seal: \`${plate.decisionSeal}\``);
    if (plate.decisionNote) lines.push(`- Rationale: ${plate.decisionNote}`);
    lines.push("");
  }
  lines.push("## Integrity");
  lines.push("");
  lines.push(`- Chain: ${verification.ok ? "intact" : `broken at event ${verification.brokenAtSeq}`}`);
  lines.push(`- Events: ${verification.eventCount}`);
  lines.push(`- Head seal: \`${verification.headSeal}\``);
  lines.push(`- Engine: ${ENGINE_NAME} ${ENGINE_VERSION}, digest \`${assessment.digest}\``);
  lines.push("");
  lines.push(`Re-verify: ${siteUrl()}/d/${plate.shareCode}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(DISCLAIMER);
  lines.push("");
  lines.push(`Data: ${work.provenance.attribution} (${work.provenance.status}, retrieved ${work.provenance.fetchedAt})`);
  return lines.join("\n");
}

export function contentTypeFor(format: DocketFormat): string {
  if (format === "json") return "application/json; charset=utf-8";
  if (format === "csv") return "text/csv; charset=utf-8";
  return "text/markdown; charset=utf-8";
}

export function docketFileName(plate: PlateRow, format: DocketFormat): string {
  const slug = plate.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `openplate-${slug || "docket"}.${format}`;
}

/** The jurisdiction table, shared by the /terms screen and the MCP manifest. */
export function jurisdictionSummary() {
  return TERM_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    lifePlusYears: rule.lifePlusYears,
    publicationCutoffYears: rule.publicationCutoffYears,
    note: rule.note,
  }));
}
