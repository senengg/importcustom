import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const cloudOrigin = String(process.env.CLOUD_APP_ORIGIN || "https://importcustom.vercel.app").replace(/\/$/, "");
const useCloudApi = String(process.env.LOCAL_API_MODE || "cloud").toLowerCase() !== "mock";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (useCloudApi && url.pathname.startsWith("/api/")) {
    await proxyCloudApi(request, response, url);
    return;
  }

  if (url.pathname === "/api/rates") {
    await handleRates(url, response);
    return;
  }

  if (url.pathname === "/api/state") {
    response.writeHead(503, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({
      error: "Cloud sync is not configured in the local server.",
      code: "SYNC_NOT_CONFIGURED",
    }));
    return;
  }

  if (url.pathname === "/api/auth/session") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ user: { id: "local-admin", email: "senthil@datapower.co.in", full_name: "Senthil K", role: "admin", workspace_id: "local", active: true } }));
    return;
  }

  if (url.pathname === "/api/auth/login") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ user: { id: "local-admin", email: "senthil@datapower.co.in", full_name: "Senthil K", role: "admin", workspace_id: "local", active: true } }));
    return;
  }

  if (url.pathname === "/api/auth/logout") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ signedOut: true }));
    return;
  }

  if (url.pathname === "/api/auth/password") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ user: { id: "local-admin", email: "senthil@datapower.co.in", full_name: "Senthil K", role: "admin", workspace_id: "local", active: true } }));
    return;
  }

  if (url.pathname === "/api/auth/recover") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ sent: true, message: "If the account exists, a recovery email has been sent." }));
    return;
  }

  if (url.pathname === "/api/users") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ users: [{ id: "local-admin", email: "senthil@datapower.co.in", full_name: "Senthil K", role: "admin", active: true, last_login_at: new Date().toISOString() }] }));
    return;
  }

  if (url.pathname === "/api/logs") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ logs: [], retentionDays: 30 }));
    return;
  }

  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const requested = url.pathname === "/"
    ? "/index.html"
    : (url.pathname === "/admin" ? "/admin.html" : safePath);
  const filePath = path.join(root, requested);

  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, {
      "content-type": mime[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  } catch {
    const index = await fs.readFile(path.join(root, "index.html"));
    response.writeHead(200, { "content-type": mime[".html"] });
    response.end(index);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Custom Import Profit Calculator: http://localhost:${port}`);
  console.log(useCloudApi
    ? `Authentication and shared data: ${cloudOrigin}`
    : "Authentication and shared data: local mock mode");
});

async function proxyCloudApi(request, response, url) {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (!value || ["host", "connection", "content-length"].includes(name.toLowerCase())) continue;
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.set("origin", cloudOrigin);
    headers.set("referer", `${cloudOrigin}/`);
    headers.set("sec-fetch-site", "same-origin");

    let body;
    if (!['GET', 'HEAD'].includes(request.method || "GET")) {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 1_000_000) throw new Error("The request is too large.");
        chunks.push(chunk);
      }
      body = chunks.length ? Buffer.concat(chunks) : undefined;
    }

    const upstream = await fetch(`${cloudOrigin}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });

    for (const [name, value] of upstream.headers) {
      if (["connection", "content-encoding", "content-length", "set-cookie", "transfer-encoding"].includes(name.toLowerCase())) continue;
      response.setHeader(name, value);
    }

    const cookies = upstream.headers.getSetCookie?.() || [];
    if (cookies.length) {
      response.setHeader("set-cookie", cookies.map((value) => value.replace(/;\s*Secure/gi, "")));
    }

    response.writeHead(upstream.status);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    response.writeHead(502, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({
      error: "The local app could not reach the cloud service.",
    }));
  }
}

async function handleRates(url, response) {
  const from = (url.searchParams.get("from") || "USD").toUpperCase();
  const to = (url.searchParams.get("to") || "INR").toUpperCase();

  try {
    const upstream = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
      { headers: { accept: "application/json" } },
    );
    if (!upstream.ok) {
      throw new Error(`Rate provider returned ${upstream.status}`);
    }
    const data = await upstream.json();
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(
      JSON.stringify({
        from,
        to,
        rate: Number(data.rates[to]),
        date: data.date,
        source: "frankfurter.app",
      }),
    );
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: "Unable to refresh exchange rate.",
      }),
    );
  }
}
