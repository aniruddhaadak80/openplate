import type { NextRequest } from "next/server";
import { getOwnerId } from "@/lib/session";
import { searchWorks } from "@/lib/sources";
import { assessClearance, BAND_LABELS, ENGINE_NAME, ENGINE_VERSION } from "@/lib/engine/clearance";
import { filePlate, getPlateView, recordDecision, retirePlate } from "@/lib/service";
import { readSealedWork } from "@/lib/sources";
import { getRepository } from "@/lib/db";
import { USE_RULES, TERM_RULES, DISCLAIMER } from "@/lib/terms";
import { SITE } from "@/lib/config";
import { checkRateLimit, READ_LIMIT, WRITE_LIMIT } from "@/lib/rate-limit";
import { describeFailure, MAX_BODY_BYTES } from "@/lib/api-helpers";
import type { Jurisdiction, UseKind } from "@/lib/types";

/**
 * An MCP-style JSON-RPC 2.0 endpoint.
 *
 * Implements initialize, tools/list and tools/call over a single POST, plus
 * notifications, with the standard JSON-RPC error objects and the tool result
 * shape MCP clients expect (content blocks plus structuredContent).
 *
 * The important property is structural rather than cosmetic: the mutating tools
 * call the same service functions the browser calls, so an agent that files a
 * plate produces a row, an audit event and a seal identical to one a person
 * would have produced, and it is scoped to the caller's own anonymous session.
 */

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: SITE.packageName, title: SITE.name, version: "1.0.0" };

const USE_ENUM = USE_RULES.map((rule) => rule.id);
const JURISDICTION_ENUM = TERM_RULES.map((rule) => rule.id);

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: "search_works",
    title: "Search both museum collections",
    description:
      "Read tool. Search The Met and the Cleveland Museum of Art Open Access collections for artworks, returning normalised records with each institution's own rights claim, the creator's life dates, the rights statement and an attribution line. Reports live versus sealed-fallback status per provider.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text, for example 'jaguar' or 'still life'. Omit for highlights." },
        limit: { type: "integer", minimum: 1, maximum: 24, default: 8 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "assess_work",
    title: "Score a work for an intended use",
    description:
      "Analysis tool. Runs the deterministic clearance engine against a museum record without saving anything. Returns a versioned score, itemised factors with weights and evidence, the copyright-term arithmetic, any reproduction restrictions found in the institution's own statement, the required credit line and a content digest.",
    inputSchema: {
      type: "object",
      properties: {
        workId: { type: "string", description: "A work identifier such as 'met:11298' or 'cle:1958.39'." },
        use: { type: "string", enum: USE_ENUM, default: "editorial" },
        jurisdiction: { type: "string", enum: JURISDICTION_ENUM, default: "us" },
        circulation: { type: "integer", minimum: 1, maximum: 50_000_000, default: 10_000 },
      },
      required: ["workId"],
      additionalProperties: false,
    },
  },
  {
    name: "file_plate",
    title: "Pin a work to an intended use",
    description:
      "Mutating tool. Re-reads the work live from the institution, stores a snapshot, runs the engine and writes the genesis audit event with its SHA-384 seal. Honours idempotencyKey so a retried call returns the plate it already created instead of filing a duplicate.",
    inputSchema: {
      type: "object",
      properties: {
        workId: { type: "string", description: "A work identifier such as 'met:11298'." },
        use: { type: "string", enum: USE_ENUM, default: "editorial" },
        jurisdiction: { type: "string", enum: JURISDICTION_ENUM, default: "us" },
        circulation: { type: "integer", minimum: 1, maximum: 50_000_000, default: 10_000 },
        note: { type: "string", maxLength: 2000 },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 120 },
      },
      required: ["workId"],
      additionalProperties: false,
    },
  },
  {
    name: "record_decision",
    title: "Record a sealed decision on a plate",
    description:
      "Mutating tool. Writes the decision together with the band, score and seal of the verdict that was read, appending to the same hash chain the UI writes to.",
    inputSchema: {
      type: "object",
      properties: {
        plateId: { type: "string", description: "The plate id returned by file_plate." },
        decision: { type: "string", enum: ["approved", "conditional", "rejected"] },
        note: { type: "string", maxLength: 2000 },
      },
      required: ["plateId", "decision"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_plate",
    title: "Replay a plate's audit chain",
    description:
      "Read tool. Recomputes every seal from genesis and reports the first broken link, if any, with the algorithm and the event list.",
    inputSchema: {
      type: "object",
      properties: { plateId: { type: "string" } },
      required: ["plateId"],
      additionalProperties: false,
    },
  },
  {
    name: "retire_plate",
    title: "Retire a plate as a tombstone",
    description:
      "Mutating tool. Marks the plate retired. The row, its snapshot, its decision and its chain are retained so a docket that was already shared still verifies.",
    inputSchema: {
      type: "object",
      properties: { plateId: { type: "string" } },
      required: ["plateId"],
      additionalProperties: false,
    },
  },
] as const;

type ToolName = (typeof TOOLS)[number]["name"];

function jsonRpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id, error: data === undefined ? { code, message } : { code, message, data } };
}

