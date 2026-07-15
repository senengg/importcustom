import assert from "node:assert/strict";
import handler from "../api/state.js";

const profile = {
  id: "user-1",
  email: "senthil@datapower.co.in",
  full_name: "Senthil K",
  role: "admin",
  workspace_id: "workspace-1",
  active: true,
};
let workspaceDocument = null;

globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  const method = options.method || "GET";
  if (path === "/auth/v1/user") return Response.json({ id: profile.id, email: profile.email });
  if (path === "/rest/v1/profiles") return Response.json([profile]);
  if (path === "/rest/v1/workspace_state" && method === "GET") {
    return Response.json(workspaceDocument ? [workspaceDocument] : []);
  }
  if (path === "/rest/v1/workspace_state" && method === "POST") {
    workspaceDocument = JSON.parse(options.body);
    return Response.json(null);
  }
  if (path === "/rest/v1/workspace_state" && method === "PATCH") {
    workspaceDocument = { ...workspaceDocument, ...JSON.parse(options.body) };
    return Response.json([workspaceDocument]);
  }
  if (path === "/rest/v1/audit_logs") return Response.json(null);
  return Response.json({ message: `Unexpected ${method} ${path}` }, { status: 500 });
};

function invoke(method, body) {
  const result = { statusCode: 200, headers: {}, body: null };
  const request = { method, headers: { cookie: "import_profit_access=access-test" }, body };
  const response = {
    setHeader(name, value) { result.headers[name] = value; },
    status(statusCode) { result.statusCode = statusCode; return this; },
    json(value) { result.body = value; return this; },
  };
  return handler(request, response).then(() => result);
}

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal((await invoke("GET")).statusCode, 503);

process.env.SUPABASE_URL = "https://example.supabase.test";
process.env.SUPABASE_ANON_KEY = "anon-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";

const empty = await invoke("GET");
assert.equal(empty.statusCode, 200);
assert.equal(empty.body.state, null);
assert.equal(empty.body.version, 0);

const state = { settings: { usdRate: 96.2 }, commissionMaster: [], products: [] };
const saved = await invoke("PUT", { state, version: 0 });
assert.equal(saved.statusCode, 200);
assert.equal(saved.body.version, 1);

const loaded = await invoke("GET");
assert.deepEqual(loaded.body.state, state);
assert.equal(loaded.body.version, 1);

const conflict = await invoke("PUT", { state, version: 0 });
assert.equal(conflict.statusCode, 409);
assert.equal(conflict.body.code, "VERSION_CONFLICT");

console.log("Multi-user shared state API verified.");
