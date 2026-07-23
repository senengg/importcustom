import assert from "node:assert/strict";
import handler from "../api/recovery.js";

const profile = {
  id: "user-1",
  email: "senthil@datapower.co.in",
  full_name: "Senthil K",
  role: "admin",
  workspace_id: "workspace-1",
  active: true,
};
const anchor = new Date("2026-07-23T14:47:00.000Z");
const previousSettings = { usdRate: 96.57, freightPerKgUsd: 4.5 };
const previousCommissionMaster = [{ id: "commission-1", category: "Cases", commissionRate: 0.105 }];
const deletedProducts = [
  { id: "product-1", productName: "Recovered One", sku: "ONE" },
  { id: "product-2", productName: "Recovered Two", sku: "TWO" },
];
let workspaceDocument = {
  state: { settings: {}, commissionMaster: [], products: [] },
  version: 7,
  updated_at: anchor.toISOString(),
};

globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  const path = parsed.pathname;
  const method = options.method || "GET";
  if (path === "/auth/v1/user") return Response.json({ id: profile.id, email: profile.email });
  if (path === "/rest/v1/profiles") return Response.json([profile]);
  if (path === "/rest/v1/workspace_state" && method === "GET") {
    return Response.json([workspaceDocument]);
  }
  if (path === "/rest/v1/workspace_state" && method === "PATCH") {
    workspaceDocument = { ...workspaceDocument, ...JSON.parse(options.body) };
    return Response.json([workspaceDocument]);
  }
  if (path === "/rest/v1/audit_logs" && method === "GET") {
    const entityType = parsed.searchParams.get("entity_type");
    if (entityType === "eq.settings") {
      return Response.json([{
        id: 10,
        old_data: previousSettings,
        new_data: {},
        created_at: anchor.toISOString(),
      }]);
    }
    if (entityType === "eq.commission_master") {
      return Response.json([{
        id: 11,
        old_data: previousCommissionMaster,
        new_data: [],
        created_at: anchor.toISOString(),
      }]);
    }
    if (entityType === "eq.product") {
      return Response.json(deletedProducts.map((product, index) => ({
        id: 100 + index,
        user_email: profile.email,
        old_data: product,
        created_at: new Date(anchor.getTime() - 60_000 - index * 1_000).toISOString(),
      })));
    }
  }
  if (path === "/rest/v1/audit_logs" && ["POST", "DELETE"].includes(method)) {
    return Response.json(null);
  }
  return Response.json({ message: `Unexpected ${method} ${path}` }, { status: 500 });
};

function invoke(method, body) {
  const result = { statusCode: 200, headers: {}, body: null };
  const request = {
    method,
    headers: { cookie: "import_profit_access=access-test" },
    body,
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

const preview = await invoke("GET");
assert.equal(preview.statusCode, 200);
assert.equal(preview.body.available, true);
assert.equal(preview.body.productCount, 2);
assert.equal(preview.body.currentProductCount, 0);
assert.equal(preview.body.currentVersion, 7);

const restored = await invoke("POST", {
  confirm: true,
  expectedProductCount: 2,
  expectedVersion: 7,
});
assert.equal(restored.statusCode, 200);
assert.equal(restored.body.productCount, 2);
assert.equal(workspaceDocument.version, 8);
assert.deepEqual(workspaceDocument.state.settings, previousSettings);
assert.deepEqual(workspaceDocument.state.commissionMaster, previousCommissionMaster);
assert.deepEqual(workspaceDocument.state.products, deletedProducts);

const completedPreview = await invoke("GET");
assert.equal(completedPreview.statusCode, 200);
assert.equal(completedPreview.body.available, false);
assert.equal(completedPreview.body.alreadyRestored, true);

console.log("Reset recovery API verified.");
