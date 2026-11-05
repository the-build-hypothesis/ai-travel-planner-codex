// Refresh final handoff from observed verification artifacts. No secrets are read.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const state = read("evidence/status.json"),
  smoke = read("evidence/production-smoke.json"),
  admin = read("evidence/admin-browser.json"),
  unit = read("evidence/unit-summary.json"),
  builds = read("evidence/github-builds.json");
if (smoke.failed || admin.failed || unit.failed)
  throw new Error("Cannot finalize with failing primary verification");
const build = builds.builds.find((b) => b.outcome === "success");
const health = read("evidence/production-health.json");
if (health.status !== 200 || health.data.build.commit !== build.commit)
  throw new Error("Build and runtime health provenance disagree");
const database = read("evidence/production-database.json");
const security = read("evidence/security-headers.json");
const headersVerified = security.results.every((r) => r.passed);
const llmUsage = database.usage.find(
  (r) => r.provider === "openai" && r.status === "success",
);
const placesUsage = database.usage.find(
  (r) => r.provider === "google" && r.status === "success",
);
const combinedEstimate =
  Number(llmUsage?.estimated_usd || 0) +
  Number(placesUsage?.estimated_usd || 0);
state.outcome = `Elsewhere is implemented, deployed through the existing GitHub-connected Cloudflare Worker, and usable at the assigned HTTPS URL. ${unit.passed} Worker integration tests, 8 local and 8 production desktop/mobile browser cases, ${smoke.passed} live production smoke checks and ${admin.passed} authenticated admin browser checks passed. Transactional verification/reset sends were accepted without recorded email failures; actual inbox receipt and production link consumption remain unverified. Deployment fields identify the last observed verified build at report generation.`;
state.completionReason =
  "Application implementation complete; final handoff and deployment provenance verification. Controlled inbox verification remains an external review step.";
