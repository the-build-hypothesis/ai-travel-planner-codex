import { env, fetchMock } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import worker from "../src/worker/index";
import {
  passwordHash,
  passwordCheck,
  hash,
  randomToken,
  limit,
  newSession,
} from "../src/worker/security";
import { calculateCost, modelPricing, searchPlaces } from "../src/worker/ai";
import { DaysSchema } from "../src/worker/schema";
import { dateRange } from "../src/worker/admin";
import type { Env } from "../src/worker/types";
import migration from "../migrations/0001_initial.sql?raw";
const origin = "https://test.example";
const e = env as unknown as Env;
let emailMessages: any[] = [];
const emailEnv = () => ({
  ...e,
  EMAIL: {
    send: async (m: any) => {
      emailMessages.push(m);
      return { messageId: "mock" };
    },
  },
});
const request = async (
  path: string,
  method = "GET",
  data?: any,
  cookie = "",
  custom = e,
) => {
  const r = await worker.fetch(
    new Request(origin + "/api" + path, {
      method,
      headers: {
        ...(method === "GET"
          ? {}
          : { Origin: origin, "Content-Type": "application/json" }),
        Cookie: cookie,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    custom,
  );
  let d: any;
  try {
    d = await r.json();
  } catch {}
  return { r, d, cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie };
};
const guest = () => request("/session");
const create = async (cookie: string) =>
  request(
    "/trips",
    "POST",
    { title: "Kyoto escape", destination: "Kyoto", preferences: { days: 2 } },
    cookie,
  );
const activity = {
  id: "a1",
  time: "09:00",
  title: "Explore the old town",
  description: "Take a relaxed walk.",
  location: "Kyoto",
  lat: 35,
  lng: 135,
  duration: 90,
  cost: 20,
  category: "culture",
  transport: "Walk for 15 minutes",
};
const day = {
  id: "d1",
  title: "A first look",
  summary: "A gentle introduction.",
  activities: [activity],
};
function mockAI(
  result: any = {
    message: "Your plan is ready.",
    title: "Kyoto escape",
    destination: "Kyoto",
    days: [day],
  },
  status = 200,
  usage: any = {
    input_tokens: 1000,
    output_tokens: 500,
    input_tokens_details: { cached_tokens: 200 },
  },
) {
  fetchMock
    .get("https://api.openai.com")
    .intercept({ path: "/v1/responses", method: "POST" })
    .reply(
      status,
      status === 200
        ? {
            status: "completed",
            output: [
              {
                content: [
                  { type: "output_text", text: JSON.stringify(result) },
                ],
              },
            ],
            usage,
          }
        : { error: { message: "mock" } },
      { headers: { "content-type": "application/json" } },
    );
}
beforeAll(async () => {
  await env.DB.exec(migration.replace(/\n/g, " "));
});
beforeEach(() => {
  emailMessages = [];
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => {
  fetchMock.deactivate();
});
describe("Security primitives", () => {
  it("hashes passwords with independent salts and verifies them", async () => {
    const a = await passwordHash("correct-password"),
      b = await passwordHash("correct-password");
    expect(a).not.toBe(b);
    expect(a).not.toContain("correct-password");
    expect(await passwordCheck("correct-password", a)).toBe(true);
    expect(await passwordCheck("wrong-password", a)).toBe(false);
  });
  it("rejects cross-origin writes and missing Origin", async () => {
    for (const header of ["https://evil.example", ""]) {
      const r = await worker.fetch(
        new Request(origin + "/api/trips", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(header ? { Origin: header } : {}),
          },
          body: "{}",
        }),
        e,
      );
      expect(r.status).toBe(403);
    }
  });
  it("uses http-only secure cookies and persists guest identity", async () => {
    const a = await guest();
    expect(a.r.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax/);
    expect(a.r.headers.get("set-cookie")).toContain("Secure");
    expect(a.cookie).toMatch(/travel_session=[a-f0-9]{64}/);
    expect(
      (await request("/session", "GET", undefined, a.cookie)).r.headers.get(
        "set-cookie",
      ),
    ).toBeNull();
  });
  it("enforces server rate limits", async () => {
    const key = randomToken();
    await limit(e, key, 1, 60);
    await expect(limit(e, key, 1, 60)).rejects.toThrow("Too many requests");
  });
  it("rejects expired sessions", async () => {
    const g = await guest();
    await env.DB.prepare("UPDATE sessions SET expires_at=?")
      .bind("2000-01-01T00:00:00.000Z")
      .run();
    expect((await request("/trips", "GET", undefined, g.cookie)).r.status).toBe(
      401,
    );
  });
});
describe("Trips and conversations", () => {
  it("creates and reopens a server-persisted guest trip", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    expect(t.r.status).toBe(201);
    expect(t.d.trip.preferences.days).toBe(2);
    const list = await request("/trips", "GET", undefined, g.cookie);
    expect(list.d.trips).toHaveLength(1);
    const detail = await request(
      "/trips/" + t.d.trip.id,
      "GET",
      undefined,
      g.cookie,
    );
    expect(detail.d.trip.title).toBe("Kyoto escape");
    expect(detail.d.messages).toEqual([]);
  });
  it("rejects invalid trips and oversized requests", async () => {
    const g = await guest();
    expect(
      (
        await request(
          "/trips",
          "POST",
          { title: "", preferences: { days: 90 } },
          g.cookie,
        )
      ).r.status,
    ).toBe(400);
    expect(
      (await request("/trips", "POST", { title: "x".repeat(300000) }, g.cookie))
        .r.status,
    ).toBe(413);
  });
  it("blocks cross-guest read edit delete and AI access", async () => {
    const a = await guest(),
      b = await guest(),
      t = await create(a.cookie);
    for (const [path, method, data] of [
      [t.d.trip.id, "GET", undefined],
      [t.d.trip.id, "PATCH", { version: 0, title: "Stolen" }],
      [t.d.trip.id, "DELETE", { confirm: true }],
      [t.d.trip.id + "/chat", "POST", { content: "hello", version: 0 }],
    ]) {
      expect(
        (await request("/trips/" + path, method as string, data, b.cookie)).r
          .status,
      ).toBe(404);
    }
  });
  it("validates edits, preserves unrelated content and rejects stale revisions", async () => {
    const g = await guest(),
      t = await create(g.cookie),
      path = "/trips/" + t.d.trip.id;
    const r = await request(
      path,
      "PATCH",
      {
        version: 0,
        itinerary: [
          day,
          { ...day, id: "d2", activities: [{ ...activity, id: "a2" }] },
        ],
      },
      g.cookie,
    );
    expect(r.r.status).toBe(200);
    const changed = await request(
      path,
      "PATCH",
      {
        version: 1,
        itinerary: [
          { ...day, activities: [{ ...activity, title: "Changed" }] },
          r.d.trip.itinerary[1],
        ],
      },
      g.cookie,
    );
    expect(changed.d.trip.itinerary[1]).toEqual(r.d.trip.itinerary[1]);
    expect(
      (await request(path, "PATCH", { version: 0, title: "Stale" }, g.cookie)).r
        .status,
    ).toBe(409);
    expect(
      (
        await request(
          path,
          "PATCH",
          {
            version: 2,
            itinerary: [
              {
                ...day,
                activities: [
                  activity,
                  { ...activity, id: "a3", time: "09:30" },
                ],
              },
            ],
          },
          g.cookie,
        )
      ).r.status,
    ).toBe(400);
  });
  it("generates a structured itinerary and records conversation and actual token counts", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    mockAI();
    const r = await request(
      "/trips/" + t.d.trip.id + "/chat",
      "POST",
      { content: "Plan Kyoto", version: 0 },
      g.cookie,
    );
    expect(r.r.status).toBe(200);
    expect(r.d.trip.itinerary[0]).toEqual(day);
    expect(r.d.messages.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    const usage = await env.DB.prepare("SELECT * FROM usage WHERE trip_id=?")
      .bind(t.d.trip.id)
      .first<any>();
    expect(usage.input_tokens).toBe(1000);
    expect(usage.output_tokens).toBe(500);
    expect(usage.cost).toBeCloseTo(0.0029);
    expect(usage.guest_id).toBeTruthy();
    const reopened = await request(
      "/trips/" + t.d.trip.id,
      "GET",
      undefined,
      g.cookie,
    );
    expect(reopened.d.messages).toHaveLength(2);
  });
  it("preserves a saved trip on malformed AI output", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    mockAI({
      message: "bad",
      title: "bad",
      destination: "x",
      days: [{ invalid: true }],
    });
    const r = await request(
      "/trips/" + t.d.trip.id + "/chat",
      "POST",
      { content: "Plan Kyoto", version: 0 },
      g.cookie,
    );
    expect(r.r.status).toBe(502);
    expect(
      (await request("/trips/" + t.d.trip.id, "GET", undefined, g.cookie)).d
        .trip.itinerary,
    ).toEqual([]);
    const usage = await env.DB.prepare(
      "SELECT status FROM usage WHERE trip_id=?",
    )
      .bind(t.d.trip.id)
      .first<any>();
    expect(usage.status).toBe("invalid");
  });
  it("handles provider failure without persisting a fabricated response", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    mockAI(undefined, 429);
    expect(
      (
        await request(
          "/trips/" + t.d.trip.id + "/chat",
          "POST",
          { content: "Plan", version: 0 },
          g.cookie,
        )
      ).r.status,
    ).toBe(429);
    expect(
      (await request("/trips/" + t.d.trip.id, "GET", undefined, g.cookie)).d
        .messages,
    ).toEqual([]);
  });
  it("requires configured provider and model, with no fallback", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    for (const custom of [
      { ...e, LLM_PROVIDER: "unsupported" },
      { ...e, LLM_MODEL: "" },
    ])
      expect(
        (
          await request(
            "/trips/" + t.d.trip.id + "/chat",
            "POST",
            { content: "Plan", version: 0 },
            g.cookie,
            custom,
          )
        ).r.status,
      ).toBe(503);
  });
  it("requires explicit confirmation for deletion", async () => {
    const g = await guest(),
      t = await create(g.cookie),
      path = "/trips/" + t.d.trip.id;
    expect((await request(path, "DELETE", {}, g.cookie)).r.status).toBe(400);
    expect(
      (await request(path, "DELETE", { confirm: true }, g.cookie)).r.status,
    ).toBe(200);
    expect((await request(path, "GET", undefined, g.cookie)).r.status).toBe(
      404,
    );
  });
});
describe("Accounts and recovery", () => {
  const register = async (cookie: string, address = "traveler@example.com") =>
    request(
      "/auth/register",
      "POST",
      { name: "Traveler", email: address, password: "long-secure-password" },
      cookie,
      emailEnv(),
    );
  it("registers, migrates only owned guest trips, verifies email once and enforces email uniqueness", async () => {
    const g = await guest(),
      other = await guest(),
      t = await create(g.cookie);
    await create(other.cookie);
    mockAI();
    await request(
      "/trips/" + t.d.trip.id + "/chat",
      "POST",
      { content: "Plan", version: 0 },
      g.cookie,
    );
    const r = await register(g.cookie);
    expect(r.r.status).toBe(201);
    expect(r.d.emailStatus).toBe("sent");
    expect(
      (await request("/trips", "GET", undefined, r.cookie)).d.trips,
    ).toHaveLength(1);
    expect((await request("/trips", "GET", undefined, g.cookie)).r.status).toBe(
      401,
    );
    const usage = await env.DB.prepare(
      "SELECT user_id FROM usage WHERE trip_id=?",
    )
      .bind(t.d.trip.id)
      .first<any>();
    expect(usage.user_id).toBe(r.d.user.id);
    expect(emailMessages).toHaveLength(1);
    const token = new URL(
      emailMessages[0].text.match(/https:\/\/\S+/)[0],
    ).searchParams.get("token");
    expect((await request("/auth/verify", "POST", { token })).r.status).toBe(
      200,
    );
    expect((await request("/auth/verify", "POST", { token })).r.status).toBe(
      400,
    );
    expect(
      (await register(other.cookie, "TRAVELER@example.com")).r.status,
    ).toBe(400);
  });
  it("logs in, migrates guest trips idempotently, and logs out", async () => {
    const g = await guest(),
      r = await register(g.cookie);
    await request("/auth/logout", "POST", {}, r.cookie);
    const guest2 = await guest();
    await create(guest2.cookie);
    const login = await request(
      "/auth/login",
      "POST",
      { email: "TRAVELER@EXAMPLE.COM", password: "long-secure-password" },
      guest2.cookie,
    );
    expect(login.r.status).toBe(200);
    expect(
      (await request("/trips", "GET", undefined, login.cookie)).d.trips,
    ).toHaveLength(1);
    await request("/auth/logout", "POST", {}, login.cookie);
    expect(
      (await request("/trips", "GET", undefined, login.cookie)).r.status,
    ).toBe(401);
  });
  it("blocks access to another registered user’s trips", async () => {
    const g = await guest(),
      r = await register(g.cookie),
      t = await create(r.cookie);
    const b = await guest(),
      s = await register(b.cookie, "other@example.com");
    expect(
      (await request("/trips/" + t.d.trip.id, "GET", undefined, s.cookie)).r
        .status,
    ).toBe(404);
  });
  it("resets password with a single-use hashed token and invalidates old sessions", async () => {
    const g = await guest(),
      r = await register(g.cookie);
    emailMessages = [];
    const forgot = await request(
      "/auth/forgot",
      "POST",
      { email: "traveler@example.com" },
      "",
      emailEnv(),
    );
    expect(forgot.r.status).toBe(200);
    const unknown = await request(
      "/auth/forgot",
      "POST",
      { email: "unknown@example.com" },
      "",
      emailEnv(),
    );
    expect(forgot.d).toEqual(unknown.d);
    const token = new URL(
      emailMessages[0].text.match(/https:\/\/\S+/)[0],
    ).searchParams.get("token")!;
    const stored = await env.DB.prepare(
      "SELECT * FROM tokens WHERE purpose='reset'",
    ).first<any>();
    expect(stored.hash).toBe(await hash(token));
    expect(
      stored.expires_at <= new Date(Date.now() + 30 * 60000).toISOString(),
    ).toBe(true);
    expect(
      (
        await request("/auth/reset", "POST", {
          token,
          password: "a-new-long-password",
        })
      ).r.status,
    ).toBe(200);
    expect(
      (
        await request("/auth/reset", "POST", {
          token,
          password: "other-long-password",
        })
      ).r.status,
    ).toBe(400);
    expect((await request("/trips", "GET", undefined, r.cookie)).r.status).toBe(
      401,
    );
    expect(
      (
        await request("/auth/login", "POST", {
          email: "traveler@example.com",
          password: "a-new-long-password",
        })
      ).r.status,
    ).toBe(200);
  });
  it("rejects expired verification and reset tokens", async () => {
    const g = await guest();
    await register(g.cookie);
    const token = randomToken();
    const user = await env.DB.prepare("SELECT id FROM users").first<any>();
    await env.DB.prepare("INSERT INTO tokens VALUES (?,?,?,?)")
      .bind(await hash(token), user.id, "reset", "2000-01-01T00:00:00.000Z")
      .run();
    expect(
      (
        await request("/auth/reset", "POST", {
          token,
          password: "a-new-long-password",
        })
      ).r.status,
    ).toBe(400);
  });
  it("changes password, updates profile, invalidates other sessions", async () => {
    const g = await guest(),
      r = await register(g.cookie);
    const second = await request("/auth/login", "POST", {
      email: "traveler@example.com",
      password: "long-secure-password",
    });
    expect(
      (await request("/account", "PATCH", { name: "New Name" }, r.cookie)).r
        .status,
    ).toBe(200);
    const changed = await request(
      "/auth/password",
      "POST",
      {
        currentPassword: "long-secure-password",
        password: "changed-long-password",
      },
      r.cookie,
    );
    expect(changed.r.status).toBe(200);
    expect(
      (await request("/trips", "GET", undefined, second.cookie)).r.status,
    ).toBe(401);
    expect(
      (await request("/session", "GET", undefined, changed.cookie)).d.user.name,
    ).toBe("New Name");
  });
  it("reports email configuration and delivery failures truthfully", async () => {
    const g = await guest();
    const r = await request(
      "/auth/register",
      "POST",
      {
        name: "Traveler",
        email: "failure@example.com",
        password: "long-secure-password",
      },
      g.cookie,
      {
        ...e,
        EMAIL: {
          send: async () => {
            throw new Error("secret-provider-error");
          },
        },
      },
    );
    expect(r.r.status).toBe(201);
    expect(r.d.emailStatus).toContain("unavailable");
    expect(JSON.stringify(r.d)).not.toContain("secret-provider-error");
    expect(
      (await request("/auth/forgot", "POST", { email: "failure@example.com" }))
        .r.status,
    ).toBe(503);
  });
});
describe("Administrator separation and monitoring", () => {
  async function bootstrap() {
    await env.DB.prepare(
      "INSERT INTO admins(id,username,password_hash,created_at) VALUES (?,?,?,?)",
    )
      .bind(
        "admin-id",
        "admin",
        await passwordHash("admin"),
        new Date().toISOString(),
      )
      .run();
    return request("/admin/login", "POST", {
      username: "admin",
      password: "admin",
    });
  }
  async function changedAdmin() {
    const r = await bootstrap();
    await request(
      "/admin/password",
      "POST",
      { currentPassword: "admin", password: "secure-admin-password" },
      r.cookie,
    );
    return r.cookie;
  }
  it("forces bootstrap replacement and separates admin/application sessions", async () => {
    const r = await bootstrap();
    expect(r.d.admin.must_change).toBe(1);
    expect(
      (await request("/admin/overview", "GET", undefined, r.cookie)).r.status,
    ).toBe(403);
    expect((await request("/trips", "GET", undefined, r.cookie)).r.status).toBe(
      401,
    );
    const g = await guest();
    expect(
      (await request("/admin/overview", "GET", undefined, g.cookie)).r.status,
    ).toBe(401);
    expect(
      (
        await request(
          "/admin/password",
          "POST",
          { currentPassword: "admin", password: "secure-admin-password" },
          r.cookie,
        )
      ).r.status,
    ).toBe(200);
    expect(
      (await request("/admin/overview", "GET", undefined, r.cookie)).r.status,
    ).toBe(200);
  });
  it("creates, resets, disables and deletes admins while protecting the last active administrator", async () => {
    const cookie = await changedAdmin();
    expect(
      (
        await request(
          "/admin/admins/admin-id",
          "PATCH",
          { disabled: true, confirm: true },
          cookie,
        )
      ).r.status,
    ).toBe(400);
    expect(
      (
        await request(
          "/admin/admins",
          "POST",
          { username: "second", password: "temporary-password" },
          cookie,
        )
      ).r.status,
    ).toBe(201);
    let list = await request("/admin/admins", "GET", undefined, cookie);
    const second = list.d.rows.find((r: any) => r.username === "second");
    expect(
      (
        await request(
          "/admin/admins/" + second.id,
          "PATCH",
          { password: "reset-admin-password", confirm: true },
          cookie,
        )
      ).r.status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/admins/" + second.id,
          "PATCH",
          { disabled: true, confirm: true },
          cookie,
        )
      ).r.status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/admins/" + second.id,
          "DELETE",
          { confirm: true },
          cookie,
        )
      ).r.status,
    ).toBe(200);
    list = await request("/admin/admins", "GET", undefined, cookie);
    expect(list.d.rows).toHaveLength(1);
  });
  it("filters aggregate costs by date and exposes unattributed usage", async () => {
    const cookie = await changedAdmin(),
      g = await guest(),
      t = await create(g.cookie);
    mockAI();
    await request(
      "/trips/" + t.d.trip.id + "/chat",
      "POST",
      { content: "Plan", version: 0 },
      g.cookie,
    );
    const o = await request("/admin/overview", "GET", undefined, cookie);
    expect(o.d.totals.trips).toBe(1);
    expect(o.d.costs.requests).toBe(1);
    expect(o.d.costs.total).toBeCloseTo(0.0029);
    const historical = await request(
      "/admin/overview?start=2000-01-01&end=2000-01-02",
      "GET",
      undefined,
      cookie,
    );
    expect(historical.d.costs.requests).toBe(0);
    expect(historical.d.totals.trips).toBe(1);
    expect(historical.d.period.trips).toBe(0);
    expect(
      (await request("/admin/overview?start=invalid", "GET", undefined, cookie))
        .r.status,
    ).toBe(400);
  });
  it("audits trip access and protected user deletion, retaining anonymized costs", async () => {
    const cookie = await changedAdmin(),
      g = await guest();
    const r = await request(
      "/auth/register",
      "POST",
      {
        name: "Traveler",
        email: "traveler@example.com",
        password: "long-secure-password",
      },
      g.cookie,
      emailEnv(),
    );
    const t = await create(r.cookie);
    mockAI();
    await request(
      "/trips/" + t.d.trip.id + "/chat",
      "POST",
      { content: "Plan", version: 0 },
      r.cookie,
    );
    expect(
      (await request("/admin/trips/" + t.d.trip.id, "GET", undefined, cookie)).r
        .status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/users/" + r.d.user.id,
          "PATCH",
          { disabled: true, confirm: true },
          cookie,
        )
      ).r.status,
    ).toBe(200);
    expect((await request("/trips", "GET", undefined, r.cookie)).r.status).toBe(
      401,
    );
    expect(
      (
        await request(
          "/admin/users/" + r.d.user.id,
          "DELETE",
          { confirm: true },
          cookie,
        )
      ).r.status,
    ).toBe(200);
    const usage = await env.DB.prepare("SELECT * FROM usage").first<any>();
    expect(usage.user_id).toBeNull();
    const afterDeletion = await request(
      "/admin/overview",
      "GET",
      undefined,
      cookie,
    );
    expect(afterDeletion.d.costs.unattributed_requests).toBe(1);
    expect(afterDeletion.d.costs.unattributed_cost).toBeCloseTo(0.0029);
    expect(
      (await request("/admin/audit", "GET", undefined, cookie)).d.rows.some(
        (r: any) => r.action === "trip.inspect",
      ),
    ).toBe(true);
    expect(
      (await env.DB.prepare("SELECT COUNT(*) count FROM trips").first<any>())
        .count,
    ).toBe(0);
  });
});
describe("Usage and schema accounting", () => {
  it("prices input, cached input, output separately and preserves unknown prices", () => {
    expect(
      calculateCost(1000, 500, 200, {
        input: 1,
        output: 4,
        cached: 0.5,
        reference: "test",
      }),
    ).toBeCloseTo(0.0029);
    expect(calculateCost(100, 200, 0, null)).toBeNull();
    expect(modelPricing(e, "unknown-model")).toBeNull();
  });
  it("records Google Places SKU, guest and trip attribution with configurable price", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    fetchMock
      .get("https://places.googleapis.com")
      .intercept({ path: "/v1/places:searchText", method: "POST" })
      .reply(200, {
        places: [{ id: "place1", displayName: { text: "A real place" } }],
      });
    const r = await request(
      "/trips/" + t.d.trip.id + "/places",
      "POST",
      { query: "Kyoto museums" },
      g.cookie,
      { ...e, GOOGLE_MAPS_API_KEY: "fake-key" },
    );
    expect(r.r.status).toBe(200);
    const row = await env.DB.prepare("SELECT * FROM usage").first<any>();
    expect(row.provider).toBe("google");
    expect(row.model).toContain("Pro");
    expect(row.cost).toBeCloseTo(0.032);
    expect(row.trip_id).toBe(t.d.trip.id);
    expect(row.guest_id).toBeTruthy();
  });
  it("records Google API usage outside a trip and failed requests", async () => {
    const g = await guest();
    fetchMock
      .get("https://places.googleapis.com")
      .intercept({ path: "/v1/places:searchText", method: "POST" })
      .reply(403, {});
    expect(
      (
        await request("/places", "POST", { query: "Paris" }, g.cookie, {
          ...e,
          GOOGLE_MAPS_API_KEY: "fake-key",
        })
      ).r.status,
    ).toBe(502);
    const row = await env.DB.prepare("SELECT * FROM usage").first<any>();
    expect(row.trip_id).toBeNull();
    expect(row.status).toBe("failed");
    expect(row.error).toBe("provider_http_403");
  });
  it("rejects duplicate IDs, overlapping schedules and incomplete coordinate pairs", () => {
    expect(DaysSchema.safeParse([day, { ...day }]).success).toBe(false);
    expect(
      DaysSchema.safeParse([
        { ...day, activities: [{ ...activity, lng: null }] },
      ]).success,
    ).toBe(false);
    expect(
      DaysSchema.safeParse([
        { ...day, activities: [{ ...activity, time: "23:30" }] },
      ]).success,
    ).toBe(false);
  });
  it("normalizes reporting dates to UTC and rejects reversed periods", () => {
    expect(
      dateRange(new URL("https://example.com/?start=2026-01-01&end=2026-01-02"))
        .start,
    ).toBe("2026-01-01T00:00:00.000Z");
    expect(() =>
      dateRange(
        new URL("https://example.com/?start=2026-01-02&end=2026-01-01"),
      ),
    ).toThrow();
  });
});

