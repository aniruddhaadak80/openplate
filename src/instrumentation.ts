/**
 * Server startup hook.
 *
 * The embedded Postgres build used for local development and tests pays a large
 * one-off cost the first time it boots, and the default adapter would otherwise
 * charge that whole cost to whichever request happened to arrive first. Doing it
 * here moves it into server startup, where a visitor never waits for it.
 *
 * On Vercel this also warms the connection pool before the first real request,
 * which is worth having. A failure here is deliberately swallowed: the store is
 * opened again, lazily, on first use, and the health endpoint reports the truth
 * about whether that succeeded.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { getRepository } = await import("./lib/db");
    const repository = await getRepository();
    await repository.init();
  } catch {
    // Never block startup on the store. If it is genuinely unavailable, the first
    // request that needs it will fail loudly and /api/health will say why.
  }
}