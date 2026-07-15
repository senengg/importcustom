import { getSupabaseConfiguration, readJsonBody, sendJson, supabaseFetch } from "../_lib/supabase.js";

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
  const body = await readJsonBody(request);
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) {
    sendJson(response, 400, { error: "Enter your email address first." });
    return;
  }
  await supabaseFetch(configuration, "/auth/v1/recover", {
    method: "POST",
    body: { email, redirect_to: `${process.env.APP_URL || "https://importcustom.vercel.app"}/` },
  }).catch(() => null);
  sendJson(response, 200, { sent: true, message: "If the account exists, a recovery email has been sent." });
}