describe("Scoped conversational changes", () => {
  it("preserves unrelated days even when the model rewrites them", async () => {
    const g = await guest(),
      t = await create(g.cookie),
      path = "/trips/" + t.d.trip.id;
    const original = [
      day,
      {
        ...day,
        id: "d2",
        title: "Unrelated day",
        activities: [{ ...activity, id: "a2" }],
      },
    ];
    await request(path, "PATCH", { version: 0, itinerary: original }, g.cookie);
    mockAI({
      message: "Day one updated.",
      title: "Kyoto escape",
      destination: "Kyoto",
      days: [
        { ...day, title: "Updated day" },
        { ...original[1], title: "Unexpected rewrite" },
      ],
    });
    const r = await request(
      path + "/chat",
      "POST",
      { version: 1, content: "Make day one less expensive." },
      g.cookie,
    );
    expect(r.r.status).toBe(200);
    expect(r.d.trip.itinerary[0].title).toBe("Updated day");
    expect(r.d.trip.itinerary[1]).toEqual(original[1]);
  });
});

describe("Production-compatible password derivation", () => {
  it("matches native standard PBKDF2 at the full work factor", async () => {
    const salt = "a".repeat(64),
      password = "portable-standard-password";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const native = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new TextEncoder().encode(salt),
        iterations: 600000,
        hash: "SHA-256",
      },
      key,
      256,
    );
    const nativeHex = Array.from(new Uint8Array(native), (v) =>
      v.toString(16).padStart(2, "0"),
    ).join("");
    expect(await passwordHash(password, salt)).toBe(
      `pbkdf2:600000:${salt}:${nativeHex}`,
    );
  });
  it("rejects malformed stored work factors before expensive hashing", async () => {
    expect(
      await passwordCheck(
        "password",
        `pbkdf2:999999999:${"a".repeat(64)}:${"b".repeat(64)}`,
      ),
    ).toBe(false);
  });
});

