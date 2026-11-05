import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const read = (p, fallback) =>
  existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
const state = read("evidence/status.json", {}),
  generatedAt = new Date().toISOString();
const definitions = [
  [
    "2.1",
    "Contextual conversation and persisted history",
    "Verified",
    "tests/app.test.ts: structured itinerary/history test; scoped modification test; mock OpenAI.",
  ],
  [
    "2.2",
    "Create, validate, save, reopen and delete trips",
    "Verified",
    "tests/app.test.ts: guest persistence and invalid input tests.",
  ],
  [
    "2.2.preferences",
    "Dates, duration, party, child ages, budget, pace and requirements",
    "Verified",
    "Trip schema tests; frontend input screens; dates are optional.",
  ],
  [
    "2.3",
    "Structured itinerary with practical schedule validation",
    "Verified",
    "Tests reject overlaps, midnight overflow, duplicate IDs and incomplete coordinates. Geographic suitability is model-generated and requires human review.",
  ],
  [
    "2.4.direct",
    "Direct activity add/remove/edit/reorder and optimistic concurrency",
    "Verified",
    "API itinerary edit test preserves unrelated days and rejects stale versions. Browser controls require browser verification.",
  ],
  [
    "2.4.conversational",
    "Conversational modifications preserve unrelated itinerary content",
    "Verified",
    "Single-day scope tests preserve unrelated days; broader change quality depends on model.",
  ],
  [
    "2.5",
    "Google place research and clearly labeled estimates",
    "Implemented but Unverified",
    "Google Pro endpoint mocked successfully; external details contain names, addresses, coordinates and Maps links; no hours/prices claimed verified.",
  ],
  [
    "2.6",
    "Interactive map and day-linked locations",
    "Implemented but Unverified",
    "Leaflet/OpenStreetMap implementation; pending browser tile/marker checks.",
  ],
  [
    "2.7",
    "Polished responsive accessible travel UI",
    "Implemented but Unverified",
    "Production build and strict frontend typecheck passed; pending real-browser visual check.",
  ],
  [
    "3.1",
    "Server-persisted secure guest access",
    "Verified",
    "Guest cookie/persistence and cross-guest tests pass.",
  ],
  [
    "3.2",
    "Email/password registration and case-insensitive uniqueness",
    "Verified",
    "Registration/migration/duplicate email test; PBKDF2 tests.",
  ],
  [
    "3.3",
    "Secure login/logout, persistent expiring sessions and rate limits",
    "Verified",
    "Session expiry, login/logout, cookie attributes and limiter tests.",
  ],
  [
    "3.4",
    "Registered account profile, password, trips and authorization",
    "Verified",
    "Profile/password and cross-user isolation tests. Production multi-device test not executed.",
  ],
  [
    "3.5",
    "Eligible guest-to-account migration without duplication",
    "Verified",
    "Registration and login migration tests; other guest trips remain isolated.",
  ],
  [
    "4.1",
    "Cloudflare Email Service binding and runtime sender",
    "Implemented but Unverified",
    "Wrangler EMAIL binding and send helper; production provider delivery not yet tested.",
  ],
  [
    "4.2",
    "Single-use expiring email verification and resend",
    "Verified",
    "Mocked delivery verification token used once; resend limits implemented.",
  ],
  [
    "4.3",
    "Non-enumerating 30-minute password recovery",
    "Verified",
    "Mocked reset success, expiry, token hash and session invalidation tests. No live inbox check.",
  ],
  [
    "4.4",
    "Graceful email delivery/configuration errors",
    "Verified",
    "Registration delivery failure and missing forgot-password binding tests; responses omit internal provider error.",
  ],
  [
    "5.1",
    "Separate administrative identities, sessions and authorization",
    "Verified",
    "Application/admin sessions cannot substitute; login limiter and expiration implemented.",
  ],
  [
    "5.2",
    "Bootstrap admin/admin with mandatory password change",
    "Verified",
    "Forced replacement and last-admin DB protection tests; one-time operator initialization marker implemented.",
  ],
  [
    "5.3",
    "Administrator creation/reset/disable/delete",
    "Verified",
    "Account lifecycle tests; DB triggers protect last active admin.",
  ],
  [
    "5.4",
    "Search/inspect/disable/enable/delete application users",
    "Verified",
    "Protected user disabling/deletion tests; paginated search and user drill-down implemented.",
  ],
  [
    "5.5",
    "Inspect all guest/user trips, timestamps, costs and history",
    "Verified",
    "Administrative trip inspection audited in test; list pagination and filters implemented.",
  ],
  [
    "6.1",
    "Lifetime and period overview metrics include guests",
    "Verified",
    "Date-filtered aggregate test includes guest AI usage and separates lifetime counts.",
  ],
  [
    "6.2",
    "Shared presets and custom UTC reporting range",
    "Verified",
    "Server date filtering and UTC normalization tests. UI presets implemented.",
  ],
  [
    "6.3",
    "Searchable/sortable user metrics and detail drill-down",
    "Implemented but Unverified",
    "Bound SQL and frontend drill-down; browser evidence pending.",
  ],
  [
    "6.4",
    "Trip metrics with default newest-first list",
    "Implemented but Unverified",
    "Paginated SQL with selected-range provider costs and trip inspection.",
  ],
  [
    "6.5",
    "Per-request usage attribution/status/tokens/cost/duration",
    "Verified",
    "OpenAI and Google mocked request usage tests; secrets never in records.",
  ],
  [
    "6.6",
    "Model-specific cached/input/output LLM token accounting",
    "Verified",
    "1000 input, 200 cached, 500 output with fixture rates gives USD 0.0029; price snapshots tested.",
  ],
  [
    "6.7",
    "Endpoint-specific Google Pro request accounting",
    "Verified",
    "One Text Search Pro fixture request at USD 32/1000 yields USD 0.032; guest/trip attribution tested.",
  ],
  [
    "6.8",
    "Estimated costs, historical assumptions and unattributed activity",
    "Verified",
    "Null unknown pricing and non-trip Google request tests; historical JSON snapshots. No invoice reconciliation.",
  ],
  [
    "6.9",
    "Cost/trip/user/token/Google usage visualizations",
    "Implemented but Unverified",
    "All five UTC day-grouped charts implemented; browser rendering pending.",
  ],
  [
    "6.10",
    "API failures, sanitized app errors, volume and latency",
    "Verified",
    "Provider failures recorded with status/duration in tests; overview SQL covers latency and failure count.",
  ],
  [
    "7",
    "Append-only-through-API sensitive admin audit logging",
    "Verified",
    "Login, account modification, user deletion and trip inspection records tested; no mutation endpoint exists.",
  ],
  [
    "8.1",
    "Runtime provider/model selection with no fallback",
    "Verified",
    "Unsupported provider/missing model tests; configured Worker metadata says openai/gpt-4o-mini.",
  ],
  [
    "8.2",
    "Server-side provider abstraction and normalized errors",
    "Verified",
    "AI adapter and Google adapter tests mock upstream HTTP; no credentials sent to frontend.",
  ],
  [
    "8.3",
    "Provider-independent structured validation before saving",
    "Verified",
    "Malformed structured result test leaves saved trip unchanged and records invalid usage.",
  ],
  [
    "8.4",
    "Timeouts, bounded retries, rate limits and cost reporting",
    "Verified",
    "Zero automatic retries; explicit user retries, 90s AI timeout, 15s Places timeout, provider 429 test.",
  ],
  [
    "9",
    "Cloudflare-only hosting and backend infrastructure",
    "Partial",
    "D1 created/migrated; Worker configuration generated; deployment not verified yet.",
  ],
  [
    "9.1",
    "Existing Worker, project-prefixed D1 and migrations",
    "Verified",
    "Cloudflare operator provision and remote Wrangler migration succeeded.",
  ],
  [
    "9.2",
    "Configured transactional email integration",
    "Implemented but Unverified",
    "EMAIL binding declared; no domain configuration altered; actual provider send pending.",
  ],
  [
    "10",
    "Preserve administrator-managed secrets and LLM configuration",
    "Verified",
    "Worker metadata inspected without secret retrieval; keep_vars true; no secret-management commands used.",
  ],
  [
    "11",
    "Commit/push and GitHub-triggered Workers Builds deployment",
    "Not Started",
    "Source not pushed at this checkpoint.",
  ],
  [
    "12",
    "Assigned root URL, custom domain, HTTPS and email URL",
    "Implemented but Unverified",
    "Wrangler custom-domain route and assigned APP_PUBLIC_URL configured; production verification pending.",
  ],
  [
    "13.auth",
    "Passwords, token hashing, ownership and CSRF/security headers",
    "Verified",
    "Security primitives, cross-origin rejection, guest/user/admin separation and token tests passed.",
  ],
  [
    "13.1",
    "Server-side safeguards for billable API abuse",
    "Verified",
    "IP/account limits, input lengths, bounded output and timeouts implemented; limiter test passed.",
  ],
  [
    "13.2",
    "Server-side administrative protection and confirmations",
    "Verified",
    "Forced change/identity isolation/confirmation/last-admin tests.",
  ],
  [
    "14.1",
    "Application automated tests",
    "Verified",
    "tests/app.test.ts: trip creation/validation/generation/edit/persistence/history/guest/migration executed.",
  ],
  [
    "14.2",
    "Authentication automated tests",
    "Verified",
    "tests/app.test.ts: account verification/recovery, session expiry, changes, cross-user and administrative lifecycle executed.",
  ],
  [
    "14.3",
    "Usage/cost automated tests",
    "Verified",
    "Tests cover costs/attribution, guests, unattributed Google activity, UTC and aggregates.",
  ],
  [
    "14.4",
    "Provider deterministic mocked integration tests",
    "Verified",
    "Configured selection, structured output rejection, 429 and Google endpoint mocks.",
  ],
  [
    "14.5",
    "Production end-to-end verification",
    "Not Started",
    "Not deployed at checkpoint.",
  ],
  [
    "17",
    "Continuous concise progress/evidence log",
    "Verified",
    "PROGRESS.md updated at milestones.",
  ],
  [
    "18.1",
    "Architecture/setup/security/deployment documentation",
    "Verified",
    "README.md exists with setup commands and limitations.",
  ],
  [
    "18.3",
    "Detailed machine-readable and human-readable build reports",
    "Verified",
    "This generator writes both root artifacts; JSON structure/counts validated below.",
  ],
];
const requirements = definitions.map(
  ([reference, description, status, evidence]) => ({
    reference,
    description,
    status,
    ...state.requirements?.[reference],
    evidence: [evidence, ...(state.requirements?.[reference]?.evidence || [])],
  }),
);
const checks = state.checks || [
  {
    command: "npm run typecheck",
    environment: "local",
    result: "passed",
    evidence: "PROGRESS.md: 2026-11-05T16:58Z",
  },
  {
    command: "npm run build",
    environment: "local production bundle",
    result: "passed",
    evidence: "PROGRESS.md: Vite 7.3.7 successful build",
  },
  {
    command: "npm test",
    environment: "workerd/local D1; mocked external services",
    result: "passed",
    counts: { passed: 30, failed: 0 },
    evidence: "tests/app.test.ts; PROGRESS.md",
  },
  {
    command:
      "bash -c source cloudflare.env; npx wrangler d1 migrations apply DB --remote",
    environment: "Cloudflare remote D1",
    result: "passed",
    evidence: "0001_initial.sql: 24 commands succeeded",
  },
  {
    command: "npm run db:local",
    environment: "local D1",
    result: "passed",
    evidence: "0001_initial.sql: 24 commands succeeded",
  },
];
const summary = {
  counts: {},
  outcome:
    state.outcome ||
    "Application implemented and 30 local mocked-service integration tests passed; production deployment and live integrations pending.",
};
for (const r of requirements)
  summary.counts[r.status] = (summary.counts[r.status] || 0) + 1;
