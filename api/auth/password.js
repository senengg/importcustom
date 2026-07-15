import { getSupabaseConfiguration, readJsonBody, sendJson, setSessionCookies, supabaseFetch } from "../_lib/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
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
    sendJson(response, 400, { error: "This invitation or recovery link is invalid or expired.", detail: error.message });
  }
}
