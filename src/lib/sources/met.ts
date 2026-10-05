import type { Creator, Provenance, Work } from "../types";
import { fetchJson, nowIso } from "./http";

/**
 * The Metropolitan Museum of Art Collection API.
 *
 * Endpoint note that matters: /public/collection/v1/search was retired on
 * 2026-10-01 and the collection moved to the Elastic-backed
 * /public/collection/v1.1/search, which is paginated. The single-record endpoint
 * stayed on /public/collection/v1/objects/{id} and is what this adapter uses.
 *
 * This is the only upstream that publishes a distinct `isPublicDomain` flag and a
 * free-text `rightsAndReproduction` statement, which is exactly why the product
 * is able to tell the artwork's term apart from the photograph of it.
 */

const BASE = "https://collectionapi.metmuseum.org/public/collection";
const SEARCH_V11 = `${BASE}/v1.1/search`;
const OBJECT_V1 = `${BASE}/v1/objects`;

const ATTRIBUTION = "The Metropolitan Museum of Art, Collection API (Open Access)";
const TERMS = "https://www.metmuseum.org/information/terms-and-conditions";

interface MetSearchResponse {
  total: number;
  objectIDs?: number[];
}

interface MetObject {
  objectID: number;
  isPublicDomain: boolean;
  primaryImage?: string | null;
  primaryImageSmall?: string | null;
  title: string;
  culture?: string;
  period?: string;
  artistDisplayName?: string;
  artistDisplayBio?: string;
  artistBeginDate?: string;
  artistEndDate?: string;
  artistWikidata_URL?: string;
  objectDate?: string;
  objectBeginDate?: number;
  objectEndDate?: number;
  medium?: string;
  dimensions?: string;
  classification?: string;
  rightsAndReproduction?: string;
  creditLine?: string;
  accessionNumber?: string;
  department?: string;
  objectURL?: string;
  metadataDate?: string;
}

function wikidataQid(url: string | undefined): string | null {
  if (!url) return null;
  const match = /\/wiki\/(Q\d+)/.exec(url);
  return match ? match[1] : null;
}

function year(value: string | undefined): number | null {
  if (!value) return null;
  const match = /(-?\d{3,4})/.exec(value);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCreator(object: MetObject): Creator {
  const name = (object.artistDisplayName ?? "").trim();
  if (name.length === 0) {
    return {
      name: "Unrecorded maker",
      birthYear: null,
      deathYear: null,
      wikidataId: null,
      anonymous: true,
    };
  }
  return {
    name,
    birthYear: year(object.artistBeginDate),
    deathYear: year(object.artistEndDate),
    wikidataId: wikidataQid(object.artistWikidata_URL),
    anonymous: false,
  };
}

export function normalizeMetObject(object: MetObject, fetchedAt: string, latencyMs?: number): Work {
  const rights = (object.rightsAndReproduction ?? "").trim();
  const creator = parseCreator(object);
  const small = (object.primaryImageSmall || object.primaryImage || "").trim();
  const creditLine = (object.creditLine ?? "").trim();

  return {
    id: `met:${object.objectID}`,
    institution: "met",
    upstreamId: String(object.objectID),
    title: object.title?.trim() || `Untitled object ${object.objectID}`,
    culture: object.culture?.trim() || null,
    period: object.period?.trim() || null,
    creator,
    madeYear:
      typeof object.objectEndDate === "number"
        ? object.objectEndDate
        : typeof object.objectBeginDate === "number"
          ? object.objectBeginDate
          : null,
    madeLabel: object.objectDate?.trim() || null,
    medium: object.medium?.trim() || null,
    classification: object.classification?.trim() || null,
    rightsStatement: rights.length > 0 ? rights : null,
    institutionCleared: typeof object.isPublicDomain === "boolean" ? object.isPublicDomain : null,
    licenseLabel: object.isPublicDomain ? "Public Domain" : null,
    institutionCreditLine: creditLine.length > 0 ? creditLine : null,
    accessionNumber: object.accessionNumber?.trim() || null,
    department: object.department?.trim() || null,
    image: small
      ? {
          url: small,
          width: null,
          height: null,
          alt: `${object.title} by ${creator.anonymous ? "an unrecorded maker" : creator.name}, The Metropolitan Museum of Art`,
        }
      : null,
    pageUrl: object.objectURL?.trim() || `https://www.metmuseum.org/art/collection/search/${object.objectID}`,
    metadataUpdatedAt: object.metadataDate ?? null,
    provenance: {
      provider: "met",
      status: "live",
      fetchedAt,
      upstreamId: `met:${object.objectID}`,
      attribution: ATTRIBUTION,
      termsUrl: TERMS,
      ...(latencyMs === undefined ? {} : { latencyMs }),
    },
  };
}

export async function fetchMetObject(objectId: number): Promise<MetObject> {
  return fetchJson<MetObject>(`${OBJECT_V1}/${objectId}`, {
    provider: "met",
    timeoutMs: 7000,
  });
}

export interface MetSearchResult {
  works: Work[];
  total: number;
  provenance: Provenance;
}

/**
 * Search the retired-then-replaced endpoint, then read the records in full.
 *
 * The search endpoint returns identifiers only, so the rights fields everyone
 * came for are not in the search response at all: each candidate is read from the
 * object endpoint. The detail pass is bounded and runs its failures through
 * allSettled, so one unreadable record never empties a page of results.
 *
 * `hasImages` is deliberately not used as a filter. The institution withholds the
 * image for anything still in copyright, so filtering on images would hide
 * exactly the records a publisher most needs to be warned about. Records without
 * an open reproduction are kept and rendered as such.
 */
export async function searchMet(query: string, limit: number): Promise<MetSearchResult> {
  const fetchedAt = nowIso();
  const startedAt = Date.now();
  const params = new URLSearchParams();
  if (query.trim().length > 0) {
    params.set("q", query.trim().slice(0, 80));
  } else {
    params.set("isHighlight", "true");
  }
  params.set("limit", String(Math.min(limit, 100)));

  const response = await fetchJson<MetSearchResponse>(`${SEARCH_V11}?${params}`, {
    provider: "met",
    timeoutMs: 7000,
    revalidate: 900,
  });

  const ids = (response.objectIDs ?? []).slice(0, limit);
  const details = await Promise.allSettled(ids.map((id) => fetchMetObject(id)));
  const latencyMs = Date.now() - startedAt;
  const works = details
    .filter((entry): entry is PromiseFulfilledResult<MetObject> => entry.status === "fulfilled")
    .map((entry) => normalizeMetObject(entry.value, fetchedAt, latencyMs));

  return {
    works: rankWorks(works),
    total: response.total ?? works.length,
    provenance: {
      provider: "met",
      status: "live",
      fetchedAt,
      upstreamId: `met:search:${encodeURIComponent(query.trim().slice(0, 40))}`,
      attribution: ATTRIBUTION,
      termsUrl: TERMS,
      latencyMs,
    },
  };
}

/**
 * Records with an open reproduction first, then by year of making, then by
 * title. Fully ordered, so two identical searches render in the same sequence.
 */
function rankWorks(works: Work[]): Work[] {
  return [...works].sort((a, b) => {
    if ((a.image ? 0 : 1) !== (b.image ? 0 : 1)) return a.image ? -1 : 1;
    const yearA = a.madeYear ?? Number.MAX_SAFE_INTEGER;
    const yearB = b.madeYear ?? Number.MAX_SAFE_INTEGER;
    if (yearA !== yearB) return yearA - yearB;
    return a.title.localeCompare(b.title);
  });
}