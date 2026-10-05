import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlateView } from "@/lib/service";
import { getOwnerId } from "@/lib/session";
import { isPlateId } from "@/lib/validation";
import { BAND_INK, STATUS_INK, formatDateTime, institutionFullName, shortSeal } from "@/lib/bands";
import { DISCLAIMER, TERM_RULES, USE_RULES, termRule } from "@/lib/terms";
import { PlateActions } from "@/components/PlateActions";
import { ChainPanel } from "@/components/ChainPanel";
import { StepWedge } from "@/components/StepWedge";
import { WorkStrip } from "@/components/WorkCard";
import { BandChip, Figure, Notice, Panel, Slug, SlugHeading, SourceBadge } from "@/components/primitives";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPlateId(id)) return { title: "Plate" };
  const ownerId = await getOwnerId();
  // includeDeleted: a retired plate keeps its own page, because the tombstone is
  // meant to stay readable and verifiable rather than vanish.
  const view = await getPlateView(ownerId, id, { includeDeleted: true }).catch(() => null);
  if (!view) return { title: "Plate" };
  return {
    title: `${view.plate.title}`,
    description: `Clearance docket for ${view.plate.title} by ${view.plate.creatorName}, scored ${view.assessment.score} of 100.`,
    alternates: { canonical: `/plates/${view.plate.id}` },
  };
}

/**
 * The dynamic route: one plate, its verdict, and everything you can do to it.
 *
 * The engine's output is rendered as a set of itemised factors rather than one
 * number, because the whole value of the product is being able to argue with the
 * number. The signed interaction is the step wedge, which re-runs the same engine
 * for a hypothetical use without touching the saved record.
 */
