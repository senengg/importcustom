import { timingSafeEqual } from "node:crypto";

const STATE_KEY = "import-profit-app:shared-state:v1";
const MAX_BODY_BYTES = 1_000_000;

function send(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}

function secretsMatch(received, expected) {
  const receivedBuffer = Buffer.from(String(received || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function getConfiguration() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const password = process.env.APP_SYNC_PASSWORD;
  return url && token && password ? { url, token, password } : null;
}

async function runRedis(configuration, command) {
  const upstream = await fetch(configuration.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const result = await upstream.json().catch(() => ({}));
  if (!upstream.ok || result.error) {
    throw new Error(result.error || `Storage returned ${upstream.status}`);
  }
  return result.result;
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      throw new Error("Request is too large.");
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function isValidState(state) {
  return Boolean(
    state &&
      typeof state === "object" &&
      state.settings &&
      typeof state.settings === "object" &&
      Array.isArray(state.commissionMaster) &&
      Array.isArray(state.products) &&
      state.products.length <= 5_000,
  );
}

export default async function handler(request, response) {
  const configuration = getConfiguration();
  if (!configuration) {
    send(response, 503, {
      error: "Cloud sync is not configured.",
      code: "SYNC_NOT_CONFIGURED",
    });
    return;
  }

  if (!secretsMatch(request.headers["x-sync-password"], configuration.password)) {
    send(response, 401, { error: "Incorrect sync password.", code: "INVALID_SYNC_PASSWORD" });
    return;
  }

  try {
    if (request.method === "GET") {
      const stored = await runRedis(configuration, ["GET", STATE_KEY]);
      const document = stored ? JSON.parse(stored) : null;
      send(response, 200, {
        state: document?.state || null,
        updatedAt: document?.updatedAt || null,
      });
      return;
    }

    if (request.method === "PUT") {
      const body = await readBody(request);
      if (!isValidState(body.state)) {
        send(response, 400, { error: "The submitted app data is invalid." });
        return;
      }

      const document = {
        version: 1,
        updatedAt: new Date().toISOString(),
        state: body.state,
      };
      await runRedis(configuration, ["SET", STATE_KEY, JSON.stringify(document)]);
      send(response, 200, { saved: true, updatedAt: document.updatedAt });
      return;
    }

    response.setHeader("Allow", "GET, PUT");
    send(response, 405, { error: "Method not allowed." });
  } catch (error) {
    send(response, 502, {
      error: "Cloud data is temporarily unavailable.",
      detail: error.message,
    });
  }
}