let sha = null,
  branch = null;
try {
  sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  branch = execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  }).trim();
} catch {}
const result = {
  schemaVersion: 1,
  specVersion: "1.7",
  project: "AI Travel Planner / Elsewhere",
  generatedAt,
  execution: {
    startedAt: "2026-11-05T16:36:10Z",
    endedAt: state.endedAt || null,
    elapsedSeconds: Math.round(
      (Date.parse(state.endedAt || generatedAt) -
        Date.parse("2026-11-05T16:36:10Z")) /
        1000,
    ),
    deliveryLimitSeconds: 28800,
    completionReason:
      state.completionReason ||
      "Implementation checkpoint; validation and deployment in progress",
    humanInterventions: [
      "Tool approval granted for dependency installation, Cloudflare metadata/provisioning/migrations and test runtime. No manual code changes requested.",
    ],
  },
  repository: {
    branch,
    commitSha: sha,
    note: "Observed HEAD when report was generated; reports are necessarily committed after this observation.",
  },
  deployment: {
    status: "not deployed",
    publicUrl: "https://ai-travel-planner-v1-codex.thebuildhypothesis.com",
    githubBuildsVerification: "pending",
    deployedCommitSha: null,
    ...state.deployment,
  },
  requirements,
  checks,
  integrations: {
    llm: {
      provider: "openai",
      model: "gpt-4o-mini",
      status: "mocked integration verified; live call pending",
    },
    googlePlaces: {
      status: "mocked request/SKU accounting verified; live call pending",
    },
    maps: { status: "implemented, browser verification pending" },
    cloudflareEmail: {
      binding: "EMAIL",
      senderVariable: "EMAIL_FROM",
      status: "mocked token/delivery workflows verified; live delivery pending",
    },
    ...state.integrations,
  },
  infrastructure: {
    resources: [
      {
        type: "D1",
        name: "bh-travel-v1-claude-codex-db",
        id: "9412d31e-a976-473d-8260-a20d6c20ce1e",
        action: "created",
      },
      {
        type: "Worker",
        name: "ai-travel-planner-codex",
        action: "existing; generated configuration targets this Worker",
      },
    ],
    migrations: { "0001_initial.sql": "applied locally and remotely" },
    ...state.infrastructure,
  },
  issues: state.issues || [
    {
      severity: "medium",
      description:
        "Live service and deployment verification pending at this checkpoint.",
      impact: "Production operation not yet demonstrated.",
      followUp:
        "Complete live API, browser, deployment and build verification.",
    },
    {
      severity: "low",
      description:
        "No authoritative billing reconciliation, live opening hours, availability or routing.",
      impact: "Travel and cost values remain clearly labeled estimates.",
      followUp:
        "Verify travel details with operators; reconcile provider invoices separately.",
    },
  ],
  costs: {
    currency: "USD",
    buildRunMeasuredAmount: null,
    providerInvoiceAmount: null,
    source: "No authoritative billing data available",
    estimatedTestFixtureLlmAmount: 0.0029,
    estimatedTestFixtureGoogleAmount: 0.032,
    ...state.costs,
  },
  summary,
};
writeFileSync("BUILD_RESULTS.json", JSON.stringify(result, null, 2) + "\n");
const statusRows = requirements
  .map(
    (r) =>
      `| ${r.reference} | ${r.description} | ${r.status} | ${r.evidence.join(" ").replaceAll("|", "/")} |`,
  )
  .join("\n");
