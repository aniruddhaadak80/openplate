#!/usr/bin/env node
/**
 * Boots the production build against the embedded store and runs the live
 * verifier against it.
 *
 * This is the local rehearsal of what Phase 8 does on the deployed alias: the
 * same script, the same assertions, the same real HTTP. It exists so a broken
 * deployment is discovered on a laptop rather than after a push.
 *
 *   node scripts/verify-local.mjs
 */

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.VERIFY_PORT ?? 4319);
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * Refuse to run against a port something else already owns.
 *
 * Without this, an orphaned server from an earlier run answers the health check
 * and the whole verification silently passes against a stale build.
 */
try {
  const probe = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
  if (probe.status) {
    console.error(`Port ${PORT} is already serving (HTTP ${probe.status}).`);
    console.error("Stop that process, or set VERIFY_PORT to a free port.");
    process.exit(2);
  }
} catch {
  // Nothing listening: exactly what this script needs.
}

const dataDir = mkdtempSync(join(tmpdir(), "openplate-verify-"));

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    // The one documented exception that lets a production build run on the
    // embedded store. Data is not durable, which is exactly why a real deployment
    // without DATABASE_URL refuses to boot instead.
    OPENPLATE_ALLOW_EMBEDDED: "1",
    PGLITE_DIR: dataDir,
    NEXT_PUBLIC_SITE_URL: BASE,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

function stop() {
  if (!server.killed) server.kill("SIGTERM");
}

process.on("exit", stop);

async function waitForReady(timeoutMs = 90_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/health`, {
        headers: { accept: "application/json" },
      });
      if (response.status === 200 || response.status === 503) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return false;
}

const ready = await waitForReady();
if (!ready) {
  console.error("The server did not become ready. Its output was:\n");
  console.error(serverLog);
  stop();
  process.exit(1);
}

console.log(`Server ready on ${BASE}\n`);

const verifier = spawn(process.execPath, ["scripts/verify-live.mjs"], {
  env: { ...process.env, BASE_URL: BASE, REQUIRE_DURABLE: "0" },
  stdio: "inherit",
});

verifier.on("exit", (code) => {
  stop();
  process.exit(code ?? 1);
});