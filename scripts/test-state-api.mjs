import assert from "node:assert/strict";
import handler from "../api/state.js";

let storedValue = null;

globalThis.fetch = async (_url, options) => {
  const [command, _key, value] = JSON.parse(options.body);
  if (command === "GET") {
    return new Response(JSON.stringify({ result: storedValue }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (command === "SET") {
    storedValue = value;
    return new Response(JSON.stringify({ result: "OK" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ error: "Unexpected command" }), { status: 400 });
};

function invoke(method, { password = "", body } = {}) {
  const result = { statusCode: 200, headers: {}, body: null };
  const request = {
    method,
    headers: { "x-sync-password": password },
    body,
  };
  const response = {
    setHeader(name, value) {
      result.headers[name] = value;
    },
    status(statusCode) {
      result.statusCode = statusCode;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    },
  };
  return handler(request, response).then(() => result);
}

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.APP_SYNC_PASSWORD;
assert.equal((await invoke("GET")).statusCode, 503);

process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
process.env.APP_SYNC_PASSWORD = "correct-password";
assert.equal((await invoke("GET", { password: "wrong-password" })).statusCode, 401);

const empty = await invoke("GET", { password: "correct-password" });
assert.equal(empty.statusCode, 200);
assert.equal(empty.body.state, null);

const state = {
  settings: { usdRate: 96.2 },
  commissionMaster: [],
  products: [{ id: "product-1", productName: "Test Product" }],
};
const saved = await invoke("PUT", { password: "correct-password", body: { state } });
assert.equal(saved.statusCode, 200);
assert.equal(saved.body.saved, true);

const loaded = await invoke("GET", { password: "correct-password" });
assert.deepEqual(loaded.body.state, state);

const emptyProductState = {
  settings: { usdRate: 96.2 },
  commissionMaster: [],
  products: [],
};
const emptyProductSave = await invoke("PUT", {
  password: "correct-password",
  body: { state: emptyProductState },
});
assert.equal(emptyProductSave.statusCode, 200);
assert.equal(emptyProductSave.body.saved, true);

const emptyProductLoad = await invoke("GET", { password: "correct-password" });
assert.deepEqual(emptyProductLoad.body.state, emptyProductState);

console.log("Cloud state API verified.");