export default async function PlatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPlateId(id)) notFound();

  const ownerId = await getOwnerId();
  // Read the tombstone too. A retired plate keeps its page, its snapshot, its
  // decision and its chain: the record leaves the docket list, but a link that was
  // already sent still resolves and still verifies.
  const view = await getPlateView(ownerId, id, { includeDeleted: true });
  const { plate, work, assessment, events, verification } = view;
  const rule = termRule(plate.jurisdiction);
  const ink = BAND_INK[assessment.band];
  const use = USE_RULES.find((entry) => entry.id === plate.use);
  const retired = plate.deletedAt !== null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 font-mono text-xs text-bone-faint">
        <Link href="/plates" className="hover:text-review">
          Docket
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate">{plate.shareCode}</span>
      </nav>

      {retired ? (
        <div className="mb-6">
          <Notice tone="warn" title="This plate is retired">
            It has been tombstoned, not erased. The snapshot, the decision and the chain are all retained, so a
            docket you already shared still verifies.{" "}
            <Link href={`/d/${plate.shareCode}`} className="text-review underline underline-offset-2">
              Open the shared view
            </Link>
            .
          </Notice>
        </div>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <Slug>Plate {plate.shareCode}</Slug>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight sm:text-4xl">
            {plate.title}
          </h1>
          <p className="mt-2 text-sm text-bone-dim">
            {work.creator.anonymous ? "Unrecorded maker" : work.creator.name}
            {work.creator.deathYear ? ` (d. ${work.creator.deathYear})` : ""} &middot;{" "}
            {institutionFullName(work.institution)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <BandChip band={assessment.band} />
          <SourceBadge status={work.provenance.status} fetchedAt={work.provenance.fetchedAt} />
          <Link
            href={`/d/${plate.shareCode}`}
            className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim underline decoration-rule-bright underline-offset-2 hover:text-review"
          >
            Shareable docket
          </Link>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        {/* Left: the proof sheet and the signature interaction. */}
        <div className="space-y-6">
          <Panel onPaper className="p-5">
            <p className="slug slug-ink">The proof</p>
            <div className="mt-4">
              <WorkStrip work={work} />
            </div>
          </Panel>

          <Panel className="p-5">
            <StepWedge
              plateId={plate.id}
              committed={assessment}
              savedUse={plate.use}
              savedJurisdiction={plate.jurisdiction}
              savedCirculation={plate.circulation}
            />
          </Panel>

          <Panel className="p-5">
            <SlugHeading slug="Term arithmetic">What the year does</SlugHeading>
            <dl className="mt-5 grid grid-cols-2 gap-5">
              <Figure
                label="Creator died"
                value={assessment.termArithmetic.creatorDeathYear ?? "unknown"}
                hint={work.creator.anonymous ? "Recorded as anonymous or unrecorded." : undefined}
              />
              <Figure label="Term length" value={`+${rule.lifePlusYears}`} hint={rule.label} />
              <Figure
                label="Term runs to"
                value={assessment.termArithmetic.requiredThrough ?? "—"}
                hint={assessment.termArithmetic.satisfied === null ? "Not computable" : assessment.termArithmetic.satisfied ? "Reached" : "Still running"}
              />
              <Figure label="Today" value={assessment.inputs.asOfYear} hint={use?.label} />
            </dl>
            <p className="mt-4 border-t border-rule pt-4 text-sm leading-relaxed text-bone-dim">
              {assessment.termArithmetic.note}
            </p>
            {rule.publicationCutoffYears ? (
              <p className="mt-2 text-xs leading-relaxed text-bone-faint">{rule.note}</p>
            ) : null}
          </Panel>
        </div>

        {/* Right: the six factors, the credit line, the decision and the chain. */}
        <div className="space-y-6">
          <Panel className="p-5">
            <div className="flex items-end justify-between gap-4">
              <SlugHeading slug={`Engine ${assessment.version}`}>Why this score</SlugHeading>
              <p className="tnum font-display text-4xl leading-none" style={{ color: ink.fg }}>
                {assessment.score.toFixed(1)}
              </p>
            </div>

            <table className="mt-5 w-full border-collapse text-left">
              <caption className="sr-only">
                Clearance factors with their weights, values, points and status
              </caption>
              <thead>
                <tr className="border-b border-rule">
                  <th scope="col" className="slug pb-2">Factor</th>
                  <th scope="col" className="slug pb-2 text-right">Weight</th>
                  <th scope="col" className="slug pb-2 text-right">Points</th>
                  <th scope="col" className="slug pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {assessment.factors.map((factor) => (
                  <tr key={factor.id} className="border-b border-rule align-top">
                    <td className="py-3 pr-3">
                      <span className="block text-sm text-bone">{factor.label}</span>
                      <span className="mt-1 block font-mono text-[0.6875rem] leading-relaxed text-bone-faint">
                        {factor.raw}
                      </span>
                      <span className="mt-1.5 block text-xs leading-relaxed text-bone-dim">
                        {factor.evidence}
                      </span>
                    </td>
                    <td className="tnum py-3 text-right font-mono text-xs text-bone-faint">
                      {factor.weight.toFixed(2)}
                    </td>
                    <td className="tnum py-3 text-right font-mono text-sm text-bone">
                      {factor.contribution.toFixed(1)}
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]"
                        style={{ color: STATUS_INK[factor.status].fg }}
                      >
                        {STATUS_INK[factor.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="tnum font-mono text-xs text-bone-faint">
                confidence {assessment.confidence.toFixed(2)} &middot; digest {shortSeal(assessment.digest)}
              </p>
              <p className="font-mono text-[0.625rem] text-bone-faint">
                {assessment.engine} {assessment.version}
              </p>
            </div>
          </Panel>

          {assessment.restrictions.length > 0 ? (
            <Panel className="p-5">
              <SlugHeading slug="Reproduction rights">What the institution asserts</SlugHeading>
              {work.rightsStatement ? (
                <p className="mt-4 border border-rule bg-room-deep p-3 font-mono text-xs leading-relaxed text-bone">
                  {work.rightsStatement}
                </p>
              ) : null}
              <ul className="mt-4 space-y-3">
                {assessment.restrictions.map((restriction) => (
                  <li key={`${restriction.kind}-${restriction.index}`} className="border-t border-rule pt-3">
                    <p className="font-mono text-xs" style={{ color: "var(--color-blocked)" }}>
                      {restriction.matchedText}
                      {restriction.holder ? ` — ${restriction.holder}` : ""}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-bone-dim">{restriction.clause}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel onPaper className="p-5">
            <p className="slug slug-ink">Credit line</p>
            <p className="mt-3 font-mono text-sm leading-relaxed text-ink">{assessment.requiredCreditLine}</p>
            <p className="slug slug-ink mt-5">Short form</p>
            <p className="mt-2 font-mono text-xs leading-relaxed text-ink-soft">{assessment.shortCitation}</p>

            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-paper-rule pt-4 sm:grid-cols-3">
              {assessment.attributionElements.map((element) => (
                <li key={element.element} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2"
                    style={{
                      background: element.present ? "var(--color-clear)" : "var(--color-blocked)",
                    }}
                  />
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-soft">
                    {element.element.replace("_", " ")}
                    {element.present ? "" : " missing"}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-paper-rule pt-4">
              <a
                href={`/api/docket/${plate.shareCode}?format=md`}
                className="border border-ink px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                Docket .md
              </a>
              <a
                href={`/api/docket/${plate.shareCode}?format=csv`}
                className="border border-ink px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                Docket .csv
              </a>
              <a
                href={`/api/docket/${plate.shareCode}?format=json`}
                className="border border-ink px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                Docket .json
              </a>
            </div>
          </Panel>

          {assessment.blockers.length > 0 ? (
            <Panel className="border-blocked p-5">
              <SlugHeading slug="Blockers">What stops this today</SlugHeading>
              <ul className="mt-4 space-y-2">
                {assessment.blockers.map((blocker) => (
                  <li key={blocker} className="flex gap-3 text-sm leading-relaxed text-bone-dim">
                    <span aria-hidden="true" className="mt-2 inline-block h-1.5 w-1.5 flex-none" style={{ background: "var(--color-blocked)" }} />
                    {blocker}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {assessment.cautions.length > 0 ? (
            <Panel className="p-5">
              <Slug>Cautions</Slug>
              <ul className="mt-3 space-y-2">
                {assessment.cautions.map((caution) => (
                  <li key={caution} className="flex gap-3 text-xs leading-relaxed text-bone-faint">
                    <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 flex-none" style={{ background: "var(--color-review)" }} />
                    {caution}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel className="p-5">
            <SlugHeading slug="Your call">Decision</SlugHeading>
            {plate.decision ? (
              <div className="mt-4 border border-rule bg-room-deep p-4">
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-bone">
                  {plate.decision}
                  {plate.decisionBand ? (
                    <span style={{ color: BAND_INK[plate.decisionBand].fg }}>
                      {" "}
                      &middot; {BAND_INK[plate.decisionBand].label} at {plate.decisionScore?.toFixed(1)}
                    </span>
                  ) : null}
                </p>
                <p className="slug mt-2">{formatDateTime(plate.decisionAt)}</p>
                {plate.decisionNote ? (
                  <p className="mt-3 text-sm leading-relaxed text-bone-dim">{plate.decisionNote}</p>
                ) : null}
                <p className="mt-3 break-all font-mono text-[0.625rem] text-bone-faint">
                  decision seal {plate.decisionSeal}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-bone-dim">
                No decision recorded yet. The verdict above is computed on every read and is not yet sealed into
                the docket.
              </p>
            )}

            <div className="mt-6 border-t border-rule pt-6">
              <PlateActions
                plateId={plate.id}
                use={plate.use}
                jurisdiction={plate.jurisdiction}
                circulation={plate.circulation}
                note={plate.note}
                decision={plate.decision}
                retired={retired}
              />
            </div>
          </Panel>

          <Panel className="p-5">
            <SlugHeading slug="SHA-384 chain">Tamper evidence</SlugHeading>
            <div className="mt-5">
              <ChainPanel
                plateId={plate.id}
                initial={verification}
                events={events.map((event) => ({
                  seq: event.seq,
                  eventType: event.eventType,
                  createdAt: event.createdAt,
                  prevSeal: event.prevSeal,
                  seal: event.seal,
                }))}
              />
            </div>
          </Panel>
        </div>
      </div>

      <p className="mt-10 max-w-3xl border-t border-rule pt-6 text-xs leading-relaxed text-bone-faint">
        {DISCLAIMER} Jurisdiction options on the{" "}
        <Link href="/terms" className="text-review underline underline-offset-2">
          terms page
        </Link>{" "}
        cover {TERM_RULES.length} published term lengths.
      </p>
    </div>
  );
}
