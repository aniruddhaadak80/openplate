import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Tests run in Node against the real service layer and an in-memory PGlite
 * database, so no test needs a network, a database server or an API key.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The embedded database is a single shared handle, so the suite runs serially
    // rather than racing itself over one data directory.
    fileParallelism: false,
    testTimeout: 30_000,
    // Booting the embedded Postgres build and applying the schema is the slow part
    // of the suite, and a cold CI machine can be much slower than a laptop.
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});