/** MCP tool results carry content blocks; structuredContent carries the payload. */
function toolResult(payload: unknown, summary: string) {
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: payload as Record<string, unknown>,
  };
}

function toolFailure(summary: string) {
  return { content: [{ type: "text" as const, text: summary }], isError: true };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function asCount(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50_000_000) return fallback;
  return Math.round(parsed);
}

async function callTool(name: string, args: Record<string, unknown>, ownerId: string) {
  switch (name as ToolName) {
    case "search_works": {
      const query = asString(args.query).slice(0, 80);
      const limit = Math.min(Math.max(asCount(args.limit, 8), 1), 24);
      const outcome = await searchWorks(query, { limit });
      return toolResult(
        {
          query: outcome.query,
          total: outcome.total,
          degraded: outcome.degraded,
          provenance: outcome.provenance,
          works: outcome.works,
        },
        `${outcome.works.length} record(s) from ${outcome.provenance.map((entry) => entry.provider).join(" and ")}${outcome.degraded ? " (sealed fallback: both institutions unreachable)" : ""}.`,
      );
    }

    case "assess_work": {
      const workId = asString(args.workId);
      if (!/^(met:[0-9]{1,12}|cle:[A-Za-z0-9._-]{1,32})$/.test(workId)) {
        return toolFailure("workId must look like 'met:11298' or 'cle:1958.39'.");
      }
      // Assessment works from a live read, falling back to the sealed record so a
      // verdict is still reachable when the institution is down.
      const { readWork } = await import("@/lib/sources");
      const live = await readWork(workId).catch(() => null);
      const work = live ?? readSealedWork(workId);
      if (!work) return toolFailure(`No record found for ${workId}.`);

      const assessment = assessClearance({
        work,
        use: asEnum<UseKind>(args.use, USE_ENUM, "editorial"),
        jurisdiction: asEnum<Jurisdiction>(args.jurisdiction, JURISDICTION_ENUM, "us"),
        circulation: asCount(args.circulation, 10_000),
        asOfYear: new Date().getUTCFullYear(),
      });
      return toolResult(
        { work, assessment },
        `${BAND_LABELS[assessment.band]} at ${assessment.score}/100 (confidence ${assessment.confidence}) for ${work.title}. ${assessment.termArithmetic.note}`,
      );
    }

    case "file_plate": {
      const workId = asString(args.workId);
      if (!/^(met:[0-9]{1,12}|cle:[A-Za-z0-9._-]{1,32})$/.test(workId)) {
        return toolFailure("workId must look like 'met:11298' or 'cle:1958.39'.");
      }
      const idempotencyKey = asString(args.idempotencyKey).trim() || null;
      const result = await filePlate(ownerId, {
        workId,
        use: asEnum<UseKind>(args.use, USE_ENUM, "editorial"),
        jurisdiction: asEnum<Jurisdiction>(args.jurisdiction, JURISDICTION_ENUM, "us"),
        circulation: asCount(args.circulation, 10_000),
        note: asString(args.note).slice(0, 2000),
        idempotencyKey,
      });
      return toolResult(
        {
          plate: result.plate,
          assessment: result.assessment,
          chain: result.verification,
          deduplicated: result.deduplicated,
          shareUrl: `/d/${result.plate.shareCode}`,
        },
        `${result.deduplicated ? "Idempotent replay returned the existing plate" : "Filed"} ${result.plate.id} for ${result.plate.title}. Verdict ${BAND_LABELS[result.assessment.band]}. Seal ${result.plate.seal}.`,
      );
    }

    case "record_decision": {
      const plateId = asString(args.plateId);
      const decision = asString(args.decision);
      if (decision !== "approved" && decision !== "conditional" && decision !== "rejected") {
        return toolFailure("decision must be approved, conditional or rejected.");
      }
      const view = await recordDecision(ownerId, plateId, decision, asString(args.note).slice(0, 2000));
      return toolResult(
        { plate: view.plate, chain: view.verification, seal: view.plate.decisionSeal },
        `Recorded ${decision} on ${plateId}. Decision seal ${view.plate.decisionSeal}.`,
      );
    }

    case "verify_plate": {
      const plateId = asString(args.plateId);
      const view = await getPlateView(ownerId, plateId, { includeDeleted: true, corroborate: false });
      return toolResult(
        {
          verification: view.verification,
          algorithm: "seal_n = SHA-384(UTF-8(prevSeal) || canonicalJson(event_n))",
          events: view.events.map((event) => ({ seq: event.seq, type: event.eventType, seal: event.seal })),
        },
        view.verification.ok
          ? `Chain intact across ${view.verification.eventCount} event(s). Head ${view.verification.headSeal}.`
          : `Chain broken at event ${view.verification.brokenAtSeq}: ${view.verification.reason}`,
      );
    }

    case "retire_plate": {
      const plateId = asString(args.plateId);
      const view = await retirePlate(ownerId, plateId);
      return toolResult(
        { plate: view.plate, chain: view.verification },
        `Retired ${plateId}. The row and its chain are retained as a tombstone; head ${view.verification.headSeal}.`,
      );
    }

    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return Response.json(jsonRpcError(null, -32600, "Request too large."), { status: 413 });
    }
    raw = JSON.parse(text) as unknown;
  } catch {
    return Response.json(jsonRpcError(null, -32700, "Parse error: the body was not valid JSON."), { status: 400 });
  }

  const gate = checkRateLimit(`mcp:${request.headers.get("x-forwarded-for") ?? "local"}`, READ_LIMIT);
  if (!gate.allowed) {
    return Response.json(jsonRpcError(null, -32000, "Rate limited."), {
      status: 429,
      headers: { "retry-after": String(gate.retryAfterSeconds) },
    });
  }

  const ownerId = await getOwnerId();
  const batch = Array.isArray(raw);
  const requests = (batch ? raw : [raw]) as JsonRpcRequest[];

  if (requests.length === 0) {
    return Response.json(jsonRpcError(null, -32600, "Invalid Request: empty batch."), { status: 400 });
  }

  const responses: unknown[] = [];
  for (const entry of requests) {
    const id = entry?.id ?? null;
    const method = entry?.method;

    if (!entry || entry.jsonrpc !== "2.0" || typeof method !== "string") {
      responses.push(jsonRpcError(id, -32600, "Invalid Request: jsonrpc must be \"2.0\" and method must be a string."));
      continue;
    }

    switch (method) {
      case "initialize":
        responses.push(
          jsonRpcResult(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: `${SITE.name} is a rights clearance desk for images. Search a museum record, assess it for an intended use, file a plate and record a decision. ${DISCLAIMER}`,
          }),
        );
        break;

      case "notifications/initialized":
      case "initialized":
      case "notifications/cancelled":
        break;

      case "ping":
        responses.push(jsonRpcResult(id, {}));
        break;

      case "tools/list":
        responses.push(jsonRpcResult(id, { tools: TOOLS }));
        break;

      case "tools/call": {
        const params = entry.params ?? {};
        const name = typeof params.name === "string" ? params.name : "";
        const args = (typeof params.arguments === "object" && params.arguments !== null
          ? params.arguments
          : {}) as Record<string, unknown>;

        const known = TOOLS.some((tool) => tool.name === name);
        if (!known) {
          responses.push(jsonRpcError(id, -32602, `Unknown tool: ${name || "(none given)"}`));
          break;
        }
        if (["file_plate", "record_decision", "retire_plate"].includes(name)) {
          const writeGate = checkRateLimit(`mcp-write:${ownerId}`, WRITE_LIMIT);
          if (!writeGate.allowed) {
            responses.push(
              jsonRpcResult(id, toolFailure("Rate limited: too many mutations in the last minute.")),
            );
            break;
          }
        }

        try {
          const result = await callTool(name, args, ownerId);
          if (result === null) {
            responses.push(jsonRpcError(id, -32602, `Unknown tool: ${name}`));
          } else {
            responses.push(jsonRpcResult(id, result));
          }
        } catch (error) {
          // A tool that fails is a result with isError, which is what lets an
          // agent read the problem and try something else, rather than a transport
          // error that tells it nothing.
          const failure = describeFailure(error);
          responses.push(
            jsonRpcResult(
              id,
              toolFailure(`${failure.code}: ${failure.message}${failure.fields ? ` ${JSON.stringify(failure.fields)}` : ""}`),
            ),
          );
        }
        break;
      }

      default:
        responses.push(jsonRpcError(id, -32601, `Method not found: ${method}`));
    }
  }

  if (batch) {
    // A batch of nothing but notifications has nothing to answer with.
    if (responses.length === 0) return new Response(null, { status: 202 });
    return Response.json(responses, { headers: { "cache-control": "no-store" } });
  }
  if (responses.length === 0) {
    return new Response(null, { status: 202 });
  }
  return Response.json(responses[0], { headers: { "cache-control": "no-store" } });
}

/** A GET on the endpoint describes it, which is friendlier than a 405. */
export async function GET() {
  const repository = await getRepository().catch(() => null);
  return Response.json(
    {
      protocol: "jsonrpc-2.0",
      transport: "http-post",
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: SERVER_INFO,
      engine: { name: ENGINE_NAME, version: ENGINE_VERSION },
      methods: ["initialize", "tools/list", "tools/call", "ping"],
      tools: TOOLS.map((tool) => tool.name),
      persistence: repository ? { kind: repository.kind, schema: repository.schema } : null,
      hint: "POST a JSON-RPC 2.0 request to this URL.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
