import Link from "next/link";
import { searchWorks } from "@/lib/sources";
import { SEALED_AT } from "@/lib/sources/fallback";
import { readTermSettings } from "@/lib/service";
import { getRepository } from "@/lib/db";
import { getOwnerId } from "@/lib/session";
import { parseSearchQuery } from "@/lib/validation";
import { SITE } from "@/lib/config";
import { TERM_RULES, USE_RULES } from "@/lib/terms";
import { GitHubLink } from "@/components/GitHubLink";
import { WorkCard } from "@/components/WorkCard";
import { Notice, Panel, Slug, SlugHeading, SourceBadge } from "@/components/primitives";

export const metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  alternates: { canonical: "/" },
};

const SUGGESTIONS = ["jaguar", "still life", "harbour", "portrait", "jade"];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = parseSearchQuery(params.q ?? "");
  const ownerId = await getOwnerId();

  const [outcome, settings, plateCount] = await Promise.all([
    searchWorks(query, { limit: 12 }),
    readTermSettings(ownerId),
    getRepository().then((repository) => repository.countPlates(ownerId)),
  ]);

  const liveProviders = outcome.provenance.filter((entry) => entry.status === "live");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* Entry. The search is the product, so it is above the fold and it is real. */}
      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <Slug>Rights clearance desk for images</Slug>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            A painting can be out of copyright and the
            <span className="block italic" style={{ color: "var(--color-review)" }}>
              photograph of it can still be protected.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-bone-dim">
            Museums publish two different things about the same artwork: whether the work is in copyright, and
            whether <em>their picture of it</em> is. OpenPlate reads both, does the arithmetic on the published
            term, and shows you the sentence behind every point of the score.
          </p>

          <form action="/" method="get" className="mt-7 max-w-xl">
            <label htmlFor="q" className="slug">
              Search two open collections
            </label>
            <div className="mt-2 flex">
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="jaguar"
                maxLength={80}
                className="min-w-0 flex-1 border border-rule bg-room-deep px-4 py-3 text-bone outline-none transition-colors placeholder:text-bone-faint focus:border-review"
              />
              <button
                type="submit"
                className="border border-l-0 border-review bg-review px-5 font-mono text-xs uppercase tracking-[0.16em] text-room transition-colors hover:bg-bone hover:border-bone"
              >
                Search
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="slug">Try</span>
              {SUGGESTIONS.map((suggestion) => (
                <Link
                  key={suggestion}
                  href={`/?q=${encodeURIComponent(suggestion)}`}
                  className="border border-rule px-2.5 py-1 font-mono text-xs text-bone-dim transition-colors hover:border-review hover:text-review"
                >
                  {suggestion}
                </Link>
              ))}
            </div>
          </form>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link
              href="/plates"
              className="border border-rule-bright px-4 py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-bone transition-colors hover:border-review hover:text-review"
            >
              {plateCount > 0 ? `Open your docket (${plateCount})` : "Open the docket"}
            </Link>
            <GitHubLink variant="button" />
          </div>
        </div>

        {/* The live status column: this is where the product refuses to pretend. */}
        <Panel className="self-start p-5">
          <Slug>Where this page got its records</Slug>
          <ul className="mt-4 space-y-3">
            {outcome.provenance.map((entry) => (
              <li key={entry.provider} className="border-t border-rule pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs uppercase tracking-[0.16em] text-bone">
                    {entry.provider === "met" ? "The Met" : entry.provider === "cle" ? "Cleveland" : entry.provider}
                  </span>
                  <SourceBadge
                    status={entry.status}
                    fetchedAt={entry.fetchedAt}
                    {...(entry.status === "fallback" ? { sealedAt: SEALED_AT } : {})}
                  />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-bone-faint">
                  {entry.latencyMs !== undefined ? `${entry.latencyMs} ms. ` : ""}
                  {entry.attribution}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-rule pt-4">
            <Slug>Your defaults</Slug>
            <p className="mt-2 text-sm leading-relaxed text-bone-dim">
              {TERM_RULES.find((rule) => rule.id === settings.jurisdiction)?.label},{" "}
              {USE_RULES.find((rule) => rule.id === settings.defaultUse)?.label.toLowerCase()} use,{" "}
              {settings.defaultCirculation.toLocaleString("en-US")} reach.
            </p>
            <Link
              href="/terms"
              className="mt-2 inline-block font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-review underline decoration-rule-bright underline-offset-2"
            >
              Change on the terms page
            </Link>
          </div>

          <p className="mt-5 border-t border-rule pt-4 text-xs leading-relaxed text-bone-faint">
            {outcome.degraded
              ? `Both institutions were unreachable, so this page is showing the sealed sample taken on ${SEALED_AT}. Nothing below is current.`
              : `${liveProviders.length} of ${outcome.provenance.length} providers answered live. ${outcome.total.toLocaleString("en-US")} matching records exist across the two collections.`}
          </p>
        </Panel>
      </section>

      {/* Results. */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SlugHeading slug={query ? `Results for "${query}"` : "Opening on the institutions' highlights"}>
            {outcome.works.length > 0
              ? `${outcome.works.length} record${outcome.works.length === 1 ? "" : "s"}`
              : "Nothing to show"}
          </SlugHeading>
          <p className="slug">Institutions answered newest-first by record, interleaved</p>
        </div>

        {outcome.degraded ? (
          <div className="mt-6">
            <Notice tone="warn" title="Sealed fallback, not live">
              Both museums failed to answer, so these are the committed sample records dated {SEALED_AT}. They are
              real records, but they are not what the institutions are publishing right now.
            </Notice>
          </div>
        ) : null}

        {outcome.works.length === 0 ? (
          <div className="mt-6">
            <Notice tone="neutral" title="No records matched">
              Nothing in either collection matched that search. Try a broader word, or one of the suggestions above.
            </Notice>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outcome.works.map((work) => (
              <WorkCard
                key={work.id}
                work={work}
                defaultUse={settings.defaultUse}
                defaultJurisdiction={settings.jurisdiction}
                defaultCirculation={settings.defaultCirculation}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-16 border-t border-rule pt-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <Slug>1. Pin the work</Slug>
            <p className="mt-2 text-sm leading-relaxed text-bone-dim">
              Choose the record and say what you are actually going to do with it. The product re-reads the work
              live and stores a snapshot, so your docket records what the institution said today.
            </p>
          </div>
          <div>
            <Slug>2. Read the arithmetic</Slug>
            <p className="mt-2 text-sm leading-relaxed text-bone-dim">
              Six weighted factors: the institution&apos;s own claim, the creator&apos;s term, the publication-age
              rule, the restrictions in their statement, your use, and whether a credit line is even possible.
            </p>
          </div>
          <div>
            <Slug>3. Seal and export</Slug>
            <p className="mt-2 text-sm leading-relaxed text-bone-dim">
              Record the decision into a SHA-384 chain, then export a dated docket as JSON, CSV or Markdown with
              the credit line and the seal a colleague can re-verify.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
