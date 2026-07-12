import fs from "node:fs/promises";
import path from "node:path";

const requiredFiles = [
  "index.html",
  "src/app.js",
  "src/styles.css",
  "api/rates.js",
  "import-profit-mark.png",
  "vercel.json",
];

for (const file of requiredFiles) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat || stat.size === 0) {
    throw new Error(`Missing required app file: ${file}`);
  }
}

const appSource = await fs.readFile(path.join("src", "app.js"), "utf8");
const formulaChecks = [
  "freightPerKgUsd) * weightKg",
  "safeNumber(settings.insuranceRate) / 100",
  "safeNumber(settings.bcdRate) / 100",
  "safeNumber(settings.swsRate) / 100",
  "gstRate / (100 + gstRate)",
  "safeNumber(product.commissionRate) * sellingPriceInr",
];

for (const formula of formulaChecks) {
  if (!appSource.includes(formula)) {
    throw new Error(`Formula check failed: ${formula}`);
  }
}

const styleSource = await fs.readFile(path.join("src", "styles.css"), "utf8");
if (styleSource.includes("letter-spacing: -")) {
  throw new Error("Negative letter spacing is not allowed.");
}

console.log("App files verified.");
