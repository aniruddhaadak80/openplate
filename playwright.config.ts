import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Browser smoke test.
 *
 * Runs the primary journey through visible controls on the real production
 * bundle, against the embedded store, so it needs no database and no key. The
 * web server is started by Playwright with the one documented opt-in that permits
 * a production build to use it.
 *
 * The store lives in a fresh temporary directory per run. Reusing one directory
 * would carry plates and idempotency keys across runs, and the second run would
 * quietly exercise the replay path instead of the real one.
 */
const PORT = Number(process.env.SMOKE_PORT ?? 4318);
const PGLITE_DIR = join(tmpdir(), `openplate-smoke-${process.pid}-${Date.now()}`);

export default defineConfig({
  testDir: "./e2e",
  // Generous: the embedded Postgres build pays a large one-off boot cost, and a
  // page's server render waits on two live museum APIs.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      OPENPLATE_ALLOW_EMBEDDED: "1",
      PGLITE_DIR,
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
    },
  },
});