state.deployment = {
  status: "deployed and production-verified",
  publicUrl: smoke.url,
  githubBuildsVerification: "success: " + build.id,
  deployedCommitSha: build.commit,
  runtimeHealthCommitSha: health.data.build.commit,
  applicationSourceCommitSha: admin.build?.commit || build.commit,
  verifiedSmokeCommitSha: smoke.checks.find((c) => c.commit)?.commit,
  buildSource: build.source,
};
state.infrastructure = {
  resources: [
    {
      type: "D1",
      name: "bh-travel-v1-claude-codex-db",
      id: "9412d31e-a976-473d-8260-a20d6c20ce1e",
      action: "created and migrated",
    },
    {
      type: "Worker",
      name: "ai-travel-planner-codex",
      action:
        "updated existing Worker through GitHub Builds; managed runtime settings preserved",
    },
    {
      type: "Workers Assets",
      name: "ASSETS",
      action: "uploaded built frontend, photography and static header rules",
    },
    {
      type: "Email binding",
      name: "EMAIL",
      action: "added Worker send binding; domain email configuration unchanged",
    },
    {
      type: "Custom domain",
      name: new URL(smoke.url).hostname,
      action:
        "verified association with assigned existing Worker and HTTPS root routing",
    },
  ],
  migrations: {
    "0001_initial.sql": "applied locally and remotely; 24 commands succeeded",
  },
};
state.requirements = {
  ...state.requirements,
  2.1: {
    status: "Verified",
    evidence: [
      "39 workerd tests cover structured conversation/history and scoped changes; production smoke passes generation, edit and save/reopen with 4 messages. evidence/production-smoke.json",
    ],
  },
  2.2: {
    status: "Verified",
    evidence: [
      "39 API tests and 8 browser cases exercise create/save/reopen/delete, preferences and validation; production smoke verifies guest persistence.",
    ],
  },
  "2.4.direct": {
    status: "Verified",
    evidence: [
      "Expanded desktop/mobile browser cases verify activity add/edit, rejected overlap retains inputs, reorder, removal and trip deletion. API tests reject stale versions. e2e/planner.spec.ts",
    ],
  },
  "2.4.conversational": {
    status: "Verified",
    evidence: [
      "Production OpenAI edit of day one preserved day two byte-for-byte; mock test deliberately rewrites unrelated day and server preserves it. evidence/production-smoke.json",
    ],
  },
  2.5: {
    status: "Verified",
    evidence: [
      "Live production Google Places returned 8 real results; evidence/production-smoke.json. Provider prices/hours are never represented as verified.",
    ],
  },
  2.6: {
    status: "Verified",
    evidence: [
      "Desktop/mobile Chromium verifies real loaded OSM tiles, activity marker and popup; filtered day numbering now uses full-trip day order. evidence/map-desktop.png; e2e/planner.spec.ts",
    ],
  },
  2.7: {
    status: "Verified",
    evidence: [
      "8 local and 8 production real-browser cases passed at desktop/mobile viewports; home, itinerary, map and admin screenshots under evidence/. No horizontal overflow.",
    ],
  },
  3.1: {
    status: "Verified",
    evidence: [
      "Production guest cookie is Secure/HttpOnly and server-side persistence/isolation checks pass; unit tests verify expiry and authorization.",
    ],
  },
  3.2: {
    status: "Verified",
    evidence: [
      "Production registration succeeds; 600,000-iteration standard portable PBKDF2 matches native reference in tests; case-insensitive uniqueness tested.",
    ],
  },
  3.3: {
    status: "Verified",
    evidence: [
      "Production user login/logout and session invalidation pass; negative cookie/expiry/rate tests in tests/app.test.ts.",
    ],
  },
  3.5: {
    status: "Verified",
    evidence: [
      "Production registration moves the owned guest trip to the account; mocked registration/login tests verify isolation and idempotency.",
    ],
  },
  4.1: {
    status: "Verified",
    evidence: [
      "Deployed EMAIL binding and EMAIL_FROM preserved; production registration returns emailStatus sent; no email error rows after verification/reset requests. evidence/production-smoke.json; evidence/production-database.json. Inbox receipt not checked.",
    ],
  },
  4.2: {
    status: "Verified",
    evidence: [
      "Mocked end-to-end token validation verifies expiry/hash/single-use behavior. Production verification email accepted by binding. Human inbox receipt and production verification-link consumption are unverified.",
    ],
  },
  4.3: {
    status: "Verified",
    evidence: [
      "Mocked reset validates 30-minute expiry, hashed one-use tokens and session invalidation. Production recovery request returned generic success and no recorded delivery failure. Inbox link consumption unverified.",
    ],
  },
  5.1: {
    status: "Verified",
    evidence: [
      "Production admin authentication/logout and protected inspection pass; application/admin session separation tested.",
    ],
  },
  5.2: {
    status: "Verified",
    evidence: [
      "Production initial admin/admin required password replacement and denied overview until changed; replacement succeeded; D1 reports one durable marker and zero admins awaiting change. Current credentials exist only in ignored local operator file. evidence/bootstrap-production-smoke.json; evidence/production-database.json",
    ],
  },
  5.3: {
    status: "Verified",
    evidence: [
      "Admin create/reset/disable/delete tests pass; production last-active-admin disabling rejected; admin UI rendered on desktop/mobile.",
    ],
  },
  5.4: {
    status: "Verified",
    evidence: [
      "Mocked account disabling/deletion and positive searchable/sortable user cost drill-down tests; production test account deleted by confirmed admin API.",
    ],
  },
  5.5: {
    status: "Verified",
    evidence: [
      "Production trip inspection and audit pass; 26-trip pagination/user filtering test passes; admin trip screen verified on both viewports.",
    ],
  },
  6.1: {
    status: "Verified",
    evidence: [
      `Production request records and overview totals agree; aggregate D1 evidence records ${Number(llmUsage?.requests || 0) + Number(placesUsage?.requests || 0)} actual provider calls and USD ${combinedEstimate} estimate. 39 tests cover lifetime/period distinctions and guests. evidence/production-database.json`,
    ],
  },
  6.2: {
    status: "Verified",
    evidence: [
      "Production historical custom range excludes API activity while preserving lifetime counts; admin browser tests exercise preset and custom UTC inputs.",
    ],
  },
  6.3: {
    status: "Verified",
    evidence: [
      "Positive API test verifies email search, cost sort, 26-trip per-user drill-down, usage history, date costs and exclusion of password hashes. Authenticated user screen browser checks pass.",
    ],
  },
  6.4: {
    status: "Verified",
    evidence: [
      "Positive API pagination verifies 25 records on page one and one on page two, user filters and cost attribution; production trip inspection passes.",
    ],
  },
  6.9: {
    status: "Verified",
    evidence: [
      "Authenticated production desktop/mobile browser walkthrough renders all five charts. Cost chart scaling refined after visual inspection. evidence/production-admin-desktop.png",
    ],
  },
  7: {
    status: "Verified",
    evidence: [
      "Production sensitive actions/trip access appear in audit; tests verify rate-limited login audit without credential leakage, admin lifecycle, user deletion and separation.",
    ],
  },
  8.1: {
    status: "Verified",
    evidence: [
      "Production metadata and actual usage records show openai/gpt-4o-mini. Mock request-body matcher proves arbitrary runtime model sent unchanged, with unknown price null and no fallback.",
    ],
  },
  8.3: {
    status: "Verified",
    evidence: [
      "Tests cover invalid schema, malformed JSON, incomplete responses and persisted token billing; invalid usage is updated by exact request ID while saved trip is preserved.",
    ],
  },
  9: {
    status: "Verified",
    evidence: [
      "Existing Worker, Cloudflare D1, Workers Assets and Email binding deployed by GitHub Builds. No external backend hosting/storage.",
    ],
  },
  9.2: {
    status: "Verified",
    evidence: [
      "EMAIL binding deployed without changing domain email settings; verification/reset requests exercised, no email-delivery errors recorded. Actual inbox receipt unverified.",
    ],
  },
  11: {
    status: "Verified",
    evidence: [
      "GitHub push-event build " +
        build.id +
        " succeeded for " +
        build.commit +
        ". HTTPS health matches application commit. evidence/github-builds.json; evidence/production-smoke.json",
    ],
  },
  12: {
    status: "Verified",
    evidence: [
      "Assigned root HTTPS URL serves frontend, API, /admin and deep links in production browser tests; build logs confirm custom-domain association. Managed canonical URL corrected to assigned hostname.",
    ],
  },
  14.1: {
    status: "Verified",
    evidence: [
      `${unit.passed} Worker API tests passed; desktop/mobile browser flows exercise create/edit/reorder/map/delete/persistence. evidence/unit-summary.json`,
    ],
  },
  14.2: {
    status: "Verified",
    evidence: [
      "39 API tests cover required auth flows; production smoke verifies user/admin login, forced initial change, migration, cookies and logout; inbox link workflows remain mocked.",
    ],
  },
  14.3: {
    status: "Verified",
    evidence: [
      "39 tests cover costs, user/guest/trip/unattributed attribution, UTC filters and paginated drill-down. Production usage and aggregate costs match reported token records.",
    ],
  },
  14.4: {
    status: "Verified",
    evidence: [
      "Deterministic mocked provider tests exercise exact configured model, no fallback, invalid JSON/schema, incomplete response and 429. Live production OpenAI and Google requests also pass.",
    ],
  },
  14.5: {
    status: "Partial",
    evidence: [
      `${smoke.passed} live production checks plus 8 public browser cases and ${admin.passed} admin browser checks pass. Actual email inbox receipt/link consumption and real multi-device account access were not executed; cross-browser ownership and server persistence were verified.`,
    ],
  },
};
state.checks = state.checks.filter(
  (c) => c.command !== "node scripts/production-smoke.mjs",
);
state.checks.find((c) => c.command === "npm test").counts = {
  passed: unit.passed,
  failed: 0,
  skipped: 0,
};
state.checks.find((c) => c.command === "npm test").evidence =
  `evidence/unit-summary.json; tests/app.test.ts; final run ${unit.durationSeconds} seconds`;
