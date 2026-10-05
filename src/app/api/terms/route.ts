import type { NextRequest } from "next/server";
import { handle, jsonError, jsonOk, NO_STORE, readJsonBody } from "@/lib/api-helpers";
import { getRepository } from "@/lib/db";
import { readTermSettings, writeTermSettings } from "@/lib/service";
import { getOwnerId } from "@/lib/session";
import { parseTermSettings } from "@/lib/validation";
import { checkRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";
import { CIRCULATION_BANDS, USE_RULES } from "@/lib/terms";

/**
 * The visitor's saved clearance defaults.
 *
 * Real persisted configuration rather than a localStorage toggle: the same
 * jurisdiction and defaults the /terms screen shows are read back here, and a new
 * browser profile genuinely starts from the product defaults instead of inheriting
 * somebody else's settings.
 */
export async function GET() {
  return handle(async () => {
    const ownerId = await getOwnerId();
    const repository = await getRepository();
    const [settings, rules] = await Promise.all([
      readTermSettings(ownerId),
      repository.listJurisdictionRules(),
    ]);

    return jsonOk(
      {
        settings,
        rules,
        uses: USE_RULES,
        circulationBands: CIRCULATION_BANDS,
        persisted: settings.updatedAt !== null,
      },
      NO_STORE,
    );
  });
}

export async function PUT(request: NextRequest) {
  return handle(async () => {
    const gate = checkRateLimit(
      `terms:${request.headers.get("x-forwarded-for") ?? "local"}`,
      WRITE_LIMIT,
    );
    if (!gate.allowed) {
      return jsonError(429, "rate_limited", "You are saving settings too quickly. Try again shortly.");
    }

    const ownerId = await getOwnerId();
    const settings = parseTermSettings(await readJsonBody(request));
    const saved = await writeTermSettings(ownerId, settings);
    return jsonOk({ settings: saved }, NO_STORE);
  });
}
