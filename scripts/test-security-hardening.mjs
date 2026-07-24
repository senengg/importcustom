import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { validateState } from "../api/_lib/state-validation.js";
import {
  readJsonBody,
  requireJsonRequest,
  requireTrustedOrigin,
  setSessionCookies,
} from "../api/_lib/supabase.js";

const validState = {
  settings: {
    usdRate: 96.5,
    dashboardCards: ["freight", "profitAmazon"],
    amazonCommissionWaiverEnabled: true,
  },
  commissionMaster: [{
    id: "commission-1",
    category: "Mobile Accessories",
    commissionRate: 0.105,
  }],
  products: [{
    id: "product-1",
    productName: "Safe Product",
    sku: "SAFE-1",
    amazonSellingPriceInr: 999,
  }],
};

assert.equal(validateState(validState).valid, true);
assert.equal(validateState({
  ...validState,
  products: [{ ...validState.products[0], id: `bad" onfocus="alert(1)` }],
}).valid, false);
assert.equal(validateState({
  ...validState,
  products: [validState.products[0], { ...validState.products[0] }],
}).valid, false);
assert.equal(validateState({
  ...validState,
  products: [{ ...validState.products[0], nested: { unsafe: true } }],
}).valid, false);
assert.equal(validateState({
  ...validState,
  commissionMaster: [{ ...validState.commissionMaster[0], commissionRate: 2 }],
}).valid, false);

await assert.rejects(
  readJsonBody({
    headers: {},
    body: { value: "x".repeat(1_000_001) },
  }),
  (error) => error.status === 413,
);

function mockResponse() {
  const result = { statusCode: 200, body: null };
  return {
    result,
    setHeader() {},
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };
}

const rejectedOrigin = mockResponse();
assert.equal(requireTrustedOrigin({
  method: "POST",
  headers: {
    host: "importcustom.vercel.app",
    origin: "https://attacker.example",
    "sec-fetch-site": "cross-site",
  },
}, rejectedOrigin), false);
assert.equal(rejectedOrigin.result.statusCode, 403);

const acceptedOrigin = mockResponse();
assert.equal(requireTrustedOrigin({
  method: "PUT",
  headers: {
    host: "importcustom.vercel.app",
    origin: "https://importcustom.vercel.app",
    "sec-fetch-site": "same-origin",
  },
}, acceptedOrigin), true);

const rejectedContentType = mockResponse();
assert.equal(requireJsonRequest({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
}, rejectedContentType), false);
assert.equal(rejectedContentType.result.statusCode, 415);

const cookieResponse = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
setSessionCookies(cookieResponse, {
  access_token: "access",
  refresh_token: "refresh",
  expires_in: 3600,
});
assert.ok(cookieResponse.headers["Set-Cookie"].every((cookie) =>
  cookie.includes("HttpOnly") &&
  cookie.includes("Secure") &&
  cookie.includes("SameSite=Strict")
));
assert.ok(cookieResponse.headers["Set-Cookie"][1].includes("Max-Age=86400"));

const [productsSource, appSource, vercelSource, schemaSource, xlsxSource] = await Promise.all([
  fs.readFile("src/products.js", "utf8"),
  fs.readFile("src/app.js", "utf8"),
  fs.readFile("vercel.json", "utf8"),
  fs.readFile("supabase/schema.sql", "utf8"),
  fs.readFile("src/xlsx-reader.js", "utf8"),
]);

const initializeStart = productsSource.indexOf("async function initialize()");
const initializeEnd = productsSource.indexOf("\n}\n\napp.innerHTML", initializeStart);
const initializeSource = productsSource.slice(initializeStart, initializeEnd);
assert.ok(initializeSource.indexOf('request("/api/auth/session")') < initializeSource.indexOf("getStoredState()"));
assert.ok(initializeSource.includes("clearSensitiveBrowserData();"));
assert.ok(!initializeSource.includes("if (!products.length)"));

for (const unsafeInterpolation of [
  'value="${row.id}"',
  'data-master-id="${row.id}"',
  'data-master-delete="${row.id}"',
  'data-select-product="${product.id}"',
]) {
  assert.equal(appSource.includes(unsafeInterpolation), false, `Unsafe attribute interpolation remains: ${unsafeInterpolation}`);
}
assert.ok(appSource.includes("clearSensitiveBrowserData();"));

const vercel = JSON.parse(vercelSource);
const headerMap = new Map(vercel.headers[0].headers.map(({ key, value }) => [key, value]));
assert.ok(headerMap.get("Content-Security-Policy")?.includes("frame-ancestors 'none'"));
assert.equal(headerMap.get("X-Frame-Options"), "DENY");
assert.ok(headerMap.has("Permissions-Policy"));

for (const table of ["workspaces", "approved_users", "profiles", "workspace_state", "audit_logs"]) {
  assert.ok(schemaSource.includes(`alter table public.${table} enable row level security;`));
  assert.ok(schemaSource.includes(`revoke all on table public.${table} from anon, authenticated;`));
}
assert.ok(schemaSource.includes("purge-expired-import-profit-audit-logs"));
assert.ok(schemaSource.includes("security definer set search_path = ''"));

assert.ok(xlsxSource.includes("MAX_TOTAL_UNCOMPRESSED_BYTES"));
assert.ok(xlsxSource.includes("Excel file expands beyond the 50 MB safety limit."));

console.log("Security hardening verified.");
