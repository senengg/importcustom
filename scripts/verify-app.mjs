import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { calculateDealPriceFromSelling, calculateSellingPriceFromDeal } from "../src/pricing.js";
import { parseOrderInvoiceRows } from "../src/invoice-orders.js";
import { createInvoiceWorkbook } from "../src/xlsx-export.js";

const requiredFiles = [
  "index.html",
  "master.html",
  "admin.html",
  "invoices.html",
  "master/index.html",
  "src/app.js",
  "src/pricing.js",
  "src/invoice-orders.js",
  "src/invoices.js",
  "src/xlsx-reader.js",
  "src/xlsx-export.js",
  "src/styles.css",
  "api/rates.js",
  "api/state.js",
  "api/auth/login.js",
  "api/auth/session.js",
  "api/auth/logout.js",
  "api/auth/password.js",
  "api/auth/recover.js",
  "api/users.js",
  "api/logs.js",
  "api/_lib/supabase.js",
  "supabase/schema.sql",
  "src/admin.js",
  "scripts/invite-initial-users.mjs",
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
const indexSource = await fs.readFile("index.html", "utf8");
const masterSource = await fs.readFile("master.html", "utf8");
const nestedMasterSource = await fs.readFile(path.join("master", "index.html"), "utf8");
const invoicePageSource = await fs.readFile("invoices.html", "utf8");
const invoiceAppSource = await fs.readFile(path.join("src", "invoices.js"), "utf8");
const formulaChecks = [
  "freightPerKgUsd) * weightKg",
  "safeNumber(settings.insuranceRate) / 100",
  "customsBaseUsd * (safeNumber(bcdRate) / 100)",
  "safeNumber(settings.swsRate) / 100",
  "normalizeProcurementType",
  "isIndiaProcurement(product)",
  "indiaProcurementDisabledFields",
  "applyIndiaProcurementDefaults(product)",
  "isProductFieldDisabled(product, key)",
  "confirmProductDelete(product)",
  "const productIdToDelete = isDraftProduct(product)",
  "product.id !== productIdToDelete",
  "confirmMasterCategoryDelete(row)",
  "[\"procurementType\", \"Procurement type\", \"select\", [\"Import\", \"India\"]]",
  "[\"color\", \"Color\", \"text\"]",
  "colour: \"color\"",
  "function getProductDisplayTitle(product)",
  ".join(\" \")",
  "[\"productCostInr\", \"India product cost / unit\", \"number\", \"INR\"]",
  "domesticProduct ? 0 : safeNumber(product.productCostUsd)",
  "domesticProduct ? productCostInr : importCostUsd * usdRate",
  "Product Cost Per Unit INR",
  "gstRate / (100 + gstRate)",
  "safeNumber(product.commissionRate) * priceInr",
  "dealPriceRate",
  "[\"dealPriceRate\", \"Deal discount %\", \"percentDecimal\", \"%\"]",
  "[\"dealPriceInr\", \"Deal price\", \"number\", \"INR\"]",
  "syncDealPriceFromRate(product)",
  "syncSellingPriceFromDeal(product)",
  "getUploadedSellingPrice(values)",
  "calculateSellingPriceFromDeal(",
  "const repairedSellingPrice = calculateSellingPriceFromDeal(",
  "Deal discount must be at least 0% and less than 100%.",
  "max=\"99.99\"",
  "const twoDecimalPricingFields = new Set([",
  "function formatTwoDecimalPricingInput(input)",
  ".toFixed(2)",
  "calculateDealPriceFromSelling(",
  "calculateAmazonAmounts(dealPriceInr",
  "amazonProfitInr",
  "amazonDealProfitInr",
  "gstAmazonInr",
  "settlementAmazonInr",
  "gstAmazonDealInr",
  "settlementAmazonDealInr",
  "GST Amazon",
  "Settlement Amazon",
  "Profit Amazon",
  "Profit Amazon Deal",
  "GST Amazon Deal",
  "Settlement Amazon Deal",
  "marginAmazon",
  "marginAmazonDeal",
  "roiAmazon",
  "roiAmazonDeal",
  "roiProductCostAmazon",
  "roiProductCostAmazonDeal",
  "Margin Amazon Deal",
  "amazon-margin",
  "deal-margin",
  "roi-landing",
  "roi-deal-landing",
  "roi-product-cost",
  "ROI Amazon Deal on landing",
  "ROI Amazon Deal on product cost",
  "defaultDashboardCards",
  "dashboardCardDefinitions",
  "data-product-dashboard",
  "data-dashboard-card",
  "renderDashboardFilter()",
  "renderProductDashboard(calc)",
  "updateProductLiveDashboard(product)",
  "normalizeDashboardCards",
  "shouldShowDashboardCard(label)",
  "data-action=\"discard-product\"",
  "[\"hsnCode\", \"HSN Code\", \"text\"]",
  "[\"eanCode\", \"EAN Code\", \"text\"]",
  "ean: \"eanCode\"",
  "eanCode: new Map()",
  "[\"sku\", \"asin\", \"eanCode\"]",
  "EAN Code before upload",
  "[\"category\", \"Category\", \"category\"]",
  "defaultCommissionMaster",
  "renderCommissionMaster()",
  "renderMasterDataPage()",
  "renderCategoryCommissionSection()",
  "data-master-category-select",
  "getSelectedCommissionRow()",
  "renderInsuranceSection()",
  "renderSwsSection()",
  "renderWarehouseSection()",
  "renderMasterPlaceholderSection",
  "data-action=\"save-master\"",
  "data-master-setting",
  "saveMasterDraft()",
  "Category Commission",
  "applyCommissionForProductCategory(product)",
  "function getLatestMasterCategory()",
  "category: getLatestMasterCategory()",
  "[\"countryOfOrigin\", \"Country of origin\", \"country\"]",
  "[\"bcdRate\", \"BCD rate\", \"number\", \"%\"]",
  "countryOfOrigin: getLatestCountryOfOrigin()",
  "data-product-upload",
  "ORDER_HISTORY_STORAGE_KEY",
  "custom-import-profit-order-history-v1",
  "parseOrderInvoiceRows(rows, file.name)",
  "Invoice ${parsedInvoice.invoiceNumber} was already uploaded",
  "Saved only in this browser. Nothing in this section is uploaded to the cloud.",
  "Lifetime ordered quantity",
  "removeLocalInvoice",
  "data-product-list-scroll",
  "function restoreProductListScroll(productListScrollTop)",
  "restoreProductListScroll(productListScrollTop)",
  "activeGroup = button.dataset.tab;",
  "handleBulkUpload",
  "readXlsxRows(file)",
  "createProductsFromUploadRows(rows)",
  "uploadHeaderAliases",
  "findDuplicateProductCode",
  "validateUniqueProductCodes",
  "getProductUniquenessMessage",
  "updateProductMessage",
  "data-product-message",
  "findUploadProductMatch",
  "mergeUploadedProduct",
  "applyUploadedProducts",
  "updated from Excel",
  "getDuplicateProductMessage",
  "Product not saved",
  "productSaveMessage",
  "Product cost / unit",
  "Deal discount %",
  "productDraft",
  "productDraftMode",
  "createNewProductDraft()",
  "createProductEditDraft(product)",
  "getEditableProduct()",
  "saveProductDraft()",
  "function hasProductDraftChanges(product = productDraft)",
  "saveButton.hidden = !hasProductDraftChanges()",
  "${hasChanges ? \"\" : \"hidden\"}",
  "Commission (preview only)",
  "function getProductWithCommissionPreview(product)",
  "commissionPreview = {",
  "data-action=\"save-product\"",
  "New Product Draft",
  "Unsaved Product Changes",
  "function getCurrentPage()",
  "initializeAuth()",
  "data-login-form",
  "/api/auth/session",
  "Users & Logs",
  "saveCloudStateNow()",
  "data-sync-control",
  "href=\"master/\"",
];

assert.equal(calculateSellingPriceFromDeal(900, 0.1), 1000);
assert.equal(calculateSellingPriceFromDeal(1699, 0.15), 1998.82);
assert.equal(calculateSellingPriceFromDeal(900, 1), null);
assert.equal(calculateDealPriceFromSelling(1000, 0.1), 900);
assert.equal(calculateDealPriceFromSelling(1998.82, 0.15), 1699);
assert.equal(calculateDealPriceFromSelling(1000, 1), null);

const invoiceFixture = [
  ["Invoice:", "TEST-001"],
  [46192],
  ["SKU", "PRODUCT NAME", "DESIGN", "COLOR", "PC", "PV US$", "US$"],
  ["SKU-ONE", "Case", "Fusion", "Black", 3, 4.5, 13.5],
  ["SKU-TWO", "Case", "Alles", "Clear", 2, 5, 10],
];
const parsedInvoiceFixture = parseOrderInvoiceRows(invoiceFixture, "Invoice_TEST-001_260619.xlsx");
assert.equal(parsedInvoiceFixture.invoiceNumber, "TEST-001");
assert.equal(parsedInvoiceFixture.invoiceDate, "2026-06-19");
assert.equal(parsedInvoiceFixture.totalQuantity, 5);
assert.equal(parsedInvoiceFixture.lines.length, 2);

const invoiceWorkbook = createInvoiceWorkbook(
  {
    invoiceNumber: "TEST-001",
    lines: [{
      sku: "SKU-ONE",
      productName: "Case",
      design: "Fusion",
      color: "Black",
      quantity: 3,
      unitPriceUsd: 4.5,
    }],
  },
  new Map([["sku-one", { asin: "ASIN-001" }]]),
  (value) => String(value || "").toLowerCase(),
);
const invoiceWorkbookBytes = new Uint8Array(await invoiceWorkbook.arrayBuffer());
assert.equal(invoiceWorkbookBytes[0], 0x50);
assert.equal(invoiceWorkbookBytes[1], 0x4b);
const invoiceWorkbookText = new TextDecoder().decode(invoiceWorkbookBytes);
for (const expected of ["Product Name", "ASIN", "ASIN-001", "Price (USD)", "Total Price (USD)", "TOTAL INVOICE VALUE"]) {
  assert.ok(invoiceWorkbookText.includes(expected), `Invoice workbook is missing ${expected}`);
}

const pageChecks = [
  [indexSource, "src/app.js?v=20260720-local-orders-7", "index app version"],
  [indexSource, "src/styles.css?v=20260720-local-orders-5", "index style version"],
  [masterSource, "src/app.js?v=20260720-local-orders-7", "master app version"],
  [masterSource, "src/styles.css?v=20260720-local-orders-5", "master style version"],
  [nestedMasterSource, "../src/app.js?v=20260720-local-orders-7", "nested master app version"],
  [nestedMasterSource, "../src/styles.css?v=20260720-local-orders-5", "nested master style version"],
  [invoicePageSource, "src/invoices.js?v=20260720-local-orders-14", "invoice page app version"],
  [invoicePageSource, "src/styles.css?v=20260720-local-orders-12", "invoice page style version"],
];

for (const [source, expected, label] of pageChecks) {
  if (!source.includes(expected)) {
    throw new Error(`Page version check failed: ${label}`);
  }
}

for (const formula of formulaChecks) {
  if (!appSource.includes(formula)) {
    throw new Error(`Formula check failed: ${formula}`);
  }
}

for (const expected of [
  "Invoice Register",
  "Total invoice amount",
  "Payment bank",
  "Payment date",
  "Paid invoices amount",
  "Pending invoices amount",
  "data-invoice-selected",
  "updatePendingSelection",
  "selectedPendingAmount",
  "Selected pending invoices",
  "data-delete-invoice",
  "deleteInvoice",
  "quantities will also be removed",
  "data-edit-invoice",
  "data-save-invoice",
  "saveInvoiceEdit",
  "Invoice number and invoice date are required.",
  "Enter a unique invoice number.",
  "data-download-invoice",
  "downloadInvoiceWorkbook",
  "marked as paid and saved locally",
  "hasCompletePaymentDetails",
  "invoice-paid-badge",
  "data-invoice-upload",
  "handleInvoiceUpload",
  "readXlsxRows(file)",
  "was already uploaded and has not been counted again",
  "paymentBank",
  "paymentDate",
  "custom-import-profit-order-history-v1",
  "saved only in this browser",
]) {
  if (!invoicePageSource.includes(expected) && !invoiceAppSource.includes(expected)) {
    throw new Error(`Invoice register check failed: ${expected}`);
  }
}

if (appSource.includes("Calculation Table") || appSource.includes("renderResultRow")) {
  throw new Error("The all-products calculation table should not be rendered.");
}

if (appSource.includes("At least one product is required") || appSource.includes("!stored.products.length")) {
  throw new Error("An empty product list must be allowed and preserved.");
}

const styleSource = await fs.readFile(path.join("src", "styles.css"), "utf8");
if (!styleSource.includes("dashboard-filter")) {
  throw new Error("Dashboard filter styles are missing.");
}

if (!styleSource.includes("[hidden]") || !styleSource.includes("display: none !important")) {
  throw new Error("Hidden elements must be forced off-screen for filters and draft controls.");
}

if (!styleSource.includes("button:disabled")) {
  throw new Error("Disabled save button styling is missing.");
}

if (!styleSource.includes("input:disabled") || !styleSource.includes("disabled-field")) {
  throw new Error("Disabled product field styling is missing.");
}

if (styleSource.includes("letter-spacing: -")) {
  throw new Error("Negative letter spacing is not allowed.");
}

console.log("App files verified.");