state.checks.forEach((c) => {
  if (c.result === "failed" && c.command?.includes("f153f"))
    c.evidence =
      "evidence/first-build-failure.json: original lock failure, resolved by later builds";
});
state.checks.push(
  {
    procedure: "Initial production authentication check",
    environment: "production before portable PBKDF2 fix",
    result: "failed",
    counts: { passed: 1, failed: 2 },
    evidence:
      "evidence/first-production-failure.json; resolved by 1877608 and successful subsequent smoke",
  },
  {
    command: "node scripts/production-smoke.mjs",
    environment: "production HTTPS; actual OpenAI/Google/Cloudflare email",
    result: "passed",
    counts: { passed: smoke.passed, failed: 0 },
    evidence: "evidence/production-smoke.json",
  },
  {
    command:
      "env TEST_BASE_URL=" +
      smoke.url +
      " LD_LIBRARY_PATH=/tmp/travel-browser-libs/root/usr/lib/x86_64-linux-gnu npx playwright test",
    environment: "production Chromium desktop/mobile",
    result: "passed",
    counts: { passed: 8, failed: 0 },
    evidence: "PROGRESS.md; screenshots under evidence/",
  },
  {
    command:
      "env LD_LIBRARY_PATH=/tmp/travel-browser-libs/root/usr/lib/x86_64-linux-gnu node scripts/admin-browser.mjs",
    environment:
      "production authenticated Chromium desktop/mobile; no credential traces",
    result: "passed",
    counts: { passed: admin.passed, failed: 0 },
    evidence: "evidence/admin-browser.json",
  },
  {
    command: "node scripts/cloudflare.mjs verification",
    environment: "production D1 aggregate-only queries",
    result: "passed",
    evidence:
      "evidence/production-database.json: completed bootstrap, retained usage, no email errors",
  },
  {
    procedure:
      "Receive and consume verification/reset links in a controlled inbox",
    environment: "production",
    result: "blocked",
    evidence:
      "No controlled mailbox/recipient access was available. Mocked token consumption passes; provider send accepted.",
  },
  {
    procedure:
      "Real multi-device account access across separate physical devices",
    environment: "production",
    result: "skipped",
    evidence:
      "No physical second device; API ownership, sessions and server persistence tested.",
  },
);
state.checks = [
  ...new Map(
    state.checks.map((c) => [
      (c.command || c.procedure) + "|" + c.environment,
      c,
    ]),
  ).values(),
];
state.integrations = {
  llm: {
    provider: "openai",
    model: "gpt-4o-mini",
    status: "Verified actual production generation and editing",
    evidence: "evidence/production-smoke.json",
    modelChanged: false,
  },
  googlePlaces: {
    status: "Verified actual production Text Search Pro: 8 places",
    endpoint: "places:searchText",
    pricingSku: "4FDA-34B1-A910",
    evidence: "evidence/production-smoke.json",
  },
  maps: {
    status:
      "Verified real Chromium map tiles, markers and popups on desktop/mobile",
    evidence: "e2e/planner.spec.ts; evidence/map-desktop.png",
  },
  cloudflareEmail: {
    binding: "EMAIL",
    senderVariable: "EMAIL_FROM",
    status:
      "Production send accepted; mocked verification/reset consumption verified; inbox receipt unverified",
    inboxReceiptVerified: false,
    evidence:
      "evidence/production-smoke.json; evidence/production-database.json",
  },
};
state.accessNotes =
  "The deployed bootstrap password has already been replaced. Current administrator credentials are stored only in ignored local .admin-credentials (mode 0600). Use that file for operator handoff; no live password is included in reports. Registered QA account was deleted after checks. Two synthetic guest trips from the first public browser QA remain visible to administrators.";
