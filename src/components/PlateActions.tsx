"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Loader2, Save, Trash2 } from "lucide-react";
import type { Decision, Jurisdiction, UseKind } from "@/lib/types";
import { TERM_RULES, USE_RULES } from "@/lib/terms";

/**
 * Everything you can do to a plate after it is filed, in one place: change the
 * inputs, record a decision, or retire it. Each control calls the real endpoint
 * and reports what came back, including the case where the server refused.
 */
export function PlateActions({
  plateId,
  use: initialUse,
  jurisdiction: initialJurisdiction,
  circulation: initialCirculation,
  note: initialNote,
  decision,
  retired,
}: {
  plateId: string;
  use: UseKind;
  jurisdiction: Jurisdiction;
  circulation: number;
  note: string;
  decision: Decision | null;
  retired: boolean;
}) {
  const router = useRouter();
  const [use, setUse] = useState(initialUse);
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction);
  const [circulation, setCirculation] = useState(initialCirculation);
  const [note, setNote] = useState(initialNote);
  const [decisionChoice, setDecisionChoice] = useState<Decision>(decision ?? "conditional");
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState<"save" | "decide" | "retire" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const fieldClass =
    "mt-1.5 w-full border border-rule bg-room-deep px-3 py-2 text-sm text-bone outline-none transition-colors focus:border-review";

  async function send(
    kind: "save" | "decide" | "retire",
    path: string,
    method: "PATCH" | "POST" | "DELETE",
    body?: unknown,
  ) {
    setBusy(kind);
    setMessage(null);
    try {
      const response = await fetch(`/api/plates/${plateId}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        plate?: { decision?: string | null; decisionSeal?: string | null };
      };
      if (!response.ok) {
        setMessage({ tone: "bad", text: payload.error?.message ?? "The server refused that change." });
        setBusy(null);
        return;
      }
      setMessage({
        tone: "ok",
        text:
          kind === "save"
            ? "Inputs updated. The verdict was recomputed and the change was sealed."
            : kind === "decide"
              ? `Decision recorded and sealed${payload.plate?.decisionSeal ? ` at ${payload.plate.decisionSeal.slice(0, 12)}` : ""}.`
              : "Retired as a tombstone. The record and its chain are retained.",
      });
      setBusy(null);
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Could not reach the API." });
      setBusy(null);
    }
  }

  const disabled = retired || busy !== null;
  const dirty =
    use !== initialUse ||
    jurisdiction !== initialJurisdiction ||
    circulation !== initialCirculation ||
    note !== initialNote;

  return (
    <div className="space-y-6">
      {message ? (
        <p
          role="status"
          className="border px-3 py-2 font-mono text-xs leading-relaxed"
          style={{
            color: message.tone === "ok" ? "var(--color-clear)" : "var(--color-blocked)",
            borderColor: message.tone === "ok" ? "var(--color-clear)" : "var(--color-blocked)",
          }}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-use" className="slug">
            Intended use
          </label>
          <select
            id="edit-use"
            value={use}
            disabled={disabled}
            onChange={(event) => setUse(event.target.value as UseKind)}
            className={fieldClass}
          >
            {USE_RULES.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="edit-jurisdiction" className="slug">
            Jurisdiction
          </label>
          <select
            id="edit-jurisdiction"
            value={jurisdiction}
            disabled={disabled}
            onChange={(event) => setJurisdiction(event.target.value as Jurisdiction)}
            className={fieldClass}
          >
            {TERM_RULES.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="edit-circulation" className="slug">
            Reach
          </label>
          <input
            id="edit-circulation"
            type="number"
            min={1}
            max={50_000_000}
            value={circulation}
            disabled={disabled}
            onChange={(event) => setCirculation(Number(event.target.value))}
            className={`${fieldClass} tnum`}
          />
        </div>

        <div>
          <label htmlFor="edit-note" className="slug">
            Note
          </label>
          <input
            id="edit-note"
            value={note}
            disabled={disabled}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <button
        type="button"
        disabled={disabled || !dirty}
        onClick={() => send("save", "", "PATCH", { use, jurisdiction, circulation, note })}
        className="inline-flex items-center gap-2 border border-rule-bright px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-bone transition-colors hover:border-bone disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy === "save" ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : (
          <Save size={14} aria-hidden="true" />
        )}
        {busy === "save" ? "Saving" : dirty ? "Save and reseal" : "Nothing to save"}
      </button>

      <fieldset disabled={disabled} className="border-t border-rule pt-5">
        <legend className="slug">Record the decision</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["approved", "conditional", "rejected"] as Decision[]).map((option) => (
            <label
              key={option}
              className="inline-flex cursor-pointer items-center gap-2 border border-rule px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] transition-colors has-[:checked]:border-review has-[:checked]:text-review"
            >
              <input
                type="radio"
                name="decision"
                value={option}
                checked={decisionChoice === option}
                onChange={() => setDecisionChoice(option)}
                className="accent-[var(--color-review)]"
              />
              {option}
            </label>
          ))}
        </div>

        <label htmlFor="rationale" className="slug mt-5 block">
          Rationale, sealed with the decision
        </label>
        <textarea
          id="rationale"
          value={rationale}
          disabled={disabled}
          onChange={(event) => setRationale(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Why this verdict is good enough to ship"
          className={`${fieldClass} resize-y`}
        />

        <button
          type="button"
          disabled={disabled}
          onClick={() => send("decide", "/decision", "POST", { decision: decisionChoice, note: rationale })}
          className="mt-4 inline-flex items-center gap-2 border border-review px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "decide" ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Gavel size={14} aria-hidden="true" />
          )}
          {busy === "decide" ? "Sealing" : "Seal the decision"}
        </button>
      </fieldset>

      <div className="border-t border-rule pt-5">
        <p className="slug">Retire</p>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-bone-faint">
          Retiring keeps the row, its snapshot, its decision and its chain. A docket you already shared still
          verifies afterwards. It stops appearing in your docket list.
        </p>
        <button
          type="button"
          disabled={retired || busy !== null}
          onClick={() => send("retire", "", "DELETE")}
          className="mt-3 inline-flex items-center gap-2 border border-blocked px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] transition-colors hover:bg-blocked hover:text-room disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: retired ? undefined : "var(--color-blocked)" }}
        >
          {busy === "retire" ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 size={14} aria-hidden="true" />
          )}
          {busy === "retire" ? "Retiring" : "Retire this plate"}
        </button>
      </div>
    </div>
  );
}
