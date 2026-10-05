"use client";

import { useState } from "react";
import { Link2, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import type { ChainVerification } from "@/lib/types";
import { formatDateTime, shortSeal } from "@/lib/bands";

/**
 * Replay the chain on demand.
 *
 * The server already verified the chain when it built this page; this button asks
 * again through the public verify endpoint, so what a reader sees is a live replay
 * rather than a badge asserted by the renderer.
 */
export function ChainPanel({
  plateId,
  initial,
  events,
}: {
  plateId: string;
  initial: ChainVerification;
  events: { seq: number; eventType: string; createdAt: string; prevSeal: string; seal: string }[];
}) {
  const [result, setResult] = useState<ChainVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = result ?? initial;

  async function replay() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/plates/${plateId}/verify`);
      const payload = (await response.json()) as {
        verification?: ChainVerification;
        error?: { message?: string };
      };
      if (!response.ok || !payload.verification) {
        setError(payload.error?.message ?? "The verify endpoint did not answer.");
        return;
      }
      setResult(payload.verification);
    } catch {
      setError("Could not reach the verify endpoint.");
    } finally {
      setBusy(false);
    }
  }

  const ok = shown.ok;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="inline-flex items-center gap-2 font-mono text-sm" style={{ color: ok ? "var(--color-clear)" : "var(--color-blocked)" }}>
          {ok ? <ShieldCheck size={16} aria-hidden="true" /> : <ShieldX size={16} aria-hidden="true" />}
          {ok ? `Chain intact across ${shown.eventCount} event(s)` : `Chain broken at event ${shown.brokenAtSeq}`}
        </p>
        <button
          type="button"
          onClick={replay}
          disabled={busy}
          className="inline-flex items-center gap-2 border border-rule-bright px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim transition-colors hover:border-bone hover:text-bone disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <Link2 size={12} aria-hidden="true" />
          )}
          {busy ? "Replaying" : "Replay the chain"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-xs" style={{ color: "var(--color-blocked)" }} role="alert">
          {error}
        </p>
      ) : null}

      {!ok && shown.reason ? (
        <p className="mt-3 border border-blocked px-3 py-2 text-xs" style={{ color: "var(--color-blocked)" }}>
          {shown.reason}
        </p>
      ) : null}

      <ol className="mt-4 space-y-2">
        {events.map((event) => (
          <li key={event.seq} className="border-t border-rule pt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-mono text-xs text-bone">
                {String(event.seq).padStart(2, "0")} &middot; {event.eventType.replace(/_/g, " ")}
              </span>
              <span className="slug">{formatDateTime(event.createdAt)}</span>
            </div>
            <p className="mt-1 break-all font-mono text-[0.625rem] leading-relaxed text-bone-faint">
              prev {shortSeal(event.prevSeal)} &rarr; seal {shortSeal(event.seal)}
            </p>
          </li>
        ))}
      </ol>

      <p className="mt-4 font-mono text-[0.625rem] leading-relaxed text-bone-faint">
        genesis {shortSeal(shown.genesisSeal)}
        <br />
        head &nbsp;&nbsp;{shortSeal(shown.headSeal)}
      </p>
    </div>
  );
}
