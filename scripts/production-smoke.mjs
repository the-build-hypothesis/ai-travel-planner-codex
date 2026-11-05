// Operator verification. Cookies/passwords stay in memory or ignored mode-0600 local storage.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const origin = config.vars.APP_PUBLIC_URL;
const checks = [];
const headers = { Origin: origin, "Content-Type": "application/json" };
let adminCookie = "",
  guestCookie = "",
  userCookie = "";
let createdUserId = null;
async function req(path, method = "GET", data, cookie = "") {
  const r = await fetch(origin + "/api" + path, {
    method,
    headers: { ...headers, Cookie: cookie },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  let d;
  try {
    d = await r.json();
  } catch {
    d = { error: "Non-JSON response" };
  }
  return {
    status: r.status,
    data: d,
    cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie,
    headers: r.headers,
  };
}
function check(name, pass, details = {}) {
  checks.push({ name, passed: !!pass, ...details });
  console.log((pass ? "PASS" : "FAIL") + " " + name);
}
try {
  const health = await req("/health");
  check(
    "HTTPS production health and deployed commit",
    health.status === 200 && !!health.data.build?.commit,
    { status: health.status, commit: health.data.build?.commit || null },
  );
  if (!health.data.build) throw new Error("Application is not deployed");
  let creds = existsSync(".admin-credentials")
    ? JSON.parse(readFileSync(".admin-credentials", "utf8"))
    : { username: "admin", password: "admin" };
  let login = await req("/admin/login", "POST", creds);
  adminCookie = login.cookie;
  check("Administrator authentication", login.status === 200, {
    status: login.status,
    error: login.data.error || null,
  });
  if (login.status !== 200) throw new Error("Administrator login failed");
  if (login.data.admin.must_change) {
    const blocked = await req("/admin/overview", "GET", undefined, adminCookie);
    check(
      "Bootstrap forced replacement blocks admin data",
      blocked.status === 403,
    );
    const newPassword = randomBytes(24).toString("base64url");
    const changed = await req(
      "/admin/password",
      "POST",
      { currentPassword: creds.password, password: newPassword },
      adminCookie,
    );
    check("Bootstrap password replaced", changed.status === 200);
    if (changed.status !== 200)
      throw new Error("Initial administrator replacement failed");
    creds = { username: creds.username, password: newPassword };
    writeFileSync(".admin-credentials", JSON.stringify(creds, null, 2) + "\n", {
      mode: 0o600,
    });
  }
  const g = await req("/session");
  guestCookie = g.cookie;
  check(
    "Secure HTTP-only guest session",
    g.status === 200 &&
      g.headers.get("set-cookie")?.includes("Secure") &&
      g.headers.get("set-cookie")?.includes("HttpOnly"),
  );
  const t = await req(
    "/trips",
    "POST",
    {
      title: "Production review · Kyoto",
      destination: "Kyoto, Japan",
      preferences: {
        days: 2,
        travelers: 2,
        budget: 300,
        currency: "USD",
        pace: "relaxed",
      },
    },
    guestCookie,
  );
  check("Guest trip creation", t.status === 201);
  if (t.status !== 201) throw new Error("Trip creation failed");
  let trip = t.data.trip;
  const before = Date.now();
  const gen = await req(
    "/trips/" + trip.id + "/chat",
    "POST",
    {
      version: trip.version,
      content:
        "Plan two relaxed days in Kyoto with just two activities each day. Use practical travel buffers and estimated group costs. Give approximate coordinates.",
    },
    guestCookie,
  );
  check(
    "Live OpenAI structured itinerary generation",
    gen.status === 200 && gen.data.trip?.itinerary?.length === 2,
    {
      status: gen.status,
      durationMs: Date.now() - before,
      error: gen.data.error || null,
    },
  );
  if (gen.status === 200) {
    trip = gen.data.trip;
    const unchanged = JSON.stringify(trip.itinerary[1]);
    const edit = await req(
      "/trips/" + trip.id + "/chat",
      "POST",
      {
        version: trip.version,
        content:
          "Make day one less expensive. Keep day one to two activities. Keep every other day unchanged.",
      },
      guestCookie,
    );
    check(
      "Live conversational editing preserves unrelated day",
      edit.status === 200 &&
        JSON.stringify(edit.data.trip?.itinerary?.[1]) === unchanged,
      { status: edit.status, error: edit.data.error || null },
    );
    if (edit.status === 200) trip = edit.data.trip;
  }
  const reopen = await req("/trips/" + trip.id, "GET", undefined, guestCookie);
  check(
    "Save/reopen preserves itinerary and conversation",
    reopen.status === 200 &&
      reopen.data.messages.length >= 2 &&
      reopen.data.trip.version === trip.version,
    { messageCount: reopen.data.messages?.length || 0 },
  );
  const outsider = await req("/session");
  const cross = await req(
    "/trips/" + trip.id,
    "GET",
    undefined,
    outsider.cookie,
  );
  check("Production cross-guest authorization", cross.status === 404);
  const places = await req(
    "/trips/" + trip.id + "/places",
    "POST",
    { query: "Kyoto temples" },
    guestCookie,
  );
  check(
    "Live Google Places research",
    places.status === 200 && places.data.places?.length > 0,
    {
      status: places.status,
      resultCount: places.data.places?.length || 0,
      error: places.data.error || null,
    },
  );
  const account = {
    name: "Production QA",
    email: `travel-qa-${Date.now()}@example.com`,
    password: randomBytes(24).toString("base64url"),
  };
  const reg = await req("/auth/register", "POST", account, guestCookie);
  userCookie = reg.cookie;
  createdUserId = reg.data.user?.id || null;
  check("Registration and transactional email request", reg.status === 201, {
    emailStatus: reg.data.emailStatus || null,
  });
  if (reg.status === 201) {
    const list = await req("/trips", "GET", undefined, userCookie);
    check(
      "Production guest-to-account migration",
      list.data.trips?.some((t) => t.id === trip.id),
    );
    const logout = await req("/auth/logout", "POST", {}, userCookie);
    check(
      "Logout invalidates session",
      (await req("/trips", "GET", undefined, userCookie)).status === 401,
    );
    const userLogin = await req("/auth/login", "POST", {
      email: account.email,
      password: account.password,
    });
    userCookie = userLogin.cookie;
    check(
      "Registered login and persistence",
      userLogin.status === 200 &&
        (await req("/trips/" + trip.id, "GET", undefined, userCookie))
          .status === 200,
    );
    const forgot = await req("/auth/forgot", "POST", { email: account.email });
    check("Password recovery non-enumerating request", forgot.status === 200, {
      status: forgot.status,
    });
  }
  const inspected = await req(
    "/admin/trips/" + trip.id,
    "GET",
    undefined,
    adminCookie,
  );
  check("Administrative trip inspection", inspected.status === 200);
  const usage = await req(
    "/admin/usage?trip=" + trip.id,
    "GET",
    undefined,
    adminCookie,
  );
  check(
    "Production request-level usage/cost accounting",
    usage.status === 200 &&
      usage.data.rows?.some(
        (r) =>
          r.provider === "openai" &&
          r.input_tokens > 0 &&
          r.output_tokens > 0 &&
          r.cost > 0,
      ) &&
      usage.data.rows?.some((r) => r.provider === "google"),
    {
      records:
        usage.data.rows?.map((r) => ({
          provider: r.provider,
          model: r.model,
          status: r.status,
          inputTokens: r.input_tokens,
          outputTokens: r.output_tokens,
          cachedTokens: r.cached_tokens,
          cost: r.cost,
          durationMs: r.duration_ms,
        })) || [],
    },
  );
  const overview = await req("/admin/overview", "GET", undefined, adminCookie);
  check(
    "Production monitoring/bindings/provider configuration",
    overview.status === 200,
    {
      configuration: overview.data.configuration,
      costs: overview.data.costs,
      totals: overview.data.totals,
    },
  );
  const historic = await req(
    "/admin/overview?start=2000-01-01&end=2000-01-02",
    "GET",
    undefined,
    adminCookie,
  );
  check(
    "Production date range filters activity but preserves lifetime counts",
    historic.status === 200 &&
      historic.data.costs.requests === 0 &&
      historic.data.totals.trips === overview.data.totals.trips,
  );
  const last = await req(
    "/admin/admins/" + login.data.admin.id,
    "PATCH",
    { disabled: true, confirm: true },
    adminCookie,
  );
  check("Production last-active-administrator protection", last.status === 400);
  const audit = await req("/admin/audit", "GET", undefined, adminCookie);
  check(
    "Production administrative audit log",
    audit.status === 200 &&
      audit.data.rows?.some((r) => r.action === "trip.inspect"),
  );
  if (createdUserId) {
    const deleted = await req(
      "/admin/users/" + createdUserId,
      "DELETE",
      { confirm: true },
      adminCookie,
    );
    check("Protected test-account cleanup", deleted.status === 200);
  } else
    await req("/trips/" + trip.id, "DELETE", { confirm: true }, guestCookie);
  await req("/admin/logout", "POST", {}, adminCookie);
  check(
    "Admin logout invalidates session",
    (await req("/admin/overview", "GET", undefined, adminCookie)).status ===
      401,
  );
} catch (e) {
  check("Smoke execution completed", false, { error: e.message });
}
const result = {
  at: new Date().toISOString(),
  environment: "production; actual OpenAI, Google and email-binding calls",
  url: origin,
  checks,
  passed: checks.filter((c) => c.passed).length,
  failed: checks.filter((c) => !c.passed).length,
  inboxDeliveryVerified: false,
};
writeFileSync(
  "evidence/production-smoke.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  `Production smoke: ${result.passed} passed; ${result.failed} failed. No credentials printed.`,
);
if (result.failed) process.exitCode = 1;
