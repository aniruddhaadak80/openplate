import { createSqlRepository } from "./sql";
import { resolveSchema } from "./schema";
import type { Repository, SqlClient } from "./repository";

/**
 * Embedded zero-configuration adapter, for local development and tests.
 *
 * PGlite is Postgres compiled to WebAssembly, so the schema, check constraints,
 * partial unique indexes and transactions exercised locally are the same ones
 * that run in production. The only difference is durability: the data lives in a
 * directory rather than a hosted instance, which is precisely why it is refused
 * in production by the selector in ./index.ts.
 */
export async function createPgliteRepository(directory?: string): Promise<Repository> {
  const { PGlite } = await import("@electric-sql/pglite");
  const target = directory ?? process.env.PGLITE_DIR ?? ".pglite";
  // One embedded instance owns the data directory and is deliberately never
  // closed: closing it would destroy the handle this repository needs.
  const client = target === ":memory:" ? new PGlite() : new PGlite(target);

  const sql: SqlClient = {
    query: async <T,>(text: string, params?: unknown[]) => {
      const result = await client.query<T>(text, params as never[]);
      return { rows: result.rows ?? [] };
    },
  };

  return createSqlRepository(sql, "pglite", resolveSchema());
}