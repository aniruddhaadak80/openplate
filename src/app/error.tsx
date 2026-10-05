"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SITE } from "@/lib/config";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Only the digest reaches the browser. The message itself is deliberately not
    // rendered: an unexpected error can carry a query, a path or a fragment of
    // configuration, and none of that belongs on a public page.
    console.error("Unhandled application error, digest:", error.digest ?? "none");
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-4 py-16 sm:px-6">
      <p className="slug">Something failed on our side</p>
      <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight">
        This request could not be completed.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-bone-dim">
        The failure has been logged. Nothing was half-written: every mutation in this product runs inside a
        transaction with its audit event, so a failed request leaves the docket exactly as it was.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-bone-faint">Reference {error.digest}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="border border-review px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room"
        >
          Try again
        </button>
        <Link
          href="/"
          className="border border-rule-bright px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-bone transition-colors hover:border-bone"
        >
          Back to search
        </Link>
        <Link
          href={SITE.repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="border border-rule px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-bone-dim transition-colors hover:border-bone hover:text-bone"
        >
          {SITE.repositoryLabel}
        </Link>
      </div>
    </div>
  );
}
