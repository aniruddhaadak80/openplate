import type { Creator, Provenance, Work } from "../types";
import { fetchJson, nowIso } from "./http";

/**
 * The Cleveland Museum of Art Open Access API.
 *
 * The second institution, chosen because it publishes the two things this product
 * needs and publishes them as fields rather than prose: `share_license_status`,
 * which states the licence of the image being served, and machine-readable
 * earliest and latest creation years. It also serves its open-access imagery
 * from a CDN that answers a plain image request, which matters when the product
 * is going to put real pictures in front of a reader.
 */

const BASE = "https://openaccess-api.clevelandart.org/api/artworks";
const SINGLE = "https://openaccess-api.clevelandart.org/api/artworks";
const ATTRIBUTION = "The Cleveland Museum of Art, Open Access API";
const TERMS = "https://www.clevelandart.org/open-access";

const FIELDS = [
  "id",
  "accession_number",
  "title",
  "creation_date",
  "creation_date_earliest",
  "creation_date_latest",
  "date_text",
  "culture",
  "technique",
  "type",
  "department",
  "share_license_status",
  "creditline",
  "url",
  "updated_at",
  "creators",
  "images",
  "collection",
].join(",");

interface CleCreator {
  description?: string;
  role?: string;
}

interface CleArtwork {
  id: number;
  accession_number?: string;
  title?: string;
  creation_date?: string;
  creation_date_earliest?: number | null;
  creation_date_latest?: number | null;
  date_text?: string;
  /**
   * The API returns this as an array of strings in some records and a bare string
   * in others, so it is normalised rather than assumed.
   */
  culture?: string | string[] | null;
  technique?: string | null;
  type?: string | null;
  department?: string | null;
  share_license_status?: string | null;
  creditline?: string | null;
  url?: string | null;
  updated_at?: string | null;
  creators?: CleCreator[] | null;
  images?: { web?: { url?: string; width?: number; height?: number } };
}

/**
 * Coerce an upstream field into trimmed text, tolerating the array form some CMA
 * fields use. Returns null rather than "undefined" when the field is absent.
 */
function text(value: string | string[] | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const joined = value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .join(", ");
    return joined.length > 0 ? joined : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface CleSearchResponse {
  info?: { total?: number };
  data?: CleArtwork[];
}

interface CleArtworkResponse {
  data?: CleArtwork;
}

/**
 * The institution publishes a creator as free text, for example
 * "Claude Monet (French, 1840-1926)". The life dates inside it are what the term
 * arithmetic needs, so they are parsed out rather than discarded.
 */
function parseCreator(artwork: CleArtwork): Creator {
  const description = (artwork.creators ?? [])
    .map((creator) => text(creator.description))
    .find((value): value is string => value !== null);

  if (!description) {
    return {
      name: "Unrecorded maker",
      birthYear: null,
      deathYear: null,
      wikidataId: null,
      anonymous: true,
    };
  }

  const name = description.split("(")[0].trim() || description;
  const lifeDates = /\((?:[^)]*?)(\d{4})\s*[-–—]\s*(\d{4})\)/.exec(description);
  const deathOnly = /\((?:[^)]*?)(\d{4})\)/.exec(description);

  const birthYear = lifeDates ? Number.parseInt(lifeDates[1], 10) : null;
  const deathYear = lifeDates
    ? Number.parseInt(lifeDates[2], 10)
    : deathOnly
      ? Number.parseInt(deathOnly[1], 10)
      : null;

  const unknownMaker = /^(unknown|anonymous|not recorded|unattributed)$/i.test(name);
  if (unknownMaker) {
    return { name: "Unrecorded maker", birthYear: null, deathYear: null, wikidataId: null, anonymous: true };
  }

  return {
    name,
    birthYear,
    deathYear,
    // The institution does not publish a Wikidata cross-reference, so it stays
    // null rather than being guessed from the name.
    wikidataId: null,
    anonymous: false,
  };
}

const CLEARED_LICENCES = new Set(["CC0", "CC0 1.0", "PUBLIC DOMAIN", "PDM"]);

