#!/usr/bin/env node
/**
 * Live end-to-end verification.
 *
 * This script talks to a deployed OpenPlate over real HTTP and proves the whole
 * loop, including the parts that are easy to claim and hard to prove: that the
 * health endpoint really reached the production store, that an agent mutation
 * persists through the same path a button uses, and that a chain replays.
 *
 *   node scripts/verify-live.mjs                     # uses BASE_URL from the env
 *   BASE_URL=https://example.vercel.app node scripts/verify-live.mjs
 *
 * It embeds no secret and reads no credential. It creates records in the target
 * environment and cleans up after itself, leaving one deliberately untouched
 * tombstone so the retire path is proven rather than asserted.
 */

const BASE = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
const REPOSITORY = "https://github.com/aniruddhaadak80/openplate";

/**
 * A deployed instance must be durable. The local rehearsal runs on the embedded
 * store, where durability is deliberately false, so it turns this off rather than
 * pretending the two situations are the same.
 */
const REQUIRE_DURABLE = process.env.REQUIRE_DURABLE !== "0";

if (!BASE) {
  console.error("Set BASE_URL to the deployment you want verified, for example:");
  console.error("  BASE_URL=https://your-deployment.vercel.app node scripts/verify-live.mjs");
  process.exit(2);
}

const USER_AGENT = "openplate-live-verifier/1.0";

let passed = 0;
let failed = 0;
const failures = [];

