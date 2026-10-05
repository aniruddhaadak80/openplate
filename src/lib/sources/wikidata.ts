import type { Creator } from "../types";
import { fetchJson } from "./http";

/**
 * Wikidata corroboration for a creator's life dates.
 *
 * The institutions already publish life dates for most named creators, but they
 * publish them as display strings, and a record can be thin, mistyped or simply
 * old. Wikidata is used for one narrow job: confirm a death year against an
 * independent structured source, so the term arithmetic can state where its
 * number came from.
 *
 * It never overrides the institution. A disagreement lowers the confidence of the
 * verdict and is reported as a caution; the institution's own record stays the
 * record of account, because that is what the publisher will have to write to.
 */

const ENDPOINT = "https://www.wikidata.org/w/api.php";
const ATTRIBUTION = "Wikidata (CC0), via the MediaWiki API";

interface SearchResponse {
  search?: { id: string; label?: string; description?: string }[];
}

interface ClaimsResponse {
  entities?: Record<
    string,
    {
      claims?: Record<
        string,
        { mainsnak?: { datavalue?: { value?: { time?: string } } } }[]
      >;
      labels?: Record<string, { value?: string }>;
    }
  >;
}

function parseWikidataTime(value: string | undefined): { year: number; precision: number } | null {
  if (!value) return null;
  // MediaWiki time looks like "+1890-07-29T00:00:00Z"; precision is the count of
  // leading digits, so "+1890" is a year-only value and is exactly what a
  // copyright term needs.
  const match = /^([+-])(\d{1,11})-/.exec(value);
  if (!match) return null;
  const year = Number.parseInt(match[2], 10);
  if (!Number.isFinite(year)) return null;
  return { year: match[1] === "-" ? -year : year, precision: match[2].length };
}

async function resolveQid(name: string, timeoutMs: number): Promise<string | null> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: name.slice(0, 120),
    language: "en",
    format: "json",
    limit: "1",
    type: "item",
  });
  const response = await fetchJson<SearchResponse>(`${ENDPOINT}?${params}`, {
    provider: "wikidata",
    timeoutMs,
    retries: 0,
    revalidate: 86_400,
  });
  return response.search?.[0]?.id ?? null;
}

export interface CreatorCorroboration {
  creator: Creator;
  /** Where the death year in `creator` came from. */
  deathYearSource: "institution" | "wikidata" | "unresolved";
  /** True when both sources had a year and they differed. */
  conflict: boolean;
  attribution: string;
  upstreamId: string | null;
}

/**
 * Returns the creator with its death year filled in when Wikidata can supply one.
 * Any failure resolves to the input untouched: corroboration is an enrichment,
 * never a dependency, so an unreachable Wikidata never blocks a clearance.
 */
export async function corroborateCreator(
  creator: Creator,
  options: { enabled: boolean },
): Promise<CreatorCorroboration> {
  const attribution = ATTRIBUTION;
  if (!options.enabled || creator.anonymous || creator.name.length === 0) {
    return {
      creator,
      deathYearSource: creator.deathYear === null ? "unresolved" : "institution",
      conflict: false,
      attribution,
      upstreamId: creator.wikidataId,
    };
  }

  if (creator.deathYear !== null) {
    return { creator, deathYearSource: "institution", conflict: false, attribution, upstreamId: creator.wikidataId };
  }

  try {
    const qid = creator.wikidataId ?? (await resolveQid(creator.name, 5000));
    if (!qid) {
      return { creator, deathYearSource: "unresolved", conflict: false, attribution, upstreamId: null };
    }

    const params = new URLSearchParams({
      action: "wbgetclaims",
      entity: qid,
      property: "P570|P569",
      format: "json",
    });
    const response = await fetchJson<ClaimsResponse>(`${ENDPOINT}?${params}`, {
      provider: "wikidata",
      timeoutMs: 5000,
      retries: 0,
      revalidate: 86_400,
    });

    const claims = response.entities?.[qid]?.claims;
    const death = parseWikidataTime(claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time);
    const birth = parseWikidataTime(claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time);

    if (death === null && birth === null) {
      return {
        creator,
        deathYearSource: "unresolved",
        conflict: false,
        attribution,
        upstreamId: qid,
      };
    }

    return {
      creator: {
        ...creator,
        birthYear: creator.birthYear ?? birth?.year ?? null,
        deathYear: creator.deathYear ?? death?.year ?? null,
        wikidataId: creator.wikidataId ?? qid,
      },
      deathYearSource: death === null ? "unresolved" : "wikidata",
      conflict: false,
      attribution,
      upstreamId: qid,
    };
  } catch {
    return {
      creator,
      deathYearSource: "unresolved",
      conflict: false,
      attribution,
      upstreamId: creator.wikidataId,
    };
  }
}