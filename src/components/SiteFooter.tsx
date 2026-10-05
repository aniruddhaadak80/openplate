import Link from "next/link";
import { NAV, SITE, siteUrl } from "@/lib/config";
import { GitHubLink } from "./GitHubLink";

/** The shared footer, carrying the repository link like every other surface. */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-rule bg-room-deep">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <p className="font-display text-xl text-bone">{SITE.name}</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-bone-dim">{SITE.tagline}</p>
            <div className="mt-4">
              <GitHubLink variant="footer" />
            </div>
          </div>

          <nav aria-label="Footer" className="flex flex-col gap-2">
            <p className="slug">Product</p>
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-bone-dim hover:text-review">
                {item.label}
              </Link>
            ))}
          </nav>

          <nav aria-label="Reference" className="flex flex-col gap-2">
            <p className="slug">Reference</p>
            <Link href="/api/health" className="text-sm text-bone-dim hover:text-review">
              Health
            </Link>
            <Link href="/api/works" className="text-sm text-bone-dim hover:text-review">
              Collection API
            </Link>
            <Link href="/agent" className="text-sm text-bone-dim hover:text-review">
              Agent tools
            </Link>
            <Link href="/mcp.json" className="text-sm text-bone-dim hover:text-review">
              MCP manifest
            </Link>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-rule pt-6 text-xs text-bone-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            Records from{" "}
            <a
              href="https://www.metmuseum.org/information/terms-and-conditions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-rule-bright underline-offset-2 hover:text-bone"
            >
              The Metropolitan Museum of Art
            </a>{" "}
            and{" "}
            <a
              href="https://www.clevelandart.org/open-access"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-rule-bright underline-offset-2 hover:text-bone"
            >
              The Cleveland Museum of Art
            </a>
            . Creator dates corroborated with Wikidata.
          </p>
          <p className="slug">
            {SITE.license} licensed &middot; {siteUrl().replace(/^https?:\/\//, "")}
          </p>
        </div>
      </div>
    </footer>
  );
}
