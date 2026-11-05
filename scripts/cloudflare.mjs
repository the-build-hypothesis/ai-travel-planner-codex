// Operator-only infrastructure helper. Loads credentials without printing them.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
function config() {
  const values = { ...process.env };
  for (const line of readFileSync("cloudflare.env", "utf8").split("\n")) {
    const m = line.match(/^(?:export\s+)?([A-Z_]+)=["']?(.*?)["']?$/);
    if (m)
      values[m[1]] = m[2].replace(
        /\$\{([A-Z_]+)\}/g,
        (_, key) => values[key] || "",
      );
  }
  return values;
}
const c = config();
const base = `https://api.cloudflare.com/client/v4/accounts/${c.CLOUDFLARE_ACCOUNT_ID}`;
async function cf(path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${c.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok || !data.success)
    throw new Error(`Cloudflare ${r.status}: ${JSON.stringify(data.errors)}`);
  return data.result;
}
const cmd = process.argv[2];
if (cmd === "inspect") {
  const settings = await cf(
    `/workers/scripts/${c.CLOUDFLARE_WORKER_NAME}/settings`,
  );
  console.log(
    JSON.stringify(
      {
        worker: c.CLOUDFLARE_WORKER_NAME,
        bindings: settings.bindings?.map((b) => ({
          name: b.name,
          type: b.type,
          ...(b.type === "plain_text" ? { text: b.text } : {}),
        })),
        compatibility_date: settings.compatibility_date,
      },
      null,
      2,
    ),
  );
} else if (cmd === "provision") {
  const name = c.EXPERIMENT_RESOURCE_PREFIX + "-db";
  let dbs = await cf("/d1/database?per_page=100");
  let db = dbs.find((d) => d.name === name);
  if (!db) {
    db = await cf("/d1/database", "POST", { name });
    console.log("Created D1 database " + name);
  }
  const settings = await cf(
    `/workers/scripts/${c.CLOUDFLARE_WORKER_NAME}/settings`,
  );
  const emailBindings =
    settings.bindings?.filter((b) => b.type === "send_email") || [];
  const conf = {
    name: c.CLOUDFLARE_WORKER_NAME,
    main: "src/worker/index.ts",
    compatibility_date: "2026-11-01",
    compatibility_flags: ["nodejs_compat"],
    keep_vars: true,
    assets: {
      directory: "./dist",
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"],
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: name,
        database_id: db.uuid,
        migrations_dir: "migrations",
      },
    ],
    send_email: emailBindings.length
      ? emailBindings.map(({ type, ...b }) => ({ ...b, name: "EMAIL" }))
      : [{ name: "EMAIL" }],
    vars: {
      APP_PUBLIC_URL: c.APP_PUBLIC_URL,
      PRICING_JSON: JSON.stringify(
        JSON.parse(readFileSync("pricing.json", "utf8")),
      ),
    },
    routes: [{ pattern: c.APP_PUBLIC_HOSTNAME, custom_domain: true }],
    observability: { enabled: true },
    build: { command: "npm run build" },
  };
  writeFileSync("wrangler.jsonc", JSON.stringify(conf, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        database: name,
        databaseId: db.uuid,
        worker: c.CLOUDFLARE_WORKER_NAME,
        url: c.APP_PUBLIC_URL,
        emailBindings: conf.send_email,
      },
      null,
      2,
    ),
  );
} else if (cmd === "worker-metadata") {
  const scripts = await cf("/workers/scripts");
  const w = scripts.find((w) => w.id === c.CLOUDFLARE_WORKER_NAME);
  console.log(JSON.stringify(w, null, 2));
} else if (cmd === "builds") {
  const scripts = await cf("/workers/scripts");
  const worker = scripts.find((w) => w.id === c.CLOUDFLARE_WORKER_NAME);
  const r = await fetch(`${base}/builds/workers/${worker.tag}/builds`, {
    headers: { Authorization: `Bearer ${c.CLOUDFLARE_API_TOKEN}` },
  });
  const d = await r.json();
  const summary = {
    at: new Date().toISOString(),
    success: d.success,
    builds: d.result?.map((b) => ({
      id: b.build_uuid,
      status: b.status,
      outcome: b.build_outcome,
      commit: b.build_trigger_metadata?.commit_hash,
      source: b.build_trigger_metadata?.build_trigger_source,
      branch: b.build_trigger_metadata?.branch,
      createdAt: b.created_on,
      stoppedAt: b.stopped_on,
    })),
  };
  writeFileSync(
    "evidence/github-builds.json",
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary, null, 2));
} else if (cmd === "build-log") {
  const scripts = await cf("/workers/scripts");
  const worker = scripts.find((w) => w.id === c.CLOUDFLARE_WORKER_NAME);
  const builds = await cf(`/builds/workers/${worker.tag}/builds`);
  const latest = builds[0];
  if (!latest) throw new Error("No build found");
  const logs = await cf(`/builds/builds/${latest.build_uuid}/logs`);
  writeFileSync(
    "evidence/latest-build-log.json",
    JSON.stringify(logs, null, 2) + "\n",
  );
  console.log(JSON.stringify(logs, null, 2));
} else if (cmd === "triggers") {
  const scripts = await cf("/workers/scripts");
  const worker = scripts.find((w) => w.id === c.CLOUDFLARE_WORKER_NAME);
  console.log(
    JSON.stringify(await cf(`/builds/workers/${worker.tag}/triggers`), null, 2),
  );
} else if (cmd === "versions") {
  const versions = await cf(
    `/workers/scripts/${c.CLOUDFLARE_WORKER_NAME}/versions`,
  );
  console.log(JSON.stringify(versions, null, 2));
} else if (cmd === "bootstrap") {
  // One-time marker prevents deleted bootstrap accounts from being recreated.
  const db = JSON.parse(readFileSync("wrangler.jsonc")).d1_databases[0]
    .database_id;
  const { webcrypto } = await import("node:crypto");
  const salt = Array.from(webcrypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("admin"),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 600000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  const hash = `pbkdf2:600000:${salt}:${Buffer.from(bits).toString("hex")}`;
  const result = await cf(`/d1/database/${db}/query`, "POST", {
    sql: "INSERT INTO admins(id,username,password_hash,created_at) SELECT ?, 'admin', ?, ? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE key='admin_bootstrapped') AND NOT EXISTS(SELECT 1 FROM admins)",
    params: [crypto.randomUUID(), hash, new Date().toISOString()],
  });
  await cf(`/d1/database/${db}/query`, "POST", {
    sql: "INSERT OR IGNORE INTO settings VALUES ('admin_bootstrapped','1')",
  });
  console.log(
    JSON.stringify(
      result.map((r) => ({ success: r.success, changes: r.meta?.changes })),
      null,
      2,
    ),
  );
} else if (cmd === "verification") {
  const db = JSON.parse(readFileSync("wrangler.jsonc", "utf8")).d1_databases[0]
    .database_id;
  const queries = {
    counts:
      "SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM trips) trips,(SELECT COUNT(*) FROM admins) admins,(SELECT COUNT(*) FROM admins WHERE must_change=1) admins_awaiting_password_change,(SELECT COUNT(*) FROM settings WHERE key='admin_bootstrapped') bootstrap_markers",
    errors:
      "SELECT category,code,COUNT(*) count FROM errors GROUP BY category,code",
    usage:
      "SELECT provider,status,COUNT(*) requests,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(cached_tokens) cached_tokens,SUM(cost) estimated_usd FROM usage GROUP BY provider,status",
  };
  const observed = {
    at: new Date().toISOString(),
    database: config().EXPERIMENT_RESOURCE_PREFIX + "-db",
  };
  for (const [key, sql] of Object.entries(queries))
    observed[key] = (
      await cf(`/d1/database/${db}/query`, "POST", { sql })
    )[0].results;
  writeFileSync(
    "evidence/production-database.json",
    JSON.stringify(observed, null, 2) + "\n",
  );
  console.log(JSON.stringify(observed, null, 2));
} else if (cmd === "security") {
  const results = await Promise.all(
    ["/", "/admin", "/api/health"].map(async (path) => {
      const response = await fetch(c.APP_PUBLIC_URL + path);
      const names = [
        "content-security-policy",
        "x-frame-options",
        "x-content-type-options",
        "strict-transport-security",
        "referrer-policy",
      ];
      const headers = Object.fromEntries(
        names.map((name) => [name, response.headers.get(name)]),
      );
      return {
        path,
        status: response.status,
        headers,
        passed: response.ok && names.every((name) => !!headers[name]),
      };
    }),
  );
  const evidence = { at: new Date().toISOString(), results };
  writeFileSync(
    "evidence/security-headers.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} else if (cmd === "health") {
  const r = await fetch(c.APP_PUBLIC_URL + "/api/health");
  console.log(
    JSON.stringify(
      { status: r.status, url: c.APP_PUBLIC_URL, data: await r.json() },
      null,
      2,
    ),
  );
} else throw new Error("Unknown operation");
