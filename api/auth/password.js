import {
  getSupabaseConfiguration,
  logServerError,
  readJsonBody,
  requireJsonRequest,
  requireTrustedOrigin,
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
  if (!requireTrustedOrigin(request, response) || !requireJsonRequest(request, response)) return;
  const configuration = getSupabaseConfiguration();
  if (!configuration) {
    sendJson(response, 503, { error: "Multi-user login is not configured." });
    return;
  }
  try {
    const body = await readJsonBody(request);
    const password = String(body.password || "");
    if (password.length < 8) {
      sendJson(response, 400, { error: "Password must contain at least 8 characters." });
      return;
    }
    const user = await supabaseFetch(configuration, "/auth/v1/user", {
      method: "PUT",
      token: body.accessToken,
      body: { password },
    });
    const profiles = await supabaseFetch(
      configuration,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,full_name,role,workspace_id,active`,
      { service: true },
    );
    setSessionCookies(response, {
      access_token: body.accessToken,
      refresh_token: body.refreshToken,
      expires_in: 3600,
    });
    sendJson(response, 200, { user: profiles?.[0] });
  } catch (error) {
    logServerError("password", error);
    sendJson(response, error.status === 413 ? 413 : 400, {
      error: error.status === 413
        ? "The password request is too large."
        : "This invitation or recovery link is invalid or expired.",
    });
  }
}
