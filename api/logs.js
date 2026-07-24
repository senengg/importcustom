import { logServerError, requireUser, sendJson, supabaseFetch } from "./_lib/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  const session = await requireUser(request, response);
  if (!session) return;
  if (session.profile.role !== "admin") {
    sendJson(response, 403, { error: "Administrator access is required." });
    return;
  }
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const logs = await supabaseFetch(
      session.configuration,
      `/rest/v1/audit_logs?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&created_at=gte.${encodeURIComponent(cutoff)}&select=id,user_email,action,entity_type,entity_id,summary,old_data,new_data,created_at&order=created_at.desc&limit=500`,
      { service: true },
    );
    sendJson(response, 200, { logs, retentionDays: 30 });
  } catch (error) {
    logServerError("logs", error);
    sendJson(response, 502, { error: "Activity logs are temporarily unavailable." });
  }
}