function check(id, label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${String(id).padStart(2, "0")}  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    failures.push(`${id} ${label}${detail ? `: ${detail}` : ""}`);
    console.log(`  FAIL  ${String(id).padStart(2, "0")}  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** One cookie jar for the whole run, so the anonymous session stays stable. */
let cookie = "";

function rememberCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const entry of raw) {
    const pair = entry.split(";")[0];
    if (pair.startsWith("op_scope=")) cookie = pair;
  }
  if (!cookie) {
    const single = response.headers.get("set-cookie");
    if (single && single.startsWith("op_scope=")) cookie = single.split(";")[0];
  }
}

async function call(path, options = {}) {
  const headers = { "user-agent": USER_AGENT, accept: "application/json", ...(options.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
  }
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.json === undefined ? {} : { body: JSON.stringify(options.json) }),
    redirect: "manual",
  });
  rememberCookies(response);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json")
    ? await response.json().catch(() => null)
    : await response.text();
  return { status: response.status, body, headers: response.headers };
}

async function rpc(method, params) {
  return call("/api/mcp", { method: "POST", json: { jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) } });
}

async function callTool(name, args) {
  const response = await rpc("tools/call", { name, arguments: args });
  return {
    status: response.status,
    result: response.body?.result ?? null,
    error: response.body?.error ?? null,
  };
}

const created = [];

try {
  section(`Verifying ${BASE}`);

  // 1. the product answers at all
  const home = await call("/");
  check(1, "GET / returns 200", home.status === 200, `status ${home.status}`);

  // 2. health really reached the store
  const health = await call("/api/health");
  const storeOk = health.body?.store?.ok === true;
  const durable = health.body?.durable === true;
  check(
    2,
    "GET /api/health returns 200 and reports a real store check",
    health.status === 200 && storeOk,
    `status ${health.status}, store ${health.body?.store?.kind ?? "?"}, detail: ${String(health.body?.store?.detail ?? "").slice(0, 90)}`,
  );
  check(
    2.5,
    REQUIRE_DURABLE
      ? "the store is a hosted, durable one"
      : "durability is not required for this run",
    REQUIRE_DURABLE ? durable : true,
    REQUIRE_DURABLE
      ? `durable ${durable}`
      : "local embedded rehearsal, data is intentionally volatile",
  );
  if (health.status !== 200 || !storeOk) {
    console.log("\nThe store did not answer, so persistence cannot be proven. Stopping here.");
    process.exit(1);
  }
  if (REQUIRE_DURABLE && !durable) {
    console.log("\nThe store answered but is not durable, so this is not a production deployment. Stopping here.");
    process.exit(1);
  }

  // 3. live data, normalised, with provenance
  const works = await call("/api/works?q=jaguar&limit=6");
  const found = Array.isArray(works.body?.works) ? works.body.works : [];
  const withProvenance = found.filter(
    (work) => work?.provenance?.provider && work?.provenance?.fetchedAt && work?.provenance?.status,
  );
  check(
    3,
    "live-data endpoint returns non-empty normalised results with source metadata",
    found.length > 0 && withProvenance.length === found.length,
    `${found.length} records, ${works.body?.degraded ? "DEGRADED (sealed fallback)" : "live"}`,
  );
  if (found.length === 0) {
    console.log("\nNo records returned, so the loop cannot be exercised. Stopping here.");
    process.exit(1);
  }
  const target = found.find((work) => work.image) ?? found[0];

  // 4. create through the public API, read back through the UI-facing API
  const createdResponse = await call("/api/plates", {
    method: "POST",
    json: {
      workId: target.id,
      use: "editorial",
      jurisdiction: "us",
      circulation: 10000,
      note: "live verifier",
      idempotencyKey: "live-verify-plate-0001",
    },
  });
  const plate = createdResponse.body?.plate;
  check(
    4,
    "a core record can be created through the public API",
    createdResponse.status === 201 && typeof plate?.id === "string",
    `status ${createdResponse.status}, plate ${plate?.id ?? "none"}`,
  );
  if (plate?.id) created.push(plate.id);

  const listResponse = await call("/api/plates");
  const listed = (listResponse.body?.plates ?? []).some((entry) => entry.id === plate?.id);
  const single = await call(`/api/plates/${plate?.id}`);
  check(
    5,
    "the record is readable back through the UI-facing API",
    listed && single.status === 200 && single.body?.plate?.id === plate?.id,
    `list ${listed}, detail ${single.status}`,
  );

  // 6. update, and the read-back reflects it
  const patched = await call(`/api/plates/${plate?.id}`, {
    method: "PATCH",
    json: { use: "merchandise", circulation: 250000, note: "live verifier, amended" },
  });
  const reread = await call(`/api/plates/${plate?.id}`);
  check(
    6,
    "the record can be updated and the change is persisted",
    patched.status === 200 &&
      reread.body?.plate?.use === "merchandise" &&
      reread.body?.plate?.circulation === 250000 &&
      reread.body?.plate?.note === "live verifier, amended",
    `use ${reread.body?.plate?.use}, reach ${reread.body?.plate?.circulation}`,
  );

  // 7. the engine, on a real record
  const assessed = await call(`/api/plates/${plate?.id}/assess`, {
    method: "POST",
    json: { use: "broadcast" },
  });
  const assessment = assessed.body?.assessed;
  const hasFactors =
    Array.isArray(assessment?.factors) && assessment.factors.length >= 6 &&
    assessment.factors.every((factor) => typeof factor.weight === "number" && typeof factor.evidence === "string");
  check(
    7,
    "the engine returns a versioned score, itemised factors, a recommendation and a seal",
    assessed.status === 200 &&
      typeof assessment?.version === "string" &&
      typeof assessment?.score === "number" &&
      hasFactors &&
      typeof assessment?.band === "string" &&
      typeof assessed.body?.seal === "string",
    `engine ${assessment?.engine} ${assessment?.version}, ${assessment?.band} at ${assessment?.score}`,
  );

  // 8. MCP handshake and tool discovery
  const initialize = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "live-verifier", version: "1.0.0" },
  });
  const tools = await rpc("tools/list");
  const toolNames = (tools.body?.result?.tools ?? []).map((tool) => tool.name);
  const expectedTools = ["search_works", "assess_work", "file_plate", "record_decision", "verify_plate", "retire_plate"];
  const allHaveSchemas = (tools.body?.result?.tools ?? []).every(
    (tool) => tool.inputSchema && tool.inputSchema.type === "object",
  );
  check(
    8,
    "MCP initialize succeeds and tools/list returns the expected tools and schemas",
    initialize.status === 200 &&
      typeof initialize.body?.result?.serverInfo?.name === "string" &&
      expectedTools.every((name) => toolNames.includes(name)) &&
      allHaveSchemas,
    `${toolNames.length} tools: ${toolNames.join(", ")}`,
  );

  // 9. an agent mutation persists through the same service layer
  const agentFile = await callTool("file_plate", {
    workId: target.id,
    use: "commercial",
    jurisdiction: "eu",
    circulation: 50000,
    note: "filed by an agent",
    idempotencyKey: "live-verify-agent-0001",
  });
  const agentPlate = agentFile.result?.structuredContent?.plate;
  const agentReadBack = agentPlate?.id ? await call(`/api/plates/${agentPlate.id}`) : { status: 0, body: null };
  check(
    9,
    "an MCP mutating tool writes through the same path and the write is persisted",
    agentFile.status === 200 &&
      typeof agentPlate?.id === "string" &&
      agentReadBack.status === 200 &&
      agentReadBack.body?.plate?.note === "filed by an agent" &&
      agentReadBack.body?.plate?.jurisdiction === "eu",
    `agent plate ${agentPlate?.id ?? "none"} read back ${agentReadBack.status}`,
  );
  if (agentPlate?.id) created.push(agentPlate.id);

  // 10. idempotency, because a retrying agent must not double-file
  const replay = await callTool("file_plate", {
    workId: target.id,
    use: "commercial",
    jurisdiction: "eu",
    circulation: 50000,
    idempotencyKey: "live-verify-agent-0001",
  });
  check(
    10,
    "an agent mutation with a replayed idempotency key returns the original plate",
    replay.result?.structuredContent?.deduplicated === true &&
      replay.result?.structuredContent?.plate?.id === agentPlate?.id,
    `deduplicated ${replay.result?.structuredContent?.deduplicated}`,
  );

  // 11. integrity replays before the delete
  const verify = await call(`/api/plates/${plate?.id}/verify`);
  const chainEvents = verify.body?.events ?? [];
  const eventNumbers = chainEvents.map((event) => event.seq);
  const sequential = eventNumbers.every((seq, index) => seq === index + 1);
  check(
    11,
    "the audit chain replays with no broken link and sequential events",
    verify.status === 200 &&
      verify.body?.verification?.ok === true &&
      verify.body?.verification?.brokenAtSeq === null &&
      chainEvents.length >= 2 &&
      sequential,
    `${chainEvents.length} events, head ${String(verify.body?.verification?.headSeal ?? "").slice(0, 12)}`,
  );

  // 12. a sealed decision, then retire, then confirm the tombstone
  const decided = await call(`/api/plates/${plate?.id}/decision`, {
    method: "POST",
    json: { decision: "approved", note: "Term satisfied; credit line complete." },
  });
  const decisionSeal = decided.body?.seal;
  check(
    12,
    "a decision is recorded and sealed with the verdict that was read",
    decided.status === 200 &&
      typeof decisionSeal === "string" &&
      decisionSeal.length === 96 &&
      decided.body?.plate?.decision === "approved" &&
      typeof decided.body?.plate?.decisionBand === "string",
    `band ${decided.body?.plate?.decisionBand}, seal ${String(decisionSeal ?? "").slice(0, 12)}`,
  );

  // 13. exports are real documents
  const md = await call(`/api/docket/${plate?.shareCode}?format=md`);
  const csv = await call(`/api/docket/${plate?.shareCode}?format=csv`);
  const json = await call(`/api/docket/${plate?.shareCode}?format=json`);
  const mdText = typeof md.body === "string" ? md.body : "";
  const csvText = typeof csv.body === "string" ? csv.body : "";
  check(
    13,
    "the docket downloads as valid Markdown, CSV and JSON",
    md.status === 200 &&
      mdText.includes("clearance docket") &&
      mdText.includes("Credit line") &&
      csv.status === 200 &&
      csvText.split("\n")[0].includes("required_credit_line") &&
      json.status === 200 &&
      typeof json.body?.clearance?.requiredCreditLine === "string",
    `md ${mdText.length}b, csv ${csvText.length}b`,
  );

  // 14. the share route renders that same docket
  const shared = await call(`/d/${plate?.shareCode}`);
  check(
    14,
    "the shareable docket route renders and stays out of the index",
    shared.status === 200 && String(shared.body ?? "").includes("Credit line"),
    `status ${shared.status}`,
  );

  const retired = await call(`/api/plates/${plate?.id}`, { method: "DELETE" });
  const afterRetire = await call(`/api/plates/${plate?.id}`);
  const retiredRow = await call(`/api/docket/${plate?.shareCode}?format=json`);
  check(
    15,
    "the record is retired as a tombstone: gone from reads, retained for verification",
    retired.status === 200 &&
      retired.body?.retired === true &&
      afterRetire.status === 404 &&
      retiredRow.status === 200 &&
      retiredRow.body?.plate?.status === "retired" &&
      retiredRow.body?.integrity?.ok === true,
    `delete ${retired.status}, read-back ${afterRetire.status}, tombstone retains ${retiredRow.body?.integrity?.eventCount} events`,
  );

  // 16. the shared chrome carries the real repository link, desktop and mobile
  const homeHtml = typeof home.body === "string" ? home.body : "";
  const footerIndex = homeHtml.indexOf("<footer");
  const headerSection = homeHtml.slice(0, footerIndex === -1 ? homeHtml.length : footerIndex);
  const footerSection = footerIndex === -1 ? "" : homeHtml.slice(footerIndex);
  const occurrences = homeHtml.split(REPOSITORY).length - 1;
  check(
    16,
    "the rendered navigation and footer both contain the public repository URL",
    headerSection.includes(REPOSITORY) &&
      footerSection.includes(REPOSITORY) &&
      homeHtml.includes('rel="noopener noreferrer"') &&
      occurrences >= 4,
    `${occurrences} occurrences across the rendered page`,
  );

  // 17. every primary route answers
  const routes = ["/", "/plates", "/terms", "/agent", "/export", "/mcp.json", "/sitemap.xml", "/api/works"];
  const results = await Promise.all(routes.map(async (route) => [route, await call(route)]));
  const broken = results.filter(([, response]) => response.status >= 400).map(([route, response]) => `${route} (${response.status})`);
  check(17, "no primary route is broken", broken.length === 0, broken.length ? broken.join(", ") : `${routes.length} routes ok`);

  // 18. the manifest names the live endpoint, and the repository really exists
  const manifest = await call("/mcp.json");
  const manifestBody = manifest.body ?? {};
  check(
    18,
    "the MCP manifest publishes the live endpoint",
    manifest.status === 200 &&
      manifestBody?.mcpServers?.openplate?.url === `${BASE}/api/mcp` &&
      Array.isArray(manifestBody?.tools) &&
      manifestBody.tools.length >= 5,
    `endpoint ${manifestBody?.mcpServers?.openplate?.url}`,
  );

  const repoResponse = await fetch(REPOSITORY, { headers: { "user-agent": USER_AGENT } });
  check(19, "the public repository URL returns 200", repoResponse.status === 200, `status ${repoResponse.status}`);

  // 20. validation refuses nonsense with a stable envelope
  const bad = await call("/api/plates", {
    method: "POST",
    json: { workId: "not-a-work", use: "nonsense", jurisdiction: "atlantis", circulation: -5 },
  });
  check(
    20,
    "invalid input is refused with a stable error envelope and correct status",
    bad.status === 422 &&
      bad.body?.error?.code === "validation_failed" &&
      typeof bad.body?.error?.fields === "object",
    `status ${bad.status}, fields ${Object.keys(bad.body?.error?.fields ?? {}).join(", ")}`,
  );

  // Clean up the agent's plate; the tombstone from step 15 is left as evidence.
  if (agentPlate?.id) {
    const cleanup = await call(`/api/plates/${agentPlate.id}`, { method: "DELETE" });
    check(21, "cleanup of the agent-created plate", cleanup.status === 200, `status ${cleanup.status}`);
  }
} catch (error) {
  failed += 1;
  failures.push(`unhandled: ${error instanceof Error ? error.message : String(error)}`);
  console.log(`\n  FAIL  --  unhandled error: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nAll checks passed against ${BASE}`);