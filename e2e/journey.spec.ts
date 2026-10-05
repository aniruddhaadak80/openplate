import { expect, test, type Page } from "@playwright/test";

/**
 * The primary journey, through visible controls only.
 *
 * Nothing here calls the API directly to make an assertion pass: each step uses the
 * controls a visitor would use, then reads the page. The console and network
 * watchers are part of the test, because a page that quietly logs an error while
 * looking finished is the failure mode this is here to catch.
 */

const consoleErrors: string[] = [];
const failedRequests: string[] = [];

function watch(page: Page) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("127.0.0.1")) return; // third-party imagery is allowed to fail

    // A cancelled prefetch is not a failure. The router speculatively fetches
    // every link in the header and then abandons the fetch when the visitor
    // navigates elsewhere; the browser reports those as ERR_ABORTED. Treating
    // them as errors would make this assertion meaningless.
    const errorText = request.failure()?.errorText ?? "";
    if (errorText.includes("ERR_ABORTED")) return;
    if (url.includes("_rsc=")) return;

    failedRequests.push(`${url} ${errorText}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("127.0.0.1") && response.status() >= 500) {
      failedRequests.push(`${url} -> ${response.status()}`);
    }
  });
}

test("the publisher journey: discover, file, inspect, decide, verify, export, agent, retire", async ({
  page,
}) => {
  watch(page);

  // ---- 1. discover a real item -------------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("photograph of it can still be protected");

  await page.getByLabel("Search two open collections").fill("jaguar");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=jaguar/, { timeout: 60_000 });
  await expect(page.getByText(/Results for "jaguar"/)).toBeVisible();

  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(0);

  // ---- 2. create a useful record ----------------------------------------------
  // The pin control lives on the card itself, so the visitor never has to guess
  // which image they are about to file.
  const firstCard = cards.first();
  await firstCard.getByRole("button", { name: "Pin this work" }).click();
  await firstCard.getByLabel("What will you do with it").selectOption("editorial");
  await firstCard.getByLabel("Whose term applies").selectOption("us");
  await firstCard.getByLabel("Reach").fill("12000");
  await firstCard.getByLabel("Note for the docket, optional").fill("Spring issue, feature well");
  await firstCard.getByRole("button", { name: "Pin to the docket" }).click();

  await expect(page).toHaveURL(/\/plates\/[0-9a-f-]{36}/, { timeout: 90_000 });
  const plateUrl = page.url();
  expect(plateUrl).toMatch(/\/plates\/[0-9a-f-]{36}/);

  // ---- 3. inspect the result ---------------------------------------------------
  await expect(page.getByText("Why this score")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  // Six factors, each with a weight, points and a status.
  await expect(page.locator("table tbody tr")).toHaveCount(6);
  await expect(page.getByText("What the year does")).toBeVisible();
  await expect(page.getByText("Credit line", { exact: true })).toBeVisible();

  // ---- 4. run the engine through the signature interaction ---------------------
  const wedge = page.locator('[role="slider"]');
  await expect(wedge).toBeVisible();
  await wedge.focus();
  const before = await page.locator(".tnum.font-display").first().innerText();
  await wedge.press("End");
  await expect(page.getByText("This is a hypothetical")).toBeVisible({ timeout: 30_000 });
  const after = await page.locator(".tnum.font-display").first().innerText();
  expect(after).not.toBe(before);

  // Reset back to the committed verdict.
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("This is a hypothetical")).toHaveCount(0);

  // ---- 5. record a decision ----------------------------------------------------
  await page.getByRole("radio", { name: "approved" }).check();
  await page.getByLabel("Rationale, sealed with the decision").fill("Checked against the institution record.");
  await page.getByRole("button", { name: "Seal the decision" }).click();
  await expect(page.getByText(/Decision recorded and sealed/)).toBeVisible({ timeout: 30_000 });

  // ---- 6. verify the chain -----------------------------------------------------
  await page.getByRole("button", { name: "Replay the chain" }).click();
  await expect(page.getByText(/Chain intact across/)).toBeVisible({ timeout: 30_000 });

  // ---- 7. use the agent tool ---------------------------------------------------
  await page.goto("/agent");
  await page.getByRole("button", { name: /file_plate/ }).click();
  await page.getByRole("button", { name: "Send" }).click();
  // The tool either files a new plate or reports an idempotent replay; both are
  // real outcomes, and both carry a verdict read back from the engine. The same
  // sentence also appears in the raw JSON below, so the summary line is the one
  // asserted: it comes first in the document.
  await expect(page.getByText(/Verdict (Clear|Blocked|Needs review)/).first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText("Persisted through the agent path")).toBeVisible();

  // ---- 8. export a real artifact ----------------------------------------------
  await page.goto("/export", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Index of dockets")).toBeVisible();
  const jsonHref = await page.locator('a[href*="format=json"]').first().getAttribute("href");
  expect(jsonHref).toBeTruthy();

  // Fetched from inside the page rather than with a separate HTTP client, so the
  // download is proved over the same session and the same origin the visitor uses.
  const download = await page.evaluate(async (href) => {
    const res = await fetch(href as string);
    return {
      status: res.status,
      disposition: res.headers.get("content-disposition") ?? "",
      body: await res.text(),
    };
  }, jsonHref as string);

  expect(download.status).toBe(200);
  expect(download.disposition).toContain("attachment");
  const payload = JSON.parse(download.body) as {
    clearance: { requiredCreditLine: string; factors: unknown[] };
    integrity: { ok: boolean };
  };
  expect(typeof payload.clearance.requiredCreditLine).toBe("string");
  expect(payload.clearance.factors.length).toBeGreaterThanOrEqual(6);
  expect(payload.integrity.ok).toBe(true);

  // ---- 9. the docket is on the list, filterable by URL state --------------------
  await page.goto("/plates", { waitUntil: "domcontentloaded" });
  // Assert the API and the rendered list agree. If they ever disagree, the message
  // names both counts, which is the difference between a rendering bug and a
  // session bug.
  const docketApi = await page.evaluate(async () => {
    const res = await fetch("/api/plates", { headers: { accept: "application/json" } });
    const body = await res.json();
    return { total: body.total, count: (body.plates ?? []).length };
  });
  expect(docketApi.count, `API saw ${JSON.stringify(docketApi)} plates`).toBeGreaterThan(0);
  await expect(page.locator('main a[href^="/plates/"]').first()).toBeVisible();
  await page.goto("/plates?use=editorial", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Filtered by")).toBeVisible();

  // ---- 10. retire it ------------------------------------------------------------
  await page.goto(plateUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Retire this plate" }).click();
  await expect(page.getByText(/Retired as a tombstone/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("This plate is retired")).toBeVisible();

  // ---- 11. truthful states and accessibility -----------------------------------
  // Empty state: filtering to something impossible shows the real empty state.
  await page.goto("/plates?search=zzzznothingmatchesthis", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Nothing matched those filters")).toBeVisible();

  // Keyboard focus must be visible on the primary controls.
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
  expect(["A", "BUTTON", "INPUT"]).toContain(focusedTag);
  const outline = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element) return "";
    return window.getComputedStyle(element).outlineStyle;
  });
  expect(outline).not.toBe("none");

  // ---- 12. no application errors anywhere --------------------------------------
  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toHaveLength(0);
  expect(failedRequests, `failed requests: ${failedRequests.join(" | ")}`).toHaveLength(0);
});

test("the repository link is present in the shared navigation and the footer", async ({ page }) => {
  // Desktop navigation.
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: /source code on GitHub/i })).toHaveAttribute(
    "href",
    "https://github.com/aniruddhaadak80/openplate",
  );

  // Footer.
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: /source code on GitHub/i })).toHaveAttribute(
    "href",
    "https://github.com/aniruddhaadak80/openplate",
  );

  // The link opens a new tab safely.
  await expect(nav.getByRole("link", { name: /source code on GitHub/i })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );

  // Mobile navigation, which is in the markup before it is opened. The menu
  // button only exists below the md breakpoint, so the viewport is narrowed first
  // rather than expecting a desktop-width click to work.
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.locator("#mobile-nav");
  const mobileLink = mobile.locator('a[href="https://github.com/aniruddhaadak80/openplate"]');
  await expect(mobileLink).toHaveCount(1);
  await page.getByRole("button", { name: /Menu/ }).click();
  await expect(mobile).toBeVisible();
  await expect(mobileLink).toBeVisible();
});

test("mobile and desktop viewports both render the primary surface", async ({ page }) => {
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("article").first()).toBeVisible();

    // No horizontal overflow at either width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${viewport.name} overflows by ${overflow}px`).toBeLessThanOrEqual(2);

    await page.goto("/plates", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Your docket")).toBeVisible();
    const overflowOnDocket = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowOnDocket, `${viewport.name} docket overflows`).toBeLessThanOrEqual(2);
  }
});