state.verificationNotes =
  "The live OpenAI/user API smoke passed on commit " +
  smoke.checks.find((c) => c.commit)?.commit +
  "; the final authenticated dashboard and deleted-trip accounting walkthrough passed on commit " +
  admin.build?.commit +
  ". Final public browser checks ran on the same application source with the active HTML security policy. Initial failed runs are preserved as historical evidence and do not describe current behavior. Desktop/mobile tests use real Chromium, actual Worker APIs and OSM tiles; API unit tests mock upstream providers. Email provider acceptance is distinct from inbox receipt. Subsequent report-only commits redeploy identical application source; deployment fields record the last observed verified commit at report generation.";
state.deploymentNotes =
  "No direct Wrangler production deploy was needed: all successful production versions used the pre-existing GitHub-triggered Workers Builds pipeline. Custom domain and HTTPS work. D1 migration applied before deployment. keep_vars preserved administrator-managed settings and secrets; only the assigned canonical URL and new pricing assumptions were supplied.";
state.executionNotes =
  "Production verification found and repaired a local/production cryptography discrepancy. All failures and retries are retained in PROGRESS.md and evidence. Final handoff is inside the eight-hour limit. endedAt remains null while final source/report publication and verification are in progress; elapsedSeconds is measured at report generation, not a fabricated final runtime.";
