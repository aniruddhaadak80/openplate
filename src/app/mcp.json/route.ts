import { mcpEndpoint, SITE, siteUrl } from "@/lib/config";
import { ENGINE_NAME, ENGINE_VERSION } from "@/lib/engine/clearance";
import { TERM_RULES, USE_RULES } from "@/lib/terms";

/**
 * The MCP manifest.
 *
 * Written by the server on every request, from the same configuration module the
 * header, the footer and the agent page read. That is deliberate: a manifest
 * checked into the repository goes stale the moment the production alias changes,
 * and an agent pointed at a dead endpoint fails silently.
 */
export async function GET() {
  const endpoint = mcpEndpoint();
  const manifest = {
    $schema: "https://modelcontextprotocol.io/schemas/2024-11-05/server.schema.json",
    name: SITE.packageName,
    displayName: SITE.name,
    description: SITE.description,
    version: "1.0.0",
    repository: { url: SITE.repositoryUrl, source: "github" },
    websiteUrl: siteUrl(),
    tools: [
      "search_works",
      "assess_work",
      "file_plate",
      "record_decision",
      "verify_plate",
      "retire_plate",
    ],
    engines: [{ name: ENGINE_NAME, version: ENGINE_VERSION }],
    mcpServers: {
      [SITE.packageName]: {
        type: "http",
        url: endpoint,
        transport: "streamable-http",
      },
    },
    endpoints: {
      mcp: endpoint,
      health: `${siteUrl()}/api/health`,
      works: `${siteUrl()}/api/works`,
      plates: `${siteUrl()}/api/plates`,
      docket: `${siteUrl()}/api/docket/{shareCode}`,
    },
    vocabularies: {
      use: USE_RULES.map((rule) => ({ id: rule.id, label: rule.label })),
      jurisdiction: TERM_RULES.map((rule) => ({
        id: rule.id,
        label: rule.label,
        lifePlusYears: rule.lifePlusYears,
      })),
    },
    attribution: {
      met: "The Metropolitan Museum of Art Collection API (Open Access)",
      cle: "The Cleveland Museum of Art Open Access API",
      wikidata: "Wikidata (CC0)",
    },
  };

  return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
}