const text = `# Build and verification report — Elsewhere\n\nGenerated ${generatedAt}. Specification v1.7. All dates/times below are UTC unless noted.\n\n## 1. Executive Summary\n\n${summary.outcome}\n\nStatus counts: ${Object.entries(
  summary.counts,
)
  .map(([k, v]) => `${k}: ${v}`)
  .join(
    "; ",
  )}. \`Verified\` in the matrix describes the cited executed check, often a local API test with mocked external services; it does **not** imply production verification. Code presence alone is not treated as evidence of successful execution.\n\n## 2. Requirement-by-Requirement Status\n\n| Reference | Requirement | Status | Evidence and remaining work |\n| --- | --- | --- | --- |\n${statusRows}\n\n## 3. What Was Built\n\nElsewhere combines a destination discovery home screen, personalized trip setup, saved journeys, structured day-by-day activity cards, an AI conversation sidebar, direct itinerary controls, a day-filtered interactive map and Google Places research. Account dialogs cover registration, verification, login, profile/password editing and recovery. A separate administrative application provides forced initial password replacement, UTC-filtered overview charts, user/trip/usage drill-downs, administrator management and audit history.\n\nReact 19/Vite builds a responsive browser application; a TypeScript Worker serves APIs and assets; Cloudflare D1 stores sessions, identities, guests, trips, conversations, one-use tokens, request-level usage, rate limits, audit and sanitized errors. Leaflet uses OpenStreetMap tiles. OpenAI Responses uses the runtime-selected model and schema-validated JSON. SQL optimistic concurrency protects against stale trip writes. Explicit single-day conversational changes preserve unrelated saved days on the server. See README.md for full implementation detail.\n\n## 4. How to Access and Test It\n\nAssigned URL: ${result.deployment.publicUrl}. Deployment status: **${result.deployment.status}**.\n\nLocal setup: \`npm ci\`, configure ignored \`.dev.vars\` using the example, \`npm run build\`, \`npm run db:local\`, then \`npm run dev\`. Optional Vite HMR: \`npm run dev:ui\`. Requires Node 22+ and local socket permissions.\n\nGuest walkthrough: start on Discover, describe a trip, supply preferences, create the trip, generate/refine the plan, inspect Itinerary/Map/Explore places, edit an activity, and reopen My trips. Sign up or log in from the same browser to migrate guest trips; check profile and recovery flows. Verification/reset links require actual email delivery.\n\nAdministrator setup is operator-controlled: after migration run \`node scripts/cloudflare.mjs bootstrap\`. Required initial username/password are \`admin\`/\`admin\`; immediately replace the password at \`/admin\` before administrative data is available. The initialization marker prevents recreation. Do not leave a known bootstrap password on a public deployment. Live replacement credentials, if created, are only in ignored local operator storage, never in this report. ${state.accessNotes || ""}\n\n## 5. Tests and Verification\n\n${checks.map((c) => `- **${c.result}** — \`${c.command || c.procedure}\` (${c.environment}). ${c.counts ? JSON.stringify(c.counts) + ". " : ""}${c.evidence || ""}`).join("\n")}\n\nMocked tests use actual workerd/local D1, but mocked OpenAI/Google/email responses. They validate application logic rather than upstream credentials or delivery. ${state.verificationNotes || "Real-browser, live API and production checks are pending at this checkpoint."}\n\n## 6. Deployment and Infrastructure\n\nObserved Git branch: \`${branch}\`. Observed HEAD: \`${sha}\` (the report itself will be committed afterward). Worker: \`ai-travel-planner-codex\`, preserved existing primary Worker. D1: \`bh-travel-v1-claude-codex-db\` (\`9412d31e-a976-473d-8260-a20d6c20ce1e\`). Migration \`0001_initial.sql\` applied locally and remotely. Static assets, DB, EMAIL and canonical URL are declared in Wrangler. Managed LLM settings and secret values were not changed.\n\nDeployment verification: ${JSON.stringify(result.deployment)}. ${state.deploymentNotes || "No deployment success is claimed at this checkpoint. GitHub Builds list initially returned no builds."}\n\n## 7. Integrations and Configuration\n\n${Object.entries(
  result.integrations,
)
  .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
  .join(
    "\n",
  )}\n\nThe runtime provider/model were verified from non-secret Worker metadata; credentials were not retrieved. Production provider availability is distinct from metadata presence. \`keep_vars: true\` preserves managed settings. The assigned canonical URL corrects a pre-existing mismatched experiment URL; no unrelated domain/DNS changes are planned. Published reference price assumptions are stored in \`pricing.json\` and runtime \`PRICING_JSON\`; model selection still comes exclusively from \`LLM_MODEL\`.\n\n## 8. Security Review\n\nPBKDF2-SHA256 uses 600,000 iterations and random salts. Session/verification/reset tokens have 256 bits of randomness, with only SHA-256 digests stored. HTTPS cookies use Secure/HTTP-only/SameSite=Lax. User and administrative sessions are separate and expire after 30 days and 8 hours respectively. Ownership authorization is performed for every trip operation. Destructive operations require explicit confirmation. DB triggers prevent last-admin removal/disable; initial credentials cannot access data before replacement. Password resets expire within 30 minutes, are single-use, and invalidate sessions. Authentication and billable APIs have persistent DB rate limits and request caps; writes require same Origin and JSON content. CSP/HSTS/frame/no-sniff headers protect the application. SQL values are bound.\n\nSecurity tests execute negative cross-identity/expired-token/cross-origin flows. These are not a professional penetration test. Remaining practical limits include lack of MFA, application-level rather than global provider spend caps, no human inbox ownership verification until real email is tested, and AI semantic travel-quality dependence. Unverified scope and external constraints appear below.\n\n## 9. Usage, Costs, and Estimates\n\nRequest records include timestamp, provider/model or endpoint/SKU, operation, user/guest/trip attribution, status, input/output/cached tokens, units, estimated USD cost, historical pricing reference, latency and sanitized error codes. Unknown rates produce null costs. Aggregates show unknown-cost counts; non-trip requests are separately reported. User deletion removes identity attribution but retains historical accounting.\n\nExecuted fixture calculations: 1,000 input tokens including 200 cached and 500 output tokens at rates 1/0.5/4 USD per million = USD 0.0029; one Google Text Search Pro request at USD 32/1,000 = USD 0.032. These are test fixtures, not observed production spend. Production reference prices are sourced from [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini) and [Google SKU pricing](https://developers.google.com/maps/billing-and-pricing/pricing), checked 2026-11-05. Base-tier estimates do not incorporate shared free allowances, volume discounts, tax or invoices.\n\nCost evidence: ${JSON.stringify(result.costs)}. No build-agent cost or authoritative provider bill was available; unknown values remain null.\n\n## 10. Known Bugs, Limitations, and Incomplete Work\n\n${result.issues.map((i) => `- **${i.severity}**: ${i.description} Impact: ${i.impact} Follow-up/workaround: ${i.followUp}`).join("\n")}\n\nAdditional bounded limitations: English UI; last 100 user trips in collection; last 16 messages plus itinerary used for model context; chart buckets are UTC days even for the last-hour range; map lines show sequence rather than routed travel; decorative stock imagery may not match saved destination; no bookings/availability/hours guarantees. No automatic billable retries. Broader conversational changes depend on model preservation instructions; explicit single-day changes are enforced on the server.\n\n## 11. Agent Execution Summary\n\nObserved start: ${result.execution.startedAt}. End: ${result.execution.endedAt || "not yet ended"}. Measured seconds at generation: ${result.execution.elapsedSeconds}; delivery limit 28,800 seconds. ${result.execution.completionReason}.\n\nMilestones, actual failures and approvals: see PROGRESS.md. The initial empty repository was built from scratch; a nonexistent pinned Workers-types version was corrected and installed versions locked. Sandbox network/socket restrictions required approved retries for dependency downloads, Cloudflare operations and workerd tests. Tool approvals were human interventions; no user product decision was needed. No other agents were spawned. ${state.executionNotes || ""}\n\n## 12. What to Expect During Independent Review\n\n1. Open the assigned URL and confirm the Discover home screen, destination cards and mobile navigation. Compare \`/api/health\` build commit with the intended GitHub build.\n2. Create a guest trip for two days, request an itinerary and confirm structured day/activity cards. Refresh and reopen; conversation should persist. Repeat in another browser and verify isolation.\n3. Change a named day conversationally and verify other days remain unchanged. Directly edit/reorder/remove an activity; overlaps should show validation errors. Review approximate map positions.\n4. Explore Places with a real destination. Expect clear errors if credentials/provider configuration fail, never fabricated place results.\n5. Register and confirm guest migration, then test login/logout, verification, profile editing and recovery using an email account you control. Missing/delayed actual email remains a separate delivery concern.\n6. Use your changed admin credentials at \`/admin\`; test reports with presets/custom UTC periods, user/trip/usage inspection and protected account operations. Known initial credentials should no longer work after setup. Test last-active-admin protection.\n7. Check request records for tokens, prices, attribution and latency. Compare estimates with recorded price assumptions; do not interpret as invoices.\n\n## 13. Final Assessment and Next Steps\n\n${state.finalAssessment || "Demonstrably ready at this checkpoint: buildable typed source, tested local API/security/persistence/cost logic, migrated Cloudflare database, responsive screen implementation and deployment configuration. Remaining: real-browser QA, live-provider checks, commit/push, GitHub Builds deployment and production verification. Final reports will be updated after these checks."}\n`;
writeFileSync("BUILD_REPORT.md", text);
const parsed = JSON.parse(readFileSync("BUILD_RESULTS.json"));
if (
  Object.values(parsed.summary.counts).reduce((a, b) => a + b, 0) !==
  parsed.requirements.length
)
  throw new Error("Status count mismatch");
console.log(
  `Reports generated: ${requirements.length} requirements; ${checks.length} checks; JSON valid`,
);
