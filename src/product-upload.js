import { calculateSellingPriceFromDeal } from "./pricing.js";

const uploadHeaderAliases = {
  product: "productName",
  productname: "productName",
  category: "category",
  design: "design",
  color: "color",
  colour: "color",
  sku: "sku",
  asin: "asin",
  ean: "eanCode",
  eancode: "eanCode",
  eanbarcode: "eanCode",
  hsn: "hsnCode",
  hsncode: "hsnCode",
  procurement: "procurementType",
  procurementtype: "procurementType",
  procurementsource: "procurementType",
  productsource: "procurementType",
  source: "procurementType",
  productcost: "productCostUsd",
  productcostusd: "productCostUsd",
  productcostunit: "productCostUsd",
  productcostperunit: "productCostUsd",
  costusd: "productCostUsd",
  productcostinr: "productCostInr",
  productcostrupees: "productCostInr",
  productcostrs: "productCostInr",
  costinr: "productCostInr",
  costrs: "productCostInr",
  weight: "weightKg",
  weightkg: "weightKg",
  weightunit: "weightKg",
  weightperunit: "weightKg",
  country: "countryOfOrigin",
  countryoforigin: "countryOfOrigin",
  coo: "cooBenefit",
  coobenefit: "cooBenefit",
  bcd: "bcdRate",
  bcdrate: "bcdRate",
  gstrate: "gstRate",
  gst: "gstRate",
  sellingprice: "amazonSellingPriceInr",
  sellingpriceinr: "amazonSellingPriceInr",
  amazonsellingprice: "amazonSellingPriceInr",
  dealdiscount: "dealPriceRate",
  dealdiscountrate: "dealPriceRate",
  dealdiscountpercent: "dealPriceRate",
  dealprice: "dealPriceInr",
  dealpriceinr: "dealPriceInr",
};

const importedFields = [
  "productName",
  "category",
  "design",
  "color",
  "sku",
  "asin",
  "eanCode",
  "hsnCode",
  "procurementType",
  "productCostUsd",
  "productCostInr",
  "weightKg",
  "countryOfOrigin",
  "cooBenefit",
  "bcdRate",
  "gstRate",
  "amazonSellingPriceInr",
  "dealPriceRate",
  "dealPriceInr",
];

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function text(value) {
  if (!hasValue(value)) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value).trim();
}