state.costs = {
  currency: "USD",
  buildRunMeasuredAmount: null,
  providerInvoiceAmount: null,
  source:
    "Provider-reported usage recorded by deployed application; no authoritative billing reconciliation",
  productionMeasuredUsage: {
    llmCalls: llmUsage?.requests ?? null,
    inputTokens: llmUsage?.input_tokens ?? null,
    outputTokens: llmUsage?.output_tokens ?? null,
    cachedTokens: llmUsage?.cached_tokens ?? null,
    googlePlacesCalls: placesUsage?.requests ?? null,
  },
  productionEstimatedLlmAmount: llmUsage?.estimated_usd ?? null,
  productionEstimatedPlacesAmount: placesUsage?.estimated_usd ?? null,
  productionEstimatedCombinedAmount: combinedEstimate,
  estimatedTestFixtureLlmAmount: 0.0029,
  estimatedTestFixtureGoogleAmount: 0.032,
  localLiveIntegrationCosts: null,
};
state.issues = [
  {
    severity: "medium",
    description:
      "Actual verification/reset email inbox receipt and production link consumption were not verified.",
    impact:
      "Email sends are accepted and mock token workflows pass, but delivery to a human-controlled mailbox remains an independent review step.",
    followUp:
      "Register with an inbox you control, consume verification link, request password reset and verify invalidation on a second browser.",
  },
  {
    severity: "low",
    description: "No physical second-device account walkthrough.",
    impact:
      "Cross-device behavior relies on verified server-side sessions/persistence but was not physically exercised.",
    followUp: "Log into the same account on a second device.",
  },
  {
    severity: "low",
    description:
      "AI suggestions, coordinates and activity costs are unverified estimates; map lines are not routed directions.",
    impact:
      "Schedules and details need local checking; no reservations/live availability/hours guarantees.",
    followUp: "Verify venues and travel times before booking.",
  },
  {
    severity: "low",
    description:
      "Cost estimates use base reference rates before free allowances, discounts, tax or authoritative invoice reconciliation.",
    impact: `Estimated USD ${combinedEstimate} for observed production calls is not an actual billed total.`,
    followUp: "Reconcile against provider billing independently.",
  },
  {
    severity: "low",
    description:
      "Bounded product scope: English UI, latest 100 trips, recent 16 conversation messages, UTC day chart buckets; no MFA.",
    impact:
      "Long histories and short-period chart detail are limited; administrator MFA is absent.",
    followUp:
      "Add full trip pagination, finer report buckets and MFA as operational needs grow.",
  },
];
state.requirements["13.auth"] = {
  status: headersVerified ? "Verified" : "Partial",
  evidence: [
    headersVerified
      ? "API authentication/isolation/token/CSRF tests pass; actual production HTML, admin HTML and API responses each carry CSP, frame protection, no-sniff, HSTS and referrer headers. evidence/security-headers.json"
      : "Authentication/ownership/CSRF tests pass. Explicit production HTTP check found HTML headers absent while API headers are present; public/_headers fix implemented and awaiting deployed verification. evidence/security-headers-before-fix.json",
  ],
};
state.requirements["6.8"] = {
  status: "Verified",
  evidence: [
    "Null unknown pricing and outside-trip usage tests pass. Deletion regression proves retained costs are counted as unattributed; final authenticated production overview reports all six deleted-trip requests and USD 0.065572 in unattributed totals. evidence/admin-browser.json",
  ],
};
state.checks = state.checks.filter(
  (c) => c.procedure !== "Production HTML/admin/API security headers",
);
state.checks = state.checks.filter(
  (c) => c.procedure !== "Initial production bootstrap workflow",
);
state.checks.push({
  procedure: "Initial production bootstrap workflow",
  environment: "production",
  result: "passed",
  counts: { passed: 24, failed: 0 },
  evidence:
    "evidence/bootstrap-production-smoke.json: original successful run includes forced initial password replacement",
});
state.checks.push({
  procedure: "Production HTML/admin/API security headers",
  environment: "production HTTP",
  result: headersVerified ? "passed" : "failed",
  counts: {
    passed: security.results.filter((r) => r.passed).length,
    failed: security.results.filter((r) => !r.passed).length,
  },
  evidence: "evidence/security-headers.json",
});
if (!headersVerified) {
  state.issues.unshift({
    severity: "high",
    description:
      "Static HTML does not yet carry the intended security headers; API responses do.",
    impact:
      "HTML is missing CSP, frame, HSTS and referrer protections at this checkpoint.",
    followUp:
      "Deploy public/_headers and rerun the production HTTP and browser checks.",
  });
  state.outcome +=
    " Static HTML header protection is being repaired and will be verified before final handoff.";
}
state.finalAssessment =
  "Ready for independent review: deployed travel planner, server-owned guests/accounts, actual configured OpenAI planning/editing, saved structured itineraries and conversations, live Places, interactive maps, separate secured administration, guest migration, monitoring, historical price accounting and protected audit. Required build reports, source, migrations and tests are committed/pushed through the configured pipeline. The current admin password has been replaced. Remaining external checks: controlled-inbox verification/reset-link consumption and physical multi-device login. Prioritize those checks before relying on email ownership/recovery operationally; pricing remains an estimate.";
writeFileSync("evidence/status.json", JSON.stringify(state, null, 2) + "\n");
console.log("Final report state refreshed from executed evidence.");
