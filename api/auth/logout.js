import { clearSessionCookies, insertAuditLog, requireUser, sendJson, supabaseFetch } from "../_lib/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  const session = await requireUser(request, response);
  if (!session) return;
  await insertAuditLog(session.configuration, session.profile, {
    action: "logout",
    entityType: "session",
    summary: `${session.profile.full_name} signed out.`,
  }).catch(() => null);
  await supabaseFetch(session.configuration, "/auth/v1/logout", {
    method: "POST",
    token: session.accessToken,
  }).catch(() => null);
  clearSessionCookies(response);
  sendJson(response, 200, { signedOut: true });
}
