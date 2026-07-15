import {
  getRequestIp,
  getSupabaseConfiguration,
  insertAuditLog,
  readJsonBody,
  sendJson,
  setSessionCookies,
  supabaseFetch,
} from "../_lib/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  const configuration = getSupabaseConfiguration();
  if (!configuration) {
    sendJson(response, 503, { error: "Multi-user login is not configured.", code: "AUTH_NOT_CONFIGURED" });
    return;
  }
  try {
    const body = await readJsonBody(request);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) {
      sendJson(response, 400, { error: "Email and password are required." });
      return;
    }
    const session = await supabaseFetch(configuration, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    const profiles = await supabaseFetch(
      configuration,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,email,full_name,role,workspace_id,active`,
      { service: true },
    );
    const profile = profiles?.[0];
    if (!profile?.active) {
      sendJson(response, 403, { error: "This account is not active." });
      return;
    }
    setSessionCookies(response, session);
    await supabaseFetch(
      configuration,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`,
      { method: "PATCH", body: { last_login_at: new Date().toISOString() }, service: true, headers: { Prefer: "return=minimal" } },
    );
    await insertAuditLog(configuration, profile, {
      action: "login",
      entityType: "session",
      summary: `${profile.full_name} signed in.`,
      newData: { ip: getRequestIp(request), userAgent: request.headers["user-agent"] || null },
    });
    sendJson(response, 200, { user: profile });
  } catch (error) {
    sendJson(response, error.status === 400 ? 401 : 502, {
      error: error.status === 400 ? "Incorrect email or password." : "Login is temporarily unavailable.",
      detail: error.message,
    });
  }
}
