import type { ReactNode } from "react";
import type { ClearanceBand } from "@/lib/types";
import { bandInk } from "@/lib/bands";

/** A framed surface: hairline rule, square corners, crop marks. */
export function Panel({
  children,
  className,
  onPaper = false,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  onPaper?: boolean;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Tag
      className={`crop border ${
        onPaper ? "border-paper-rule bg-paper text-ink" : "border-rule bg-bench text-bone"
      } ${className ?? ""}`}
    >
      {children}
    </Tag>
  );
}

/** The slug line a printer writes beside a plate. */
export function Slug({
  children,
  className,
  onPaper = false,
}: {
  children: ReactNode;
  className?: string;
  onPaper?: boolean;
}) {
  return <p className={`slug ${onPaper ? "slug-ink" : ""} ${className ?? ""}`}>{children}</p>;
}

/** Section heading with its slug above it. */
export function SlugHeading({
  slug,
  children,
  className,
  as: Tag = "h2",
}: {
  slug: string;
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag className={className}>
      <span className="slug block">{slug}</span>
      <span className="mt-1.5 block font-display text-2xl leading-tight tracking-tight sm:text-3xl">
        {children}
      </span>
    </Tag>
  );
}

/**
 * The colour bar: a printer's state strip. The band gets its own spot ink and
 * nothing else on the page is allowed to use it.
 */
export function BandChip({ band, className }: { band: ClearanceBand; className?: string }) {
  const ink = bandInk(band);
  return (
    <span
      className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.16em] ${className ?? ""}`}
      style={{ color: ink.fg, borderColor: ink.border }}
    >
      <span aria-hidden="true" className="inline-block h-2 w-2" style={{ background: ink.fg }} />
      {ink.label}
    </span>
  );
}

/** The greyscale step wedge, read-only, as a value display. */
export function StepWedgeReadout({ score }: { score: number }) {
  const filled = Math.max(1, Math.min(10, Math.round((score / 100) * 10)));
  return (
    <div className="wedge" role="img" aria-label={`Score ${score} out of 100, ${filled} of 10 steps`}>
      {Array.from({ length: 10 }, (_, index) => (
        <span
          key={index}
          className="wedge-patch"
          style={{
            background: `var(--color-wedge-${index + 1})`,
            cursor: "default",
            opacity: index < filled ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}

/** A labelled figure. */
export function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <p className="slug">{label}</p>
      <p className="tnum mt-1 font-mono text-2xl leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-bone-faint">{hint}</p> : null}
    </div>
  );
}

/** Honest source labelling: live, or a sealed sample with the date it was taken. */
export function SourceBadge({
  status,
  fetchedAt,
  sealedAt,
}: {
  status: "live" | "fallback";
  fetchedAt: string;
  sealedAt?: string;
}) {
  const live = status === "live";
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em]"
      style={{ color: live ? "var(--color-live)" : "var(--color-review)" }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: live ? "var(--color-live)" : "var(--color-review)" }}
      />
      {live ? "live" : `sealed sample ${sealedAt ?? fetchedAt}`}
    </span>
  );
}

/** Empty and error states, so neither route can render a blank panel. */
export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "warn" | "bad";
  title: string;
  children?: ReactNode;
}) {
  const colour =
    tone === "bad" ? "var(--color-blocked)" : tone === "warn" ? "var(--color-review)" : "var(--color-bone-faint)";
  return (
    <div className="crop border border-rule bg-bench p-5">
      <p className="font-mono text-[0.6875rem] uppercase tracking-[0.16em]" style={{ color: colour }}>
        {title}
      </p>
      {children ? <div className="mt-2 text-sm leading-relaxed text-bone-dim">{children}</div> : null}
    </div>
  );
}
