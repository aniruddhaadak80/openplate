"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import type { ClearanceResult, Jurisdiction, UseKind } from "@/lib/types";
import { USE_RULES } from "@/lib/terms";
import { BAND_INK, STATUS_INK } from "@/lib/bands";

/**
 * The signature interaction: a step wedge you pull along.
 *
 * A printer reads density off a strip of ten patches rather than off a number, so
 * that is the control here. Dragging it or clicking a patch changes the intended
 * use, which is posted to the engine's assess endpoint; the score, the term
 * arithmetic, the blockers and the required credit line all come back recomputed
 * from the institution's own record.
 *
 * It manipulates real state and reveals a real computation: the hypothetical it
 * shows is produced by the same pure engine function the saved verdict uses, and
 * the wedge's patches are tinted by whichever factor is currently costing the most
 * points, so the score's movement is explained rather than merely shown.
 */
export function StepWedge({
  plateId,
  committed,
  savedUse,
  savedJurisdiction,
  savedCirculation,
}: {
  plateId: string;
  committed: ClearanceResult;
  savedUse: UseKind;
  savedJurisdiction: Jurisdiction;
  savedCirculation: number;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const [pendingUse, setPendingUse] = useState<UseKind>(savedUse);
  const [live, setLive] = useState<ClearanceResult>(committed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const hypothetical = live.band !== committed.band || live.score !== committed.score;
  const ink = BAND_INK[live.band];

  /**
   * The factor costing the most points, which is the honest answer to "why did
   * the number move". A factor at full weight costs nothing, so the biggest loss
   * is the one furthest below its maximum.
   */
  const dominantLoss = useMemo(() => {
    let worst: { id: string; lost: number } | null = null;
    for (const factor of live.factors) {
      const lost = factor.weight * (1 - factor.normalized) * 100;
      if (lost > 0.5 && (worst === null || lost > worst.lost)) worst = { id: factor.id, lost };
    }
    return worst;
  }, [live.factors]);

  const runAssess = useCallback(
    async (use: UseKind) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/plates/${plateId}/assess`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            use,
            jurisdiction: savedJurisdiction,
            circulation: savedCirculation,
          }),
        });
        const payload = (await response.json()) as {
          assessed?: ClearanceResult;
          error?: { message?: string };
        };
        if (!response.ok || !payload.assessed) {
          setError(payload.error?.message ?? "The engine did not answer.");
          return;
        }
        setLive(payload.assessed);
      } catch {
        setError("Could not reach the assessment endpoint.");
      } finally {
        setBusy(false);
      }
    },
    [plateId, savedJurisdiction, savedCirculation],
  );

  function chooseUse(use: UseKind) {
    setPendingUse(use);
    void runAssess(use);
  }

  function positionFromPointer(clientX: number): number {
    const rail = railRef.current;
    if (!rail) return 0;
    const box = rail.getBoundingClientRect();
    if (box.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }

  const activeIndex = USE_RULES.findIndex((rule) => rule.id === pendingUse);
  const markerPercent = ((activeIndex + 0.5) / USE_RULES.length) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="slug">Exposure of the intended use</p>
        <p className="tnum font-mono text-xs text-bone-faint">
          {savedCirculation.toLocaleString("en-US")} reach &middot; {savedJurisdiction.toUpperCase()}
        </p>
      </div>

      {/* The rail the slug marker travels along. */}
      <div className="mt-4 px-1">
        <div
          ref={railRef}
          className="rail"
          role="slider"
          tabIndex={0}
          aria-label="Intended use, from personal to broadcast"
          aria-valuemin={0}
          aria-valuemax={USE_RULES.length - 1}
          aria-valuenow={Math.max(0, activeIndex)}
          aria-valuetext={USE_RULES[activeIndex]?.label}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              const next = USE_RULES[Math.min(USE_RULES.length - 1, activeIndex + 1)];
              if (next) chooseUse(next.id);
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              const next = USE_RULES[Math.max(0, activeIndex - 1)];
              if (next) chooseUse(next.id);
            }
            if (event.key === "Home") {
              event.preventDefault();
              const first = USE_RULES[0];
              if (first) chooseUse(first.id);
            }
            if (event.key === "End") {
              event.preventDefault();
              const last = USE_RULES[USE_RULES.length - 1];
              if (last) chooseUse(last.id);
            }
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
            const index = Math.round(positionFromPointer(event.clientX) * (USE_RULES.length - 1));
            const rule = USE_RULES[index];
            if (rule) chooseUse(rule.id);
          }}
          onPointerMove={(event) => {
            if (!dragging) return;
            const index = Math.round(positionFromPointer(event.clientX) * (USE_RULES.length - 1));
            const rule = USE_RULES[index];
            if (rule && rule.id !== pendingUse) chooseUse(rule.id);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture(event.pointerId);
            setDragging(false);
          }}
        >
          <motion.span
            className="slug-marker"
            style={{ left: `${markerPercent}%` }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: busy ? 0.4 : 1 }}
            transition={{ duration: 0.15 }}
          />
        </div>
      </div>

      {/* The ten-patch strip: the wedge itself. */}
      <div className="wedge mt-3" aria-hidden="true">
        {USE_RULES.map((rule, index) => {
          const selected = index === activeIndex;
          const factor = live.factors.find((entry) => entry.id === "use_scale");
          const contribution = factor ? factor.normalized : 0;
          const patch = Math.max(1, Math.min(10, Math.round(contribution * 10) || (10 - index)));
          return (
            <button
              key={rule.id}
              type="button"
              onClick={() => chooseUse(rule.id)}
              aria-pressed={selected}
              aria-label={`${rule.label}: ${rule.meaning}`}
              className="wedge-patch"
              style={{
                background: `var(--color-wedge-${patch})`,
                boxShadow: selected ? `inset 0 0 0 1px ${ink.fg}` : undefined,
              }}
            />
          );
        })}
      </div>

      <div className="mt-2 flex justify-between">
        <span className="slug">Personal</span>
        <span className="slug">Broadcast</span>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-bone-dim">
        {USE_RULES.find((rule) => rule.id === pendingUse)?.meaning}
      </p>

      {/* The reading the wedge produced. */}
      <div className="mt-5 border-t border-rule pt-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="slug">Clearance score</p>
            <p className="tnum mt-1 font-display text-4xl leading-none" style={{ color: ink.fg }}>
              {live.score.toFixed(1)}
            </p>
          </div>
          <div className="text-right">
            <p className="slug">Verdict</p>
            <p className="mt-1 font-mono text-sm uppercase tracking-[0.16em]" style={{ color: ink.fg }}>
              {ink.label}
            </p>
          </div>
        </div>

        <div className="wedge mt-4">
          {Array.from({ length: 10 }, (_, index) => {
            const filled = index < Math.max(1, Math.round((live.score / 100) * 10));
            return (
              <span
                key={index}
                className="wedge-patch"
                style={{
                  background: filled ? ink.fg : `var(--color-wedge-${index + 1})`,
                  opacity: filled ? 0.85 : 0.3,
                  cursor: "default",
                }}
              />
            );
          })}
        </div>

        <p className="tnum mt-2 text-xs text-bone-faint">
          Confidence {live.confidence.toFixed(2)} &middot; engine {live.engine} {live.version}
        </p>

        {busy ? (
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-review" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Recomputing against the institution record
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 text-xs" style={{ color: "var(--color-blocked)" }} role="alert">
            {error}
          </p>
        ) : null}

        {dominantLoss ? (
          <p className="mt-3 text-xs leading-relaxed text-bone-faint">
            The score is being held down mostly by{" "}
            <span style={{ color: STATUS_INK.unresolved.fg }}>
              {live.factors.find((factor) => factor.id === dominantLoss.id)?.label.toLowerCase()}
            </span>
            , which is costing {dominantLoss.lost.toFixed(1)} of the 100 points.
          </p>
        ) : null}

        {hypothetical ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border border-review px-3 py-2.5">
            <p className="text-xs leading-relaxed text-bone-dim">
              This is a hypothetical: the saved plate still reads{" "}
              <strong style={{ color: BAND_INK[committed.band].fg }}>{BAND_INK[committed.band].label}</strong>{" "}
              at {committed.score.toFixed(1)} for {USE_RULES.find((rule) => rule.id === savedUse)?.label}.
            </p>
            <button
              type="button"
              onClick={() => {
                setPendingUse(savedUse);
                setLive(committed);
                setError(null);
              }}
              className="inline-flex items-center gap-1.5 border border-rule-bright px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim transition-colors hover:border-bone hover:text-bone"
            >
              <RotateCcw size={12} aria-hidden="true" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => router.push(`/plates/${plateId}`)}
              className="inline-flex items-center gap-1.5 border border-review px-3 py-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room"
            >
              Save this use
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {live.restrictions.length > 0 ? (
          <div className="mt-4 border border-rule p-3">
            <p className="slug">Restrictions in the institution&apos;s own words</p>
            <ul className="mt-2 space-y-1.5">
              {live.restrictions.map((restriction) => (
                <li key={`${restriction.kind}-${restriction.index}`} className="text-xs leading-relaxed text-bone-dim">
                  <code className="font-mono" style={{ color: "var(--color-blocked)" }}>
                    {restriction.matchedText}
                  </code>{" "}
                  &mdash; {restriction.clause}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
