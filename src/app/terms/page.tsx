import Link from "next/link";
import { getRepository } from "@/lib/db";
import { readTermSettings } from "@/lib/service";
import { getOwnerId } from "@/lib/session";
import { CIRCULATION_BANDS, DISCLAIMER, USE_RULES } from "@/lib/terms";
import { SITE } from "@/lib/config";
import { TermsForm } from "@/components/TermsForm";
import { Panel, Slug, SlugHeading } from "@/components/primitives";

export const metadata = {
  title: "Terms and defaults",
  alternates: { canonical: "/terms" },
};

/**
 * The rule table, read out of the database.
 *
 * These numbers are the ones the engine uses, so they are rendered from the same
 * seeded rows rather than from a second copy in a template. If a term length were
 * ever corrected, this page and the arithmetic would move together.
 */
export default async function TermsPage() {
  const ownerId = await getOwnerId();
  const repository = await getRepository();
  const [settings, rules] = await Promise.all([
    readTermSettings(ownerId),
    repository.listJurisdictionRules(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <SlugHeading slug="Published terms, not advice">
        Whose copyright term applies
      </SlugHeading>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-bone-dim">
        OpenPlate multiplies one number by another and shows its work. What it cannot do is tell you that the
        arithmetic settles the question: a term running out is a necessary condition for reuse, not a sufficient
        one, and the museum&apos;s own claim about its photograph is a separate right that outlives the artwork.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <Slug>Term lengths in the database</Slug>
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {rules.map((rule) => (
              <li key={rule.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="font-display text-lg text-bone">{rule.label}</span>
                  <span className="tnum font-mono text-sm text-review">
                    life + {rule.lifePlusYears}
                    {rule.publicationCutoffYears ? ` · or ${rule.publicationCutoffYears}y from publication` : ""}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-bone-faint">{rule.note}</p>
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <Slug>How the six factors are weighted</Slug>
            <ul className="mt-4 space-y-2">
              {[
                ["Creator's copyright term", "0.26", "The largest weight, because the term is arithmetic you can check."],
                ["Institution's own claim", "0.20", "What the museum says about the record it is serving."],
                ["Reproduction restrictions", "0.20", "Estates, collecting societies, licences and copyright marks in their statement."],
                ["Publication-age rule", "0.14", "Where a jurisdiction clears by age regardless of the creator's death."],
                ["Exposure of the intended use", "0.12", "Editorial is not merchandise, and a newsletter is not a broadcast."],
                ["Credit-line completeness", "0.08", "Whether the record even supplies the elements a credit line needs."],
              ].map(([label, weight, why]) => (
                <li key={label} className="flex flex-wrap items-baseline gap-x-3 border-t border-rule pt-2">
                  <span className="min-w-0 flex-1 text-sm text-bone">{label}</span>
                  <span className="tnum font-mono text-xs text-review">{weight}</span>
                  <span className="w-full text-xs leading-relaxed text-bone-faint sm:w-auto sm:flex-[2]">{why}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <Panel className="p-5">
            <SlugHeading slug="Persisted per session">Your defaults</SlugHeading>
            <div className="mt-5">
              <TermsForm initial={settings} />
            </div>
            <p className="mt-4 border-t border-rule pt-4 text-xs leading-relaxed text-bone-faint">
              Stored against this browser&apos;s anonymous owner id. There are no accounts and no email address.
              Last written {new Date(settings.updatedAt).toISOString().slice(0, 16).replace("T", " ")}Z.
            </p>
          </Panel>

          <Panel className="p-5">
            <Slug>Use and reach bands</Slug>
            <ul className="mt-4 space-y-3">
              {USE_RULES.map((rule) => (
                <li key={rule.id} className="border-t border-rule pt-3 first:border-t-0 first:pt-0">
                  <span className="text-sm text-bone">{rule.label}</span>
                  <p className="mt-1 text-xs leading-relaxed text-bone-faint">{rule.meaning}</p>
                </li>
              ))}
            </ul>
            <ul className="mt-5 space-y-2 border-t border-rule pt-4">
              {CIRCULATION_BANDS.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-bone-dim">{entry.label}</span>
                  <span className="tnum font-mono text-[0.6875rem] text-bone-faint">
                    {Number.isFinite(entry.max) ? `up to ${entry.max.toLocaleString("en-US")}` : "no ceiling"}{" "}
                    &middot; &times;{entry.penalty}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-5">
            <Slug>Not legal advice</Slug>
            <p className="mt-3 text-xs leading-relaxed text-bone-dim">{DISCLAIMER}</p>
            <p className="mt-4 border-t border-rule pt-4 font-mono text-[0.625rem] leading-relaxed text-bone-faint">
              {SITE.name} reads records published under each institution&apos;s open-access terms and the
              copyright term lengths listed above. It performs no legal analysis and contacts no rights holder.
            </p>
            <Link
              href="/api/terms"
              className="mt-3 inline-block font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-review underline decoration-rule-bright underline-offset-2"
            >
              Read these settings as JSON
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
