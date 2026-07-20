import { insertAuditLog, readJsonBody, requireUser, sendJson, supabaseFetch } from "./_lib/supabase.js";

function latestLoginTimestamp(profileTimestamp, authTimestamp) {
  const timestamps = [profileTimestamp, authTimestamp]
    .filter(Boolean)
    .map((value) => ({ value, time: Date.parse(value) }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time);
  return timestamps[0]?.value || null;
}

export default async function handler(request, response) {
  const session = await requireUser(request, response);
  if (!session) return;
  if (session.profile.role !== "admin") {
    sendJson(response, 403, { error: "Administrator access is required." });
    return;
  }

  try {
    if (request.method === "GET") {
      const users = await supabaseFetch(
        session.configuration,
        `/rest/v1/profiles?workspace_id=eq.${encodeURIComponent(session.profile.workspace_id)}&select=id,email,full_name,role,active,last_login_at,created_at&order=full_name.asc`,
        { service: true },
      );
      const authResult = await supabaseFetch(
        session.configuration,
        "/auth/v1/admin/users?per_page=1000",
        { service: true },
      ).catch(() => null);
      const authUsers = Array.isArray(authResult) ? authResult : (authResult?.users || []);
      const authUsersById = new Map(authUsers.map((user) => [user.id, user]));
      const usersWithLatestLogin = users.map((user) => ({
        ...user,
        last_login_at: latestLoginTimestamp(
          user.last_login_at,
          authUsersById.get(user.id)?.last_sign_in_at,
        ),
      }));
      sendJson(response, 200, { users: usersWithLatestLogin });
      return;
    }

    if (request.method === "POST") {
      const body = await readJsonBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.fullName || "").trim();
      const role = ["admin", "editor", "viewer"].includes(body.role) ? body.role : "viewer";
      if (!email || !fullName) {
        sendJson(response, 400, { error: "Name and email are required." });
        return;
      }
      await supabaseFetch(session.configuration, "/rest/v1/approved_users?on_conflict=email", {
        method: "POST",
        service: true,
        body: { email, full_name: fullName, role, workspace_id: session.profile.workspace_id },
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      });
      await supabaseFetch(session.configuration, "/auth/v1/invite", {
        method: "POST",
        service: true,
        body: {
          email,
          data: { full_name: fullName, role, workspace_id: session.profile.workspace_id },
          redirect_to: `${process.env.APP_URL || "https://importcustom.vercel.app"}/`,
        },
      });
      await insertAuditLog(session.configuration, session.profile, {
        action: "invite",
        entityType: "user",
        entityId: email,
        summary: `${session.profile.full_name} invited ${fullName} as ${role}.`,
        newData: { email, fullName, role },
      });
      sendJson(response, 201, { invited: true });
      return;
    }

    response.setHeader("Allow", "GET, POST");
    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    sendJson(response, 502, { error: "User management is temporarily unavailable.", detail: error.message });
  }
}
