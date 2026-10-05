import type { NextRequest } from "next/server";
import { handle, jsonOk, shortCache } from "@/lib/api-helpers";
import { searchWorks } from "@/lib/sources";
import { parseBoundedInt, parseSearchQuery } from "@/lib/validation";
import { checkRateLimit, READ_LIMIT } from "@/lib/rate-limit";
import { SEALED_AT } from "@/lib/sources/fallback";

/**
 * Live collection search across both institutions.
 *
 * The response always says whether it is live or degraded, per provider, with the
 * time it was fetched. A caller can therefore never mistake the sealed sample for
 * a current answer, and a provider that failed is named rather than hidden.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = request.nextUrl.searchParams;
    const query = parseSearchQuery(params.get("q"));
    const limit = parseBoundedInt(params.get("limit"), 12, 1, 24);

    const gate = checkRateLimit(`works:${request.headers.get("x-forwarded-for") ?? "local"}`, READ_LIMIT);
    if (!gate.allowed) {
      return jsonOk(
        { error: { code: "rate_limited", message: "Too many searches. Try again shortly." } },
        { status: 429, headers: { "retry-after": String(gate.retryAfterSeconds) } },
      );
    }

    const outcome = await searchWorks(query, { limit });

    return jsonOk(
      {
        query: outcome.query,
        total: outcome.total,
        degraded: outcome.degraded,
        degradedReason: outcome.degraded
          ? `Both institutions were unreachable, so these are sealed sample records taken on ${SEALED_AT}.`
          : null,
        provenance: outcome.provenance,
        works: outcome.works,
      },
      shortCache(300),
    );
  });
}
