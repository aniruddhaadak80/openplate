import Image from "next/image";
import Link from "next/link";
import type { Jurisdiction, UseKind, Work } from "@/lib/types";
import { BAND_INK } from "@/lib/bands";
import { institutionName } from "@/lib/bands";
import { SourceBadge } from "./primitives";
import { PinPanel } from "./PinPanel";

/**
 * One search result, rendered as a proof: the sheet is bright paper, the metadata
 * runs down a slug gutter beside it, and the institution's own claim about rights
 * is stated in words rather than implied by the presence of a picture.
 *
 * The card also carries the write path, so a visitor can go from an image they
 * found to a filed, scored record without leaving the results.
 */
export function WorkCard({
  work,
  defaultUse = "editorial",
  defaultJurisdiction = "us",
  defaultCirculation = 10_000,
}: {
  work: Work;
  defaultUse?: UseKind;
  defaultJurisdiction?: Jurisdiction;
  defaultCirculation?: number;
}) {
  const claim = work.institutionCleared;
  const claimInk =
    claim === true
      ? "var(--color-clear)"
      : claim === false
        ? "var(--color-blocked)"
        : "var(--color-review)";

  const claimText =
    claim === true
      ? work.licenseLabel
        ? `Cleared · ${work.licenseLabel}`
        : "Cleared"
      : claim === false
        ? "In copyright"
        : "No claim published";

  return (
    <article className="crop border border-rule bg-bench">
      {/* The proof sheet. */}
      <div className="relative flex aspect-[4/5] items-center justify-center border-b border-rule bg-room-deep p-3">
        {work.image ? (
          <Image
            src={work.image.url}
            alt={work.image.alt}
            width={work.image.width ?? 600}
            height={work.image.height ?? 750}
            // Read straight from the provider: the institutions already publish
            // correctly sized derivatives, so proxying them would only add a hop.
            unoptimized
            // A results grid can hold a dozen museum images. Only the first row is
            // worth spending the visitor's bandwidth on.
            loading="lazy"
            decoding="async"
            className="max-h-full w-auto max-w-full object-contain"
          />
        ) : (
          <div className="px-4 text-center">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]" style={{ color: claimInk }}>
              No open reproduction
            </p>
            <p className="mt-2 text-xs leading-relaxed text-bone-faint">
              The institution withholds the image for this record, which is itself the answer: the picture on
              their page is not theirs to give away.
            </p>
          </div>
        )}
      </div>

      {/* The slug gutter. */}
      <div className="grid grid-cols-[1fr_auto] gap-x-4 p-4">
        <div className="min-w-0">
          <p className="font-display text-base leading-snug text-bone">{work.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-bone-dim">
            {work.creator.anonymous ? "Unrecorded maker" : work.creator.name}
            {work.creator.deathYear ? ` (d. ${work.creator.deathYear})` : ""}
          </p>
          <p className="mt-1 text-xs text-bone-faint">
            {work.madeLabel ?? (work.madeYear ? String(work.madeYear) : "date not published")}
            {work.medium ? ` · ${work.medium}` : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]" style={{ color: claimInk }}>
            {claimText}
          </p>
          <SourceBadge status={work.provenance.status} fetchedAt={work.provenance.fetchedAt} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-rule px-4 py-3">
        <span className="slug">{institutionName(work.institution)}</span>
        <Link
          href={`/?q=${encodeURIComponent(work.title.slice(0, 40))}`}
          className="text-xs text-bone-dim underline decoration-rule-bright underline-offset-2 transition-colors hover:text-review"
        >
          Similar
        </Link>
      </div>

      <PinPanel
        workId={work.id}
        title={work.title}
        defaultUse={defaultUse}
        defaultJurisdiction={defaultJurisdiction}
        defaultCirculation={defaultCirculation}
      />
    </article>
  );
}

/** Compact read-only strip for a work already pinned to a plate. */
export function WorkStrip({ work }: { work: Work }) {
  const ink = BAND_INK.blocked;
  return (
    <div className="flex gap-4">
      <div className="flex h-28 w-24 flex-none items-center justify-center border border-rule bg-room-deep">
        {work.image ? (
          <Image
            src={work.image.url}
            alt={work.image.alt}
            width={work.image.width ?? 200}
            height={work.image.height ?? 240}
            unoptimized
            className="max-h-full w-auto max-w-full object-contain"
          />
        ) : (
          <span className="px-2 text-center font-mono text-[0.5625rem] uppercase tracking-[0.12em]" style={{ color: ink.fg }}>
            No open image
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg leading-snug text-bone">{work.title}</p>
        <p className="mt-1 text-sm text-bone-dim">
          {work.creator.anonymous ? "Unrecorded maker" : work.creator.name}
          {work.creator.deathYear ? ` (d. ${work.creator.deathYear})` : ""}
        </p>
        <p className="mt-1 text-xs text-bone-faint">
          {institutionName(work.institution)} &middot; {work.accessionNumber ?? work.upstreamId}
        </p>
        <a
          href={work.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim underline decoration-rule-bright underline-offset-2 hover:text-review"
        >
          Open the institution record
        </a>
      </div>
    </div>
  );
}
