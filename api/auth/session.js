import { requireUser, sendJson } from "../_lib/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  const session = await requireUser(request, response);
  if (!session) return;
  sendJson(response, 200, { user: session.profile });
}
