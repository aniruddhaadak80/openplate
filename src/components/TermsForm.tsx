"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import type { Jurisdiction, TermSettings, UseKind } from "@/lib/types";
import { CIRCULATION_BANDS, TERM_RULES, USE_RULES } from "@/lib/terms";

/**
 * Saved clearance defaults.
 *
 * Persisted through PUT /api/terms, so a new browser starts from the product
 * defaults rather than inheriting somebody's choices, and the plate form on the
 * landing page opens with whatever was decided here.
 */
export function TermsForm({ initial }: { initial: TermSettings }) {
  const router = useRouter();
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(initial.jurisdiction);
  const [defaultUse, setDefaultUse] = useState<UseKind>(initial.defaultUse);
  const [defaultCirculation, setDefaultCirculation] = useState(initial.defaultCirculation);
  const [preferredInstitution, setPreferredInstitution] = useState(initial.preferredInstitution ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const dirty =
    jurisdiction !== initial.jurisdiction ||
    defaultUse !== initial.defaultUse ||
    defaultCirculation !== initial.defaultCirculation ||
    preferredInstitution !== (initial.preferredInstitution ?? "");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/terms", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jurisdiction,
          defaultUse,
          defaultCirculation,
          preferredInstitution: preferredInstitution === "" ? null : preferredInstitution,
        }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setMessage({ tone: "bad", text: payload.error?.message ?? "The server refused those settings." });
        setBusy(false);
        return;
      }
      setMessage({ tone: "ok", text: "Saved to the database for this browser session." });
      setBusy(false);
      router.refresh();
    } catch {
      setMessage({ tone: "bad", text: "Could not reach the API." });
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-1.5 w-full border border-rule bg-room-deep px-3 py-2 text-sm text-bone outline-none transition-colors focus:border-review";

  return (
    <form onSubmit={save} className="space-y-5">
      <div>
        <label htmlFor="terms-jurisdiction" className="slug">
          Default jurisdiction
        </label>
        <select
          id="terms-jurisdiction"
          value={jurisdiction}
          onChange={(event) => setJurisdiction(event.target.value as Jurisdiction)}
          className={fieldClass}
        >
          {TERM_RULES.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.label} — life + {rule.lifePlusYears}
              {rule.publicationCutoffYears ? `, or ${rule.publicationCutoffYears} years from publication` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="terms-use" className="slug">
          Default intended use
        </label>
        <select
          id="terms-use"
          value={defaultUse}
          onChange={(event) => setDefaultUse(event.target.value as UseKind)}
          className={fieldClass}
        >
          {USE_RULES.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.label} — {rule.meaning}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="terms-circulation" className="slug">
          Default reach
        </label>
        <input
          id="terms-circulation"
          type="number"
          min={1}
          max={50_000_000}
          value={defaultCirculation}
          onChange={(event) => setDefaultCirculation(Number(event.target.value))}
          className={`${fieldClass} tnum`}
        />
        <p className="mt-1 text-xs text-bone-faint">
          {CIRCULATION_BANDS.find((entry) => defaultCirculation <= entry.max)?.label ?? "Open to the internet"}
        </p>
      </div>

      <div>
        <label htmlFor="terms-institution" className="slug">
          Institution you work with most
        </label>
        <select
          id="terms-institution"
          value={preferredInstitution}
          onChange={(event) => setPreferredInstitution(event.target.value)}
          className={fieldClass}
        >
          <option value="">No preference</option>
          <option value="met">The Metropolitan Museum of Art</option>
          <option value="cle">The Cleveland Museum of Art</option>
        </select>
      </div>

      {message ? (
        <p
          role="status"
          className="border px-3 py-2 font-mono text-xs"
          style={{
            color: message.tone === "ok" ? "var(--color-clear)" : "var(--color-blocked)",
            borderColor: message.tone === "ok" ? "var(--color-clear)" : "var(--color-blocked)",
          }}
        >
          {message.text}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !dirty}
        className="inline-flex items-center gap-2 border border-review px-4 py-2.5 font-mono text-xs uppercase tracking-[0.16em] text-review transition-colors hover:bg-review hover:text-room disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
        {busy ? "Saving" : dirty ? "Save defaults" : "Saved"}
      </button>
    </form>
  );
}
