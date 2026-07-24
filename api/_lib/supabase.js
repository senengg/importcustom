const ACCESS_COOKIE = "import_profit_access";
const REFRESH_COOKIE = "import_profit_refresh";
const MAX_BODY_BYTES = 1_000_000;
const SAFE_FETCH_SITES = new Set(["same-origin", "none"]);

export function sendJson(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}

export function getSupabaseConfiguration() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anonKey && serviceKey ? { url, anonKey, serviceKey } : null;
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.status = 400;
    throw error;
  }
}

export async function readJsonBody(request) {
  const declaredLength = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    const error = new Error("Request is too large.");
    error.status = 413;
    throw error;
  }
  if (request.body && typeof request.body === "object") {
    const serialized = JSON.stringify(request.body);
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) {
      const error = new Error("Request is too large.");
      error.status = 413;
      throw error;
    }
    return request.body;
  }
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > MAX_BODY_BYTES) {
      const error = new Error("Request is too large.");
      error.status = 413;
      throw error;
    }
    return parseJson(request.body);
  }
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      const error = new Error("Request is too large.");
      error.status = 413;
      throw error;
    }
  }
  return raw ? parseJson(raw) : {};
}

function getRequestOrigin(request) {
  const forwardedHost = String(request.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(request.headers?.host || "").trim();
  if (!host) return "";
  const forwardedProto = String(request.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? "http" : "https");
  return `${protocol}://${host}`;
}

export function requireTrustedOrigin(request, response) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(request.method || "GET").toUpperCase())) return true;

  const fetchSite = String(request.headers?.["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite && !SAFE_FETCH_SITES.has(fetchSite)) {
    sendJson(response, 403, { error: "This request did not originate from the app." });
    return false;
  }

  const suppliedOrigin = String(request.headers?.origin || "").replace(/\/$/, "");
  if (suppliedOrigin) {
    const configuredOrigin = String(process.env.APP_URL || "").replace(/\/$/, "");
    const allowedOrigins = new Set([configuredOrigin].filter(Boolean));
    if (!configuredOrigin || process.env.VERCEL_ENV !== "production") {
      allowedOrigins.add(getRequestOrigin(request));
    }
    if (!allowedOrigins.has(suppliedOrigin)) {
      sendJson(response, 403, { error: "This request did not originate from the app." });
      return false;
    }
  } else if (!fetchSite && (process.env.VERCEL || process.env.NODE_ENV === "production")) {
    sendJson(response, 403, { error: "The request origin could not be verified." });
    return false;
  }

  return true;
}

export function requireJsonRequest(request, response) {
  const contentType = String(request.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (contentType === "application/json") return true;
  if (!contentType && !process.env.VERCEL && process.env.NODE_ENV !== "production") return true;
  sendJson(response, 415, { error: "Content-Type must be application/json." });
  return false;
}

export function logServerError(context, error) {
  console.error(`[${context}]`, {
    name: error?.name || "Error",
    status: Number(error?.status || 0) || undefined,
    message: error?.message || "Unknown error",
  });
}

function parseCookies(request) {
  return String(request.headers.cookie || "")
    .split(";")
    .map((item) => item.trim().split("="))
    .filter(([name]) => name)
    .reduce((cookies, [name, ...value]) => {
      cookies[name] = decodeURIComponent(value.join("="));
      return cookies;
    }, {});
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function setSessionCookies(response, session) {
  response.setHeader("Set-Cookie", [
    cookie(ACCESS_COOKIE, session.access_token, Math.max(60, Number(session.expires_in || 3600))),
    cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24),
  ]);
}

export function clearSessionCookies(response) {
  response.setHeader("Set-Cookie", [cookie(ACCESS_COOKIE, "", 0), cookie(REFRESH_COOKIE, "", 0)]);
}

export async function supabaseFetch(configuration, path, { method = "GET", body, token, service = false, headers = {} } = {}) {
  const key = service ? configuration.serviceKey : configuration.anonKey;
  const response = await fetch(`${configuration.url}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.error_description || data?.error || `Supabase returned ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function getProfile(configuration, userId) {
  const rows = await supabaseFetch(
    configuration,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,role,workspace_id,active`,
    { service: true },
  );
  return rows?.[0] || null;
}

async function refreshSession(configuration, refreshToken) {
  if (!refreshToken) return null;
  return supabaseFetch(configuration, "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken },
  }).catch(() => null);
}

export async function requireUser(request, response) {
  const configuration = getSupabaseConfiguration();
  if (!configuration) {
    sendJson(response, 503, { error: "Multi-user login is not configured.", code: "AUTH_NOT_CONFIGURED" });
    return null;
  }

  const cookies = parseCookies(request);
  let accessToken = cookies[ACCESS_COOKIE];
  let authUser = accessToken
    ? await supabaseFetch(configuration, "/auth/v1/user", { token: accessToken }).catch(() => null)
    : null;

  if (!authUser) {
    const refreshed = await refreshSession(configuration, cookies[REFRESH_COOKIE]);
    if (refreshed?.access_token) {
      setSessionCookies(response, refreshed);
      accessToken = refreshed.access_token;
      authUser = refreshed.user;
    }
  }

  if (!authUser) {
    clearSessionCookies(response);
    sendJson(response, 401, { error: "Please sign in.", code: "AUTH_REQUIRED" });
    return null;
  }

  const profile = await getProfile(configuration, authUser.id);
  if (!profile?.active) {
    clearSessionCookies(response);
    sendJson(response, 403, { error: "This account is not active.", code: "ACCOUNT_DISABLED" });
    return null;
  }

  return { configuration, accessToken, authUser, profile };
}

function buildAuditRecord(profile, entry) {
  return {
    workspace_id: profile.workspace_id,
    user_id: profile.id,
    user_email: profile.email,
    action: entry.action,
    entity_type: entry.entityType || "app",
    entity_id: entry.entityId || null,
    summary: entry.summary,
    old_data: entry.oldData ?? null,
    new_data: entry.newData ?? null,
  };
}

export async function insertAuditLogs(configuration, profile, entries) {
  const records = entries.map((entry) => buildAuditRecord(profile, entry));
  const batchSize = 100;
  for (let index = 0; index < records.length; index += batchSize) {
    await supabaseFetch(configuration, "/rest/v1/audit_logs", {
      method: "POST",
      body: records.slice(index, index + batchSize),
      service: true,
      headers: { Prefer: "return=minimal" },
    });
  }
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabaseFetch(
    configuration,
    `/rest/v1/audit_logs?created_at=lt.${encodeURIComponent(cutoff)}`,
    { method: "DELETE", service: true, headers: { Prefer: "return=minimal" } },
  ).catch(() => null);
}

export async function insertAuditLog(configuration, profile, entry) {
  await insertAuditLogs(configuration, profile, [entry]);
}

export function getRequestIp(request) {
  return String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;
}
