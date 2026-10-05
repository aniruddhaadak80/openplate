import type { NextRequest } from "next/server";
import { handle, jsonError, jsonOk, NO_STORE, readJsonBody } from "@/lib/api-helpers";
import { getPlateView, retirePlate, updatePlate } from "@/lib/service";
import { getOwnerId } from "@/lib/session";
import { isPlateId, parsePlatePatch } from "@/lib/validation";
import { checkRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: Context) {
  return handle(async () => {
    const { id } = await context.params;
    if (!isPlateId(id)) return jsonError(400, "bad_identifier", "That plate identifier is malformed.");

    const ownerId = await getOwnerId();
    const view = await getPlateView(ownerId, id);
    return jsonOk(view, NO_STORE);
  });
}

/**
 * Change the intended use, the jurisdiction, the reach or the note.
 *
 * The response is the whole recomputed view rather than a bare row, because the
 * point of changing any of those four inputs is to watch the verdict move.
 */
export async function PATCH(request: NextRequest, context: Context) {
  return handle(async () => {
    const gate = checkRateLimit(
      `plate-update:${request.headers.get("x-forwarded-for") ?? "local"}`,
      WRITE_LIMIT,
    );
    if (!gate.allowed) {
      return jsonError(429, "rate_limited", "You are changing plates too quickly. Try again shortly.");
    }

    const { id } = await context.params;
    if (!isPlateId(id)) return jsonError(400, "bad_identifier", "That plate identifier is malformed.");

    const ownerId = await getOwnerId();
    const patch = parsePlatePatch(await readJsonBody(request));
    const view = await updatePlate(ownerId, id, patch);
    return jsonOk(view, NO_STORE);
  });
}

/**
 * Retire the plate. It is a tombstone, not a delete: the row, its snapshot, its
 * decision and its chain all survive so a shared docket still verifies. The read
 * endpoints stop returning it, and the share route reports it as gone.
 */
export async function DELETE(request: NextRequest, context: Context) {
  return handle(async () => {
    const gate = checkRateLimit(
      `plate-retire:${request.headers.get("x-forwarded-for") ?? "local"}`,
      WRITE_LIMIT,
    );
    if (!gate.allowed) {
      return jsonError(429, "rate_limited", "You are retiring plates too quickly. Try again shortly.");
    }

    const { id } = await context.params;
    if (!isPlateId(id)) return jsonError(400, "bad_identifier", "That plate identifier is malformed.");

    const ownerId = await getOwnerId();
    const view = await retirePlate(ownerId, id);
    return jsonOk(
      {
        plate: view.plate,
        retired: true,
        chain: view.verification,
        note: "Retired as a tombstone: the record and its chain are retained so a shared docket still verifies.",
      },
      NO_STORE,
    );
  });
}
