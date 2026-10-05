import Link from "next/link";
import { getRepository } from "@/lib/db";
import { getOwnerId } from "@/lib/session";
import { verifyPlate } from "@/lib/service";
import { BAND_INK, formatDate, shortSeal } from "@/lib/bands";
import { USE_RULES } from "@/lib/terms";
import { SITE, mcpEndpoint, siteUrl } from "@/lib/config";
import { AgentConsole } from "@/components/AgentConsole";
import { Notice, Panel, Slug, SlugHeading } from "@/components/primitives";

export const metadata = {
  title: "Agent tools",
  alternates: { canonical: "/agent" },
};

/**
 * The agent surface.
 *
 * A publisher's own tooling can read the collections, run the engine and file
 * plates here. The page exists so a person can watch that happen: the requests and
 * responses are on screen rather than hidden in a log.
 */
export default async function AgentPage() {
  const ownerId = await getOwnerId();
  const repository = await getRepository();
  const plates = await repository.listPlates(ownerId, { limit: 5, offset: 0, includeDeleted: false });
  const chains = await Promise.all(plates.map((plate) => verifyPlate(plate.id)));
  const latest = plates[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <SlugHeading slug="JSON-RPC 2.0 over HTTP POST">Agent tools</SlugHeading>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-bone-dim">
        Six typed tools on one endpoint: two read tools, an analysis tool that runs the same engine the page runs,
        and two mutating tools that go through the same service layer the buttons use. Mutations are idempotent when
        given a key, and every call is scoped to this browser&apos;s anonymous session.
      </p>

      <div className="mt-8">
        {/* The canonical endpoint is resolved on the server and handed down, so
            the client never has to bake a build-time host into its bundle. */}
        <AgentConsole endpoint={mcpEndpoint()} plateId={latest?.id ?? null} plateCount={plates.length} />
      </div>

      <section className="mt-12">
        <SlugHeading slug="What the mutating tools actually wrote">Recent agent-visible plates</SlugHeading>
        {plates.length === 0 ? (
          <div className="mt-6">
            <Notice tone="neutral" title="No plates in this session yet">
              Run <code className="font-mono">file_plate</code> in the console above. It creates a real row and a
              real genesis event, and the response links straight to it.
            </Notice>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-rule border-y border-rule">
            {plates.map((plate, index) => {
              const chain = chains[index];
              const ink = plate.decisionBand ? BAND_INK[plate.decisionBand] : null;
              return (
                <li key={plate.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/plates/${plate.id}`} className="text-sm text-bone hover:text-review">
                      {plate.title}
                    </Link>
                    <p className="mt-0.5 font-mono text-[0.625rem] text-bone-faint">
                      {USE_RULES.find((rule) => rule.id === plate.use)?.label} &middot;{" "}
                      {plate.jurisdiction.toUpperCase()} &middot; filed {formatDate(plate.createdAt)} &middot;{" "}
                      {chain.ok ? `chain ok, ${chain.eventCount} events` : `chain broken at ${chain.brokenAtSeq}`}
                    </p>
                  </div>
                  <p className="font-mono text-[0.625rem] text-bone-faint">{shortSeal(plate.seal)}</p>
                  {ink ? (
                    <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em]" style={{ color: ink.fg }}>
                      {ink.label}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Panel className="mt-12 p-5">
        <Slug>Wiring a client up</Slug>
        <pre className="tnum mt-4 overflow-x-auto border border-rule bg-room-deep p-4 font-mono text-[0.6875rem] leading-relaxed text-bone-dim">
          {`{
  "mcpServers": {
    "${SITE.packageName}": {
      "type": "http",
      "url": "${mcpEndpoint()}"
    }
  }
}`}
        </pre>
        <p className="mt-4 text-xs leading-relaxed text-bone-faint">
          This deployment serves the console at{" "}
          <span className="font-mono text-bone-dim">{siteUrl()}</span>. The live host is published in{" "}
          <a href="/mcp.json" className="text-review underline underline-offset-2">
            /mcp.json
          </a>{" "}
          with the production endpoint already filled in. That manifest is generated at request time from the same
          configuration this page and the footer use, so it cannot name the wrong host.
        </p>
      </Panel>
    </div>
  );
}
