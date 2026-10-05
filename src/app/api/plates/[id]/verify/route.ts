import type { NextRequest } from "next/server";
import { handle, jsonError, jsonOk, NO_STORE } from "@/lib/api-helpers";
import { getPlateView } from "@/lib/service";
import { getOwnerId } from "@/lib/session";
import { isPlateId } from "@/lib/validation";
import { GENESIS_SEAL } from "@/lib/integrity/chain";

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * Replay this plate's chain and report the first broken link.
 *
 * A chain that verifies says nothing about whether the right decision was reached,
 * only that nobody has edited history since it was written. A chain that does not
 * verify names the exact sequence number where the seal stops matching, which is
 * the thing an auditor actually needs.
 */
export async function GET(_request: NextRequest, context: Context) {
  return handle(async () => {
    const { id } = await context.params;
    if (!isPlateId(id)) return jsonError(400, "bad_identifier", "That plate identifier is malformed.");

    const ownerId = await getOwnerId();
    const view = await getPlateView(ownerId, id, { includeDeleted: true });

    return jsonOk(
      {
        verification: view.verification,
        algorithm: "seal_n = SHA-384(UTF-8(prevSeal) || canonicalJson(event_n))",
        genesisSeal: GENESIS_SEAL,
        events: view.events.map((event) => ({
          seq: event.seq,
          type: event.eventType,
          at: event.createdAt,
          prevSeal: event.prevSeal,
          seal: event.seal,
        })),
      },
      NO_STORE,
    );
  });
}
