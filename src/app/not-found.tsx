import Link from "next/link";
import { SITE } from "@/lib/config";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-4 py-16 sm:px-6">
      <p className="slug">404</p>
      <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight">
        There is no plate at that address.
      </h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-bone-dim">
        Share codes are unguessable and plates are owned by the browser that filed them, so a link only works for
        whoever it was sent to. If one of yours stopped working, the plate was most likely retired, which keeps the
        record but takes it out of the docket.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/"
          className="border border-review px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room"
        >
          Search the collections
        </Link>
        <Link
          href="/plates"
          className="border border-rule-bright px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-bone transition-colors hover:border-bone"
        >
          Open the docket
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
