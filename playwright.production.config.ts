import { defineConfig, devices } from "@playwright/test";
/**
 * The deployed-instance browser pass.
 *
 * Separate from the local smoke configuration because there is no web server to
 * start and no embedded store: this runs against the real production alias, with a
 * real hosted database, so a failure here means something different from a local
 * one. The production URL is read from PRODUCTION_URL rather than guessed.
 */

const production = (process.env.PRODUCTION_URL ?? "https://openplate-sigma.vercel.app").replace(/\/+$/, "");

export default defineConfig({
  testDir: "./e2e-prod",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: production,
    trace: "retain-on-failure",
    actionTimeout: 45_000,
    navigationTimeout: 120_000,
  },
  projects: [{ name: "chromium-production", use: { ...devices["Desktop Chrome"] } }],
});
