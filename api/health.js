import { requireUser, sendJson, supabaseFetch } from "./_lib/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const session = await requireUser(request, response);
  if (!session) return;

  try {
    const rows = await supabaseFetch(
      session.configuration,
      `/rest/v1/workspace_state?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&select=version&limit=1`,
      { service: true },
    );
    sendJson(response, 200, {
      online: true,
      version: Number(rows?.[0]?.version || 0),
    });
  } catch {
    sendJson(response, 503, {
      online: false,
      error: "The shared workspace is unavailable.",
    });
  }
}
