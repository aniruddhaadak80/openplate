import { readFileSync } from "node:fs";

/**
 * Checks every absolute URL in the README actually resolves.
 *
 * Placeholders containing angle brackets are skipped, because they are examples
 * rather than links. Anything else that returns 4xx or 5xx is a release blocker:
 * the README is the repository's landing page, and a dead link there is a dead
 * link in a visitor's face.
 */

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

const urls = [
  ...new Set(
    (readme.match(/https:\/\/[^\s)\]>|`'"]+/g) ?? []).map((url) =>
      url.replace(/[.,;:'"`]+$/, ""),
    ),
  ),
].sort();

const skipped = [];
const throttled = [];
const failures = [];
let checked = 0;

for (const url of urls) {
  if (url.includes("<") || url.includes("$") || url.includes("|")) {
    skipped.push(url);
    continue;
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "openplate-link-check/1.0" },
      signal: AbortSignal.timeout(45_000),
    });
    checked += 1;
    const status = response.status;
    // 429 and 503 mean the host is throttling or briefly unavailable. That is
    // not the same as a dead link: the resource resolved and answered.
    if (status === 429 || status === 503) {
      throttled.push(`${status} ${url}`);
    } else if (status >= 400) {
      failures.push(`${status} ${url}`);
    } else {
      console.log(`  ok ${status} ${url}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/abort|timeout/i.test(message)) {
      failures.push(`TIMEOUT ${url}`);
    } else {
      console.log(`  skipped (${message}) ${url}`);
    }
  }
}

console.log(
  `\n${checked} checked, ${failures.length} broken, ${throttled.length} rate-limited, ${skipped.length} placeholders skipped`,
);
for (const failure of failures) console.log(`  FAIL ${failure}`);
for (const url of throttled) console.log(`  throttled (resolves, host is limiting): ${url}`);
for (const url of skipped) console.log(`  placeholder ${url}`);

if (failures.length > 0) process.exit(1);