import type { Provenance, SearchOutcome, Work } from "../types";
import { searchCle } from "./cle";
import { fallbackWorks } from "./fallback";
import { searchMet, fetchMetObject, normalizeMetObject } from "./met";
import { fetchCleArtwork, normalizeCleArtwork } from "./cle";
import { nowIso } from "./http";

/**
 * The search and read surface the whole product depends on.
 *
 * Both institutions are asked at once and neither is allowed to fail the request:
 * if The Met times out and Cleveland answers, the page renders with one honest
 * provenance row for the failure. Only when every provider has failed does the
 * sealed sample stand in, and then `degraded` is set so the interface can say so
 * in words rather than passing stale data off as live.
 */

function filterFallback(query: string): Work[] {
  const needle = query.trim().toLowerCase();
  const works = fallbackWorks();
  if (needle.length === 0) return works;
  const matches = works.filter((work) =>
    [work.title, work.creator.name, work.culture, work.classification ?? "", work.department ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
  return matches.length > 0 ? matches : works;
}

/**
 * Round-robin the two institutions so a single page shows both. Deterministic:
 * the merge order is fixed, so two identical queries produce one identical grid.
 */
function interleave(metWorks: Work[], cleWorks: Work[]): Work[] {
  const merged: Work[] = [];
  const longer = Math.max(metWorks.length, cleWorks.length);
  for (let index = 0; index < longer; index += 1) {
    const met = metWorks[index];
    if (met) merged.push(met);
    const cle = cleWorks[index];
    if (cle) merged.push(cle);
  }
  return merged;
}

export async function searchWorks(
  query: string,
  options: { limit?: number } = {},
): Promise<SearchOutcome> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 24);
  const trimmed = query.trim().slice(0, 80);

  const [metResult, cleResult] = await Promise.allSettled([
    searchMet(trimmed, limit),
    searchCle(trimmed, limit),
  ]);

  const provenance: Provenance[] = [];
  const metWorks = metResult.status === "fulfilled" ? metResult.value.works : [];
  const cleWorks = cleResult.status === "fulfilled" ? cleResult.value.works : [];

  if (metResult.status === "fulfilled") {
    provenance.push(metResult.value.provenance);
  } else {
    provenance.push(failureProvenance("met", trimmed, metResult.reason));
  }
  if (cleResult.status === "fulfilled") {
    provenance.push(cleResult.value.provenance);
  } else {
    provenance.push(failureProvenance("cle", trimmed, cleResult.reason));
  }

  const liveWorks = interleave(metWorks, cleWorks);

  if (liveWorks.length > 0) {
    return {
      query: trimmed,
      total: Math.max(
        metResult.status === "fulfilled" ? metResult.value.total : 0,
        cleResult.status === "fulfilled" ? cleResult.value.total : 0,
      ),
      works: liveWorks.slice(0, limit),
      provenance,
      degraded: false,
    };
  }

  return {
    query: trimmed,
    total: fallbackWorks().length,
    works: filterFallback(trimmed).slice(0, limit),
    provenance,
    degraded: true,
  };
}

/**
 * A provider that failed is reported with the reason it failed.
 *
 * The message describes the upstream institution's behaviour, not our own
 * internals: no URL, no stack and no configuration ever reaches this string.
 */
function failureProvenance(provider: string, query: string, reason: unknown): Provenance {
  const detail =
    reason instanceof Error && reason.message
      ? reason.message.slice(0, 160)
      : "no reason given";
  return {
    provider,
    status: "fallback",
    fetchedAt: nowIso(),
    upstreamId: `${provider}:failed:${encodeURIComponent(query.slice(0, 40))}`,
    attribution: `${provider === "met" ? "The Metropolitan Museum of Art" : "The Cleveland Museum of Art"} did not answer: ${detail}`,
    termsUrl:
      provider === "met"
        ? "https://www.metmuseum.org/information/terms-and-conditions"
        : "https://www.clevelandart.org/open-access",
  };
}

/**
 * Read one record in full. Returns null only when the id is malformed or the
 * institution has no such record; a network failure is reported by the caller
 * through the provenance entry rather than by pretending the record is missing.
 */
export async function readWork(workId: string): Promise<Work | null> {
  const [institution, rawId] = splitWorkId(workId);
  if (institution === null || rawId === null) return null;

  const fetchedAt = nowIso();

  if (institution === "met") {
    // splitWorkId only returns a number for a well-formed Met identifier.
    const object = await fetchMetObject(rawId as number);
    return normalizeMetObject(object, fetchedAt);
  }

  const artwork = await fetchCleArtwork(String(rawId));
  if (!artwork) return null;
  return normalizeCleArtwork(artwork, fetchedAt);
}

export function splitWorkId(workId: string): ["met" | "cle" | null, number | string | null] {
  const separator = workId.indexOf(":");
  if (separator === -1) return [null, null];
  const institution = workId.slice(0, separator);
  const remainder = workId.slice(separator + 1);
  if (institution === "met") {
    const numeric = Number.parseInt(remainder, 10);
    return Number.isFinite(numeric) && String(numeric) === remainder ? ["met", numeric] : [null, null];
  }
  if (institution === "cle") {
    return remainder.length > 0 && remainder.length <= 32 ? ["cle", remainder] : [null, null];
  }
  return [null, null];
}

/** Look up a sealed record without touching the network. Used by tests. */
export function readSealedWork(workId: string): Work | null {
  return fallbackWorks().find((work) => work.id === workId) ?? null;
}