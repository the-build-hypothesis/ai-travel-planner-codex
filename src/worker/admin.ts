import {
  all,
  body,
  HttpError,
  id,
  json,
  now,
  type Env,
  type Row,
} from "./types";
import {
  audit,
  passwordHash,
  requireAdmin,
  validatePassword,
} from "./security";
export function dateRange(url: URL) {
  const end = url.searchParams.get("end") || now(),
    start =
      url.searchParams.get("start") ||
      new Date(Date.now() - 30 * 86400000).toISOString();
  if (
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(start) > Date.parse(end)
  )
    throw new HttpError(400, "Invalid reporting period");
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}
export async function adminApi(
  req: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (!path.startsWith("/api/admin/")) return null;
  const a = await requireAdmin(req, env);
  const url = new URL(req.url);
  const { start, end } = dateRange(url);
  const page = Math.max(
      1,
      Math.min(100000, Number(url.searchParams.get("page")) || 1),
    ),
    offset = (page - 1) * 25,
    q = (url.searchParams.get("q") || "").slice(0, 200);
  const userFilter = url.searchParams.get("user"),
    tripFilter = url.searchParams.get("trip");
  if (path === "/api/admin/overview" && req.method === "GET") {
    const [totals, period, costs, series, activity, errors] = await Promise.all(
      [
        env.DB.prepare(
          "SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM trips) trips",
        ).first(),
        env.DB.prepare(
          "SELECT (SELECT COUNT(*) FROM users WHERE created_at BETWEEN ? AND ?) users,(SELECT COUNT(*) FROM trips WHERE created_at BETWEEN ? AND ?) trips",
        )
          .bind(start, end, start, end)
          .first(),
        env.DB.prepare(
          "SELECT SUM(CASE WHEN provider='openai' THEN cost ELSE 0 END) llm,SUM(CASE WHEN provider='google' THEN cost ELSE 0 END) places,SUM(cost) total,COUNT(*) requests,SUM(CASE WHEN cost IS NULL THEN 1 ELSE 0 END) unknown_costs,SUM(CASE WHEN status<>'success' THEN 1 ELSE 0 END) failures,AVG(duration_ms) latency,SUM(input_tokens) input_tokens,SUM(output_tokens) output_tokens,SUM(CASE WHEN trip_id IS NULL OR NOT EXISTS(SELECT 1 FROM trips existing_trip WHERE existing_trip.id=usage.trip_id) THEN cost ELSE 0 END) unattributed_cost,SUM(CASE WHEN trip_id IS NULL OR NOT EXISTS(SELECT 1 FROM trips existing_trip WHERE existing_trip.id=usage.trip_id) THEN 1 ELSE 0 END) unattributed_requests FROM usage WHERE timestamp BETWEEN ? AND ?",
        )
          .bind(start, end)
          .first(),
        all(
          env.DB,
          "SELECT substr(timestamp,1,10) day,SUM(cost) cost,SUM(input_tokens+output_tokens) tokens,COUNT(*) requests,SUM(CASE WHEN provider='google' THEN units ELSE 0 END) places FROM usage WHERE timestamp BETWEEN ? AND ? GROUP BY day ORDER BY day",
          start,
          end,
        ),
        all(
          env.DB,
          "SELECT day,SUM(trips) trips,SUM(users) users FROM (SELECT substr(created_at,1,10) day,COUNT(*) trips,0 users FROM trips WHERE created_at BETWEEN ? AND ? GROUP BY day UNION ALL SELECT substr(created_at,1,10) day,0 trips,COUNT(*) users FROM users WHERE created_at BETWEEN ? AND ? GROUP BY day) GROUP BY day ORDER BY day",
          start,
          end,
          start,
          end,
        ),
        all(
          env.DB,
          "SELECT * FROM errors WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp DESC LIMIT 30",
          start,
          end,
        ),
      ],
    );
    return json({
      totals,
      period,
      costs,
      series,
      activity,
      errors,
      start,
      end,
      timeZone: "UTC",
      configuration: {
        provider: env.LLM_PROVIDER || null,
        model: env.LLM_MODEL || null,
        email: !!env.EMAIL && !!env.EMAIL_FROM,
        places: !!env.GOOGLE_MAPS_API_KEY,
        pricingConfigured: !!env.PRICING_JSON,
      },
    });
  }
  if (path === "/api/admin/users" && req.method === "GET") {
    const sort = url.searchParams.get("sort");
    const order =
      sort === "email"
        ? "u.email ASC"
        : sort === "cost"
          ? "combined_cost DESC"
          : "u.created_at DESC";
    const rows = await all(
      env.DB,
      `SELECT u.id,u.email,u.name,u.created_at,u.verified,u.disabled,(SELECT COUNT(*) FROM trips WHERE user_id=u.id) trips,(SELECT SUM(cost) FROM usage WHERE user_id=u.id AND timestamp BETWEEN ? AND ?) combined_cost,(SELECT SUM(cost) FROM usage WHERE user_id=u.id AND provider='openai' AND timestamp BETWEEN ? AND ?) llm_cost,(SELECT SUM(cost) FROM usage WHERE user_id=u.id AND provider='google' AND timestamp BETWEEN ? AND ?) places_cost FROM users u WHERE u.email LIKE ? ORDER BY ${order} LIMIT 25 OFFSET ?`,
      start,
      end,
      start,
      end,
      start,
      end,
      `%${q}%`,
      offset,
    );
    const count = await env.DB.prepare(
      "SELECT COUNT(*) total FROM users WHERE email LIKE ?",
    )
      .bind(`%${q}%`)
      .first();
    return json({ rows, count, page });
  }
  if (path === "/api/admin/trips" && req.method === "GET") {
    const rows = await all(
      env.DB,
      `SELECT t.id,t.title,t.destination,t.created_at,t.updated_at,t.user_id,t.guest_id,json_array_length(t.itinerary) days,u.email,(SELECT SUM(cost) FROM usage WHERE trip_id=t.id AND timestamp BETWEEN ? AND ?) combined_cost,(SELECT SUM(cost) FROM usage WHERE trip_id=t.id AND provider='openai' AND timestamp BETWEEN ? AND ?) llm_cost,(SELECT SUM(cost) FROM usage WHERE trip_id=t.id AND provider='google' AND timestamp BETWEEN ? AND ?) places_cost FROM trips t LEFT JOIN users u ON t.user_id=u.id WHERE (t.title LIKE ? OR t.destination LIKE ?) AND (? IS NULL OR t.user_id=?) ORDER BY t.created_at DESC LIMIT 25 OFFSET ?`,
      start,
      end,
      start,
      end,
      start,
      end,
      `%${q}%`,
      `%${q}%`,
      userFilter,
      userFilter,
      offset,
    );
    return json({ rows, page });
  }
  if (path.startsWith("/api/admin/trips/") && req.method === "GET") {
    const tripId = path.split("/").pop()!;
    const trip = await env.DB.prepare("SELECT * FROM trips WHERE id=?")
      .bind(tripId)
      .first<Row>();
    if (!trip) throw new HttpError(404, "Trip not found");
    await audit(env, a.id, "trip.inspect", tripId);
    return json({
      trip: {
        ...trip,
        preferences: JSON.parse(trip.preferences),
        itinerary: JSON.parse(trip.itinerary),
      },
      messages: await all(
        env.DB,
        "SELECT * FROM messages WHERE trip_id=? ORDER BY created_at",
        tripId,
      ),
    });
  }
  if (path === "/api/admin/usage" && req.method === "GET") {
    const rows = await all(
      env.DB,
      "SELECT * FROM usage WHERE timestamp BETWEEN ? AND ? AND (? IS NULL OR user_id=?) AND (? IS NULL OR trip_id=?) ORDER BY timestamp DESC LIMIT 25 OFFSET ?",
      start,
      end,
      userFilter,
      userFilter,
      tripFilter,
      tripFilter,
      offset,
    );
    return json({ rows, page });
  }
  if (path === "/api/admin/audit" && req.method === "GET")
    return json({
      rows: await all(
        env.DB,
        "SELECT * FROM audit WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp DESC LIMIT 25 OFFSET ?",
        start,
        end,
        offset,
      ),
      page,
    });
  if (path === "/api/admin/admins" && req.method === "GET")
    return json({
      rows: await all(
        env.DB,
        "SELECT id,username,must_change,disabled,created_at FROM admins ORDER BY created_at",
      ),
    });
  if (path === "/api/admin/admins" && req.method === "POST") {
    const b = await body(req);
    if (
      typeof b.username !== "string" ||
      !/^[-a-zA-Z0-9_]{3,50}$/.test(b.username)
    )
      throw new HttpError(
        400,
        "Username must contain 3–50 letters, numbers, underscores or hyphens",
      );
    const adminId = id();
    try {
      await env.DB.prepare(
        "INSERT INTO admins(id,username,password_hash,created_at) VALUES (?,?,?,?)",
      )
        .bind(
          adminId,
          b.username,
          await passwordHash(validatePassword(b.password)),
          now(),
        )
        .run();
    } catch {
      throw new HttpError(
        400,
        "Unable to create administrator. Username may already exist.",
      );
    }
    await audit(env, a.id, "admin.create", adminId);
    return json({ ok: true }, 201);
  }
  const userMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userMatch && ["PATCH", "DELETE"].includes(req.method)) {
    const b = await body(req);
    if (b.confirm !== true)
      throw new HttpError(400, "Confirmation is required");
    const target = userMatch[1];
    if (req.method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE usage SET user_id=NULL,guest_id=NULL WHERE user_id=?",
        ).bind(target),
        env.DB.prepare("DELETE FROM users WHERE id=?").bind(target),
      ]);
      await audit(env, a.id, "user.delete", target);
    } else {
      if (typeof b.disabled !== "boolean")
        throw new HttpError(400, "Invalid status");
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET disabled=? WHERE id=?").bind(
          b.disabled ? 1 : 0,
          target,
        ),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target),
      ]);
      await audit(
        env,
        a.id,
        b.disabled ? "user.disable" : "user.enable",
        target,
      );
    }
    return json({ ok: true });
  }
  const adminMatch = path.match(/^\/api\/admin\/admins\/([^/]+)$/);
  if (adminMatch && ["PATCH", "DELETE"].includes(req.method)) {
    const target = adminMatch[1],
      b = await body(req);
    if (b.confirm !== true)
      throw new HttpError(400, "Confirmation is required");
    if (target === a.id && req.method === "DELETE")
      throw new HttpError(
        400,
        "Use another administrator account to delete your account",
      );
    try {
      if (req.method === "DELETE")
        await env.DB.prepare("DELETE FROM admins WHERE id=?")
          .bind(target)
          .run();
      else if (b.password) {
        await env.DB.prepare(
          "UPDATE admins SET password_hash=?,must_change=1 WHERE id=?",
        )
          .bind(await passwordHash(validatePassword(b.password)), target)
          .run();
      } else {
        if (typeof b.disabled !== "boolean")
          throw new HttpError(400, "Invalid status");
        await env.DB.prepare("UPDATE admins SET disabled=? WHERE id=?")
          .bind(b.disabled ? 1 : 0, target)
          .run();
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(
        400,
        "Unable to update administrator. The last active administrator must remain available.",
      );
    }
    await env.DB.prepare("DELETE FROM admin_sessions WHERE admin_id=?")
      .bind(target)
      .run();
    await audit(
      env,
      a.id,
      req.method === "DELETE"
        ? "admin.delete"
        : b.password
          ? "admin.password_reset"
          : b.disabled
            ? "admin.disable"
            : "admin.enable",
      target,
    );
    return json({ ok: true });
  }
  return null;
}