describe("Upstream response edge cases", () => {
  it("marks invalid JSON against the exact billable request and preserves the trip", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    fetchMock
      .get("https://api.openai.com")
      .intercept({ path: "/v1/responses", method: "POST" })
      .reply(200, {
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "not JSON" }] }],
        usage: { input_tokens: 100, output_tokens: 20 },
      });
    const r = await request(
      "/trips/" + t.d.trip.id + "/chat",
      "POST",
      { content: "Plan Kyoto", version: 0 },
      g.cookie,
    );
    expect(r.r.status).toBe(502);
    const usage = await env.DB.prepare("SELECT * FROM usage WHERE trip_id=?")
      .bind(t.d.trip.id)
      .first<any>();
    expect(usage.status).toBe("invalid");
    expect(usage.input_tokens).toBe(100);
    expect(usage.cost).toBeGreaterThan(0);
    expect(
      (await request("/trips/" + t.d.trip.id, "GET", undefined, g.cookie)).d
        .trip.version,
    ).toBe(0);
  });
  it("sends exactly the configured model identifier to OpenAI without substituting one", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    fetchMock
      .get("https://api.openai.com")
      .intercept({
        path: "/v1/responses",
        method: "POST",
        body: (raw: string) =>
          JSON.parse(raw).model === "runtime-selected-model",
      })
      .reply(200, {
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  message: "Ready",
                  title: "Kyoto",
                  destination: "Kyoto",
                  days: [day],
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 20 },
      });
    const r = await request(
      "/trips/" + t.d.trip.id + "/chat",
      "POST",
      { content: "Plan Kyoto", version: 0 },
      g.cookie,
      { ...e, LLM_MODEL: "runtime-selected-model" },
    );
    expect(r.r.status).toBe(200);
    const usage = await env.DB.prepare("SELECT * FROM usage WHERE trip_id=?")
      .bind(t.d.trip.id)
      .first<any>();
    expect(usage.model).toBe("runtime-selected-model");
    expect(usage.cost).toBeNull();
  });
  it("rejects incomplete output while recording reported billable usage", async () => {
    const g = await guest(),
      t = await create(g.cookie);
    fetchMock
      .get("https://api.openai.com")
      .intercept({ path: "/v1/responses", method: "POST" })
      .reply(200, {
        status: "incomplete",
        output: [],
        usage: { input_tokens: 150, output_tokens: 50 },
      });
    expect(
      (
        await request(
          "/trips/" + t.d.trip.id + "/chat",
          "POST",
          { content: "Plan Kyoto", version: 0 },
          g.cookie,
        )
      ).r.status,
    ).toBe(502);
    const usage = await env.DB.prepare("SELECT * FROM usage WHERE trip_id=?")
      .bind(t.d.trip.id)
      .first<any>();
    expect(usage.status).toBe("incomplete");
    expect(usage.output_tokens).toBe(50);
  });
  it("returns the same invalid-login message for unknown and existing accounts", async () => {
    const g = await guest();
    await request(
      "/auth/register",
      "POST",
      {
        name: "Traveler",
        email: "known@example.com",
        password: "long-secure-password",
      },
      g.cookie,
      emailEnv(),
    );
    const a = await request("/auth/login", "POST", {
        email: "known@example.com",
        password: "wrong-password",
      }),
      b = await request("/auth/login", "POST", {
        email: "unknown@example.com",
        password: "wrong-password",
      });
    expect(a.r.status).toBe(401);
    expect(a.d).toEqual(b.d);
  });
});

