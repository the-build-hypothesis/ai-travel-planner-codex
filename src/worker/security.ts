import { HttpError, id, now, type Env, type Identity, type Row } from "./types";
const enc = new TextEncoder();
export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function passwordHash(
  password: string,
  salt = randomToken(),
  iterations = 600000,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2:${iterations}:${salt}:${Array.from(new Uint8Array(bits), (v) => v.toString(16).padStart(2, "0")).join("")}`;
}
export async function passwordCheck(password: string, stored: string) {
  const parts = stored.split(":");
  if (parts.length !== 4) return false;
  const derived = await passwordHash(password, parts[2], Number(parts[1]));
  let diff = derived.length ^ stored.length;
  for (let i = 0; i < stored.length; i++)
    diff |= stored.charCodeAt(i) ^ (derived.charCodeAt(i) || 0);
  return diff === 0;
}
export function validatePassword(value: unknown) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new HttpError(400, "Use a password with 12–128 characters");
  return value;
}
export function email(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^\S+@[^\s@]+\.[^\s@]+$/.test(value)
  )
    throw new HttpError(400, "Enter a valid email address");
  return value.trim().toLowerCase();
}
export function cookie(req: Request, name: string) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function setCookie(
  res: Response,
  name: string,
  value: string,
  seconds: number,
  req: Request,
) {
  res.headers.append(
    "Set-Cookie",
    `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
  );
  return res;
}
export async function limit(
  env: Env,
  key: string,
  max: number,
  windowSeconds: number,
) {
  const stamp = Date.now();
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count",
  )
    .bind(key, stamp + windowSeconds * 1000, stamp, stamp)
    .first<Row>();
  if (row!.count > max)
    throw new HttpError(429, "Too many requests. Please try again later.");
}
export async function identity(req: Request, env: Env): Promise<Identity> {
  const token = cookie(req, "travel_session");
  const h = token ? await hash(token) : "";
  if (h) {
    const session = await env.DB.prepare(
      "SELECT * FROM sessions WHERE hash=? AND expires_at>?",
    )
      .bind(h, now())
      .first<Row>();
    if (session) {
      const user = session.user_id
        ? await env.DB.prepare(
            "SELECT id,email,name,verified,disabled,created_at FROM users WHERE id=?",
          )
            .bind(session.user_id)
            .first<Row>()
        : null;
      if (user?.disabled) throw new HttpError(403, "This account is disabled");
      return { user, guestId: session.guest_id, sessionHash: h };
    }
  }
  return { user: null, guestId: null, sessionHash: "" };
}
export async function newSession(
  env: Env,
  userId: string | null,
  guestId: string | null,
) {
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO sessions(hash,user_id,guest_id,expires_at) VALUES (?,?,?,?)",
  )
    .bind(
      await hash(token),
      userId,
      guestId,
      new Date(Date.now() + 30 * 86400000).toISOString(),
    )
    .run();
  return token;
}
export async function requireIdentity(req: Request, env: Env) {
  const actor = await identity(req, env);
  if (!actor.sessionHash)
    throw new HttpError(401, "Start a guest session or sign in");
  return actor;
}
export async function requireAdmin(
  req: Request,
  env: Env,
  allowChange = false,
) {
  const token = cookie(req, "travel_admin");
  const row = await env.DB.prepare(
    "SELECT a.* FROM admins a JOIN admin_sessions s ON a.id=s.admin_id WHERE s.hash=? AND s.expires_at>? AND a.disabled=0",
  )
    .bind(await hash(token), now())
    .first<Row>();
  if (!row) throw new HttpError(401, "Administrator sign in required");
  if (row.must_change && !allowChange)
    throw new HttpError(
      403,
      "Change your initial administrator password first",
    );
  return row;
}
export async function audit(
  env: Env,
  actor: string | null,
  action: string,
  target: string | null,
  outcome = "success",
) {
  await env.DB.prepare("INSERT INTO audit VALUES (?,?,?,?,?,?)")
    .bind(id(), now(), actor, action, target, outcome)
    .run();
}
export async function ownTrip(env: Env, actor: Identity, tripId: string) {
  const row = await env.DB.prepare(
    "SELECT * FROM trips WHERE id=? AND " +
      (actor.user ? "user_id=?" : "guest_id=? AND user_id IS NULL"),
  )
    .bind(tripId, actor.user?.id || actor.guestId)
    .first<Row>();
  if (!row) throw new HttpError(404, "Trip not found");
  return row;
}
export async function migrateGuest(env: Env, actor: Identity, userId: string) {
  if (actor.guestId && !actor.user) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE trips SET user_id=?,guest_id=NULL WHERE guest_id=? AND user_id IS NULL",
      ).bind(userId, actor.guestId),
      env.DB.prepare(
        "UPDATE usage SET user_id=? WHERE guest_id=? AND user_id IS NULL",
      ).bind(userId, actor.guestId),
      env.DB.prepare("DELETE FROM sessions WHERE guest_id=?").bind(
        actor.guestId,
      ),
    ]);
  }
}
