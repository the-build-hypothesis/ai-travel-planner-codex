# Elsewhere · AI Travel Planner

A responsive travel planning application implementing `spec/v1.md` (v1.7). React/Vite frontend, TypeScript Cloudflare Worker API, and D1 SQL persistence. Hosting and persistent application data remain on Cloudflare. External providers: runtime-selected OpenAI Responses, Google Places (New), OpenStreetMap tiles, and destination photography from Unsplash.

## Local setup

Node 22+ and npm are required.

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run build
npm run db:local
npm run dev
```

Open the localhost URL printed by Wrangler. For frontend HMR, also run `npm run dev:ui`; Vite proxies `/api` to port 8787. Production assets are served by Wrangler, so rebuild after frontend changes when using only Wrangler. Email delivery requires a real Cloudflare Email Service binding; local tests mock the binding. No email links or tokens are printed in application responses.

Runtime bindings:

| Binding | Purpose |
| --- | --- |
| `DB` | D1 database |
| `ASSETS` | Built Vite static assets |
| `APP_PUBLIC_URL` | Canonical HTTPS origin for email links |
| `LLM_PROVIDER` | Must be `openai`; unsupported values produce explicit errors |
| `LLM_MODEL` | Exact model used; no default or fallback |
| `OPENAI_API_KEY` | Server-only runtime secret |
| `GOOGLE_MAPS_API_KEY` | Optional server-only Places API credential |
| `EMAIL` | Cloudflare Email Service send binding |
| `EMAIL_FROM` | Administrator-managed verified sender |
| `PRICING_JSON` | Optional model and endpoint pricing, described below |

Never commit `.dev.vars` or `cloudflare.env`, retrieve production secrets, or use Wrangler secret-management commands. Deployment uses `keep_vars: true` to retain administrator-managed runtime variables; the assigned canonical URL is the only tracked plain-text runtime variable.

## Planning

Use the home composer or destination cards to start a trip. Supply optional dates, children’s ages, budget, currency and pace. Incomplete requests are supported: ask the companion for ideas. Trips save server-side automatically. Open **My trips** to reopen an itinerary and its conversation. The workspace has itinerary, interactive map, and Google Places research tabs. Directly add, edit, remove and rearrange activities; conflicting schedules are rejected. Conversational edits pass the current plan and recent history to the configured model and instruct it to preserve unaffected IDs and days. AI output is validated before saving. A revision number prevents stale overwrites.

AI recommendations and coordinates are suggestions, prices are per-group estimates, and no booking or live opening-hours claim is made. Verify details before travel. Place research provides current Google place names, addresses and Google Maps links; no live prices or hours are requested. Map connecting lines indicate sequence, not routed directions. Destination cards are inspiration; saved-trip photos are decorative, not verified destination images.

## Authentication and ownership

A cryptographically random 256-bit session token is stored in an HTTP-only SameSite=Lax cookie (Secure on HTTPS); only its SHA-256 digest is persisted. Guest sessions last 30 days. Guest IDs are internal UUIDs and never authorize requests by themselves. User email is unique case-insensitively; relationships use stable user UUIDs. Passwords use salted PBKDF2-SHA256 with 600,000 iterations. Registration/login migrate only the guest trips attached to the authenticated browser session, without copying records. All trip operations check server-side ownership. Signed-in sessions expire after 30 days; logout deletes the session.

Verification/reset tokens are random and stored only as hashes. Verification expires in 24 hours; reset in 30 minutes. Tokens are single-use. Password resets invalidate all user sessions and outstanding account tokens. Password changes require the current password and invalidate other sessions. Forgot-password responses do not disclose account existence; provider delivery failures are logged as sanitized codes and the public response only confirms a request, not delivery. Registration accurately reports email delivery failure while retaining the account. Resend shows delivery/configuration errors explicitly. Disabled accounts cannot authenticate; disabling revokes sessions.

Writes require a matching Origin and JSON content type. Security headers include CSP, HSTS on HTTPS, frame restrictions and no-sniff. D1 statements bind values. Server-side limits cover authentication, guest creation, trip creation, AI/Places use, and request sizes. AI calls have a 90-second timeout and 10,000 output-token cap; Places a 15-second timeout. There are zero automatic retries to avoid duplicate billable requests; users can retry explicitly. IP and account limits both protect billable APIs. This is application-level protection, not a substitute for Cloudflare WAF or provider spend limits.

## Administrator bootstrap

The separate `/admin` login uses a separate table and cookie (`travel_admin`), with 8-hour sessions and stricter limits. There is no public administrator registration. After the remote schema migration, an authorized operator runs:

```sh
node scripts/cloudflare.mjs bootstrap
```

This creates the required initial username `admin` and password `admin` as a salted hash, and records a durable initialization marker. It does not recreate deleted bootstrap accounts. **Immediately sign in at `/admin` and replace the initial password.** No dashboard or admin API data is available before password replacement. For unattended deployment, use the operator smoke procedure to replace this password promptly; never leave a deployed installation awaiting initial setup. The application does not display default credentials publicly.

Administrators can create accounts, reset temporary passwords, disable/delete accounts, inspect users and guest trips, and review usage and audit history. DB triggers protect the last active administrator against deletion/disabling. Resets force another password change and invalidate existing admin sessions. Destructive operations require both UI confirmation and an explicit API confirmation flag. Sensitive operations append an immutable-through-API audit entry. Administrative user deletion cascades trips/conversations, removes sessions/tokens, and clears user/guest identifiers from historical usage; historical usage and costs remain, and opaque historical trip IDs remain for accounting. Audit target UUIDs remain for accountability. There is no UI endpoint to alter audit records.

## Email service

`send_email: [{ name: "EMAIL" }]` configures Cloudflare Email Service. Structured messages use runtime `EMAIL_FROM`; domain-level email setup is not modified. The sender must be onboarded and recipient eligibility must satisfy Cloudflare account restrictions. Tests prove token workflows with mocked delivery; see build reports for real delivery status. A present binding alone does not prove inbox delivery.

## Monitoring and pricing

`/admin` reports lifetime user/trip counts separately from selected-period activity and costs. All server filtering uses UTC and inclusive ISO timestamp bounds. Presets cover hour/day/3/7/30/90 days/year and custom UTC ranges. Reports include users, trips, request-level usage, failures, latency, cost/token/creation/registration charts, and audit records. Lists paginate in pages of 25. User costs are selected-period values; trip counts are lifetime. Guest usage is included. Requests without a trip are retained and accounted for separately.

Prices are configurable assumptions, not invoices. Set the optional non-secret `PRICING_JSON` binding through your administrator configuration, for example:

```json
{
  "your-runtime-model": {"input": 1, "output": 4, "cached": 0.5, "reference": "your-verified-price-and-date"},
  "google_text_search": {"per1000": 32, "reference": "your-verified-Places-Pro-price-and-date"}
}
```

**These numbers are illustrative, not a claim of current provider pricing.** Model rates are USD per million tokens; Google endpoint rates are USD per thousand requests. Cost = `(uncached_input × input_rate + cached_input × cached_rate + output × output_rate) / 1e6`. Reasoning tokens are included in provider output token totals. Full price snapshots are stored on each usage record, including historical configuration references. Missing prices result in null/Unknown, never invented zero-cost claims. Aggregates exclude unknown costs and show an unknown-cost request count. Failed calls record status, latency and sanitized errors; unknown provider billing remains null. Build-run/provider invoice costs are not available from the app and must not be inferred from these estimates.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

Vitest runs the API in Cloudflare workerd with local D1 and deterministic mocked OpenAI, Google, and email responses. Tests do not establish live external integration. See `PROGRESS.md`, `BUILD_REPORT.md`, and `BUILD_RESULTS.json` for exact executed checks and remaining limitations.

## Deployment

Existing GitHub branch `main` connects to the assigned existing Worker through Workers Builds. `wrangler.jsonc` declares D1, assets, email, canonical URL and assigned custom domain. `npm run build` generates an embedded commit identifier exposed by `/api/health`. Run schema migration separately before deploying:

```sh
npm run db:remote
npm run build
```

Then commit/push to the configured branch. Verify GitHub-triggered Cloudflare build success, compare its commit with `/api/health`, verify HTTPS and full application flows. `npm run deploy` is available for troubleshooting but does not substitute for final GitHub Builds verification. The operator helper reads ignored `cloudflare.env`, never prints secrets, and can inspect binding metadata, provision only the project-prefixed D1, bootstrap, inspect builds/versions and check production health. The checked-in generated Wrangler configuration is reproducible and references the existing primary Worker.

## Limitations

Consult the current build reports for verified limitations. There are no reservations, transit-routing API, live availability, opening hours, price guarantees, MFA or automatic billing reconciliation. Conversation context uses the most recent 16 messages plus the full current itinerary. User trip lists show the latest 100 trips. Reporting charts aggregate by UTC calendar day (including short reporting periods). UI is English. AI changes depend on the model following preservation instructions; stale writes and malformed schedules are rejected, but semantic itinerary quality requires review. OpenStreetMap/Unsplash availability is external. No secrets are ever returned to the browser.
