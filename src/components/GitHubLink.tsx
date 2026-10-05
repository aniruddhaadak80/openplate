import { SITE } from "@/lib/config";

/**
 * The official GitHub mark, inlined.
 *
 * The icon library does not ship a GitHub glyph, and reaching for an unrelated
 * icon would misrepresent the link. This is the real mark, drawn as the two
 * overlapping counters that identify it, so the repository link is never carried
 * by a pictogram that merely looks technical.
 */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/**
 * The one repository link.
 *
 * Every appearance of it in the product - the desktop header, the mobile menu,
 * the landing call to action and the footer - renders this component, which reads
 * the URL from the single site configuration module. There is no second copy of
 * the repository address anywhere in the codebase.
 */
export function GitHubLink({
  variant = "inline",
  className,
}: {
  variant?: "inline" | "button" | "footer";
  className?: string;
}) {
  const label = variant === "button" ? "Star on GitHub" : SITE.repositoryLabel;

  const base =
    "inline-flex items-center gap-2 transition-colors duration-150 focus-visible:outline-2";

  const tone =
    variant === "button"
      ? "border border-rule-bright bg-bench px-4 py-2 text-bone hover:border-review hover:text-review"
      : variant === "footer"
        ? "text-bone-dim hover:text-review"
        : "text-bone-dim hover:text-review";

  return (
    <a
      href={SITE.repositoryUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${tone} ${className ?? ""}`}
      aria-label={`${SITE.name} source code on GitHub`}
    >
      <GitHubMark />
      <span>{label}</span>
    </a>
  );
}
