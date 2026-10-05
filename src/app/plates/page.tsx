import Link from "next/link";
import Image from "next/image";
import { getRepository } from "@/lib/db";
import { getOwnerId } from "@/lib/session";
import { verifyPlate } from "@/lib/service";
import { isJurisdiction, isPlateStatus, isUseKind, parseBoundedInt } from "@/lib/validation";
import { BAND_INK, formatDate } from "@/lib/bands";
import { USE_RULES } from "@/lib/terms";
import type { Jurisdiction, PlateStatus, UseKind } from "@/lib/types";
import { Notice, Panel, Slug, SlugHeading } from "@/components/primitives";

export const metadata = {
  title: "Docket",
  alternates: { canonical: "/plates" },
};

/**
 * The workspace.
 *
 * Filters and paging live in the URL rather than in component state, so a filtered
 * view can be bookmarked, pasted into a message and survived by a refresh. Each
 * filter is a plain link to the next URL, which means the list is fully rendered on
 * the server and works before a single byte of JavaScript arrives.
 */
export default async function PlatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ownerId = await getOwnerId();
  const repository = await getRepository();

  const useParam = params.use ?? null;
  const jurisdictionParam = params.jurisdiction ?? null;
  const statusParam = params.status ?? null;
  const search = (params.search ?? "").trim().slice(0, 80);
  const limit = parseBoundedInt(params.limit ?? null, 24, 1, 100);
  const offset = parseBoundedInt(params.offset ?? null, 0, 0, 10_000);

  const use = isUseKind(useParam) ? (useParam as UseKind) : undefined;
  const jurisdiction = isJurisdiction(jurisdictionParam)
    ? (jurisdictionParam as Jurisdiction)
    : undefined;
  const status = isPlateStatus(statusParam) ? (statusParam as PlateStatus) : undefined;

  const [plates, total, includeDeleted] = await Promise.all([
    repository.listPlates(ownerId, {
      limit,
      offset,
      ...(use ? { use } : {}),
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
      includeDeleted: params.includeDeleted === "true",
    }),
    repository.countPlates(ownerId),
    params.includeDeleted === "true",
  ]);

  const chains = await Promise.all(plates.map((plate) => verifyPlate(plate.id)));

  function hrefFor(changes: Record<string, string | undefined>): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({
      use: useParam,
      jurisdiction: jurisdictionParam,
      status: statusParam,
      search: params.search,
      includeDeleted: params.includeDeleted,
      ...changes,
    })) {
      if (value !== undefined && value !== null && value !== "") next.set(key, value);
    }
    const query = next.toString();
    return query ? `/plates?${query}` : "/plates";
  }

  const activeFilters = [use, jurisdiction, status, search ? `“${search}”` : null].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SlugHeading slug="Everything you have pinned">Your docket</SlugHeading>
        <div className="flex gap-4">
          <Link
            href="/"
            className="border border-rule-bright px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-bone transition-colors hover:border-review hover:text-review"
          >
            File another
          </Link>
          <Link
            href="/export"
            className="border border-review px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room"
          >
            Export docket
          </Link>
        </div>
      </div>

      {/* Filters, all of them links. */}
      <Panel className="mt-8 p-4">
        <form action="/plates" method="get" className="flex flex-wrap gap-3">
          <input
            type="search"
            name="search"
            defaultValue={search}
            placeholder="Filter by title or creator"
            maxLength={80}
            className="min-w-0 flex-1 border border-rule bg-room-deep px-3 py-2 text-sm text-bone outline-none transition-colors placeholder:text-bone-faint focus:border-review"
          />
          <select
            name="use"
            defaultValue={use ?? ""}
            className="border border-rule bg-room-deep px-3 py-2 text-sm text-bone outline-none transition-colors focus:border-review"
            aria-label="Filter by intended use"
          >
            <option value="">Any use</option>
            {USE_RULES.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.label}
              </option>
            ))}
          </select>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="border border-rule bg-room-deep px-3 py-2 text-sm text-bone outline-none transition-colors focus:border-review"
            aria-label="Filter by status"
          >
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="decided">Decided</option>
            <option value="retired">Retired</option>
          </select>
          <button
            type="submit"
            className="border border-review px-4 font-mono text-xs uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room"
          >
            Apply
          </button>
        </form>

        {activeFilters.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-4">
            <span className="slug">Filtered by</span>
            {activeFilters.map((filter) => (
              <span key={filter} className="border border-rule-bright px-2 py-1 font-mono text-xs text-bone-dim">
                {filter}
              </span>
            ))}
            <Link href="/plates" className="font-mono text-xs text-review underline underline-offset-2">
              Clear
            </Link>
          </div>
        ) : null}
      </Panel>

      {plates.length === 0 ? (
        <div className="mt-6">
          <Notice tone="neutral" title={total === 0 ? "The docket is empty" : "Nothing matched those filters"}>
            {total === 0 ? (
              <>
                Nothing has been pinned yet.{" "}
                <Link href="/" className="text-review underline underline-offset-2">
                  Search a collection
                </Link>{" "}
                and pin a work to see its clearance breakdown.
              </>
            ) : (
              <>
                {total} plate{total === 1 ? " is" : "s are"} on file, but none match this filter.{" "}
                <Link href="/plates" className="text-review underline underline-offset-2">
                  Clear the filter
                </Link>
                .
              </>
            )}
          </Notice>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-rule border-y border-rule">
          {plates.map((plate, index) => {
            const chain = chains[index];
            const band = plate.decisionBand;
            const ink = band ? BAND_INK[band] : null;
            return (
              <li key={plate.id}>
                <Link
                  href={`/plates/${plate.id}`}
                  className="grid grid-cols-[auto_1fr] items-center gap-4 px-2 py-4 transition-colors hover:bg-bench sm:gap-6"
                >
                  <div className="flex h-16 w-14 items-center justify-center border border-rule bg-room-deep">
                    {plate.workSnapshot.image ? (
                      <Image
                        src={plate.workSnapshot.image.url}
                        alt={plate.workSnapshot.image.alt}
                        width={plate.workSnapshot.image.width ?? 120}
                        height={plate.workSnapshot.image.height ?? 140}
                        unoptimized
                        className="max-h-full w-auto max-w-full object-contain"
                      />
                    ) : (
                      <span className="px-1 text-center font-mono text-[0.5rem] uppercase tracking-[0.1em] text-bone-faint">
                        No image
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="truncate font-display text-base text-bone">{plate.title}</span>
                      {plate.deletedAt ? (
                        <span
                          className="font-mono text-[0.625rem] uppercase tracking-[0.16em]"
                          style={{ color: "var(--color-blocked)" }}
                        >
                          retired
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-bone-dim">
                      {plate.creatorName} &middot; {USE_RULES.find((rule) => rule.id === plate.use)?.label} &middot;{" "}
                      {plate.jurisdiction.toUpperCase()} &middot; {plate.circulation.toLocaleString("en-US")} reach
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[0.625rem] text-bone-faint">
                      <span>filed {formatDate(plate.createdAt)}</span>
                      <span>
                        chain {chain.ok ? `ok · ${chain.eventCount} events` : `broken at ${chain.brokenAtSeq}`}
                      </span>
                      {plate.decision ? <span>decision {plate.decision}</span> : null}
                    </p>
                  </div>

                  {ink ? (
                    <p
                      className="col-span-2 font-mono text-[0.6875rem] uppercase tracking-[0.16em] sm:col-span-1 sm:text-right"
                      style={{ color: ink.fg }}
                    >
                      {ink.label}
                    </p>
                  ) : (
                    <Slug className="col-span-2 sm:col-span-1 sm:text-right">no decision yet</Slug>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {plates.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <Slug>
            Showing {offset + 1}-{offset + plates.length} of {total}
          </Slug>
          <div className="flex gap-2">
            {offset > 0 ? (
              <Link
                href={hrefFor({ offset: String(Math.max(0, offset - limit)) })}
                className="border border-rule-bright px-3 py-1.5 font-mono text-xs text-bone-dim hover:border-bone hover:text-bone"
              >
                Previous
              </Link>
            ) : null}
            {offset + plates.length < total ? (
              <Link
                href={hrefFor({ offset: String(offset + limit) })}
                className="border border-rule-bright px-3 py-1.5 font-mono text-xs text-bone-dim hover:border-bone hover:text-bone"
              >
                Next
              </Link>
            ) : null}
            <Link
              href={hrefFor({ includeDeleted: includeDeleted ? undefined : "true" })}
              className="border border-rule px-3 py-1.5 font-mono text-xs text-bone-faint hover:border-bone hover:text-bone"
            >
              {includeDeleted ? "Hide retired" : "Show retired"}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
