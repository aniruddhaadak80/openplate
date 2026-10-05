"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PinIcon } from "lucide-react";
import type { Jurisdiction, UseKind } from "@/lib/types";
import { CIRCULATION_BANDS, TERM_RULES, USE_RULES } from "@/lib/terms";

/**
 * File a plate from a search result.
 *
 * This is the write half of the core loop: pick the work on screen, say what you
 * are actually going to do with it, and pin it. It posts to the same /api/plates
 * endpoint the agent tool calls, then navigates to the plate where the verdict has
 * already been computed and sealed.
 */
export function FilePlateForm({
  workId,
  defaultUse,
  defaultJurisdiction,
  defaultCirculation,
}: {
  workId: string;
  defaultUse: UseKind;
  defaultJurisdiction: Jurisdiction;
  defaultCirculation: number;
}) {
  const router = useRouter();
  const [use, setUse] = useState<UseKind>(defaultUse);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(defaultJurisdiction);
  const [circulation, setCirculation] = useState(defaultCirculation);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const response = await fetch("/api/plates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workId, use, jurisdiction, circulation, note }),
      });
      const payload = (await response.json()) as {
        plate?: { id: string };
        error?: { message?: string; fields?: Record<string, string> };
      };
      if (!response.ok || !payload.plate) {
        setError(payload.error?.message ?? "The plate could not be filed.");
        setFields(payload.error?.fields ?? {});
        setBusy(false);
        return;
      }
      router.push(`/plates/${payload.plate.id}`);
    } catch {
      setError("Could not reach the API.");
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-1.5 w-full border border-rule bg-room-deep px-3 py-2 text-sm text-bone outline-none transition-colors focus:border-review";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="use" className="slug">
          What will you do with it
        </label>
        <select
          id="use"
          value={use}
          onChange={(event) => setUse(event.target.value as UseKind)}
          className={fieldClass}
        >
          {USE_RULES.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.label} — {rule.meaning}
            </option>
          ))}
        </select>
        {fields.use ? (
          <p className="mt-1 text-xs" style={{ color: "var(--color-blocked)" }}>
            {fields.use}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="jurisdiction" className="slug">
            Whose term applies
          </label>
          <select
            id="jurisdiction"
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value as Jurisdiction)}
            className={fieldClass}
          >
            {TERM_RULES.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.label} (life + {rule.lifePlusYears})
              </option>
            ))}
          </select>
          {fields.jurisdiction ? (
            <p className="mt-1 text-xs" style={{ color: "var(--color-blocked)" }}>
              {fields.jurisdiction}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="circulation" className="slug">
            Reach
          </label>
          <input
            id="circulation"
            type="number"
            min={1}
            max={50_000_000}
            step={1}
            value={circulation}
            onChange={(event) => setCirculation(Number(event.target.value))}
            className={`${fieldClass} tnum`}
          />
          <p className="mt-1 text-xs text-bone-faint">
            {CIRCULATION_BANDS.find((band) => circulation <= band.max)?.label ?? "Open to the internet"}
          </p>
          {fields.circulation ? (
            <p className="mt-1 text-xs" style={{ color: "var(--color-blocked)" }}>
              {fields.circulation}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="note" className="slug">
          Note for the docket, optional
        </label>
        <textarea
          id="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Which issue of the newsletter this is for"
          className={`${fieldClass} resize-y`}
        />
        {fields.note ? (
          <p className="mt-1 text-xs" style={{ color: "var(--color-blocked)" }}>
            {fields.note}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="border border-blocked px-3 py-2 text-sm" style={{ color: "var(--color-blocked)" }} role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 border border-review bg-review px-4 py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-room transition-colors hover:bg-bone hover:border-bone disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <PinIcon size={14} aria-hidden="true" />
        )}
        {busy ? "Filing and sealing" : "Pin to the docket"}
      </button>
    </form>
  );
}
