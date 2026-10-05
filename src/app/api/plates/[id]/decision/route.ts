import type { NextRequest } from "next/server";
import { handle, jsonError, jsonOk, NO_STORE, readJsonBody } from "@/lib/api-helpers";
import { recordDecision } from "@/lib/service";
import { getOwnerId } from "@/lib/session";
import { isPlateId, parseDecision } from "@/lib/validation";
import { checkRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * Record the decision, sealed.
 *
 * The band, the score and the seal of the verdict that was actually read are
 * written into the same audit event as the decision, so the docket records what
 * was concluded at the time rather than re-reporting a verdict the terms have
 * since moved away from.
 */
export async function POST(request: NextRequest, context: Context) {
  return handle(async () => {
    const gate = checkRateLimit(
      `plate-decide:${request.headers.get("x-forwarded-for") ?? "local"}`,
      WRITE_LIMIT,
    );
    if (!gate.allowed) {
      return jsonError(429, "rate_limited", "You are recording decisions too quickly. Try again shortly.");
    }

    const { id } = await context.params;
    if (!isPlateId(id)) return jsonError(400, "bad_identifier", "That plate identifier is malformed.");

    const ownerId = await getOwnerId();
    const { decision, note } = parseDecision(await readJsonBody(request));
    const view = await recordDecision(ownerId, id, decision, note);

    return jsonOk(
      {
        plate: view.plate,
        assessment: view.assessment,
        chain: view.verification,
        seal: view.plate.decisionSeal,
      },
      NO_STORE,
    );
  });
}