function number(value) {
  if (!hasValue(value)) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[₹$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentagePoints(value, fallback) {
  if (!hasValue(value)) return fallback;
  const parsed = number(value);
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

function discountRate(value) {
  if (!hasValue(value)) return 0;
  const parsed = number(value);
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function yesNo(value) {
  return ["yes", "y", "true", "1"].includes(text(value).toLowerCase()) ? "Yes" : "No";
}

function procurementType(value) {
  return text(value).toLowerCase() === "india" ? "India" : "Import";
}

function normalizedCode(value) {
  return text(value).toLowerCase();
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "");
}

function latestProductValue(products, field, fallback = "") {
  return [...products].reverse().find((product) => text(product[field]))?.[field] || fallback;
}

function categoryCommission(category, commissionMaster) {
  const row = (commissionMaster || []).find(
    (item) => text(item.category).toLowerCase() === text(category).toLowerCase(),
  );
  return row ? safeNumber(row.commissionRate) : 0.105;
}

function normalizePricing(product) {
  const normalized = { ...product };
  const sellingPrice = safeNumber(normalized.amazonSellingPriceInr);
  const rate = discountRate(normalized.dealPriceRate);
  normalized.amazonSellingPriceInr = sellingPrice;
  normalized.dealPriceRate = rate;
  normalized.dealPriceInr = hasValue(normalized.dealPriceInr)
    ? safeNumber(normalized.dealPriceInr)
    : Math.round(sellingPrice * (1 - rate) * 100) / 100;
  if (normalized.procurementType === "India") {
    normalized.productCostUsd = 0;
    normalized.countryOfOrigin = "India";
    normalized.cooBenefit = "No";
    normalized.bcdRate = 0;
  }
  return normalized;
}

function getUploadedSellingPrice(values) {
  const uploadedSellingPrice = hasValue(values.amazonSellingPriceInr)
    ? number(values.amazonSellingPriceInr)
    : 0;
  if (!hasValue(values.dealPriceInr) || !hasValue(values.dealPriceRate)) {
    return uploadedSellingPrice;
  }
  const sellingPrice = calculateSellingPriceFromDeal(
    number(values.dealPriceInr),
    discountRate(values.dealPriceRate),
  );
  if (sellingPrice === null) {
    throw new Error("Excel Deal discount must be at least 0% and less than 100%.");
  }
  return sellingPrice;
}

function createUploadedProduct(values, state) {
  const products = state.products || [];
  const settings = state.settings || {};
  const country = text(values.countryOfOrigin);
  const source = procurementType(
    text(values.procurementType) || (country.toLowerCase() === "india" ? "India" : "Import"),
  );
  const category = text(values.category) || latestProductValue(products, "category", "Uncategorised");
  const uploadedCost = number(values.productCostUsd);
  const sellingPrice = getUploadedSellingPrice(values);
  const rate = discountRate(values.dealPriceRate);
  const product = {
    id: crypto.randomUUID(),
    productName: text(values.productName) || text(values.sku) || "Imported Product",
    category,
    design: text(values.design),
    color: text(values.color),
    sku: text(values.sku),
    asin: text(values.asin),
    eanCode: text(values.eanCode),
    hsnCode: text(values.hsnCode),
    procurementType: source,
    productCostUsd: source === "India" ? 0 : uploadedCost,
    productCostInr: hasValue(values.productCostInr)
      ? number(values.productCostInr)
      : (source === "India" ? uploadedCost : 0),
    weightKg: number(values.weightKg),
    countryOfOrigin: country || (source === "India"
      ? "India"
      : latestProductValue(products, "countryOfOrigin", settings.lastCountryOfOrigin || "China")),
    cooBenefit: yesNo(values.cooBenefit),
    bcdRate: percentagePoints(values.bcdRate, safeNumber(settings.bcdRate)),
    gstRate: percentagePoints(values.gstRate, 18),
    overheadCostInr: 100,
    amazonSellingPriceInr: sellingPrice,
    dealPriceRate: rate,
    dealPriceInr: hasValue(values.dealPriceInr)
      ? number(values.dealPriceInr)
      : Math.round(sellingPrice * (1 - rate) * 100) / 100,
    commissionRate: categoryCommission(category, state.commissionMaster),
    pickPackFeeInr: 17,
    weightHandlingFeeInr: 42,
    fixedClosingFeeInr: 52,
    tdsTcsRate: 0.006,
  };
  return normalizePricing(product);
}

function findMatchingProduct(product, products) {
  const matches = products.filter((item) =>
    (normalizedCode(product.sku) && normalizedCode(item.sku) === normalizedCode(product.sku)) ||
    (normalizedCode(product.asin) && normalizedCode(item.asin) === normalizedCode(product.asin)) ||
    (normalizedCode(product.eanCode) && normalizedCode(item.eanCode) === normalizedCode(product.eanCode)),
  );
  const uniqueMatches = [...new Map(matches.map((item) => [item.id, item])).values()];
  if (uniqueMatches.length > 1) {
    throw new Error(
      `Excel row for ${product.productName} matches more than one saved product. Check SKU, ASIN and EAN Code.`,
    );
  }
  return uniqueMatches[0] || null;
}

function productsFromRows(rows, state) {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => uploadHeaderAliases[normalizeHeader(cell)]),
  );
  if (headerIndex === -1) {
    throw new Error("No matching header row found in the Excel file.");
  }
  const columns = rows[headerIndex].reduce((map, header, index) => {
    const field = uploadHeaderAliases[normalizeHeader(header)];
    if (field) map.set(index, field);
    return map;
  }, new Map());

  return rows.slice(headerIndex + 1).flatMap((row) => {
    const values = {};
    columns.forEach((field, index) => {
      values[field] = row[index];
    });
    if (!Object.values(values).some(hasValue)) return [];
    return [createUploadedProduct(values, state)];
  });
}

export function importProductRows(rows, state) {
  const nextProducts = [...(state.products || [])];
  const uploadedProducts = productsFromRows(rows, state);
  if (!uploadedProducts.length) {
    throw new Error("No product rows found in the Excel file.");
  }

  let addedCount = 0;
  let updatedCount = 0;
  uploadedProducts.forEach((uploadedProduct) => {
    const existing = findMatchingProduct(uploadedProduct, nextProducts);
    if (!existing) {
      nextProducts.unshift(uploadedProduct);
      addedCount += 1;
      return;
    }
    const merged = { ...existing };
    importedFields.forEach((field) => {
      merged[field] = uploadedProduct[field];
    });
    merged.commissionRate = categoryCommission(merged.category, state.commissionMaster);
    nextProducts[nextProducts.findIndex((product) => product.id === existing.id)] = normalizePricing(merged);
    updatedCount += 1;
  });

  return { products: nextProducts, addedCount, updatedCount };
}
