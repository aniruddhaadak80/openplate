import { isDurableEnvironment } from "@/lib/db";
import { handle, jsonOk, NO_STORE } from "@/lib/api-helpers";
import { ENGINE_NAME, ENGINE_VERSION } from "@/lib/engine/clearance";
import { storeHealth } from "@/lib/service";
import { SITE } from "@/lib/config";

/**
 * Health, with teeth.
 *
 * This does not return a static success object: it opens the repository the
 * running process is actually configured to use, runs a probe and a count, and
 * reports the adapter it landed on.
 *
 * Two different questions get two different answers. `ok` asks whether the store
 * could be reached and read at all, which decides the status code. `durable`
 * asks whether what it read will still be there after a redeploy, which is the
 * claim that actually matters for "your plates survive", and is reported
 * separately so a local embedded run is never mistaken for a real deployment.
 */
export async function GET() {
  return handle(async () => {
    let store: Awaited<ReturnType<typeof storeHealth>>;
    try {
      store = await storeHealth();
    } catch {
      return jsonOk(
        {
          ok: false,
          durable: false,
          product: SITE.name,
          checkedAt: new Date().toISOString(),
          store: {
            ok: false,
            kind: process.env.DATABASE_URL ? "postgres" : "unavailable",
            schema: "unknown",
            durable: isDurableEnvironment(),
            detail: "The repository could not be opened.",
            checkedAt: new Date().toISOString(),
          },
          engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
        },
        { status: 503, ...NO_STORE },
      );
    }

    const body = {
      ok: store.ok,
      durable: store.durable,
      product: SITE.name,
      checkedAt: store.checkedAt,
      store: {
        ok: store.ok,
        kind: store.kind,
        schema: store.schema,
        durable: store.durable,
        detail: store.detail,
      },
      engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
      sources: ["met", "cle", "wikidata"],
    };

    return jsonOk(body, { status: body.ok ? 200 : 503, ...NO_STORE });
  });
}

/** Convenience for the badge in the README: does a repository exist at all. */
export async function HEAD() {
  const response = await GET();
  return new Response(null, { status: response.status });
}
