import type { NextRequest } from "next/server";
import { handle, jsonError, jsonOk, NO_STORE, readJsonBody } from "@/lib/api-helpers";
import { assessPlate, getPlateView } from "@/lib/service";
import { getOwnerId } from "@/lib/session";
import { isPlateId, ValidationError } from "@/lib/validation";
import type { Jurisdiction, UseKind } from "@/lib/types";

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * Re-run the engine without saving anything.
 *
 * A publisher wants to ask "what if this were merchandise instead of editorial"
 * without committing to a change. This calls the identical engine function the
 * page and the agent tool call, so the hypothetical it returns is the real
 * arithmetic, not an approximation drawn in a component.
 */
export async function POST(request: NextRequest, context: Context) {
  return handle(async () => {
    const { id } = await context.params;
    if (!isPlateId(id)) return jsonError(400, "bad_identifier", "That plate identifier is malformed.");

    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const overrides: { use?: UseKind; jurisdiction?: Jurisdiction; circulation?: number; asOfYear?: number } = {};

    if (body.use !== undefined) {
      if (typeof body.use !== "string" || !["personal", "editorial", "educational", "commercial", "merchandise", "broadcast"].includes(body.use)) {
        throw new ValidationError({ use: "Unknown intended use." });
      }
      overrides.use = body.use as UseKind;
    }
    if (body.jurisdiction !== undefined) {
      if (typeof body.jurisdiction !== "string" || !["us", "eu", "uk", "ca", "au", "jp"].includes(body.jurisdiction)) {
        throw new ValidationError({ jurisdiction: "Unknown jurisdiction." });
      }
      overrides.jurisdiction = body.jurisdiction as Jurisdiction;
    }
    if (body.circulation !== undefined) {
      const circulation = Number(body.circulation);
      if (!Number.isFinite(circulation) || circulation < 1 || circulation > 50_000_000) {
        throw new ValidationError({ circulation: "Reach must be a number between 1 and 50,000,000." });
      }
      overrides.circulation = Math.round(circulation);
    }
    // asOfYear exists so a reader can see how the arithmetic behaves in a
    // different year. It is clamped to a plausible range and never used by the UI
    // unless explicitly asked for.
    if (body.asOfYear !== undefined) {
      const year = Number(body.asOfYear);
      if (!Number.isFinite(year) || year < 1900 || year > 2200) {
        throw new ValidationError({ asOfYear: "The year must be between 1900 and 2200." });
      }
      overrides.asOfYear = Math.round(year);
    }

    const ownerId = await getOwnerId();
    const view = await getPlateView(ownerId, id);
    const hypothetical = await assessPlate(view.plate, overrides, { corroborate: false });

    return jsonOk(
      {
        saved: { use: view.plate.use, jurisdiction: view.plate.jurisdiction, circulation: view.plate.circulation },
        assessed: hypothetical,
        committed: view.assessment,
        differsFromSaved:
          hypothetical.band !== view.assessment.band || hypothetical.score !== view.assessment.score,
        seal: view.plate.seal,
      },
      NO_STORE,
    );
  });
}

/** GET returns the committed verdict for the plate as it stands. */
export async function GET(_request: NextRequest, context: Context) {
  return handle(async () => {
    const { id } = await context.params;
    if (!isPlateId(id)) return jsonError(400, "bad_identifier", "That plate identifier is malformed.");
    const ownerId = await getOwnerId();
    const view = await getPlateView(ownerId, id);
    return jsonOk({ assessment: view.assessment, seal: view.plate.seal }, NO_STORE);
  });
}
