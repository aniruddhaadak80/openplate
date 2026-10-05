import type { NextRequest } from "next/server";
import { handle, jsonError, jsonOk, NO_STORE, readJsonBody } from "@/lib/api-helpers";
import { getRepository } from "@/lib/db";
import { filePlate, verifyPlate } from "@/lib/service";
import { getOwnerId } from "@/lib/session";
import {
  isJurisdiction,
  isPlateStatus,
  isUseKind,
  parseBoundedInt,
  parseCreatePlate,
} from "@/lib/validation";
import { checkRateLimit, WRITE_LIMIT } from "@/lib/rate-limit";
import type { Jurisdiction, PlateStatus, UseKind } from "@/lib/types";

/** The docket: everything this anonymous visitor has filed. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = request.nextUrl.searchParams;
    const ownerId = await getOwnerId();
    const repository = await getRepository();

    const limit = parseBoundedInt(params.get("limit"), 24, 1, 100);
    const offset = parseBoundedInt(params.get("offset"), 0, 0, 10_000);
    const search = params.get("search")?.trim().slice(0, 80) ?? "";

    const useParam = params.get("use");
    const jurisdictionParam = params.get("jurisdiction");
    const statusParam = params.get("status");

    const plates = await repository.listPlates(ownerId, {
      limit,
      offset,
      ...(isUseKind(useParam) ? { use: useParam as UseKind } : {}),
      ...(isJurisdiction(jurisdictionParam) ? { jurisdiction: jurisdictionParam as Jurisdiction } : {}),
      ...(isPlateStatus(statusParam) ? { status: statusParam as PlateStatus } : {}),
      ...(search.length > 0 ? { search } : {}),
      includeDeleted: params.get("includeDeleted") === "true",
    });

    // One extra read per plate rather than N queries: the chain head is needed for
    // the docket list, and verifyPlate is a single indexed select each.
    const verified = await Promise.all(plates.map((plate) => verifyPlate(plate.id)));
    const verificationById = new Map(verified.map((entry) => [entry.entityId, entry]));

    const total = await repository.countPlates(ownerId);
    return jsonOk(
      {
        total,
        limit,
        offset,
        plates: plates.map((plate) => ({
          ...plate,
          chain: verificationById.get(plate.id) ?? null,
        })),
      },
      NO_STORE,
    );
  });
}

/** File a plate: pin a real work to an intended use. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const gate = checkRateLimit(
      `plate-create:${request.headers.get("x-forwarded-for") ?? "local"}`,
      WRITE_LIMIT,
    );
    if (!gate.allowed) {
      return jsonError(429, "rate_limited", "You are filing plates too quickly. Try again shortly.");
    }

    const ownerId = await getOwnerId();
    const input = parseCreatePlate(await readJsonBody(request));
    const result = await filePlate(ownerId, input);

    return jsonOk(
      {
        plate: result.plate,
        assessment: result.assessment,
        chain: result.verification,
        deduplicated: result.deduplicated,
        shareUrl: `/d/${result.plate.shareCode}`,
      },
      { status: result.deduplicated ? 200 : 201, ...NO_STORE },
    );
  });
}
