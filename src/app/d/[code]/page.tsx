import Link from "next/link";
import { notFound } from "next/navigation";
import { getShareView } from "@/lib/service";
import { isShareCode } from "@/lib/validation";
import { GoneError } from "@/lib/api-helpers";
import { BAND_INK, STATUS_INK, formatDateTime, institutionFullName, shortSeal } from "@/lib/bands";
import { DISCLAIMER } from "@/lib/terms";
import { SITE } from "@/lib/config";
import { BandChip, Notice, Panel, SlugHeading } from "@/components/primitives";

export const metadata = {
  title: "Shared docket",
  robots: { index: false, follow: false },
};

/**
 * The stable share route.
 *
 * A share code is a capability, so this page deliberately carries no owner chrome
 * and no write controls: it is the read-only docket a publisher sends a colleague
 * or a client. It reports chain state, because the point of sending someone here
 * is that they can check it.
 *
 * A retired docket still renders, labelled as retired, rather than 404ing: the
 * value of a shared docket is that it stays checkable.
 */
export default async function SharedDocketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isShareCode(code)) notFound();

  let view;
  try {
    view = await getShareView(code);
  } catch (error) {
    if (error instanceof GoneError) notFound();
    throw error;
  }

  const { plate, work, assessment, events, verification } = view;
  const retired = plate.deletedAt !== null;
  const ink = BAND_INK[assessment.band];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="slug">
        {SITE.name} &middot; shared docket &middot;{" "}
        <span className="tnum">{plate.shareCode}</span>
      </p>

      {retired ? (
        <div className="mt-6">
          <Notice tone="warn" title="This docket has been retired by its owner">
            The plate was tombstoned rather than erased, so the record below is exactly as it stood. The chain is
            retained and still replays.
          </Notice>
        </div>
      ) : null}

      <header className="mt-6">
        <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">{work.title}</h1>
        <p className="mt-2 text-sm text-bone-dim">
          {work.creator.anonymous ? "Unrecorded maker" : work.creator.name}
          {work.creator.deathYear ? ` (d. ${work.creator.deathYear})` : ""} &middot;{" "}
          {institutionFullName(work.institution)}
        </p>
        <div className="mt-4">
          <BandChip band={assessment.band} />
        </div>
      </header>

      <Panel onPaper className="mt-8 p-5">
        <p className="slug slug-ink">Credit line</p>
        <p className="mt-3 font-mono text-sm leading-relaxed text-ink">{assessment.requiredCreditLine}</p>
        <p className="mt-4 border-t border-paper-rule pt-4 font-mono text-xs text-ink-soft">
          {assessment.shortCitation}
        </p>
      </Panel>

      <Panel className="mt-6 p-5">
        <SlugHeading slug={`Scored ${assessment.score.toFixed(1)} of 100`}>The factors</SlugHeading>
        <ul className="mt-4 divide-y divide-rule">
          {assessment.factors.map((factor) => (
            <li key={factor.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-bone">{factor.label}</span>
                <span className="flex items-center gap-3">
                  <span className="tnum font-mono text-sm text-bone">{factor.contribution.toFixed(1)}</span>
                  <span
                    className="font-mono text-[0.625rem] uppercase tracking-[0.16em]"
                    style={{ color: STATUS_INK[factor.status].fg }}
                  >
                    {STATUS_INK[factor.status].label}
                  </span>
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-bone-faint">{factor.evidence}</p>
            </li>
          ))}
        </ul>
      </Panel>

      {plate.decision ? (
        <Panel className="mt-6 p-5">
          <SlugHeading slug={formatDateTime(plate.decisionAt)}>Decision: {plate.decision}</SlugHeading>
          {plate.decisionNote ? (
            <p className="mt-3 text-sm leading-relaxed text-bone-dim">{plate.decisionNote}</p>
          ) : null}
          <p className="mt-3 break-all font-mono text-[0.625rem] text-bone-faint">
            sealed at {plate.decisionSeal}
          </p>
        </Panel>
      ) : null}

      <Panel className="mt-6 p-5">
        <SlugHeading slug="Chain verification">Can this be trusted</SlugHeading>
        <p className="mt-4 text-sm" style={{ color: verification.ok ? "var(--color-clear)" : "var(--color-blocked)" }}>
          {verification.ok
            ? `Every one of ${verification.eventCount} events recomputes to the stored seal, from the fixed genesis value.`
            : `The chain breaks at event ${verification.brokenAtSeq}: ${verification.reason}`}
        </p>
        <ol className="mt-4 space-y-1.5">
          {events.map((event) => (
            <li key={event.seq} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-rule pt-1.5">
              <span className="font-mono text-xs text-bone-dim">
                {String(event.seq).padStart(2, "0")} {event.eventType.replace(/_/g, " ")}
              </span>
              <span className="font-mono text-[0.625rem] text-bone-faint">{shortSeal(event.seal)}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4">
          <a
            href={`/api/docket/${plate.shareCode}?format=md`}
            className="border border-rule-bright px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim hover:border-bone hover:text-bone"
          >
            Download .md
          </a>
          <a
            href={`/api/docket/${plate.shareCode}?format=csv`}
            className="border border-rule-bright px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim hover:border-bone hover:text-bone"
          >
            Download .csv
          </a>
          <a
            href={`/api/docket/${plate.shareCode}?format=json`}
            className="border border-rule-bright px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim hover:border-bone hover:text-bone"
          >
            Download .json
          </a>
        </div>
      </Panel>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
        <p className="max-w-xl text-xs leading-relaxed text-bone-faint">{DISCLAIMER}</p>
        <Link
          href="/"
          className="border border-review px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room"
        >
          Clear your own image
        </Link>
      </div>

      <p className="mt-4 font-mono text-[0.625rem] text-bone-faint">
        engine {assessment.engine} {assessment.version} &middot; digest {shortSeal(assessment.digest)} &middot;{" "}
        <span style={{ color: ink.fg }}>{ink.label}</span>
      </p>
    </div>
  );
}
