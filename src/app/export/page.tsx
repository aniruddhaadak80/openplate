import Link from "next/link";
import { getRepository } from "@/lib/db";
import { getOwnerId } from "@/lib/session";
import { verifyPlate } from "@/lib/service";
import { BAND_INK, formatDate } from "@/lib/bands";
import { DISCLAIMER, USE_RULES, TERM_RULES } from "@/lib/terms";
import { SITE } from "@/lib/config";
import { Notice, Panel, Slug, SlugHeading } from "@/components/primitives";

export const metadata = {
  title: "Export",
  alternates: { canonical: "/export" },
};

/**
 * The export route.
 *
 * One page that turns the whole docket into something a person can hand over:
 * a printable index, plus per-plate links in three formats and the shared docket
 * URL for each. It renders server-side, so the page works with no JavaScript at
 * all, which matters for the person who just wants to print something.
 */
export default async function ExportPage() {
  const ownerId = await getOwnerId();
  const repository = await getRepository();
  const plates = await repository.listPlates(ownerId, { limit: 100, offset: 0, includeDeleted: false });
  const chains = await Promise.all(plates.map((plate) => verifyPlate(plate.id)));

  const decided = plates.filter((plate) => plate.decision !== null);
  const intact = chains.filter((chain) => chain.ok).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <SlugHeading slug="Take it with you">Export the docket</SlugHeading>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-bone-dim">
        Every plate has a stable share URL and three downloadable renderings of the same view. The Markdown file is
        the one to paste into an email; the CSV is the one for a spreadsheet; the JSON is the one for a script that
        wants to check the seals.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Plates", String(plates.length)],
          ["Decided", String(decided.length)],
          ["Chains intact", `${intact}/${plates.length}`],
          ["Jurisdictions", String(TERM_RULES.length)],
        ].map(([label, value]) => (
          <div key={label} className="crop border border-rule bg-bench p-4">
            <p className="slug">{label}</p>
            <p className="tnum mt-1.5 font-display text-2xl leading-none text-bone">{value}</p>
          </div>
        ))}
      </div>

      {plates.length === 0 ? (
        <div className="mt-8">
          <Notice tone="neutral" title="Nothing to export yet">
            File a plate first and it will appear here with its own download links.{" "}
            <Link href="/" className="text-review underline underline-offset-2">
              Search a collection
            </Link>
            .
          </Notice>
        </div>
      ) : (
        <section className="mt-10">
          <Slug>Index of dockets</Slug>
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {plates.map((plate, index) => {
              const chain = chains[index];
              const ink = plate.decisionBand ? BAND_INK[plate.decisionBand] : null;
              return (
                <li key={plate.id} className="py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg leading-snug text-bone">{plate.title}</p>
                      <p className="mt-1 text-xs text-bone-dim">
                        {plate.creatorName} &middot;{" "}
                        {USE_RULES.find((rule) => rule.id === plate.use)?.label} &middot;{" "}
                        {plate.jurisdiction.toUpperCase()} &middot; filed {formatDate(plate.createdAt)}
                      </p>
                    </div>
                    {ink ? (
                      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]" style={{ color: ink.fg }}>
                        {ink.label}
                      </p>
                    ) : null}
                  </div>

                  <p className="mt-3 font-mono text-[0.625rem] text-bone-faint">
                    {chain.ok ? `chain intact, ${chain.eventCount} events` : `chain broken at ${chain.brokenAtSeq}`}{" "}
                    &middot; share {plate.shareCode}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/d/${plate.shareCode}`}
                      className="border border-rule-bright px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim transition-colors hover:border-bone hover:text-bone"
                    >
                      Share page
                    </Link>
                    {(["md", "csv", "json"] as const).map((format) => (
                      <a
                        key={format}
                        href={`/api/docket/${plate.shareCode}?format=${format}`}
                        className="border border-rule px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim transition-colors hover:border-review hover:text-review"
                      >
                        .{format}
                      </a>
                    ))}
                    <Link
                      href={`/plates/${plate.id}`}
                      className="border border-rule px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim transition-colors hover:border-review hover:text-review"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Panel className="mt-12 p-5">
        <Slug>What is inside a docket file</Slug>
        <ul className="mt-4 space-y-2">
          {[
            "The credit line, assembled from the institution's own record, and a short citation.",
            "Every factor with its weight, its raw value, its points and the sentence behind it.",
            "The term arithmetic in full: death year, term length, the year the term runs to.",
            "The exact restriction phrases found in the rights statement, with the words that triggered them.",
            "The decision, its rationale, and the seal it was sealed at.",
            "The full event chain with every prev/seal pair, so it can be replayed offline.",
            "Provenance for every external record, including whether it was live or a sealed sample.",
          ].map((line) => (
            <li key={line} className="flex gap-3 text-xs leading-relaxed text-bone-dim">
              <span aria-hidden="true" className="mt-1.5 inline-block h-1.5 w-1.5 flex-none" style={{ background: "var(--color-review)" }} />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-5 border-t border-rule pt-4 text-xs leading-relaxed text-bone-faint">{DISCLAIMER}</p>
      </Panel>

      <p className="mt-6 font-mono text-[0.625rem] text-bone-faint">
        {SITE.name} &middot; {SITE.license} licensed
      </p>
    </div>
  );
}
