import assert from "node:assert/strict";
import handler from "../api/health.js";

const profile = {
  id: "user-1",
  email: "senthil@datapower.co.in",
  full_name: "Senthil K",
  role: "admin",
  workspace_id: "workspace-1",
  active: true,
};

globalThis.fetch = async (url) => {
  const parsed = new URL(url);
  if (parsed.pathname === "/auth/v1/user") {
    return Response.json({ id: profile.id, email: profile.email });
  }
  if (parsed.pathname === "/rest/v1/profiles") {
    return Response.json([profile]);
  }
  if (parsed.pathname === "/rest/v1/workspace_state") {
    return Response.json([{ version: 42 }]);
  }
  return Response.json({ error: "Unexpected request." }, { status: 500 });
};

function invoke(method) {
  const result = { statusCode: 200, headers: {}, body: null };
  const request = {
    method,
    headers: { cookie: "import_profit_access=access-test" },
  };
  const response = {
    setHeader(name, value) { result.headers[name] = value; },
    status(statusCode) { result.statusCode = statusCode; return this; },
    json(value) { result.body = value; return this; },
  };
  return handler(request, response).then(() => result);
}

process.env.SUPABASE_URL = "https://example.supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";

const health = await invoke("GET");
assert.equal(health.statusCode, 200);
assert.equal(health.body.online, true);
assert.equal(health.body.version, 42);

const unsupported = await invoke("POST");
assert.equal(unsupported.statusCode, 405);

console.log("Workspace health API verified.");