export function normalizeCleArtwork(artwork: CleArtwork, fetchedAt: string, latencyMs?: number): Work {
  const licence = text(artwork.share_license_status);
  const creator = parseCreator(artwork);
  const web = artwork.images?.web;
  const imageUrl = text(web?.url) ?? "";
  const title = text(artwork.title) ?? `Untitled object ${artwork.id}`;
  const accession = text(artwork.accession_number);
  const objectType = text(artwork.type);
  const technique = text(artwork.technique);
  const creditline = text(artwork.creditline);

  let institutionCleared: boolean | null = null;
  if (licence !== null) {
    institutionCleared = CLEARED_LICENCES.has(licence.toUpperCase());
  }

  const madeYear =
    typeof artwork.creation_date_latest === "number"
      ? artwork.creation_date_latest
      : typeof artwork.creation_date_earliest === "number"
        ? artwork.creation_date_earliest
        : null;

  return {
    id: `cle:${artwork.id}`,
    institution: "cle",
    upstreamId: String(artwork.id),
    title,
    culture: text(artwork.culture),
    period: technique,
    creator,
    madeYear,
    madeLabel: text(artwork.date_text) ?? text(artwork.creation_date),
    medium: [objectType, technique].filter((entry): entry is string => entry !== null).join(", ") || null,
    classification: objectType,
    rightsStatement: null,
    institutionCleared,
    licenseLabel: licence,
    institutionCreditLine: creditline,
    accessionNumber: accession,
    department: text(artwork.department),
    image: imageUrl
      ? {
          url: imageUrl.startsWith("//") ? `https:${imageUrl}` : imageUrl,
          width: typeof web?.width === "number" ? web.width : null,
          height: typeof web?.height === "number" ? web.height : null,
          alt: `${title} by ${creator.anonymous ? "an unrecorded maker" : creator.name}, The Cleveland Museum of Art`,
        }
      : null,
    pageUrl: text(artwork.url) ?? `https://clevelandart.org/art/${accession ?? artwork.id}`,
    metadataUpdatedAt: text(artwork.updated_at),
    provenance: {
      provider: "cle",
      status: "live",
      fetchedAt,
      upstreamId: `cle:${artwork.id}`,
      attribution: ATTRIBUTION,
      termsUrl: TERMS,
      ...(latencyMs === undefined ? {} : { latencyMs }),
    },
  };
}

/**
 * Read one record.
 *
 * Two forms are accepted, and the distinction matters. The numeric form is the
 * institution's own internal id and resolves through the singular endpoint, which
 * is what every search result carries, so an identifier handed out by this
 * adapter always reads back. The dotted form is an accession number, which is
 * friendlier to type and resolves through the filtered collection endpoint.
 */
export async function fetchCleArtwork(identifier: string): Promise<CleArtwork | null> {
  const fields = new URLSearchParams({ fields: FIELDS });

  if (/^\d{1,12}$/.test(identifier)) {
    const direct = await fetchJson<CleArtworkResponse>(
      `${SINGLE}/${encodeURIComponent(identifier)}?${fields}`,
      { provider: "cle", timeoutMs: 7000 },
    );
    if (direct.data) return direct.data;
  }

  const byAccession = await fetchJson<CleSearchResponse>(
    `${BASE}?accession_number=${encodeURIComponent(identifier)}&limit=1&${fields}`,
    { provider: "cle", timeoutMs: 7000 },
  );
  return byAccession.data?.[0] ?? null;
}

export async function searchCle(query: string, limit: number): Promise<{
  works: Work[];
  total: number;
  provenance: Provenance;
}> {
  const fetchedAt = nowIso();
  const startedAt = Date.now();
  const params = new URLSearchParams({ fields: FIELDS, limit: String(Math.min(limit, 100)) });
  if (query.trim().length > 0) params.set("q", query.trim().slice(0, 80));

  const response = await fetchJson<CleSearchResponse>(`${BASE}?${params}`, {
    provider: "cle",
    timeoutMs: 7000,
    revalidate: 900,
  });

  const artworks = (response.data ?? []).filter((artwork) => Boolean(artwork?.images?.web?.url));
  const latencyMs = Date.now() - startedAt;

  return {
    works: artworks.map((artwork) => normalizeCleArtwork(artwork, fetchedAt, latencyMs)),
    total: response.info?.total ?? artworks.length,
    provenance: {
      provider: "cle",
      status: "live",
      fetchedAt,
      upstreamId: `cle:search:${encodeURIComponent(query.trim().slice(0, 40))}`,
      attribution: ATTRIBUTION,
      termsUrl: TERMS,
      latencyMs,
    },
  };
}