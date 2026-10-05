import { createSqlRepository } from "./sql";
import { resolveSchema } from "./schema";
import type { Repository, SqlClient } from "./repository";

/**
 * Hosted production adapter.
 *
 * Connects to whatever DATABASE_URL points at. This is the only adapter a
 * production deployment is allowed to use, because it is the only one whose data
 * survives a redeploy and a cold start.
 */
export async function createPgRepository(databaseUrl: string): Promise<Repository> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: databaseUrl,
    // Serverless functions are short-lived and concurrent, so the pool stays small
    // and hands connections back fast.
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Neon and every other hosted provider terminates TLS.
    ssl: databaseUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  });
  pool.on("error", () => {
    // A pooled connection dropped mid-flight is routine in serverless: the pool
    // replaces it on the next query. Never let it take the request down.
  });

  const client: SqlClient = {
    query: async <T,>(text: string, params?: unknown[]) => {
      const result = await pool.query(text, params as never[]);
      return { rows: result.rows as T[] };
    },
  };

  return createSqlRepository(client, "postgres", resolveSchema());
}