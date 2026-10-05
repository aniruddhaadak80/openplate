import type { Repository } from "./repository";

/**
 * Adapter selection.
 *
 * Production REQUIRES a hosted Postgres and fails loudly without one. Local
 * development and tests fall back to the embedded PGlite build so the project
 * runs with zero environment variables. A Vercel deployment without DATABASE_URL
 * therefore fails its own health check rather than quietly accepting writes into
 * storage that a cold start would erase.
 */

const GLOBAL_KEY = "__openPlateRepository";
type GlobalWithRepo = typeof globalThis & { [GLOBAL_KEY]?: Repository };

let cached: Repository | null = null;
let pending: Promise<Repository> | null = null;

export async function getRepository(): Promise<Repository> {
  if (cached) return cached;
  const globalScope = globalThis as GlobalWithRepo;
  if (globalScope[GLOBAL_KEY]) {
    cached = globalScope[GLOBAL_KEY];
    return cached;
  }
  if (pending) return pending;

  pending = (async () => {
    const url = process.env.DATABASE_URL?.trim();
    if (url) {
      const { createPgRepository } = await import("./pg");
      const repository = await createPgRepository(url);
      await repository.init();
      cached = repository;
      globalScope[GLOBAL_KEY] = repository;
      return repository;
    }

    if (process.env.NODE_ENV === "production") {
      // The single exception is an explicit opt-in used by the local production
      // build in the browser smoke test. It is never set in a real deployment, so
      // a deployment that has lost its database fails loudly instead of accepting
      // writes into volatile storage.
      if (process.env.OPENPLATE_ALLOW_EMBEDDED !== "1") {
        throw new Error(
          "DATABASE_URL is not set. OpenPlate requires a hosted Postgres database in production; see .env.example. Refusing to fall back to the embedded store, whose data does not survive a cold start.",
        );
      }
    }

    const { createPgliteRepository } = await import("./pglite");
    const repository = await createPgliteRepository();
    await repository.init();
    cached = repository;
    globalScope[GLOBAL_KEY] = repository;
    return repository;
  })();

  return pending;
}

/** True when the running process is backed by storage that survives a redeploy. */
export function isDurableEnvironment(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
