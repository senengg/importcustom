export default async function handler(request, response) {
  const url = new URL(request.url, `https://${request.headers.host}`);
  const from = (url.searchParams.get("from") || "USD").toUpperCase();
  const to = (url.searchParams.get("to") || "INR").toUpperCase();

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    response.status(400).json({ error: "Use three-letter currency codes." });
    return;
  }

  try {
    const upstream = await fetch(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
      { headers: { accept: "application/json" } },
    );

    if (!upstream.ok) {
      throw new Error(`Rate provider returned ${upstream.status}`);
    }

    const data = await upstream.json();
    const rate = Number(data?.rates?.[to]);

    if (!Number.isFinite(rate)) {
      throw new Error("Rate missing from provider response.");
    }

    response.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    response.status(200).json({
      from,
      to,
      rate,
      date: data.date,
      source: "frankfurter.app",
    });
  } catch (error) {
    console.error("[rates]", { name: error?.name || "Error", message: error?.message || "Unknown error" });
    response.status(502).json({
      error: "Unable to refresh exchange rate.",
    });
  }
}
