import { TERM_RULES } from "../terms";
import type { SqlClient } from "./repository";

/**
 * Schema, constraints and idempotent first-run seeding.
 *
 * Written once and executed by both adapters, so there is no such thing as a
 * local schema that has drifted away from production. Everything is
 * `if not exists`, which makes the first request against a cold database safe to
 * run concurrently.
 *
 * The seed is reference data only: the copyright term rules that the engine reads.
 * They are upserted under fixed primary keys and can never collide with a
 * visitor's plate, because plates carry generated UUIDs and a share code that no
 * seed produces.
 */

const SCHEMA_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function resolveSchema(): string {
  const requested = process.env.DATABASE_SCHEMA?.trim();
  if (!requested) return "public";
  if (!SCHEMA_NAME_RE.test(requested)) {
    throw new Error(
      `DATABASE_SCHEMA must be a plain SQL identifier (letters, digits, underscore). Received: ${requested}`,
    );
  }
  return requested;
}

function ddl(schema: string): string[] {
  const s = schema;
  return [
    `create schema if not exists ${s}`,

    // Reference data: published copyright term rules. origin is fixed so that
    // this table can only ever contain catalogue rows.
    `create table if not exists ${s}.jurisdiction_rules (
      id text primary key,
      label text not null,
      life_plus_years integer not null check (life_plus_years between 1 and 200),
      publication_cutoff_years integer check (publication_cutoff_years between 1 and 300),
      note text not null,
      origin text not null default 'catalogue' check (origin = 'catalogue')
    )`,

    // A visitor's saved clearance preferences. One row per anonymous owner, so
    // this table is also the list of owners and stays small.
    `create table if not exists ${s}.term_settings (
      owner_id uuid primary key,
      jurisdiction text not null check (jurisdiction in ('us','eu','uk','ca','au','jp')),
      default_use text not null check (default_use in ('personal','editorial','educational','commercial','merchandise','broadcast')),
      default_circulation integer not null check (default_circulation between 1 and 50000000),
      preferred_institution text check (preferred_institution in ('met','cle') or preferred_institution is null),
      updated_at timestamptz not null default now()
    )`,

    // The core entity: one artwork pinned to one intended use.
    // The work snapshot is denormalised on purpose. A retired plate still has to
    // render its own credit line and re-verify its own chain long after the
    // institution has changed or withdrawn the record.
    `create table if not exists ${s}.plates (
      id uuid primary key,
      owner_id uuid not null,
      share_code text not null unique,
      idempotency_key text,
      work_id text not null,
      institution text not null check (institution in ('met','cle')),
      title text not null check (char_length(title) between 1 and 300),
      creator_name text not null check (char_length(creator_name) between 1 and 300),
      work_snapshot jsonb not null,
      use_kind text not null check (use_kind in ('personal','editorial','educational','commercial','merchandise','broadcast')),
      jurisdiction text not null check (jurisdiction in ('us','eu','uk','ca','au','jp')),
      circulation integer not null check (circulation between 1 and 50000000),
      note text not null default '' check (char_length(note) <= 2000),
      status text not null default 'draft' check (status in ('draft','decided','retired')),
      decision text check (decision in ('approved','conditional','rejected')),
      decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
      decision_at timestamptz,
      decision_band text check (decision_band in ('clear','clear_with_credit','review','blocked')),
      decision_score real check (decision_score is null or decision_score between 0 and 100),
      decision_seal text,
      seal text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz,
      -- A decision is either wholly recorded or not started: the band, the score
      -- and the note cannot exist without a verdict.
      check (
        (decision is null and decision_note is null and decision_at is null
          and decision_band is null and decision_score is null)
        or (decision is not null and decision_at is not null and decision_band is not null
            and decision_score is not null)
      )
    )`,

    // Idempotency for agent mutations: replaying the same key returns the plate
    // that was already created instead of filing a duplicate.
    `create unique index if not exists plates_owner_idempotency
       on ${s}.plates (owner_id, idempotency_key)
       where idempotency_key is not null`,
    `create index if not exists plates_owner_recent on ${s}.plates (owner_id, created_at desc)`,
    `create index if not exists plates_owner_status on ${s}.plates (owner_id, status)`,
    `create index if not exists plates_owner_jurisdiction on ${s}.plates (owner_id, jurisdiction)`,
    `create index if not exists plates_work on ${s}.plates (work_id)`,

    // Append-only audit trail. One row per event, ordered by seq, linked to the
    // previous event by a SHA-384 seal.
    `create table if not exists ${s}.audit_events (
      id bigserial primary key,
      entity_id uuid not null,
      entity_kind text not null default 'plate' check (entity_kind = 'plate'),
      owner_id uuid not null,
      seq integer not null check (seq > 0),
      event_type text not null check (event_type in ('filed','updated','decision_recorded','retired','verified')),
      payload jsonb not null,
      prev_seal text not null check (char_length(prev_seal) = 96),
      seal text not null check (char_length(seal) = 96),
      created_at timestamptz not null,
      unique (entity_id, seq)
    )`,
    `create index if not exists audit_entity_seq on ${s}.audit_events (entity_id, seq)`,
    `create index if not exists audit_owner_recent on ${s}.audit_events (owner_id, created_at desc)`,
  ];
}

export async function applySchema(client: SqlClient, schema: string): Promise<void> {
  for (const statement of ddl(schema)) {
    await client.query(statement);
  }
}

/**
 * Upsert the term rules. Fixed ids and upsert semantics: re-running refreshes the
 * published numbers without touching a single visitor plate.
 */
export async function seedJurisdictionRules(client: SqlClient, schema: string): Promise<number> {
  for (const rule of TERM_RULES) {
    await client.query(
      `insert into ${schema}.jurisdiction_rules
         (id, label, life_plus_years, publication_cutoff_years, note, origin)
       values ($1,$2,$3,$4,$5,'catalogue')
       on conflict (id) do update set
         label = excluded.label,
         life_plus_years = excluded.life_plus_years,
         publication_cutoff_years = excluded.publication_cutoff_years,
         note = excluded.note`,
      [rule.id, rule.label, rule.lifePlusYears, rule.publicationCutoffYears, rule.note],
    );
  }
  return TERM_RULES.length;
}