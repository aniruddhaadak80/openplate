/**
 * Single source of truth for identity, navigation and every outbound URL.
 *
 * The repository URL is declared exactly once, here. The shared header, the
 * mobile menu, the landing call to action, the footer, the README links and the
 * MCP manifest all read from this module, so a build can never ship a stale or
 * hand-written GitHub link in one corner of the product and the real one in
 * another.
 */

export const SITE = {
  name: "OpenPlate",
  shortName: "OpenPlate",
  tagline: "Know what you are allowed to put in print.",
  description:
    "OpenPlate is a rights clearance desk for images. Search The Met and the Cleveland Museum of Art live, pin a real artwork to the use you have in mind, read the itemised copyright-term arithmetic and reproduction restrictions behind the verdict, record a decision, and export a dated credit line that a colleague can re-verify.",
  repositoryUrl: "https://github.com/aniruddhaadak80/openplate",
  repositoryLabel: "View source",
  license: "MIT",
  author: "Aniruddha Adak",
  packageName: "openplate",
} as const;

export const NAV = [
  { href: "/", label: "Search" },
  { href: "/plates", label: "Docket" },
  { href: "/terms", label: "Terms" },
  { href: "/agent", label: "Agent" },
  { href: "/export", label: "Export" },
] as const;

/**
 * Canonical absolute origin, used for metadata, the sitemap, the share route and
 * the MCP manifest.
 *
 * Resolution order: NEXT_PUBLIC_SITE_URL, the production alias Vercel injects,
 * then localhost. The value is never guessed from the repository name, because
 * Vercel hands out suffixed aliases when a bare name is taken.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const injected = (
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    ""
  ).trim();
  if (injected) {
    const host = injected.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${host}`;
  }
  return "http://localhost:3000";
}

/** The JSON-RPC endpoint an agent client should be pointed at. */
export function mcpEndpoint(): string {
  return `${siteUrl()}/api/mcp`;
}