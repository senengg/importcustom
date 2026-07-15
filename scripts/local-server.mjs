import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);

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

  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const requested = safePath === "/" ? "/index.html" : safePath;
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

server.listen(port, () => {
  console.log(`Custom Import Profit Calculator: http://localhost:${port}`);
});

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
        detail: error.message,
      }),
    );
  }
}