describe("Administrative reporting detail and pagination", () => {
  it("filters and paginates users/trips and attributes period costs to the selected user", async () => {
    const time = new Date().toISOString(),
      pw = await passwordHash("report-admin-password");
    await env.DB.prepare(
      "INSERT INTO admins(id,username,password_hash,must_change,created_at) VALUES (?,?,?,?,?)",
    )
      .bind("report-admin", "report-admin", pw, 0, time)
      .run();
    const a = await request("/admin/login", "POST", {
      username: "report-admin",
      password: "report-admin-password",
    });
    await env.DB.prepare(
      "INSERT INTO users(id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)",
    )
      .bind("report-user", "report@example.com", "Report Traveler", pw, time)
      .run();
    await env.DB.batch(
      Array.from({ length: 26 }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO trips(id,user_id,title,destination,preferences,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        ).bind(
          `report-trip-${i}`,
          "report-user",
          `Report trip ${i}`,
          "Kyoto",
          "{}",
          time,
          time,
        ),
      ),
    );
    const cookie =
      "travel_session=" + (await newSession(e, "report-user", null));
    mockAI();
    expect(
      (
        await request(
          "/trips/report-trip-0/chat",
          "POST",
          { content: "Plan Kyoto", version: 0 },
          cookie,
        )
      ).r.status,
    ).toBe(200);
    const g = await guest();
    await create(g.cookie);
    const users = await request(
      "/admin/users?q=report&sort=cost",
      "GET",
      undefined,
      a.cookie,
    );
    expect(users.d.rows).toHaveLength(1);
    expect(users.d.rows[0].trips).toBe(26);
    expect(users.d.rows[0].llm_cost).toBeCloseTo(0.0029);
    expect(users.d.rows[0].combined_cost).toBeCloseTo(0.0029);
    expect(users.d.rows[0]).not.toHaveProperty("password_hash");
    const p1 = await request(
        "/admin/trips?user=report-user&page=1",
        "GET",
        undefined,
        a.cookie,
      ),
      p2 = await request(
        "/admin/trips?user=report-user&page=2",
        "GET",
        undefined,
        a.cookie,
      );
    expect(p1.d.rows).toHaveLength(25);
    expect(p2.d.rows).toHaveLength(1);
    expect(
      [...p1.d.rows, ...p2.d.rows].every(
        (r: any) => r.user_id === "report-user",
      ),
    ).toBe(true);
    const history = await request(
      "/admin/usage?user=report-user",
      "GET",
      undefined,
      a.cookie,
    );
    expect(history.d.rows).toHaveLength(1);
    expect(history.d.rows[0].trip_id).toBe("report-trip-0");
    const old = await request(
      "/admin/users?q=report&start=2000-01-01&end=2000-01-02",
      "GET",
      undefined,
      a.cookie,
    );
    expect(old.d.rows[0].trips).toBe(26);
    expect(old.d.rows[0].combined_cost).toBeNull();
  });
});

describe("Administrative abuse audit", () => {
  it("records rate-limited administrator attempts without credentials", async () => {
    for (let i = 0; i < 5; i++) await limit(e, "admin-login:local", 5, 900);
    const r = await request("/admin/login", "POST", {
      username: "admin",
      password: "never-log-this-password",
    });
    expect(r.r.status).toBe(429);
    const records = (await env.DB.prepare("SELECT * FROM audit").all()).results;
    expect(records).toHaveLength(1);
    expect(records[0].outcome).toBe("rate_limited");
    expect(JSON.stringify(records)).not.toContain("never-log-this-password");
  });
});
