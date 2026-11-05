import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const origin = JSON.parse(readFileSync("wrangler.jsonc", "utf8")).vars
  .APP_PUBLIC_URL;
const creds = JSON.parse(readFileSync(".admin-credentials", "utf8"));
const browser = await chromium.launch();
const results = [];
const health = await (await fetch(origin + "/api/health")).json();
for (const viewport of [
  { name: "desktop", width: 1440, height: 1080 },
  { name: "mobile", width: 390, height: 844 },
]) {
  const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(origin + "/admin");
    await page.getByLabel("Username").fill(creds.username);
    await page.getByLabel("Password", { exact: true }).fill(creds.password);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await page
      .getByRole("heading", { name: "Every journey, accounted for." })
      .waitFor();
    await page.getByText("Travelers · lifetime", { exact: true }).waitFor();
    await page.screenshot({
      path: `evidence/production-admin-${viewport.name}.png`,
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    const overview = await (
      await context.request.get(origin + "/api/admin/overview")
    ).json();
    results.push({
      check: `${viewport.name} administrator dashboard/charts`,
      passed:
        !overflow &&
        errors.length === 0 &&
        overview.costs.unattributed_requests > 0 &&
        overview.costs.unattributed_cost > 0,
      overflow,
      errors,
      accounting: overview.costs,
    });
    for (const [label, heading] of [
      ["Travelers", "Your travel community."],
      ["All journeys", "A world of journeys."],
      ["Usage & costs", "Usage & estimated costs."],
      ["Administrators", "The people behind the plans."],
      ["Audit trail", "A clear record."],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      results.push({ check: `${viewport.name} ${label} screen`, passed: true });
    }
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page.getByLabel("Reporting period").selectOption("Last hour");
    await page.getByText("Travelers · lifetime", { exact: true }).waitFor();
    await page.getByLabel("Reporting period").selectOption("Custom");
    await page.getByLabel("Start (UTC)").waitFor();
    results.push({
      check: `${viewport.name} period selector and custom inputs`,
      passed: true,
    });
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.getByRole("heading", { name: "Behind the journeys." }).waitFor();
    results.push({ check: `${viewport.name} admin logout`, passed: true });
  } catch (e) {
    results.push({
      check: `${viewport.name} browser verification`,
      passed: false,
      error: e.message.replaceAll(creds.password, "[redacted]"),
    });
  }
  await context.close();
}
await browser.close();
writeFileSync(
  "evidence/admin-browser.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      build: health.build,
      environment:
        "production real Chromium, no traces or credential screenshots",
      results,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => !r.passed)) process.exitCode = 1;
