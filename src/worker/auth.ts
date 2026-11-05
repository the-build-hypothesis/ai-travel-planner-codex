import { HttpError, body, id, json, now, type Env, type Row } from "./types";
import {
  audit,
  cookie,
  email,
  hash,
  identity,
  limit,
  migrateGuest,
  newSession,
  passwordCheck,
  passwordHash,
  randomToken,
  requireAdmin,
  requireIdentity,
  setCookie,
  validatePassword,
} from "./security";
// A fixed non-account value gives unknown identities the same one-hash work
// factor as existing accounts. It is not an account credential.
const dummyHash = `pbkdf2:600000:${"a".repeat(64)}:${"b".repeat(64)}`;
async function sendToken(env: Env, user: Row, purpose: "verify" | "reset") {
  if (!env.EMAIL || !env.EMAIL_FROM || !env.APP_PUBLIC_URL)
    throw new HttpError(
      503,
      "Transactional email is not configured. Contact the administrator.",
    );
  const token = randomToken();
  const tokenHash = await hash(token);
  await env.DB.prepare("INSERT INTO tokens VALUES (?,?,?,?)")
    .bind(
      tokenHash,
      user.id,
      purpose,
      new Date(
        Date.now() + (purpose === "reset" ? 30 * 60000 : 24 * 3600000),
      ).toISOString(),
    )
    .run();
  const link = new URL(
    purpose === "reset" ? "/reset-password" : "/verify-email",
    env.APP_PUBLIC_URL,
  );
  link.searchParams.set("token", token);
  try {
    await env.EMAIL.send({
      from: env.EMAIL_FROM,
      to: user.email,
      subject:
        purpose === "reset"
          ? "Reset your Elsewhere password"
          : "Welcome to Elsewhere — verify your email",
      text: `${purpose === "reset" ? "Set a new password" : "Verify your email address"}: ${link.toString()}\nThis link expires in ${purpose === "reset" ? "30 minutes" : "24 hours"} and can only be used once. If you did not request this, ignore this email.`,
    });
  } catch {
    await env.DB.prepare("DELETE FROM tokens WHERE hash=?")
      .bind(tokenHash)
      .run();
    throw new HttpError(
      503,
      "Email delivery is unavailable. Please try again later.",
    );
  }
}
export async function auth(
  req: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  if (path === "/api/session" && req.method === "GET") {
    let actor = await identity(req, env);
    if (!actor.sessionHash) {
      await limit(env, `guest:${ip}`, 100, 3600);
      const guest = id();
      await env.DB.prepare("INSERT INTO guests VALUES (?,?)")
        .bind(guest, now())
        .run();
      const token = await newSession(env, null, guest);
      return setCookie(
        json({ user: null, guest: true }),
        "travel_session",
        token,
        30 * 86400,
        req,
      );
    }
    return json({ user: actor.user, guest: !actor.user });
  }
  if (path === "/api/auth/logout" && req.method === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE hash=?")
      .bind(await hash(cookie(req, "travel_session")))
      .run();
    return setCookie(json({ ok: true }), "travel_session", "", 0, req);
  }
  if (path === "/api/auth/register" && req.method === "POST") {
    await limit(env, `register:${ip}`, 5, 3600);
    const b = await body(req);
    const address = email(b.email),
      pass = validatePassword(b.password);
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
    if (!name) throw new HttpError(400, "Enter your name");
    const actor = await identity(req, env);
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?")
      .bind(address)
      .first();
    if (existing)
      throw new HttpError(
        400,
        "Unable to create an account. Try signing in or recovering your password.",
      );
    const user = { id: id(), email: address, name };
    await env.DB.prepare(
      "INSERT INTO users(id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)",
    )
      .bind(user.id, address, name, await passwordHash(pass), now())
      .run();
    await migrateGuest(env, actor, user.id);
    let emailStatus = "sent";
    try {
      await sendToken(env, user, "verify");
    } catch (e) {
      emailStatus = e instanceof HttpError ? e.message : "Email unavailable";
    }
    return setCookie(
      json({ user: { ...user, verified: 0 }, emailStatus }, 201),
      "travel_session",
      await newSession(env, user.id, null),
      30 * 86400,
      req,
    );
  }
  if (path === "/api/auth/login" && req.method === "POST") {
    await limit(env, `login:${ip}`, 15, 900);
    const b = await body(req);
    const address = email(b.email);
    await limit(env, `login-email:${await hash(address)}`, 10, 900);
    if (typeof b.password !== "string" || b.password.length > 128)
      throw new HttpError(400, "Invalid credentials");
    const user = await env.DB.prepare("SELECT * FROM users WHERE email=?")
      .bind(address)
      .first<Row>();
    const valid = await passwordCheck(
      b.password,
      user?.password_hash || dummyHash,
    );
    if (!user || !valid || user.disabled)
      throw new HttpError(401, "Email or password is incorrect");
    const actor = await identity(req, env);
    await migrateGuest(env, actor, user.id);
    if (actor.sessionHash)
      await env.DB.prepare("DELETE FROM sessions WHERE hash=?")
        .bind(actor.sessionHash)
        .run();
    const { password_hash, ...safe } = user;
    return setCookie(
      json({ user: safe }),
      "travel_session",
      await newSession(env, user.id, null),
      30 * 86400,
      req,
    );
  }
  if (path === "/api/auth/forgot" && req.method === "POST") {
    await limit(env, `forgot:${ip}`, 5, 3600);
    const b = await body(req);
    const address = email(b.email);
    await limit(env, `forgot-email:${await hash(address)}`, 3, 3600);
    if (!env.EMAIL || !env.EMAIL_FROM)
      throw new HttpError(
        503,
        "Transactional email is not configured. Contact the administrator.",
      );
    const user = await env.DB.prepare(
      "SELECT id,email FROM users WHERE email=? AND disabled=0",
    )
      .bind(address)
      .first<Row>();
    if (user) {
      try {
        await sendToken(env, user, "reset");
      } catch {
        await env.DB.prepare("INSERT INTO errors VALUES (?,?,?,?)")
          .bind(id(), now(), "email", "reset_delivery_failed")
          .run();
      }
    }
    return json({
      message:
        "If an eligible account exists, a reset email has been requested. If it does not arrive, try again later or contact support.",
    });
  }
  if (path === "/api/auth/verify" && req.method === "POST") {
    await limit(env, `verify:${ip}`, 30, 3600);
    const b = await body(req);
    if (typeof b.token !== "string") throw new HttpError(400, "Invalid link");
    const h = await hash(b.token);
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE users SET verified=1 WHERE id=(SELECT user_id FROM tokens WHERE hash=? AND purpose='verify' AND expires_at>?) RETURNING id",
      ).bind(h, now()),
      env.DB.prepare(
        "DELETE FROM tokens WHERE hash=? AND purpose='verify'",
      ).bind(h),
    ]);
    if (!results[0].results.length)
      throw new HttpError(400, "This verification link is invalid or expired");
    return json({ ok: true });
  }
  if (path === "/api/auth/reset" && req.method === "POST") {
    await limit(env, `reset:${ip}`, 10, 3600);
    const b = await body(req);
    const password = validatePassword(b.password);
    if (typeof b.token !== "string") throw new HttpError(400, "Invalid link");
    const h = await hash(b.token);
    const passHash = await passwordHash(password);
    const results = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM sessions WHERE user_id=(SELECT user_id FROM tokens WHERE hash=? AND purpose='reset' AND expires_at>?)",
      ).bind(h, now()),
      env.DB.prepare(
        "UPDATE users SET password_hash=? WHERE id=(SELECT user_id FROM tokens WHERE hash=? AND purpose='reset' AND expires_at>?) RETURNING id",
      ).bind(passHash, h, now()),
      env.DB.prepare(
        "DELETE FROM tokens WHERE user_id=(SELECT user_id FROM tokens WHERE hash=? AND purpose='reset')",
      ).bind(h),
    ]);
    if (!results[1].results.length)
      throw new HttpError(400, "This reset link is invalid or expired");
    return json({ ok: true });
  }
  if (path === "/api/auth/resend" && req.method === "POST") {
    const a = await requireIdentity(req, env);
    if (!a.user) throw new HttpError(401, "Sign in first");
    await limit(env, `resend:${a.user.id}`, 3, 3600);
    if (!a.user.verified) await sendToken(env, a.user, "verify");
    return json({ message: "Verification email requested." });
  }
  if (path === "/api/account" && req.method === "PATCH") {
    const a = await requireIdentity(req, env);
    if (!a.user) throw new HttpError(401, "Sign in first");
    const b = await body(req);
    if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 80)
      throw new HttpError(400, "Enter a name");
    await env.DB.prepare("UPDATE users SET name=? WHERE id=?")
      .bind(b.name.trim(), a.user.id)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/auth/password" && req.method === "POST") {
    const a = await requireIdentity(req, env);
    if (!a.user) throw new HttpError(401, "Sign in first");
    await limit(env, `password:${a.user.id}`, 5, 900);
    const b = await body(req);
    const password = validatePassword(b.password);
    const user = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE id=?",
    )
      .bind(a.user.id)
      .first<Row>();
    if (
      typeof b.currentPassword !== "string" ||
      !(await passwordCheck(b.currentPassword, user!.password_hash))
    )
      throw new HttpError(400, "Current password is incorrect");
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(
        await passwordHash(password),
        a.user.id,
      ),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(a.user.id),
      env.DB.prepare(
        "DELETE FROM tokens WHERE user_id=? AND purpose='reset'",
      ).bind(a.user.id),
    ]);
    return setCookie(
      json({ ok: true }),
      "travel_session",
      await newSession(env, a.user.id, null),
      30 * 86400,
      req,
    );
  }
  if (path === "/api/admin/login" && req.method === "POST") {
    try {
      await limit(env, `admin-login:${ip}`, 5, 900);
    } catch (e) {
      await audit(env, null, "admin.login", null, "rate_limited");
      throw e;
    }
    const b = await body(req);
    if (
      typeof b.username !== "string" ||
      typeof b.password !== "string" ||
      b.password.length > 128
    )
      throw new HttpError(400, "Invalid credentials");
    try {
      await limit(
        env,
        `admin-username:${await hash(b.username.toLowerCase())}`,
        8,
        900,
      );
    } catch (e) {
      await audit(env, null, "admin.login", null, "rate_limited");
      throw e;
    }
    const admin = await env.DB.prepare("SELECT * FROM admins WHERE username=?")
      .bind(b.username)
      .first<Row>();
    const valid = await passwordCheck(
      b.password,
      admin?.password_hash || dummyHash,
    );
    await audit(
      env,
      admin?.id || null,
      "admin.login",
      null,
      admin && valid && !admin.disabled ? "success" : "failed",
    );
    if (!admin || !valid || admin.disabled)
      throw new HttpError(401, "Invalid administrator credentials");
    const token = randomToken();
    await env.DB.prepare("INSERT INTO admin_sessions VALUES (?,?,?)")
      .bind(
        await hash(token),
        admin.id,
        new Date(Date.now() + 8 * 3600000).toISOString(),
      )
      .run();
    return setCookie(
      json({
        admin: {
          id: admin.id,
          username: admin.username,
          must_change: admin.must_change,
        },
      }),
      "travel_admin",
      token,
      8 * 3600,
      req,
    );
  }
  if (path === "/api/admin/session" && req.method === "GET") {
    const a = await requireAdmin(req, env, true);
    return json({
      admin: { id: a.id, username: a.username, must_change: a.must_change },
    });
  }
  if (path === "/api/admin/logout" && req.method === "POST") {
    await env.DB.prepare("DELETE FROM admin_sessions WHERE hash=?")
      .bind(await hash(cookie(req, "travel_admin")))
      .run();
    return setCookie(json({ ok: true }), "travel_admin", "", 0, req);
  }
  if (path === "/api/admin/password" && req.method === "POST") {
    const a = await requireAdmin(req, env, true);
    await limit(env, `admin-password:${a.id}`, 5, 900);
    const b = await body(req);
    const password = validatePassword(b.password);
    if (
      typeof b.currentPassword !== "string" ||
      !(await passwordCheck(b.currentPassword, a.password_hash))
    )
      throw new HttpError(400, "Current password is incorrect");
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE admins SET password_hash=?,must_change=0 WHERE id=?",
      ).bind(await passwordHash(password), a.id),
      env.DB.prepare(
        "DELETE FROM admin_sessions WHERE admin_id=? AND hash<>?",
      ).bind(a.id, await hash(cookie(req, "travel_admin"))),
    ]);
    await audit(env, a.id, "admin.password_change", a.id);
    return json({ ok: true });
  }
  return null;
}
