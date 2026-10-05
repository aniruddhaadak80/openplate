import { expect, test, type Page } from "@playwright/test";

/**
 * The browser pass against the deployed alias.
 *
 * Kept separate from the local journey because the deployed instance has a hosted
 * database and real museum traffic, and a failure here means something different
 * from a failure locally. Nothing is mocked and no fixture is seeded: the data is
 * created through the visible controls and left as a tombstone afterwards.
 */

const consoleErrors: string[] = [];
const failedRequests: string[] = [];

function watch(page: Page, host: string) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes(host)) return; // third-party imagery is allowed to fail
    const errorText = request.failure()?.errorText ?? "";
    if (errorText.includes("ERR_ABORTED")) return; // cancelled prefetch
    if (url.includes("_rsc=")) return;
    failedRequests.push(`${url} ${errorText}`);
  });
  page.on("response", (response) => {
    if (response.url().includes(host) && response.status() >= 500) {
      failedRequests.push(`${response.url()} -> ${response.status()}`);
    }
  });
}

test("production: the three jobs to be done, end to end", async ({ page, baseURL }) => {
  const host = new URL(baseURL ?? "https://openplate-sigma.vercel.app").host;
  watch(page, host);

  // Job 1: an editor can search a real collection and pin a work to a use.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "photograph of it can still be protected",
  );
  await expect(page.getByText(/providers answered live|sealed sample/i)).toBeVisible();

  await page.getByLabel("Search two open collections").fill("jaguar");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=jaguar/, { timeout: 90_000 });
  await expect(page.locator("article").first()).toBeVisible();

  const firstCard = page.locator("article").first();
  await firstCard.getByRole("button", { name: "Pin this work" }).click();
  await firstCard.getByLabel("What will you do with it").selectOption("editorial");
  await firstCard.getByLabel("Whose term applies").selectOption("us");
  await firstCard.getByLabel("Reach").fill("15000");
  await firstCard.getByRole("button", { name: "Pin to the docket" }).click();
  await expect(page).toHaveURL(/\/plates\/[0-9a-f-]{36}/, { timeout: 120_000 });
  const plateUrl = page.url();

  // Job 2: the editor can read the itemised arithmetic and re-run it.
  await expect(page.getByText("Why this score")).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(6);
  await expect(page.getByText("Credit line", { exact: true })).toBeVisible();
  const creditLine = await page.getByText("Credit line", { exact: true }).locator("..").innerText();
  expect(creditLine.length).toBeGreaterThan(40);

  const wedge = page.locator('[role="slider"]');
  await wedge.focus();
  await wedge.press("End");
  await expect(page.getByText("This is a hypothetical")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Reset" }).click();

  // Job 3: the editor can record a decision, verify it and export it.
  await page.getByRole("radio", { name: "approved" }).check();
  await page.getByLabel("Rationale, sealed with the decision").fill("Verified against the institution record.");
  await page.getByRole("button", { name: "Seal the decision" }).click();
  await expect(page.getByText(/Decision recorded and sealed/)).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Replay the chain" }).click();
  await expect(page.getByText(/Chain intact across/)).toBeVisible({ timeout: 60_000 });

  const exportResult = await page.evaluate(async () => {
    const list = await fetch("/api/plates", { headers: { accept: "application/json" } });
    const body = await list.json();
    const shareCode = body.plates?.[0]?.shareCode;
    if (!shareCode) return { ok: false as const };
    const res = await fetch(`/api/docket/${shareCode}?format=json`);
    const docket = await res.json();
    return {
      ok: true as const,
      status: res.status,
      disposition: res.headers.get("content-disposition") ?? "",
      creditLine: docket?.clearance?.requiredCreditLine ?? "",
      integrityOk: docket?.integrity?.ok === true,
      events: docket?.integrity?.eventCount ?? 0,
    };
  });
  expect(exportResult.ok).toBe(true);
  if (exportResult.ok) {
    expect(exportResult.status).toBe(200);
    expect(exportResult.disposition).toContain("attachment");
    expect(exportResult.creditLine.length).toBeGreaterThan(40);
    expect(exportResult.integrityOk).toBe(true);
    expect(exportResult.events).toBeGreaterThanOrEqual(2);
  }

  // The agent console drives a real mutation on the deployed instance.
  // The agent console drives a real mutation on the deployed instance. This one
  // navigation waits for the network to settle, because clicking a React button
  // before hydration has attached does nothing at all and the request is silently
  // never sent. The agent page renders no imagery, so networkidle is safe here.
  await page.goto("/agent", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /file_plate/ }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Verdict (Clear|Blocked|Needs review)/).first()).toBeVisible({
    timeout: 90_000,
  });

  // Shared chrome, keyboard focus, and a mobile pass.
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: /source code on GitHub/i })).toHaveAttribute(
    "href",
    "https://github.com/aniruddhaadak80/openplate",
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const element = document.activeElement;
    return element ? window.getComputedStyle(element).outlineStyle : "";
  });
  expect(outline).not.toBe("none");

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${viewport.name} overflows by ${overflow}px`).toBeLessThanOrEqual(2);
  }

  // Retire what this run created, so the deployed docket is left as evidence.
  await page.goto(plateUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Retire this plate" }).click();
  await expect(page.getByText("This plate is retired")).toBeVisible({ timeout: 60_000 });

  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toHaveLength(0);
  expect(failedRequests, `failed requests: ${failedRequests.join(" | ")}`).toHaveLength(0);
});