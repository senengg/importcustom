import {
  calculateDealPriceFromSelling,
  calculateDealRateFromPrices,
  calculateSellingPriceFromDeal,
} from "./pricing.js";
import { normalizeInvoiceIdentifier, parseOrderInvoiceRows } from "./invoice-orders.js";
import {
  renderWorkspaceConnectionStatus,
  startWorkspaceConnectionMonitor,
} from "./connection-status.js";

const STORAGE_KEY = "custom-import-profit-state-v1";
const ORDER_HISTORY_STORAGE_KEY = "custom-import-profit-order-history-v1";

const defaultDashboardCards = [
  "freight",
  "insurance",
  "basicCustoms",
  "sws",
  "igst",
  "importCost",
  "landingCost",
  "gstAmazon",
  "gstAmazonDeal",
  "settlementAmazon",
  "settlementAmazonDeal",
  "profitAmazon",
  "profitAmazonDeal",
  "marginAmazon",
  "marginAmazonDeal",
  "roiAmazonLanding",
  "roiAmazonDealLanding",
  "roiAmazonProductCost",
  "roiAmazonDealProductCost",
];

const defaultSettings = {
  usdRate: 95.2,
  freightPerKgUsd: 4.5,
  amazonCommissionWaiverEnabled: true,
  amazonCommissionWaiverThresholdInr: 999,
  insuranceRate: 1.125,
  bcdRate: 15,
  swsRate: 10,
  warehouseRate: 2,
  fxUpdatedAt: "Manual",
  lastCountryOfOrigin: "China",
  dashboardCards: [...defaultDashboardCards],
};

const defaultCommissionMaster = [
  { category: "Mobile Accessories", commissionRate: 0.105 },
];

const defaultProducts = [
  {
    id: crypto.randomUUID(),
    productName: "iPhone 17 Case",
    category: "Mobile Accessories",
    design: "Alles",
    color: "",
    sku: "ABCD",
    asin: "1234ABC",
    eanCode: "",
    hsnCode: "",
    procurementType: "Import",
    productCostUsd: 9.5,
    productCostInr: 0,
    weightKg: 0.05,
    countryOfOrigin: "China",
    cooBenefit: "No",
    bcdRate: 15,
    gstRate: 18,
    overheadCostInr: 100,
    amazonSellingPriceInr: 2799,
    dealPriceRate: 0,
    dealPriceInr: 2799,
    commissionRate: 0.105,
    pickPackFeeInr: 17,
    weightHandlingFeeInr: 42,
    fixedClosingFeeInr: 52,
    tdsTcsRate: 0.006,
  },
  {
    id: crypto.randomUUID(),
    productName: "iPhone 17 Pro Case",
    category: "Mobile Accessories",
    design: "Fusion",
    color: "",
    sku: "DDSF",
    asin: "4323DSFD",
    eanCode: "",
    hsnCode: "",
    procurementType: "Import",
    productCostUsd: 4.5,
    productCostInr: 0,
    weightKg: 0.07,
    countryOfOrigin: "Korea",
    cooBenefit: "Yes",
    bcdRate: 15,
    gstRate: 18,
    overheadCostInr: 100,
    amazonSellingPriceInr: 1699,
    dealPriceRate: 0,
    dealPriceInr: 1699,
    commissionRate: 0.105,
    pickPackFeeInr: 17,
    weightHandlingFeeInr: 42,
    fixedClosingFeeInr: 52,
    tdsTcsRate: 0.006,
  },
];

const fieldGroups = [
  {
    title: "Product",
    fields: [
      ["productName", "Product name", "text"],
      ["category", "Category", "category"],
      ["design", "Design", "text"],
      ["color", "Color", "text"],
      ["sku", "SKU", "text"],
      ["asin", "ASIN", "text"],
      ["eanCode", "EAN Code", "text"],
      ["hsnCode", "HSN Code", "text"],
      ["procurementType", "Procurement type", "select", ["Import", "India"]],
      ["productCostUsd", "Product cost / unit", "number", "USD"],
      ["productCostInr", "India product cost / unit", "number", "INR"],
    ],
  },
  {
    title: "Freight",
    fields: [["weightKg", "Weight / unit", "number", "kg"]],
  },
  {
    title: "Customs",
    fields: [
      ["countryOfOrigin", "Country of origin", "country"],
      ["cooBenefit", "COO benefit", "select", ["No", "Yes"]],
      ["bcdRate", "BCD rate", "number", "%"],
      ["gstRate", "GST rate", "number", "%"],
    ],
  },
  {
    title: "Overhead",
    fields: [["overheadCostInr", "Overhead cost", "number", "INR"]],
  },
  {
    title: "Amazon",
    fields: [
      ["amazonSellingPriceInr", "Selling price", "number", "INR"],
      ["dealPriceRate", "Deal discount %", "percentDecimal", "%"],
      ["dealPriceInr", "Deal price", "number", "INR"],
      ["commissionRate", "Commission (preview only)", "percentDecimal", "%"],
      ["pickPackFeeInr", "Pick pack fee", "number", "INR"],
      ["weightHandlingFeeInr", "Weight handling fee", "number", "INR"],
      ["fixedClosingFeeInr", "Fixed closing fee", "number", "INR"],
      ["tdsTcsRate", "TDS/TCS deduction", "percentDecimal", "%"],
    ],
  },
];

const twoDecimalPricingFields = new Set([
  "amazonSellingPriceInr",
  "dealPriceRate",
  "dealPriceInr",
]);

const productSearchFilters = [
  { value: "all", label: "All fields" },
  { value: "productName", label: "Product" },
  { value: "category", label: "Category" },
  { value: "sku", label: "SKU" },
  { value: "asin", label: "ASIN" },
  { value: "eanCode", label: "EAN Code" },
  { value: "hsnCode", label: "HSN Code" },
  { value: "design", label: "Design" },
  { value: "color", label: "Color" },
  { value: "procurementType", label: "Procurement" },
  { value: "countryOfOrigin", label: "Country" },
  { value: "cooBenefit", label: "COO benefit" },
];

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

const dashboardCardDefinitions = [
  { id: "freight", label: "Freight / unit", value: (calc) => currency(calc.freightUsd, "USD", 3) },
  { id: "insurance", label: "Insurance / unit", value: (calc) => currency(calc.insuranceUsd, "USD", 3) },
  {
    id: "basicCustoms",
    label: "Basic customs",
    value: (calc) => `${currency(calc.basicCustomDutyUsd, "USD", 3)} - ${currency(calc.basicCustomDutyInr)}`,
  },
  { id: "sws", label: "SWS", value: (calc) => `${currency(calc.swsUsd, "USD", 3)} - ${currency(calc.swsInr)}` },
  { id: "igst", label: "IGST", value: (calc) => `${currency(calc.igstUsd, "USD", 3)} - ${currency(calc.igstInr)}` },
  {
    id: "importCost",
    label: "Import cost",
    value: (calc) => `${currency(calc.importCostUsd, "USD", 3)} - ${currency(calc.importCostInr)}`,
  },
  { id: "landingCost", label: "Landing cost", value: (calc) => currency(calc.landingCostInr) },
  { id: "gstAmazon", label: "GST Amazon", value: (calc) => currency(calc.gstAmazonInr) },
  { id: "gstAmazonDeal", label: "GST Amazon Deal", value: (calc) => currency(calc.gstAmazonDealInr) },
  { id: "settlementAmazon", label: "Settlement Amazon", value: (calc) => currency(calc.settlementAmazonInr) },
  { id: "settlementAmazonDeal", label: "Settlement Amazon Deal", value: (calc) => currency(calc.settlementAmazonDealInr) },
  {
    id: "profitAmazon",
    label: "Profit Amazon",
    value: (calc) => currency(calc.amazonProfitInr),
    tone: (calc) => (calc.amazonProfitInr >= 0 ? "good" : "bad"),
  },
  {
    id: "profitAmazonDeal",
    label: "Profit Amazon Deal",
    value: (calc) => currency(calc.amazonDealProfitInr),
    tone: (calc) => (calc.amazonDealProfitInr >= 0 ? "good" : "bad"),
  },
  { id: "marginAmazon", label: "Margin Amazon", value: (calc) => percent(calc.marginAmazon) },
  { id: "marginAmazonDeal", label: "Margin Amazon Deal", value: (calc) => percent(calc.marginAmazonDeal) },
  { id: "roiAmazonLanding", label: "ROI Amazon on landing", value: (calc) => percent(calc.roiAmazon) },
  { id: "roiAmazonDealLanding", label: "ROI Amazon Deal on landing", value: (calc) => percent(calc.roiAmazonDeal) },
  { id: "roiAmazonProductCost", label: "ROI Amazon on product cost", value: (calc) => percent(calc.roiProductCostAmazon) },
  {
    id: "roiAmazonDealProductCost",
    label: "ROI Amazon Deal on product cost",
    value: (calc) => percent(calc.roiProductCostAmazonDeal),
  },
];

const initialRequestParams = new URLSearchParams(window.location.search);
const requestedProductId = initialRequestParams.get("product");
const requestedNewProduct = initialRequestParams.get("new") === "1";
let state = loadState();
localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
let calculatorFreightPerKgUsd = safeNumber(state.settings.freightPerKgUsd);
let selectedProductId = requestedNewProduct
  ? null
  : (state.products.some((product) => product.id === requestedProductId)
    ? requestedProductId
    : (state.products[0]?.id ?? null));
let activeGroup = "Product";
let exchangeStatus = "";
let productSearchQuery = "";
let productFilterField = "all";
let uploadStatus = "";
let uploadStatusTone = "";
let localOrderInvoices = loadLocalOrderInvoices();
let invoiceUploadStatus = "";
let invoiceUploadStatusTone = "";
let selectedMasterCategoryId = state.commissionMaster[0]?.id ?? null;
let masterDraft = null;
let masterDraftMessage = "";
let productDraft = null;
let productDraftMode = "";
let productDraftOriginalId = null;
let pendingNewProductRequest = requestedNewProduct;
let productSaveMessage = "";
let commissionPreview = null;
let currentUser = null;
let authReady = false;
let authMessage = "";
let cloudSyncEnabled = false;
let cloudSaveTimer = null;
let cloudVersion = 0;
let syncStatus = "Local only";
let syncStatusTone = "local";
let syncStatusTitle = "Data is currently stored on this device.";
const authCallbackParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const authCallback = {
  accessToken: authCallbackParams.get("access_token"),
  refreshToken: authCallbackParams.get("refresh_token"),
  type: authCallbackParams.get("type"),
};

function createDefaultState() {
  return {
    settings: { ...defaultSettings, dashboardCards: [...defaultDashboardCards] },
    commissionMaster: cloneDefaultCommissionMaster(),
    products: defaultProducts.map((product) => normalizeProduct({ ...product, id: crypto.randomUUID() })),
  };
}

function normalizeStoredState(stored) {
  if (!stored?.settings || !Array.isArray(stored?.products)) return null;
  const settings = { ...defaultSettings, ...stored.settings };
  settings.amazonCommissionWaiverEnabled = settings.amazonCommissionWaiverEnabled === true;
  settings.amazonCommissionWaiverThresholdInr =
    safeNumber(settings.amazonCommissionWaiverThresholdInr) || 999;
  settings.dashboardCards = normalizeDashboardCards(settings.dashboardCards);
  return {
    settings,
    commissionMaster: normalizeCommissionMaster(stored.commissionMaster, stored.products),
    products: stored.products.map((product) => normalizeProduct({
      ...product,
      category: product.category || "",
      bcdRate: product.bcdRate ?? defaultSettings.bcdRate,
      id: product.id || crypto.randomUUID(),
    })),
  };
}

function loadState() {
  try {
    const stored = normalizeStoredState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (stored) return stored;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createDefaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleCloudSave();
}

function loadLocalOrderInvoices() {
  try {
    const stored = JSON.parse(localStorage.getItem(ORDER_HISTORY_STORAGE_KEY));
    if (!Array.isArray(stored)) return [];
    return stored.filter((invoice) =>
      invoice &&
      invoice.id &&
      invoice.invoiceNumber &&
      invoice.invoiceDate &&
      Array.isArray(invoice.lines),
    );
  } catch {
    localStorage.removeItem(ORDER_HISTORY_STORAGE_KEY);
    return [];
  }
}

function saveLocalOrderInvoices() {
  localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(localOrderInvoices));
}

function setSyncStatus(label, tone, title) {
  syncStatus = label;
  syncStatusTone = tone;
  syncStatusTitle = title || label;
}

async function requestApi(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") throw new Error("The server returned an invalid response.");
  if (!response.ok) {
    const error = new Error(data.error || "The request failed.");
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }
  return data;
}

async function requestCloudState(method, body) {
  const response = await fetch("/api/state", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object") {
    throw new Error("Cloud sync returned an invalid response.");
  }
  if (!response.ok) {
    const error = new Error(data.error || "Cloud sync is unavailable.");
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }
  if (method === "GET" && !("state" in data)) {
    throw new Error("Cloud sync returned an incomplete response.");
  }
  return data;
}

async function saveCloudStateNow() {
  if (!cloudSyncEnabled) return false;
  setSyncStatus("Saving…", "syncing", "Saving changes to shared cloud storage.");
  try {
    const result = await requestCloudState("PUT", { state, version: cloudVersion });
    cloudVersion = Number(result.version || cloudVersion);
    setSyncStatus("Synced", "synced", "All changes are saved and available on other devices.");
    return true;
  } catch (error) {
    if (error.code === "VERSION_CONFLICT" && error.data?.state) {
      cloudVersion = Number(error.data.version || cloudVersion);
      const latestState = normalizeStoredState(error.data.state);
      if (latestState) applyCloudState(latestState);
      setSyncStatus("Updated", "error", error.message);
      window.alert(error.message);
      return false;
    }
    if (error.status === 401) {
      currentUser = null;
      authMessage = "Your session expired. Please sign in again.";
      authReady = true;
      render();
      return false;
    }
    setSyncStatus("Sync failed", "error", error.message);
    return false;
  }
}

function scheduleCloudSave() {
  if (!cloudSyncEnabled) return;
  clearTimeout(cloudSaveTimer);
  setSyncStatus("Saving…", "syncing", "Waiting to save the latest changes.");
  cloudSaveTimer = setTimeout(() => {
    cloudSaveTimer = null;
    saveCloudStateNow();
  }, 700);
}

function applyCloudState(cloudState) {
  const newProductDraft = isNewProductDraft() ? productDraft : null;
  state = cloudState;
  calculatorFreightPerKgUsd = safeNumber(state.settings.freightPerKgUsd);
  selectedProductId = newProductDraft
    ? newProductDraft.id
    : (state.products.some((product) => product.id === requestedProductId)
      ? requestedProductId
      : (state.products.some((product) => product.id === selectedProductId)
        ? selectedProductId
        : (state.products[0]?.id ?? null)));
  selectedMasterCategoryId = state.commissionMaster[0]?.id ?? null;
  masterDraft = null;
  if (!newProductDraft) resetProductDraft();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

async function initializeCloudSync({ forcePrompt = false } = {}) {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  setSyncStatus("Connecting…", "syncing", "Connecting to shared cloud storage.");

  if (forcePrompt) {
    syncPassword = "";
    sessionStorage.removeItem(SYNC_PASSWORD_KEY);
  }

  let cloudDocument;
  try {
    cloudDocument = await requestCloudState("GET");
  } catch (error) {
    if (error.code === "SYNC_NOT_CONFIGURED") {
      cloudSyncEnabled = false;
      setSyncStatus("Local only", "local", "Cloud sync needs to be configured in Vercel.");
      return;
    }

    if (error.status !== 401) {
      cloudSyncEnabled = false;
      setSyncStatus("Offline", "error", error.message);
      return;
    }

    const enteredPassword = window.prompt("Enter the app sync password to load shared product data:");
    if (!enteredPassword) {
      cloudSyncEnabled = false;
      setSyncStatus("Local only", "local", "Click to connect this device to shared data.");
      return;
    }

    syncPassword = enteredPassword;
    sessionStorage.setItem(SYNC_PASSWORD_KEY, syncPassword);
    try {
      cloudDocument = await requestCloudState("GET");
    } catch (passwordError) {
      cloudSyncEnabled = false;
      sessionStorage.removeItem(SYNC_PASSWORD_KEY);
      syncPassword = "";
      setSyncStatus(
        passwordError.status === 401 ? "Wrong password" : "Offline",
        "error",
        passwordError.message,
      );
      return;
    }
  }

  cloudSyncEnabled = true;
  const cloudState = normalizeStoredState(cloudDocument.state);
  const migrationComplete = localStorage.getItem(SYNC_MIGRATION_KEY) === "complete";
  let migrationSucceeded = true;

  if (cloudState) {
    if (
      cloudState.products.length > 0 &&
      !migrationComplete &&
      state.products.length > cloudState.products.length
    ) {
      migrationSucceeded = await saveCloudStateNow();
    } else {
      applyCloudState(cloudState);
      setSyncStatus("Synced", "synced", "Shared data loaded. Changes will sync across devices.");
    }
  } else if (state.products.length > defaultProducts.length) {
    migrationSucceeded = await saveCloudStateNow();
  } else {
    setSyncStatus("Cloud ready", "synced", "Cloud storage is ready. Your next change will be shared.");
  }

  if (migrationSucceeded) {
    localStorage.setItem(SYNC_MIGRATION_KEY, "complete");
  }
}

async function initializeAuthenticatedCloudSync() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = null;
  setSyncStatus("Connecting…", "syncing", "Connecting to the shared workspace.");
  try {
    const cloudDocument = await requestCloudState("GET");
    cloudSyncEnabled = true;
    cloudVersion = Number(cloudDocument.version || 0);
    const cloudState = normalizeStoredState(cloudDocument.state);
    if (cloudState) {
      applyCloudState(cloudState);
      setSyncStatus("Synced", "synced", "Shared data loaded. Changes will sync across users.");
    } else {
      await saveCloudStateNow();
    }
  } catch (error) {
    cloudSyncEnabled = false;
    setSyncStatus("Offline", "error", error.message);
  }
}

async function initializeAuth() {
  try {
    const session = await requestApi("/api/auth/session");
    currentUser = session.user;
    authMessage = "";
  } catch (error) {
    currentUser = null;
    authMessage = error.code === "AUTH_NOT_CONFIGURED"
      ? "Multi-user login needs Supabase configuration in Vercel."
      : "";
  }
  if (currentUser) openRequestedNewProductDraft();
  authReady = true;
  render();
  if (currentUser) await initializeAuthenticatedCloudSync();
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  authMessage = "Signing in…";
  renderLoginMessage();
  try {
    const result = await requestApi("/api/auth/login", {
      method: "POST",
      body: { email: form.email.value, password: form.password.value },
    });
    currentUser = result.user;
    authMessage = "";
    openRequestedNewProductDraft();
    render();
    await initializeAuthenticatedCloudSync();
  } catch (error) {
    authMessage = error.message;
    button.disabled = false;
    renderLoginMessage();
  }
}

async function handleSetPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.password.value !== form.confirmPassword.value) {
    authMessage = "The passwords do not match.";
    renderLoginMessage();
    return;
  }
  const button = form.querySelector("button");
  button.disabled = true;
  authMessage = "Saving password…";
  renderLoginMessage();
  try {
    const result = await requestApi("/api/auth/password", {
      method: "POST",
      body: {
        accessToken: authCallback.accessToken,
        refreshToken: authCallback.refreshToken,
        password: form.password.value,
      },
    });
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    currentUser = result.user;
    authMessage = "";
    render();
    await initializeAuthenticatedCloudSync();
  } catch (error) {
    authMessage = error.message;
    button.disabled = false;
    renderLoginMessage();
  }
}

async function handlePasswordRecovery() {
  const email = document.querySelector('[data-login-form] input[name="email"]')?.value || "";
  try {
    const result = await requestApi("/api/auth/recover", { method: "POST", body: { email } });
    authMessage = result.message;
  } catch (error) {
    authMessage = error.message;
  }
  renderLoginMessage();
}

function renderLoginMessage() {
  const message = document.querySelector("[data-login-message]");
  if (message) message.textContent = authMessage;
}

async function logout() {
  await requestApi("/api/auth/logout", { method: "POST" }).catch(() => null);
  currentUser = null;
  cloudSyncEnabled = false;
  cloudVersion = 0;
  authMessage = "You have signed out.";
  render();
}

function currency(value, currencyCode = "INR", decimals = 0) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(safeNumber(value));
}

function number(value, decimals = 2) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(safeNumber(value));
}

function percent(value, decimals = 1) {
  return `${number(safeNumber(value) * 100, decimals)}%`;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProcurementType(value) {
  return String(value ?? "").trim().toLowerCase() === "india" ? "India" : "Import";
}

function isIndiaProcurement(product) {
  return normalizeProcurementType(product.procurementType) === "India";
}

const indiaProcurementDisabledFields = new Set(["countryOfOrigin", "cooBenefit", "bcdRate"]);

function applyIndiaProcurementDefaults(product) {
  if (!isIndiaProcurement(product)) return product;
  product.productCostUsd = 0;
  product.countryOfOrigin = "India";
  product.cooBenefit = "No";
  product.bcdRate = 0;
  return product;
}

function isProductFieldDisabled(product, key) {
  return isIndiaProcurement(product) && indiaProcurementDisabledFields.has(key);
}

function roundCurrencyValue(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function normalizeDashboardCards(cardIds) {
  if (!Array.isArray(cardIds)) return [...defaultDashboardCards];
  const validIds = new Set(dashboardCardDefinitions.map((card) => card.id));
  return [...new Set(cardIds)].filter((cardId) => validIds.has(cardId));
}

function getVisibleDashboardCards() {
  const selectedIds = new Set(normalizeDashboardCards(state.settings.dashboardCards));
  return dashboardCardDefinitions.filter((card) => selectedIds.has(card.id));
}

function normalizeProduct(product) {
  const normalized = { ...product };
  normalized.eanCode = String(normalized.eanCode ?? "").trim();
  normalized.procurementType = normalizeProcurementType(normalized.procurementType);
  normalized.productCostInr = safeNumber(normalized.productCostInr);
  applyIndiaProcurementDefaults(normalized);
  let sellingPriceInr = safeNumber(normalized.amazonSellingPriceInr);
  if (
    sellingPriceInr <= 0 &&
    safeNumber(normalized.dealPriceInr) > 0 &&
    hasValue(normalized.dealPriceRate)
  ) {
    const repairedSellingPrice = calculateSellingPriceFromDeal(
      normalized.dealPriceInr,
      normalized.dealPriceRate,
    );
    if (repairedSellingPrice !== null) {
      normalized.amazonSellingPriceInr = repairedSellingPrice;
      sellingPriceInr = repairedSellingPrice;
    }
  }

  if (!hasValue(normalized.dealPriceRate) && !hasValue(normalized.dealPriceInr)) {
    normalized.dealPriceRate = 0;
    normalized.dealPriceInr = sellingPriceInr;
  } else if (!hasValue(normalized.dealPriceInr)) {
    normalized.dealPriceRate = safeNumber(normalized.dealPriceRate);
    normalized.dealPriceInr = roundCurrencyValue(
      sellingPriceInr * (1 - normalized.dealPriceRate),
    );
  } else if (!hasValue(normalized.dealPriceRate)) {
    normalized.dealPriceInr = safeNumber(normalized.dealPriceInr);
    normalized.dealPriceRate = sellingPriceInr
      ? (sellingPriceInr - normalized.dealPriceInr) / sellingPriceInr
      : 0;
  } else {
    normalized.dealPriceInr = safeNumber(normalized.dealPriceInr);
    normalized.dealPriceRate = sellingPriceInr
      ? (sellingPriceInr - normalized.dealPriceInr) / sellingPriceInr
      : safeNumber(normalized.dealPriceRate);
  }

  return normalized;
}

function createNewProductDraft() {
  const draft = normalizeProduct({
    id: crypto.randomUUID(),
    productName: "",
    category: "",
    design: "",
    color: "",
    sku: "",
    asin: "",
    eanCode: "",
    hsnCode: "",
    procurementType: "Import",
    productCostUsd: 0,
    productCostInr: 0,
    weightKg: 0,
    countryOfOrigin: "",
    cooBenefit: "No",
    bcdRate: 0,
    gstRate: 0,
    overheadCostInr: 0,
    amazonSellingPriceInr: 0,
    dealPriceRate: 0,
    dealPriceInr: 0,
    commissionRate: 0,
    pickPackFeeInr: 0,
    weightHandlingFeeInr: 0,
    fixedClosingFeeInr: 0,
    tdsTcsRate: 0,
  });
  return draft;
}

function startNewProductDraft() {
  productDraft = createNewProductDraft();
  productDraftMode = "new";
  productDraftOriginalId = null;
  selectedProductId = productDraft.id;
  productSaveMessage = "";
  clearCommissionPreview();
  activeGroup = "Product";
}

function openRequestedNewProductDraft() {
  if (!pendingNewProductRequest) return;
  pendingNewProductRequest = false;
  startNewProductDraft();
  window.history.replaceState({}, "", window.location.pathname);
}

function createProductEditDraft(product) {
  return normalizeProduct({ ...product });
}

function isDraftProduct(product) {
  return Boolean(productDraft && product?.id === productDraft.id);
}

function isNewProductDraft() {
  return productDraftMode === "new";
}

function hasProductDraftChanges(product = productDraft) {
  if (!product || !isDraftProduct(product)) return false;
  if (isNewProductDraft()) return true;

  const originalProduct = state.products.find((item) => item.id === productDraftOriginalId);
  if (!originalProduct) return true;
  const normalizedOriginal = normalizeProduct({ ...originalProduct });

  return fieldGroups.some((group) =>
    group.fields.some(([key, , type]) => {
      if (["number", "percentDecimal"].includes(type)) {
        return Math.abs(safeNumber(product[key]) - safeNumber(normalizedOriginal[key])) > 0.000001;
      }
      return String(product[key] ?? "") !== String(normalizedOriginal[key] ?? "");
    }),
  );
}

function getDraftProductLabel() {
  return isNewProductDraft() ? "New Product Draft" : "Unsaved Product Changes";
}

function getSelectedProduct() {
  if (productDraft?.id === selectedProductId) {
    return productDraft;
  }

  return state.products.find((product) => product.id === selectedProductId) || state.products[0] || null;
}

function getProductWithCommissionPreview(product) {
  if (!product || commissionPreview?.productId !== product.id) return product;
  return { ...product, commissionRate: commissionPreview.rate };
}

function clearCommissionPreview() {
  commissionPreview = null;
}

function getListedProducts() {
  if (!productDraft) return state.products;
  if (isNewProductDraft()) return [productDraft, ...state.products];

  return state.products.map((product) =>
    product.id === productDraftOriginalId ? productDraft : product,
  );
}

function getProductListScrollTop() {
  return document.querySelector("[data-product-list-scroll]")?.scrollTop ?? 0;
}

function restoreProductListScroll(productListScrollTop) {
  const productListScroll = document.querySelector("[data-product-list-scroll]");
  if (productListScroll) {
    productListScroll.scrollTop = productListScrollTop;
  }
}

function resetProductDraft() {
  productDraft = null;
  productDraftMode = "";
  productDraftOriginalId = null;
}

function getEditableProduct() {
  if (productDraft?.id === selectedProductId) {
    return productDraft;
  }

  const savedProduct = state.products.find((product) => product.id === selectedProductId);
  if (!savedProduct) return null;

  productDraft = createProductEditDraft(savedProduct);
  productDraftMode = "edit";
  productDraftOriginalId = savedProduct.id;
  return productDraft;
}

function normalizeUniqueCode(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getProductIdentityLabel(product) {
  return product.productName || product.sku || product.asin || product.eanCode || "another product";
}

function getProductDisplayTitle(product) {
  return [product?.productName || "Untitled product", product?.design, product?.color]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function getDuplicateProductMessage(duplicate) {
  if (!duplicate) return "";
  return `Duplicate ${duplicate.label} "${duplicate.value}" already exists in ${getProductIdentityLabel(duplicate.product)}. Product not saved.`;
}

function getIgnoredProductIdForValidation(product) {
  if (isDraftProduct(product)) {
    return isNewProductDraft() ? null : productDraftOriginalId;
  }
  return product?.id ?? null;
}

function getProductUniquenessMessage(product) {
  return getDuplicateProductMessage(
    findDuplicateProductCode(product, state.products, getIgnoredProductIdForValidation(product)),
  );
}

function updateProductMessage(message) {
  const messageBox = document.querySelector("[data-product-message]");
  if (messageBox) {
    messageBox.textContent = message;
    messageBox.hidden = !message;
  }

  const saveButton = document.querySelector('[data-action="save-product"]');
  if (saveButton) {
    saveButton.hidden = !hasProductDraftChanges();
    saveButton.disabled = Boolean(message);
  }

  const discardButton = document.querySelector('[data-action="discard-product"]');
  if (discardButton) {
    discardButton.hidden = !hasProductDraftChanges();
  }
}

function getDeleteName(value, fallback) {
  return String(value || "").trim() || fallback;
}

function confirmMasterCategoryDelete(row) {
  const categoryName = getDeleteName(row?.category, "this category");
  return window.confirm(`Delete ${categoryName}?\nSave Master Data to keep this change.`);
}

function findDuplicateProductCode(product, products = state.products, ignoredProductId = null) {
  const checks = [
    ["sku", "SKU"],
    ["asin", "ASIN"],
    ["eanCode", "EAN Code"],
  ];

  for (const [field, label] of checks) {
    const code = normalizeUniqueCode(product[field]);
    if (!code) continue;
    const duplicateProduct = products.find((item) =>
      item.id !== ignoredProductId && normalizeUniqueCode(item[field]) === code,
    );
    if (duplicateProduct) {
      return { field, label, value: product[field], product: duplicateProduct };
    }
  }

  return null;
}

function validateUniqueProductCodes(products, existingProducts = state.products) {
  const seen = {
    sku: new Map(),
    asin: new Map(),
    eanCode: new Map(),
  };

  existingProducts.forEach((product) => {
    ["sku", "asin", "eanCode"].forEach((field) => {
      const code = normalizeUniqueCode(product[field]);
      if (code && !seen[field].has(code)) {
        seen[field].set(code, product);
      }
    });
  });

  for (const product of products) {
    for (const [field, label] of [["sku", "SKU"], ["asin", "ASIN"], ["eanCode", "EAN Code"]]) {
      const code = normalizeUniqueCode(product[field]);
      if (!code) continue;
      const duplicateProduct = seen[field].get(code);
      if (duplicateProduct && duplicateProduct.id !== product.id) {
        return { field, label, value: product[field], product: duplicateProduct };
      }
      seen[field].set(code, product);
    }
  }

  return null;
}

function findUploadProductMatch(product, products) {
  const matches = products.filter((item) => {
    const skuMatches = normalizeUniqueCode(product.sku) &&
      normalizeUniqueCode(item.sku) === normalizeUniqueCode(product.sku);
    const asinMatches = normalizeUniqueCode(product.asin) &&
      normalizeUniqueCode(item.asin) === normalizeUniqueCode(product.asin);
    const eanMatches = normalizeUniqueCode(product.eanCode) &&
      normalizeUniqueCode(item.eanCode) === normalizeUniqueCode(product.eanCode);
    return skuMatches || asinMatches || eanMatches;
  });
  const uniqueMatches = [...new Map(matches.map((item) => [item.id, item])).values()];

  if (uniqueMatches.length > 1) {
    throw new Error(
      `Excel row for ${getProductIdentityLabel(product)} matches more than one saved product. Check SKU, ASIN and EAN Code before upload.`,
    );
  }

  return uniqueMatches[0] || null;
}

function mergeUploadedProduct(existingProduct, uploadedProduct) {
  const fieldsFromExcel = [
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
  const merged = { ...existingProduct, id: existingProduct.id };

  fieldsFromExcel.forEach((field) => {
    merged[field] = uploadedProduct[field];
  });

  const normalized = normalizeProduct(merged);
  applyCommissionForProductCategory(normalized);
  return normalized;
}

function applyUploadedProducts(products) {
  let addedCount = 0;
  let updatedCount = 0;
  const touchedProducts = [];

  products.forEach((uploadedProduct) => {
    const existingProduct = findUploadProductMatch(uploadedProduct, state.products);

    if (existingProduct) {
      const productIndex = state.products.findIndex((product) => product.id === existingProduct.id);
      const updatedProduct = mergeUploadedProduct(existingProduct, uploadedProduct);
      state.products[productIndex] = updatedProduct;
      touchedProducts.push(updatedProduct);
      updatedCount += 1;
      return;
    }

    state.products.push(uploadedProduct);
    touchedProducts.push(uploadedProduct);
    addedCount += 1;
  });

  return { addedCount, updatedCount, touchedProducts };
}

function saveProductDraft() {
  if (!productDraft) return;
  const productListScrollTop = getProductListScrollTop();
  const savedProduct = normalizeProduct({ ...productDraft });
  applyCommissionForProductCategory(savedProduct);
  const duplicate = findDuplicateProductCode(
    savedProduct,
    state.products,
    isNewProductDraft() ? null : productDraftOriginalId,
  );
  if (duplicate) {
    productSaveMessage = getDuplicateProductMessage(duplicate);
    render();
    restoreProductListScroll(productListScrollTop);
    return;
  }
  if (isNewProductDraft()) {
    state.products.push(savedProduct);
  } else {
    const productIndex = state.products.findIndex((product) => product.id === productDraftOriginalId);
    if (productIndex === -1) return;
    state.products[productIndex] = savedProduct;
  }
  if (String(savedProduct.countryOfOrigin || "").trim()) {
    state.settings.lastCountryOfOrigin = savedProduct.countryOfOrigin;
  }
  selectedProductId = savedProduct.id;
  clearCommissionPreview();
  resetProductDraft();
  productSaveMessage = "";
  saveState();
  render();
  restoreProductListScroll(productListScrollTop);
}

function syncDealPriceFromRate(product) {
  const dealPrice = calculateDealPriceFromSelling(
    product.amazonSellingPriceInr,
    product.dealPriceRate,
  );
  if (dealPrice === null) return false;

  product.dealPriceInr = dealPrice;
  return true;
}

function syncDealRateFromPrice(product) {
  const dealPriceRate = calculateDealRateFromPrices(
    product.amazonSellingPriceInr,
    product.dealPriceInr,
  );
  if (dealPriceRate === null) return false;

  product.dealPriceRate = dealPriceRate;
  return true;
}

function updateDealLinkedFields(product, changedKey) {
  const sellingPriceInput = document.querySelector('[data-product-field="amazonSellingPriceInr"]');
  const rateInput = document.querySelector('[data-product-field="dealPriceRate"]');
  const priceInput = document.querySelector('[data-product-field="dealPriceInr"]');

  if (changedKey !== "amazonSellingPriceInr" && sellingPriceInput) {
    sellingPriceInput.value = safeNumber(product.amazonSellingPriceInr).toFixed(2);
  }

  if (changedKey !== "dealPriceRate" && rateInput) {
    rateInput.value = (safeNumber(product.dealPriceRate) * 100).toFixed(2);
  }

  if (changedKey !== "dealPriceInr" && priceInput) {
    priceInput.value = safeNumber(product.dealPriceInr).toFixed(2);
  }
}

function formatTwoDecimalPricingInput(input) {
  if (!twoDecimalPricingFields.has(input.dataset.productField)) return;
  input.value = safeNumber(input.value).toFixed(2);
}

function getDealPriceInr(product) {
  if (hasValue(product.dealPriceInr)) {
    return safeNumber(product.dealPriceInr);
  }

  const sellingPriceInr = safeNumber(product.amazonSellingPriceInr);
  const dealPriceRate = hasValue(product.dealPriceRate) ? safeNumber(product.dealPriceRate) : 0;
  return roundCurrencyValue(sellingPriceInr * (1 - dealPriceRate));
}

function createCommissionRow(category = "", commissionRate = 0.105) {
  return {
    id: crypto.randomUUID(),
    category,
    commissionRate,
  };
}

function cloneDefaultCommissionMaster() {
  return defaultCommissionMaster.map((row) =>
    createCommissionRow(row.category, row.commissionRate),
  );
}

function cloneCommissionMasterRows(rows) {
  return rows.map((row) => ({
    id: row.id || crypto.randomUUID(),
    category: row.category || "",
    commissionRate: safeNumber(row.commissionRate),
  }));
}

function createMasterDraft() {
  return {
    settings: {
      freightPerKgUsd: state.settings.freightPerKgUsd,
      amazonCommissionWaiverEnabled: state.settings.amazonCommissionWaiverEnabled,
      amazonCommissionWaiverThresholdInr: state.settings.amazonCommissionWaiverThresholdInr,
      insuranceRate: state.settings.insuranceRate,
      swsRate: state.settings.swsRate,
      warehouseRate: state.settings.warehouseRate,
    },
    commissionMaster: cloneCommissionMasterRows(state.commissionMaster),
  };
}

function ensureMasterDraft() {
  if (!masterDraft) {
    masterDraft = createMasterDraft();
  }

  const rows = getDraftCommissionMaster();
  if (!rows.some((row) => row.id === selectedMasterCategoryId)) {
    selectedMasterCategoryId = rows[0]?.id ?? null;
  }
}

function getDraftSettings() {
  return masterDraft?.settings || state.settings;
}

function getDraftCommissionMaster() {
  return masterDraft?.commissionMaster || state.commissionMaster;
}

function normalizeCommissionMaster(masterRows, products = []) {
  const rows = Array.isArray(masterRows) ? masterRows : [];
  const normalized = rows
    .map((row) => ({
      id: row.id || crypto.randomUUID(),
      category: String(row.category || "").trim(),
      commissionRate: safeNumber(row.commissionRate),
    }))
    .filter((row) => row.category);
  const known = new Set(normalized.map((row) => row.category.toLowerCase()));

  products.forEach((product) => {
    const category = String(product.category || "").trim();
    if (category && !known.has(category.toLowerCase())) {
      normalized.push(createCommissionRow(category, safeNumber(product.commissionRate) || 0.105));
      known.add(category.toLowerCase());
    }
  });

  return normalized.length ? normalized : cloneDefaultCommissionMaster();
}

function getKnownCategories() {
  return [...new Set(
    [
      ...state.commissionMaster.map((row) => String(row.category || "").trim()),
      ...state.products.map((product) => String(product.category || "").trim()),
    ]
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

function getKnownCountries() {
  return [...new Set(
    state.products
      .map((product) => String(product.countryOfOrigin || "").trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

function getLatestCountryOfOrigin() {
  const lastCountry = String(state.settings.lastCountryOfOrigin || "").trim();
  if (lastCountry) return lastCountry;

  for (let index = state.products.length - 1; index >= 0; index -= 1) {
    const country = String(state.products[index].countryOfOrigin || "").trim();
    if (country) return country;
  }

  return getKnownCountries()[0] || "";
}

function getCommissionForCategory(category) {
  const normalizedCategory = String(category || "").trim().toLowerCase();
  const match = state.commissionMaster.find(
    (row) => String(row.category || "").trim().toLowerCase() === normalizedCategory,
  );
  return match ? safeNumber(match.commissionRate) : null;
}

function applyCommissionForProductCategory(product) {
  const commissionRate = getCommissionForCategory(product.category);
  if (commissionRate !== null) {
    product.commissionRate = commissionRate;
  }
}

function getLatestMasterCategory() {
  for (let index = state.commissionMaster.length - 1; index >= 0; index -= 1) {
    const category = String(state.commissionMaster[index].category || "").trim();
    if (category) return category;
  }
  return getKnownCategories()[0] || "";
}

function getEffectiveAmazonCommissionRate(priceInr, product, settings = state.settings) {
  const waiverThresholdInr = safeNumber(settings.amazonCommissionWaiverThresholdInr);
  const waiverApplies =
    settings.amazonCommissionWaiverEnabled === true &&
    priceInr > 0 &&
    priceInr <= waiverThresholdInr;
  return waiverApplies ? 0 : safeNumber(product.commissionRate);
}

function calculateAmazonAmounts(priceInr, gstRate, product, landingCostInr, settings = state.settings) {
  const gstOnSellingPriceInr = priceInr * (gstRate / (100 + gstRate));
  const commissionRate = getEffectiveAmazonCommissionRate(priceInr, product, settings);
  const settlementInr =
    priceInr -
    commissionRate * priceInr -
    safeNumber(product.pickPackFeeInr) -
    safeNumber(product.weightHandlingFeeInr) -
    safeNumber(product.fixedClosingFeeInr) -
    (priceInr - gstOnSellingPriceInr) * safeNumber(product.tdsTcsRate);
  const profitInr = settlementInr - gstOnSellingPriceInr - landingCostInr;

  return {
    gstOnSellingPriceInr,
    commissionRate,
    settlementInr,
    profitInr,
    margin: priceInr ? profitInr / priceInr : 0,
  };
}

function getCalculatorSettings() {
  return {
    ...state.settings,
    freightPerKgUsd: calculatorFreightPerKgUsd,
  };
}

function calculateProduct(product, settings = getCalculatorSettings()) {
  const domesticProduct = isIndiaProcurement(product);
  const productCostUsd = domesticProduct ? 0 : safeNumber(product.productCostUsd);
  const weightKg = safeNumber(product.weightKg);
  const gstRate = safeNumber(product.gstRate);
  const usdRate = safeNumber(settings.usdRate);
  const productCostInr = domesticProduct ? safeNumber(product.productCostInr) : productCostUsd * usdRate;
  const freightUsd = domesticProduct ? 0 : safeNumber(settings.freightPerKgUsd) * weightKg;
  const insuranceUsd = domesticProduct
    ? 0
    : (productCostUsd + freightUsd) * (safeNumber(settings.insuranceRate) / 100);
  const customsBaseUsd = productCostUsd + freightUsd + insuranceUsd;
  const hasCooBenefit = String(product.cooBenefit).toLowerCase() === "yes";
  const bcdRate = product.bcdRate ?? settings.bcdRate;
  const basicCustomDutyUsd = domesticProduct || hasCooBenefit
    ? 0
    : customsBaseUsd * (safeNumber(bcdRate) / 100);
  const swsUsd = domesticProduct ? 0 : basicCustomDutyUsd * (safeNumber(settings.swsRate) / 100);
  const igstUsd = domesticProduct
    ? 0
    : (productCostUsd + freightUsd + insuranceUsd + basicCustomDutyUsd + swsUsd) *
      (gstRate / 100);
  const importCostUsd =
    productCostUsd + freightUsd + insuranceUsd + basicCustomDutyUsd + swsUsd;
  const importCostInr = domesticProduct ? productCostInr : importCostUsd * usdRate;
  const landingCostInr =
    importCostInr + importCostInr * (safeNumber(settings.warehouseRate) / 100) + safeNumber(product.overheadCostInr);
  const listedSellingPriceInr = safeNumber(product.amazonSellingPriceInr);
  const dealPriceInr = getDealPriceInr(product);
  const amazonAmounts = calculateAmazonAmounts(
    listedSellingPriceInr,
    gstRate,
    product,
    landingCostInr,
    settings,
  );
  const amazonDealAmounts = calculateAmazonAmounts(
    dealPriceInr,
    gstRate,
    product,
    landingCostInr,
    settings,
  );
  const gstAmazonInr = amazonAmounts.gstOnSellingPriceInr;
  const settlementAmazonInr = amazonAmounts.settlementInr;
  const gstOnAmazonSellingPriceInr = amazonDealAmounts.gstOnSellingPriceInr;
  const amazonSettlementInr = amazonDealAmounts.settlementInr;
  const gstAmazonDealInr = amazonDealAmounts.gstOnSellingPriceInr;
  const settlementAmazonDealInr = amazonDealAmounts.settlementInr;
  const amazonProfitInr = amazonAmounts.profitInr;
  const amazonDealProfitInr = amazonDealAmounts.profitInr;
  const profitInr = amazonDealProfitInr;
  const marginAmazon = amazonAmounts.margin;
  const marginAmazonDeal = amazonDealAmounts.margin;
  const roiAmazon = landingCostInr ? amazonProfitInr / landingCostInr : 0;
  const roiAmazonDeal = landingCostInr ? amazonDealProfitInr / landingCostInr : 0;
  const roiProductCostAmazon = productCostInr ? amazonProfitInr / productCostInr : 0;
  const roiProductCostAmazonDeal = productCostInr ? amazonDealProfitInr / productCostInr : 0;
  const margin = marginAmazonDeal;
  const roi = roiAmazonDeal;
  const roiOnProductCost = roiProductCostAmazonDeal;

  return {
    productCostInr,
    freightUsd,
    insuranceUsd,
    basicCustomDutyUsd,
    basicCustomDutyInr: basicCustomDutyUsd * usdRate,
    swsUsd,
    swsInr: swsUsd * usdRate,
    igstUsd,
    igstInr: igstUsd * usdRate,
    importCostUsd,
    importCostInr,
    landingCostInr,
    listedSellingPriceInr,
    dealPriceInr,
    amazonListedSettlementInr: amazonAmounts.settlementInr,
    gstOnListedSellingPriceInr: amazonAmounts.gstOnSellingPriceInr,
    gstAmazonInr,
    settlementAmazonInr,
    gstOnAmazonSellingPriceInr,
    amazonSettlementInr,
    gstAmazonDealInr,
    settlementAmazonDealInr,
    amazonProfitInr,
    amazonDealProfitInr,
    amazonCommissionRate: amazonAmounts.commissionRate,
    amazonDealCommissionRate: amazonDealAmounts.commissionRate,
    profitInr,
    marginAmazon,
    marginAmazonDeal,
    roiAmazon,
    roiAmazonDeal,
    roiProductCostAmazon,
    roiProductCostAmazonDeal,
    margin,
    roi,
    roiOnProductCost,
  };
}

function summarize() {
  const calculated = state.products.map((product) => ({
    product,
    calc: calculateProduct(product),
  }));
  const totals = calculated.reduce(
    (sum, item) => {
      sum.revenue += safeNumber(item.product.amazonSellingPriceInr);
      sum.landing += item.calc.landingCostInr;
      sum.settlement += item.calc.amazonSettlementInr;
      sum.profit += item.calc.profitInr;
      return sum;
    },
    { revenue: 0, landing: 0, settlement: 0, profit: 0 },
  );
  const best = [...calculated].sort((a, b) => b.calc.profitInr - a.calc.profitInr)[0];
  const profitableCount = calculated.filter((item) => item.calc.profitInr > 0).length;

  return {
    calculated,
    totals,
    best,
    profitableCount,
    margin: totals.revenue ? totals.profit / totals.revenue : 0,
  };
}

function renderAppLoader(message = "Preparing your workspace") {
  return `
    <main class="login-page loading-page">
      <section class="branded-loader" role="status" aria-live="polite">
        <div class="loader-orbit" aria-hidden="true">
          <img class="loader-mark" src="import-profit-mark.png" alt="" />
        </div>
        <p class="eyebrow">Import and Profit App</p>
        <h1>${escapeHtml(message)}</h1>
        <div class="loader-progress" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
      </section>
    </main>
  `;
}

function renderLoginPage() {
  if (!authReady) return renderAppLoader();

  const completingPassword = authCallback.accessToken && ["invite", "recovery"].includes(authCallback.type);
  return `
    <main class="login-page">
      <section class="login-card">
        <img class="brand-mark login-mark" src="import-profit-mark.png" alt="" />
        <p class="eyebrow">Import and Profit App</p>
        <h1>${completingPassword ? "Set your password" : "Sign in"}</h1>
        <p class="login-note">${completingPassword ? "Choose a password to complete your invitation or account recovery." : "Use the email address from your invitation. New accounts can only be created by an administrator."}</p>
        ${completingPassword ? `
          <form class="login-form" data-password-form>
            <label class="form-field"><span>New password</span><div class="input-shell"><input name="password" type="password" minlength="8" required /></div></label>
            <label class="form-field"><span>Confirm password</span><div class="input-shell"><input name="confirmPassword" type="password" minlength="8" required /></div></label>
            <button class="primary-button" type="submit">Save password</button>
          </form>
        ` : `
          <form class="login-form" data-login-form>
            <label class="form-field">
              <span>Email</span>
              <div class="input-shell"><input name="email" type="email" autocomplete="username" required /></div>
            </label>
            <label class="form-field">
              <span>Password</span>
              <div class="input-shell"><input name="password" type="password" autocomplete="current-password" required /></div>
            </label>
            <button class="primary-button" type="submit">Sign in</button>
            <button class="ghost-button" type="button" data-recover-password>Forgot password</button>
          </form>
        `}
        <p class="login-message" data-login-message>${escapeHtml(authMessage)}</p>
      </section>
    </main>
  `;
}

function render() {
  const app = document.querySelector("#app");
  if (!authReady || !currentUser) {
    app.innerHTML = renderLoginPage();
    document.querySelector("[data-login-form]")?.addEventListener("submit", handleLogin);
    document.querySelector("[data-password-form]")?.addEventListener("submit", handleSetPassword);
    document.querySelector("[data-recover-password]")?.addEventListener("click", handlePasswordRecovery);
    return;
  }
  const page = getCurrentPage();

  if (page === "master") {
    ensureMasterDraft();
    app.innerHTML = `
      <main class="shell">
        ${renderHeader(page)}
        ${renderMasterDataPage()}
      </main>
    `;

    bindEvents();
    return;
  }

  const summary = summarize();
  const selectedProduct = getSelectedProduct();
  selectedProductId = selectedProduct?.id ?? null;
  const selectedCalc = selectedProduct
    ? calculateProduct(getProductWithCommissionPreview(selectedProduct))
    : null;

  app.innerHTML = `
    <main class="shell">
      <header class="app-header">
        <div class="brand-lockup">
          <img class="brand-mark" src="/import-profit-mark.png" alt="" />
          <div>
            <p class="eyebrow">Import and Profit</p>
            <strong class="sidebar-title">Workspace</strong>
          </div>
        </div>
        <nav class="header-actions" aria-label="Workspace navigation">
          <span class="sidebar-section-label">Workspace</span>
          <a class="nav-link active" href="index.html">Calculator</a>
          <a class="nav-link" href="products.html">All Products</a>
          <a class="nav-link" href="invoices.html">Invoices</a>
          <a class="nav-link" href="master/index.html">Master Data</a>
          ${renderSyncControl()}
        </nav>
      </header>

      <section class="settings-band">
        ${renderSettingInput("usdRate", "USD Rate", state.settings.usdRate, "INR")}
        ${renderCalculatorFreightInput(calculatorFreightPerKgUsd)}
        <div class="rate-tools">
          <button class="ghost-button" data-action="refresh-rate">Live USD/INR</button>
          <span class="status-text">${exchangeStatus || state.settings.fxUpdatedAt}</span>
        </div>
      </section>

      <section class="workspace">
        <aside class="product-list">
          <div class="section-title">
            <h2>Find Product</h2>
          </div>
          ${renderProductSearch()}
          <div class="list-scroll" data-product-list-scroll>
            ${getListedProducts().map((product) => renderProductRow(product)).join("")}
          </div>
          <div class="empty-filter" data-filter-empty hidden>No products match this search.</div>
        </aside>

        <section class="editor-panel">
          ${
            selectedProduct
              ? renderEditor(selectedProduct, selectedCalc)
              : `<div class="empty-state">Add a product to begin.</div>`
          }
        </section>
      </section>
    </main>
  `;

  bindEvents();
  applyProductFilter();
}

function getCurrentPage() {
  const path = window.location.pathname.replace(/\/$/, "");
  return path === "/master" ||
    path === "/master.html" ||
    path === "/master/index.html" ||
    path.endsWith("/master/index.html")
    ? "master"
    : "home";
}

function renderHeader(page) {
  return `
    <header class="app-header">
      <div class="brand-lockup">
        <img class="brand-mark" src="/import-profit-mark.png" alt="" />
        <div>
          <p class="eyebrow">Import and Profit</p>
          <strong class="sidebar-title">Workspace</strong>
        </div>
      </div>
      <nav class="header-actions" aria-label="Workspace navigation">
        <span class="sidebar-section-label">Workspace</span>
        <a class="nav-link" href="../index.html">Calculator</a>
        <a class="nav-link" href="../products.html">All Products</a>
        <a class="nav-link" href="../invoices.html">Invoices</a>
        <a class="nav-link active" href="../master/index.html">Master Data</a>
        ${renderSyncControl()}
      </nav>
    </header>
    <section class="page-topbar">
      <div>
        <p class="page-kicker">Workspace / Settings</p>
        <h1>Master Data</h1>
      </div>
      <span class="page-status-pill">Configuration</span>
    </section>
  `;
}

function renderSyncControl() {
  return `
    ${currentUser?.role === "admin" ? `<a class="nav-link" href="/admin">Users & Logs</a>` : ""}
    ${renderWorkspaceConnectionStatus()}
    <span class="sidebar-section-label account-section-label">Account</span>
    <span class="account-chip" title="${escapeAttribute(currentUser?.email || "")}">
      <strong>${escapeHtml(currentUser?.full_name || currentUser?.email || "User")}</strong>
      <small>${escapeHtml(currentUser?.role || "")}</small>
    </span>
    <button class="ghost-button compact sidebar-logout" data-action="logout" type="button">Logout</button>
  `;
}

function renderSettingInput(key, label, value, suffix) {
  return `
    <label class="setting-field">
      <span>${label}</span>
      <div class="input-shell">
        <input data-setting="${key}" type="number" step="0.001" value="${value}" />
        <b>${suffix}</b>
      </div>
    </label>
  `;
}

function renderCalculatorFreightInput(value) {
  return `
    <label class="setting-field">
      <span>Freight / kg</span>
      <div class="input-shell">
        <input
          data-calculator-freight
          type="number"
          step="0.001"
          value="${value}"
          aria-label="Temporary freight per kilogram"
        />
        <b>USD</b>
      </div>
    </label>
  `;
}

function renderMasterSettingInput(key, label, value, suffix) {
  return `
    <label class="setting-field">
      <span>${label}</span>
      <div class="input-shell">
        <input data-master-setting="${key}" type="number" step="0.001" value="${value}" />
        <b>${suffix}</b>
      </div>
    </label>
  `;
}

function renderMasterDataPage() {
  return `
    <section class="master-page">
      <section class="master-toolbar">
        <div>
          <h2>Master Data Entry</h2>
          <p class="section-note">Changes here update the app only after you save.</p>
          ${masterDraftMessage ? `<p class="save-message">${masterDraftMessage}</p>` : ""}
        </div>
        <button class="primary-button" data-action="save-master">Save Master Data</button>
      </section>
      ${renderCategoryCommissionSection()}
      ${renderAmazonCommissionWaiverSection()}
      ${renderFreightSection()}
      ${renderInsuranceSection()}
      ${renderSwsSection()}
      ${renderWarehouseSection()}
    </section>
  `;
}

function renderCommissionMaster() {
  return renderCategoryCommissionSection();
}

function renderAmazonCommissionWaiverSection() {
  const draftSettings = getDraftSettings();
  const enabled = draftSettings.amazonCommissionWaiverEnabled === true;
  return `
    <section class="master-section">
      <div class="section-title">
        <div>
          <h2>Amazon Commission Waiver</h2>
          <p class="section-note">Temporarily use 0% commission when the applicable selling or deal price is at or below the limit.</p>
        </div>
        <span class="section-pill ${enabled ? "active" : ""}">${enabled ? "Active" : "Inactive"}</span>
      </div>
      <div class="commission-waiver-settings">
        <label class="waiver-toggle">
          <input
            data-master-setting="amazonCommissionWaiverEnabled"
            type="checkbox"
            ${enabled ? "checked" : ""}
          />
          <span>
            <strong>Enable temporary waiver</strong>
            <small>Switch this off when Amazon ends the waiver.</small>
          </span>
        </label>
        ${renderMasterSettingInput(
          "amazonCommissionWaiverThresholdInr",
          "Price limit",
          draftSettings.amazonCommissionWaiverThresholdInr,
          "INR",
        )}
      </div>
    </section>
  `;
}

function renderCategoryCommissionSection() {
  const selectedRow = getSelectedCommissionRow();
  const commissionRows = getDraftCommissionMaster();

  return `
    <section class="master-section">
      <div class="section-title">
        <div>
          <h2>Category Commission</h2>
          <p class="section-note">Map each product category to its Amazon commission.</p>
        </div>
        <button class="primary-button compact" data-action="add-master-category">+ Category</button>
      </div>
      <label class="form-field master-picker">
        <span>Select category</span>
        <div class="input-shell">
          <select data-master-category-select>
            ${commissionRows
              .map(
                (row) => `
                  <option value="${row.id}" ${row.id === selectedMasterCategoryId ? "selected" : ""}>
                    ${escapeHtml(row.category || "Untitled category")}
                  </option>
                `,
              )
              .join("")}
          </select>
        </div>
      </label>
      <div class="master-grid">
        ${selectedRow ? renderCommissionMasterRow(selectedRow) : ""}
      </div>
    </section>
  `;
}

function getSelectedCommissionRow() {
  const rows = getDraftCommissionMaster();
  const selectedRow = rows.find((row) => row.id === selectedMasterCategoryId);
  if (selectedRow) return selectedRow;

  const fallbackRow = rows[0] || null;
  selectedMasterCategoryId = fallbackRow?.id ?? null;
  return fallbackRow;
}

function renderFreightSection() {
  const draftSettings = getDraftSettings();
  return `
    <section class="master-section">
      <div class="section-title">
        <div>
          <h2>Freight</h2>
          <p class="section-note">Saved freight rate used as the calculator default.</p>
        </div>
      </div>
      <div class="master-grid compact">
        ${renderMasterSettingInput("freightPerKgUsd", "Freight / kg", draftSettings.freightPerKgUsd, "USD")}
      </div>
    </section>
  `;
}

function renderInsuranceSection() {
  const draftSettings = getDraftSettings();
  return `
    <section class="master-section">
      <div class="section-title">
        <div>
          <h2>Insurance</h2>
          <p class="section-note">Default insurance rate used in import cost calculation.</p>
        </div>
      </div>
      <div class="master-grid compact">
        ${renderMasterSettingInput("insuranceRate", "Insurance rate", draftSettings.insuranceRate, "%")}
      </div>
    </section>
  `;
}

function renderSwsSection() {
  const draftSettings = getDraftSettings();
  return `
    <section class="master-section">
      <div class="section-title">
        <div>
          <h2>SWS</h2>
          <p class="section-note">Default Social Welfare Surcharge rate used after basic custom duty.</p>
        </div>
      </div>
      <div class="master-grid compact">
        ${renderMasterSettingInput("swsRate", "SWS rate", draftSettings.swsRate, "%")}
      </div>
    </section>
  `;
}

function renderWarehouseSection() {
  const draftSettings = getDraftSettings();
  return `
    <section class="master-section">
      <div class="section-title">
        <div>
          <h2>Warehouse</h2>
          <p class="section-note">Default warehouse load added to import cost before overhead cost.</p>
        </div>
      </div>
      <div class="master-grid compact">
        ${renderMasterSettingInput("warehouseRate", "Warehouse load", draftSettings.warehouseRate, "%")}
      </div>
    </section>
  `;
}

function renderMasterPlaceholderSection(title, note) {
  return `
    <section class="master-section placeholder">
      <div class="section-title">
        <div>
          <h2>${title}</h2>
          <p class="section-note">${note}</p>
        </div>
        <span class="section-pill">Ready for setup</span>
      </div>
    </section>
  `;
}

function renderCommissionMasterRow(row) {
  return `
    <div class="master-row">
      <label class="form-field">
        <span>Category</span>
        <div class="input-shell">
          <input
            data-master-id="${row.id}"
            data-master-field="category"
            data-master-original="${escapeAttribute(row.category)}"
            type="text"
            value="${escapeAttribute(row.category)}"
          />
        </div>
      </label>
      <label class="form-field">
        <span>Amazon commission</span>
        <div class="input-shell">
          <input
            data-master-id="${row.id}"
            data-master-field="commissionRate"
            type="number"
            step="0.001"
            value="${safeNumber(row.commissionRate) * 100}"
          />
          <b>%</b>
        </div>
      </label>
      <button class="icon-button danger master-delete" data-master-delete="${row.id}" title="Delete category" aria-label="Delete category">x</button>
    </div>
  `;
}

function metric(label, value, detail, tone = "") {
  return `
    <article class="metric ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `;
}

function renderProductRow(product) {
  const calc = calculateProduct(product);
  const active = product.id === selectedProductId ? "active" : "";
  const draft = isDraftProduct(product);
  const tone = calc.amazonDealProfitInr >= 0 ? "positive" : "negative";
  return `
    <button class="product-row ${active} ${draft ? "draft" : ""}" data-select-product="${product.id}" data-product-row="${product.id}">
      <span>
        <strong>${escapeHtml(getProductDisplayTitle(product))}</strong>
        <small>SKU: ${escapeHtml(product.sku || "-")} | ASIN: ${escapeHtml(product.asin || "-")} | EAN: ${escapeHtml(product.eanCode || "-")} | HSN: ${escapeHtml(product.hsnCode || "-")}</small>
        <small>${draft ? (isNewProductDraft() ? "Draft, not saved" : "Unsaved changes") : `Category: ${escapeHtml(product.category || "-")}`}</small>
      </span>
      <b class="${tone}">${currency(calc.amazonDealProfitInr)}</b>
    </button>
  `;
}

function renderProductSearch() {
  return `
    <div class="product-search-control">
      <div class="product-tools">
        <div class="input-shell search-shell">
          <input
            data-product-search
            type="search"
            placeholder="Search product, category, color, SKU, ASIN, EAN, HSN"
            value="${escapeAttribute(productSearchQuery)}"
            aria-label="Search products"
          />
        </div>
        <div class="input-shell filter-shell">
          <select data-product-filter aria-label="Filter search field">
            ${productSearchFilters
              .map(
                (filter) => `
                  <option value="${filter.value}" ${productFilterField === filter.value ? "selected" : ""}>
                    ${filter.label}
                  </option>
                `,
              )
              .join("")}
          </select>
        </div>
      </div>
      ${uploadStatus ? `<div class="upload-status ${uploadStatusTone}">${escapeHtml(uploadStatus)}</div>` : ""}
    </div>
  `;
}

function getProductOrderHistory(product) {
  const sku = normalizeInvoiceIdentifier(product?.sku);
  if (!sku) return [];

  return localOrderInvoices
    .map((invoice) => ({
      ...invoice,
      quantity: invoice.lines
        .filter((line) => normalizeInvoiceIdentifier(line.sku) === sku)
        .reduce((total, line) => total + safeNumber(line.quantity), 0),
    }))
    .filter((invoice) => invoice.quantity > 0)
    .sort((a, b) =>
      String(b.invoiceDate).localeCompare(String(a.invoiceDate)) ||
      String(b.invoiceNumber).localeCompare(String(a.invoiceNumber)),
    );
}

function formatOrderDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value || "-");
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatOrderQuantity(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(safeNumber(value));
}

function renderOrderHistory(product) {
  const history = getProductOrderHistory(product);
  const totalQuantity = history.reduce((total, invoice) => total + invoice.quantity, 0);
  return `
    <section class="order-history-panel">
      <div class="order-history-head">
        <div>
          <h3>Lifetime ordered quantity</h3>
        </div>
        <strong class="order-total">${formatOrderQuantity(totalQuantity)}</strong>
      </div>
      ${invoiceUploadStatus ? `<div class="upload-status ${invoiceUploadStatusTone}">${escapeHtml(invoiceUploadStatus)}</div>` : ""}
      <div class="order-history-meta">No. of invoices: <strong>${history.length}</strong></div>
      ${history.length ? `
        <div class="order-history-table" role="table" aria-label="Product invoice history">
          <div class="order-history-row order-history-labels" role="row">
            <span>Order date</span>
            <span>Invoice number</span>
            <span>Quantity</span>
            <span></span>
          </div>
          ${history.map((invoice) => `
            <div class="order-history-row" role="row">
              <span>${escapeHtml(formatOrderDate(invoice.invoiceDate))}</span>
              <strong>${escapeHtml(invoice.invoiceNumber)}</strong>
              <b>${formatOrderQuantity(invoice.quantity)}</b>
              <button class="icon-button small danger" data-remove-invoice="${escapeAttribute(invoice.id)}" title="Remove this invoice from local history" aria-label="Remove invoice">Ã—</button>
            </div>
          `).join("")}
        </div>
      ` : `<div class="order-history-empty">No invoice quantity recorded for SKU ${escapeHtml(product.sku || "-")}.</div>`}
    </section>
  `;
}

function renderEditor(product, calc) {
  const draft = isDraftProduct(product);
  const hasChanges = hasProductDraftChanges(product);
  const productMessage = productSaveMessage || getProductUniquenessMessage(product);
  return `
    <div class="editor-head">
      <div>
        ${draft ? `<p class="eyebrow">${getDraftProductLabel()}</p>` : ""}
        <h2>${escapeHtml(getProductDisplayTitle(product))}</h2>
      </div>
      <div class="row-actions ${draft ? "draft-actions" : ""}">
        <button class="primary-button compact" data-action="save-product" ${hasChanges ? "" : "hidden"} ${productMessage ? "disabled" : ""}>Save Product</button>
        <button class="ghost-button compact" data-action="discard-product" ${hasChanges ? "" : "hidden"}>Discard</button>
      </div>
    </div>
    <div class="product-message error" data-product-message ${productMessage ? "" : "hidden"}>${escapeHtml(productMessage)}</div>

    <div class="tabs" role="tablist" aria-label="Product sections">
      ${fieldGroups
        .map(
          (group) => `
            <button class="${group.title === activeGroup ? "active" : ""}" data-tab="${group.title}" role="tab">
              ${group.title}
            </button>
          `,
        )
        .join("")}
    </div>

    <div class="editor-grid">
      ${fieldGroups.find((group) => group.title === activeGroup).fields
        .filter((field) => shouldRenderProductField(product, field))
        .map((field) => renderProductField(product, field))
        .join("")}
    </div>
    ${activeGroup === "Amazon" ? renderCommissionWaiverStatus() : ""}
    ${renderCountryOptions()}
    ${renderDashboardFilter()}
    <div class="breakdown-grid" data-product-dashboard>
      ${!getVisibleDashboardCards().length ? `<div class="dashboard-empty">No dashboard cards selected.</div>` : ""}
      ${breakdownItem("Freight / unit", currency(calc.freightUsd, "USD", 3))}
      ${breakdownItem("Insurance / unit", currency(calc.insuranceUsd, "USD", 3))}
      ${breakdownItem("Basic customs", `${currency(calc.basicCustomDutyUsd, "USD", 3)} · ${currency(calc.basicCustomDutyInr)}`)}
      ${breakdownItem("SWS", `${currency(calc.swsUsd, "USD", 3)} · ${currency(calc.swsInr)}`)}
      ${breakdownItem("IGST", `${currency(calc.igstUsd, "USD", 3)} · ${currency(calc.igstInr)}`)}
      ${breakdownItem("Import cost", `${currency(calc.importCostUsd, "USD", 3)} · ${currency(calc.importCostInr)}`)}
      ${breakdownItem("Landing cost", currency(calc.landingCostInr))}
      ${breakdownItem("GST Amazon", currency(calc.gstAmazonInr))}
      ${breakdownItem("GST Amazon Deal", currency(calc.gstAmazonDealInr))}
      ${breakdownItem("Settlement Amazon", currency(calc.settlementAmazonInr))}
      ${breakdownItem("Settlement Amazon Deal", currency(calc.settlementAmazonDealInr))}
      ${breakdownItem("Profit Amazon", currency(calc.amazonProfitInr), calc.amazonProfitInr >= 0 ? "good" : "bad")}
      ${breakdownItem("Profit Amazon Deal", currency(calc.amazonDealProfitInr), calc.amazonDealProfitInr >= 0 ? "good" : "bad")}
      ${breakdownItem("Margin Amazon", percent(calc.marginAmazon), "amazon-margin")}
      ${breakdownItem("Margin Amazon Deal", percent(calc.marginAmazonDeal), "deal-margin")}
      ${breakdownItem("ROI Amazon on landing", percent(calc.roiAmazon), "roi-landing")}
      ${breakdownItem("ROI Amazon Deal on landing", percent(calc.roiAmazonDeal), "roi-deal-landing")}
      ${breakdownItem("ROI Amazon on product cost", percent(calc.roiProductCostAmazon), "roi-product-cost")}
      ${breakdownItem("ROI Amazon Deal on product cost", percent(calc.roiProductCostAmazonDeal), "roi-product-cost")}
    </div>
    ${activeGroup === "Product" ? renderOrderHistory(product) : ""}
  `;
}

function renderCommissionWaiverStatus() {
  const enabled = state.settings.amazonCommissionWaiverEnabled === true;
  const threshold = currency(state.settings.amazonCommissionWaiverThresholdInr);
  if (!enabled) {
    return `<div class="commission-waiver-status">Commission waiver is off. The category commission applies to both prices.</div>`;
  }

    return `
      <div class="commission-waiver-status active">
        <strong>0% commission up to ${threshold}</strong>
      </div>
    `;
  }

function shouldRenderProductField(product, [key]) {
  if (key === "productCostUsd") return !isIndiaProcurement(product);
  if (key === "productCostInr") return isIndiaProcurement(product);
  return true;
}

function renderProductField(product, [key, label, type, suffixOrOptions]) {
  const previewProduct = getProductWithCommissionPreview(product);
  const rawValue = previewProduct[key] ?? "";
  const disabled = isProductFieldDisabled(product, key);
  const disabledAttribute = disabled ? " disabled" : "";
  let control = "";

  if (type === "select") {
    control = `
      <select data-product-field="${key}"${disabledAttribute}>
        ${suffixOrOptions
          .map(
            (option) => `
              <option value="${option}" ${String(rawValue) === option ? "selected" : ""}>${option}</option>
            `,
          )
          .join("")}
      </select>
    `;
  } else if (type === "category") {
    const categories = getKnownCategories();
    control = `
      <select data-product-field="${key}"${disabledAttribute}>
        <option value="" ${rawValue ? "" : "selected"}>Select category</option>
        ${categories
          .map(
            (category) => `
              <option value="${escapeAttribute(category)}" ${String(rawValue) === category ? "selected" : ""}>${escapeHtml(category)}</option>
            `,
          )
          .join("")}
        ${rawValue && !categories.includes(String(rawValue)) ? `<option value="${escapeAttribute(rawValue)}" selected>${escapeHtml(rawValue)}</option>` : ""}
      </select>
    `;
  } else {
    const value = type === "percentDecimal" ? safeNumber(rawValue) * 100 : rawValue;
    const blankNewDraftNumber =
      isNewProductDraft() &&
      isDraftProduct(product) &&
      ["number", "percentDecimal"].includes(type) &&
      safeNumber(value) === 0;
    const displayValue = blankNewDraftNumber
      ? ""
      : (twoDecimalPricingFields.has(key)
        ? safeNumber(value).toFixed(2)
        : value);
    const isTextInput = type === "text" || type === "country";
    const listAttribute = type === "country" ? ` list="country-options"` : "";
    const numberLimits = key === "dealPriceRate" ? ` min="0" max="99.99"` : "";
    const numberStep = twoDecimalPricingFields.has(key) ? "0.01" : "0.001";
    control = `
      <input
        data-product-field="${key}"
        type="${isTextInput ? "text" : "number"}"
        step="${isTextInput ? "" : numberStep}"
        ${listAttribute}
        ${numberLimits}
        ${disabledAttribute}
        value="${escapeAttribute(displayValue)}"
      />
    `;
  }

  return `
    <label class="form-field ${disabled ? "disabled-field" : ""}">
      <span>${label}</span>
      <div class="input-shell">
        ${control}
        ${suffixOrOptions && type !== "select" ? `<b>${suffixOrOptions}</b>` : ""}
      </div>
    </label>
  `;
}

function renderCountryOptions() {
  const countries = getKnownCountries();
  if (!countries.length) return "";

  return `
    <datalist id="country-options">
      ${countries.map((country) => `<option value="${escapeAttribute(country)}"></option>`).join("")}
    </datalist>
  `;
}

function renderDashboardFilter() {
  const selectedCards = new Set(normalizeDashboardCards(state.settings.dashboardCards));
  return `
    <details class="dashboard-filter">
      <summary>Dashboard display</summary>
      <div class="dashboard-filter-grid">
        ${dashboardCardDefinitions
          .map(
            (card) => `
              <label class="dashboard-filter-option">
                <input
                  data-dashboard-card="${card.id}"
                  type="checkbox"
                  ${selectedCards.has(card.id) ? "checked" : ""}
                />
                <span>${card.label}</span>
              </label>
            `,
          )
          .join("")}
      </div>
    </details>
  `;
}

function shouldShowDashboardCard(label) {
  const card = dashboardCardDefinitions.find((item) => item.label === label);
  if (!card) return true;
  return normalizeDashboardCards(state.settings.dashboardCards).includes(card.id);
}

function renderProductDashboard(calc) {
  if (!getVisibleDashboardCards().length) {
    return `<div class="dashboard-empty">No dashboard cards selected.</div>`;
  }

  return `
      ${breakdownItem("Freight / unit", currency(calc.freightUsd, "USD", 3))}
      ${breakdownItem("Insurance / unit", currency(calc.insuranceUsd, "USD", 3))}
      ${breakdownItem("Basic customs", `${currency(calc.basicCustomDutyUsd, "USD", 3)} · ${currency(calc.basicCustomDutyInr)}`)}
      ${breakdownItem("SWS", `${currency(calc.swsUsd, "USD", 3)} · ${currency(calc.swsInr)}`)}
      ${breakdownItem("IGST", `${currency(calc.igstUsd, "USD", 3)} · ${currency(calc.igstInr)}`)}
      ${breakdownItem("Import cost", `${currency(calc.importCostUsd, "USD", 3)} · ${currency(calc.importCostInr)}`)}
      ${breakdownItem("Landing cost", currency(calc.landingCostInr))}
      ${breakdownItem("GST Amazon", currency(calc.gstAmazonInr))}
      ${breakdownItem("GST Amazon Deal", currency(calc.gstAmazonDealInr))}
      ${breakdownItem("Settlement Amazon", currency(calc.settlementAmazonInr))}
      ${breakdownItem("Settlement Amazon Deal", currency(calc.settlementAmazonDealInr))}
      ${breakdownItem("Profit Amazon", currency(calc.amazonProfitInr), calc.amazonProfitInr >= 0 ? "good" : "bad")}
      ${breakdownItem("Profit Amazon Deal", currency(calc.amazonDealProfitInr), calc.amazonDealProfitInr >= 0 ? "good" : "bad")}
      ${breakdownItem("Margin Amazon", percent(calc.marginAmazon), "amazon-margin")}
      ${breakdownItem("Margin Amazon Deal", percent(calc.marginAmazonDeal), "deal-margin")}
      ${breakdownItem("ROI Amazon on landing", percent(calc.roiAmazon), "roi-landing")}
      ${breakdownItem("ROI Amazon Deal on landing", percent(calc.roiAmazonDeal), "roi-deal-landing")}
      ${breakdownItem("ROI Amazon on product cost", percent(calc.roiProductCostAmazon), "roi-product-cost")}
      ${breakdownItem("ROI Amazon Deal on product cost", percent(calc.roiProductCostAmazonDeal), "roi-product-cost")}
  `;
}

function updateProductLiveDashboard(product) {
  const calc = calculateProduct(getProductWithCommissionPreview(product));
  const dashboard = document.querySelector("[data-product-dashboard]");
  if (dashboard) {
    dashboard.innerHTML = renderProductDashboard(calc);
  }

  const productRow = [...document.querySelectorAll("[data-product-row]")].find(
    (row) => row.dataset.productRow === product.id,
  );
  const profitCell = productRow?.querySelector("b");
  if (profitCell) {
    profitCell.textContent = currency(calc.amazonDealProfitInr);
    profitCell.classList.toggle("positive", calc.amazonDealProfitInr >= 0);
    profitCell.classList.toggle("negative", calc.amazonDealProfitInr < 0);
  }

  if (isDraftProduct(product)) {
    const editorLabel = document.querySelector(".editor-head .eyebrow");
    if (editorLabel) {
      editorLabel.textContent = getDraftProductLabel();
    }

    const rowActions = document.querySelector(".editor-head .row-actions");
    rowActions?.classList.add("draft-actions");
    const discardButton = document.querySelector('[data-action="discard-product"]');
    if (discardButton) {
      discardButton.hidden = false;
    }

    productRow?.classList.add("draft");
    const rowDetails = productRow?.querySelectorAll("small");
    if (rowDetails?.length) {
      rowDetails[rowDetails.length - 1].textContent = isNewProductDraft()
        ? "Draft, not saved"
        : "Unsaved changes";
    }

  }
}

function breakdownItem(label, value, tone = "") {
  if (!shouldShowDashboardCard(label)) return "";

  return `
    <article class="breakdown-item ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("input", (event) => {
      updateSettingFromInput(event.currentTarget);
      saveState();
    });
    input.addEventListener("change", (event) => {
      updateSettingFromInput(event.currentTarget);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-calculator-freight]").forEach((input) => {
    const updateTemporaryFreight = (event) => {
      calculatorFreightPerKgUsd = safeNumber(event.currentTarget.value);
      const product = getSelectedProduct();
      if (product) {
        updateProductLiveDashboard(product);
      }
    };
    input.addEventListener("input", updateTemporaryFreight);
    input.addEventListener("change", updateTemporaryFreight);
  });

  document.querySelectorAll("[data-master-setting]").forEach((input) => {
    input.addEventListener("input", updateMasterSettingFromInput);
    input.addEventListener("change", updateMasterSettingFromInput);
  });

  document.querySelectorAll("[data-product-field]").forEach((input) => {
    input.addEventListener("input", handleProductInput);
    input.addEventListener("change", handleProductInput);
    input.addEventListener("blur", (event) => formatTwoDecimalPricingInput(event.currentTarget));
  });

  document.querySelectorAll("[data-dashboard-card]").forEach((input) => {
    input.addEventListener("change", () => {
      state.settings.dashboardCards = [...document.querySelectorAll("[data-dashboard-card]:checked")]
        .map((item) => item.dataset.dashboardCard);
      saveState();
      const product = getSelectedProduct();
      if (product) {
        updateProductLiveDashboard(product);
      }
    });
  });

  document.querySelectorAll("[data-master-field]").forEach((input) => {
    input.addEventListener("input", handleMasterInput);
    input.addEventListener("change", handleMasterInput);
  });

  const masterCategorySelect = document.querySelector("[data-master-category-select]");
  masterCategorySelect?.addEventListener("change", (event) => {
    selectedMasterCategoryId = event.currentTarget.value;
    render();
  });

  document.querySelectorAll("[data-master-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      ensureMasterDraft();
      const row = masterDraft.commissionMaster.find(
        (item) => item.id === button.dataset.masterDelete,
      );
      if (!row) return;
      if (masterDraft.commissionMaster.length === 1) {
        window.alert("At least one category is required.");
        return;
      }
      if (!confirmMasterCategoryDelete(row)) return;
      masterDraft.commissionMaster = masterDraft.commissionMaster.filter(
        (row) => row.id !== button.dataset.masterDelete,
      );
      selectedMasterCategoryId = masterDraft.commissionMaster[0]?.id ?? null;
      masterDraftMessage = "";
      render();
    });
  });

  const productSearch = document.querySelector("[data-product-search]");
  productSearch?.addEventListener("input", (event) => {
    productSearchQuery = event.currentTarget.value;
    applyProductFilter();
  });

  const productFilter = document.querySelector("[data-product-filter]");
  productFilter?.addEventListener("change", (event) => {
    productFilterField = event.currentTarget.value;
    applyProductFilter();
  });

  const productUpload = document.querySelector("[data-product-upload]");
  productUpload?.addEventListener("change", handleBulkUpload);

  document.querySelectorAll("[data-remove-invoice]").forEach((button) => {
    button.addEventListener("click", () => removeLocalInvoice(button.dataset.removeInvoice));
  });

  document.querySelectorAll("[data-select-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const productListScrollTop = getProductListScrollTop();
      clearCommissionPreview();
      selectedProductId = button.dataset.selectProduct;
      productSaveMessage = "";
      render();
      restoreProductListScroll(productListScrollTop);
    });
  });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const productListScrollTop = getProductListScrollTop();
      activeGroup = button.dataset.tab;
      render();
      restoreProductListScroll(productListScrollTop);
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
}

function applyProductFilter() {
  const rows = document.querySelectorAll("[data-product-row]");
  const query = productSearchQuery.trim().toLowerCase();
  let visibleCount = 0;

  rows.forEach((row) => {
    const product = getListedProducts().find((item) => item.id === row.dataset.productRow);
    const isVisible = Boolean(query) && (product ? productMatchesSearch(product, query) : false);
    row.hidden = !isVisible;
    if (isVisible) {
      visibleCount += 1;
    }
  });

  document.querySelector(".product-list")?.classList.toggle("search-idle", !query);

  const emptyState = document.querySelector("[data-filter-empty]");
  if (emptyState) {
    emptyState.hidden = !query || visibleCount > 0;
  }
}

function productMatchesSearch(product, query) {
  if (!query) return true;
  const fields =
    productFilterField === "all"
      ? productSearchFilters
          .filter((filter) => filter.value !== "all")
          .map((filter) => filter.value)
      : [productFilterField];

  return fields.some((field) =>
    String(product[field] ?? "")
      .toLowerCase()
      .includes(query),
  );
}

function getInvoiceMatchSummary(invoice) {
  const savedSkus = new Set(
    state.products
      .map((product) => normalizeInvoiceIdentifier(product.sku))
      .filter(Boolean),
  );
  const matchedLines = invoice.lines.filter((line) =>
    savedSkus.has(normalizeInvoiceIdentifier(line.sku)),
  );
  const unmatchedLines = invoice.lines.filter((line) =>
    !savedSkus.has(normalizeInvoiceIdentifier(line.sku)),
  );
  return {
    matchedLines,
    unmatchedLines,
    matchedQuantity: matchedLines.reduce((total, line) => total + safeNumber(line.quantity), 0),
  };
}

async function handleInvoiceUpload(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  if (!file) return;

  invoiceUploadStatus = `Reading ${file.name}`;
  invoiceUploadStatusTone = "";
  render();

  try {
    const rows = await readXlsxRows(file);
    const parsedInvoice = parseOrderInvoiceRows(rows, file.name);
    const invoiceKey = normalizeInvoiceIdentifier(parsedInvoice.invoiceNumber);
    if (localOrderInvoices.some((invoice) =>
      normalizeInvoiceIdentifier(invoice.invoiceNumber) === invoiceKey,
    )) {
      throw new Error(`Invoice ${parsedInvoice.invoiceNumber} was already uploaded and has not been counted again.`);
    }

    const invoice = {
      ...parsedInvoice,
      id: crypto.randomUUID(),
      importedAt: new Date().toISOString(),
    };
    localOrderInvoices.push(invoice);
    saveLocalOrderInvoices();

    const match = getInvoiceMatchSummary(invoice);
    invoiceUploadStatus = `Invoice ${invoice.invoiceNumber}: ${formatOrderQuantity(invoice.totalQuantity)} units read, ${formatOrderQuantity(match.matchedQuantity)} matched to saved products${match.unmatchedLines.length ? `, ${match.unmatchedLines.length} SKU row${match.unmatchedLines.length === 1 ? "" : "s"} unmatched` : ""}.`;
    invoiceUploadStatusTone = match.unmatchedLines.length ? "warning" : "";
    activeGroup = "Product";
    render();
  } catch (error) {
    invoiceUploadStatus = error.message || "Could not read this invoice.";
    invoiceUploadStatusTone = "error";
    render();
  }
}

function removeLocalInvoice(invoiceId) {
  const invoice = localOrderInvoices.find((item) => item.id === invoiceId);
  if (!invoice) return;
  if (!window.confirm(`Remove invoice ${invoice.invoiceNumber} from local order history?\nThis removes its quantities from every product on this browser.`)) {
    return;
  }
  localOrderInvoices = localOrderInvoices.filter((item) => item.id !== invoiceId);
  saveLocalOrderInvoices();
  invoiceUploadStatus = `Invoice ${invoice.invoiceNumber} removed from local order history.`;
  invoiceUploadStatusTone = "";
  render();
}

async function handleBulkUpload(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  if (!file) return;

  if (productDraft) {
    uploadStatus = "Save or discard the current product before uploading Excel.";
    uploadStatusTone = "error";
    render();
    return;
  }

  uploadStatus = `Reading ${file.name}`;
  uploadStatusTone = "";
  render();

  try {
    const rows = await readXlsxRows(file);
    const products = createProductsFromUploadRows(rows);
    if (!products.length) {
      throw new Error("No product rows found in the Excel file.");
    }

    const uploadResult = applyUploadedProducts(products);
    state.commissionMaster = normalizeCommissionMaster(state.commissionMaster, state.products);
    const latestCountry = [...uploadResult.touchedProducts].reverse().find((product) =>
      String(product.countryOfOrigin || "").trim(),
    )?.countryOfOrigin;
    if (latestCountry) {
      state.settings.lastCountryOfOrigin = latestCountry;
    }

    selectedProductId = uploadResult.touchedProducts[0].id;
    productSearchQuery = "";
    productFilterField = "all";
    activeGroup = "Product";
    productSaveMessage = "";
    uploadStatus = `${uploadResult.addedCount} added, ${uploadResult.updatedCount} updated from Excel.`;
    uploadStatusTone = "";
    saveState();
    render();
  } catch (error) {
    uploadStatus = error.message || "Could not import this Excel file.";
    uploadStatusTone = "error";
    render();
  }
}

async function readXlsxRows(file) {
  const zip = await readZipEntries(await file.arrayBuffer());
  const sheetPath = await getFirstWorksheetPath(zip);
  const sharedStrings = zip.has("xl/sharedStrings.xml")
    ? parseSharedStrings(await zip.getText("xl/sharedStrings.xml"))
    : [];
  return parseWorksheetRows(await zip.getText(sheetPath), sharedStrings);
}

async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const endOffset = findZipEndOffset(view);
  const entryCount = view.getUint16(endOffset + 10, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  const entries = new Map();
  let offset = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Excel file structure is not readable.");
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + fileNameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;

    entries.set(name, {
      method,
      compressed: bytes.slice(dataStart, dataStart + compressedSize),
      content: null,
    });

    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  async function getBytes(name) {
    const entry = entries.get(name);
    if (!entry) throw new Error(`Missing Excel part: ${name}`);
    if (entry.content) return entry.content;
    if (entry.method === 0) {
      entry.content = entry.compressed;
    } else if (entry.method === 8) {
      entry.content = await inflateZipDeflate(entry.compressed);
    } else {
      throw new Error("This Excel compression type is not supported.");
    }
    return entry.content;
  }

  return {
    has: (name) => entries.has(name),
    names: () => [...entries.keys()],
    getBytes,
    getText: async (name) => new TextDecoder("utf-8").decode(await getBytes(name)),
  };
}

function findZipEndOffset(view) {
  const minimumOffset = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("Please upload a valid .xlsx file.");
}

async function inflateZipDeflate(bytes) {
  if (!("DecompressionStream" in window)) {
    throw new Error("Excel upload needs a current Chrome or Edge browser.");
  }

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function getFirstWorksheetPath(zip) {
  if (!zip.has("xl/workbook.xml")) {
    const fallbackSheet = zip.names().find((name) => name.startsWith("xl/worksheets/sheet"));
    if (fallbackSheet) return fallbackSheet;
    throw new Error("No worksheet found in this Excel file.");
  }

  const workbookDoc = parseXml(await zip.getText("xl/workbook.xml"));
  const sheet = workbookDoc.getElementsByTagName("sheet")[0];
  const relId = sheet?.getAttribute("r:id");
  if (!relId || !zip.has("xl/_rels/workbook.xml.rels")) {
    return "xl/worksheets/sheet1.xml";
  }

  const relDoc = parseXml(await zip.getText("xl/_rels/workbook.xml.rels"));
  const relationship = [...relDoc.getElementsByTagName("Relationship")]
    .find((item) => item.getAttribute("Id") === relId);
  const target = relationship?.getAttribute("Target");
  if (!target) return "xl/worksheets/sheet1.xml";
  return normalizeZipPath(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
}

function normalizeZipPath(path) {
  const parts = [];
  path.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      parts.pop();
      return;
    }
    parts.push(part);
  });
  return parts.join("/");
}

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Excel XML could not be read.");
  }
  return doc;
}

function parseSharedStrings(xml) {
  return [...parseXml(xml).getElementsByTagName("si")].map((item) =>
    [...item.getElementsByTagName("t")].map((text) => text.textContent || "").join(""),
  );
}

function parseWorksheetRows(xml, sharedStrings) {
  return [...parseXml(xml).getElementsByTagName("row")]
    .map((row) => {
      const values = [];
      [...row.getElementsByTagName("c")].forEach((cell) => {
        const cellRef = cell.getAttribute("r") || "";
        const column = columnNameToIndex(cellRef.replace(/[0-9]/g, "")) ?? values.length;
        values[column] = readWorksheetCell(cell, sharedStrings);
      });
      return values;
    })
    .filter((row) => row.some(hasUploadValue));
}

function readWorksheetCell(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return [...cell.getElementsByTagName("t")].map((text) => text.textContent || "").join("");
  }

  const value = cell.getElementsByTagName("v")[0]?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  if (type === "b") return value === "1";
  if (type === "str") return value;
  const parsed = Number(value);
  return value !== "" && Number.isFinite(parsed) ? parsed : value;
}

function columnNameToIndex(columnName) {
  if (!columnName) return null;
  return [...columnName].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function createProductsFromUploadRows(rows) {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => uploadHeaderAliases[normalizeUploadHeader(cell)]),
  );
  if (headerIndex === -1) {
    throw new Error("No matching header row found in the Excel file.");
  }

  const columnMap = rows[headerIndex].reduce((map, header, index) => {
    const field = uploadHeaderAliases[normalizeUploadHeader(header)];
    if (field) map.set(index, field);
    return map;
  }, new Map());

  return rows
    .slice(headerIndex + 1)
    .map((row) => createProductFromUploadRow(row, columnMap))
    .filter(Boolean);
}

function createProductFromUploadRow(row, columnMap) {
  const values = {};
  columnMap.forEach((field, index) => {
    values[field] = row[index];
  });

  if (!Object.values(values).some(hasUploadValue)) return null;
  const countryOfOrigin = uploadText(values.countryOfOrigin);
  const procurementType = normalizeProcurementType(
    uploadText(values.procurementType) || (countryOfOrigin.toLowerCase() === "india" ? "India" : "Import"),
  );
  const uploadedProductCost = parseUploadNumber(values.productCostUsd);

  const product = {
    ...defaultProducts[0],
    id: crypto.randomUUID(),
    productName: uploadText(values.productName) || uploadText(values.sku) || "Imported Product",
    category: uploadText(values.category) || getLatestMasterCategory(),
    design: uploadText(values.design),
    color: uploadText(values.color),
    sku: uploadText(values.sku),
    asin: uploadText(values.asin),
    eanCode: uploadText(values.eanCode),
    hsnCode: uploadText(values.hsnCode),
    procurementType,
    productCostUsd: procurementType === "India" ? 0 : uploadedProductCost,
    productCostInr: hasUploadValue(values.productCostInr)
      ? parseUploadNumber(values.productCostInr)
      : (procurementType === "India" ? uploadedProductCost : 0),
    weightKg: parseUploadNumber(values.weightKg),
    countryOfOrigin: countryOfOrigin || (procurementType === "India" ? "India" : getLatestCountryOfOrigin()),
    cooBenefit: parseUploadYesNo(values.cooBenefit),
    bcdRate: parseUploadPercentagePoints(values.bcdRate, state.settings.bcdRate),
    gstRate: parseUploadPercentagePoints(values.gstRate, defaultProducts[0].gstRate),
    amazonSellingPriceInr: getUploadedSellingPrice(values),
    dealPriceRate: parseUploadDiscountRate(values.dealPriceRate),
    dealPriceInr: hasUploadValue(values.dealPriceInr) ? parseUploadNumber(values.dealPriceInr) : undefined,
  };

  const normalized = normalizeProduct(product);
  applyCommissionForProductCategory(normalized);
  return normalized;
}

function normalizeUploadHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("&", "and")
    .replace(/[^a-z0-9]+/g, "");
}

function hasUploadValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function uploadText(value) {
  if (!hasUploadValue(value)) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value).trim();
}

function parseUploadNumber(value) {
  if (!hasUploadValue(value)) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).replace(/[₹$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseUploadPercentagePoints(value, fallback) {
  if (!hasUploadValue(value)) return fallback;
  const parsed = parseUploadNumber(value);
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

function parseUploadDiscountRate(value) {
  if (!hasUploadValue(value)) return 0;
  const parsed = parseUploadNumber(value);
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function getUploadedSellingPrice(values) {
  const uploadedSellingPrice = hasUploadValue(values.amazonSellingPriceInr)
    ? parseUploadNumber(values.amazonSellingPriceInr)
    : undefined;

  if (!hasUploadValue(values.dealPriceInr) || !hasUploadValue(values.dealPriceRate)) {
    return uploadedSellingPrice;
  }

  const dealPriceRate = parseUploadDiscountRate(values.dealPriceRate);
  const sellingPrice = calculateSellingPriceFromDeal(
    parseUploadNumber(values.dealPriceInr),
    dealPriceRate,
  );
  if (sellingPrice === null) {
    throw new Error("Excel Deal discount must be at least 0% and less than 100%.");
  }

  return sellingPrice;
}

function parseUploadYesNo(value) {
  const text = uploadText(value).toLowerCase();
  if (["yes", "y", "true", "1"].includes(text)) return "Yes";
  if (["no", "n", "false", "0"].includes(text)) return "No";
  return "No";
}

function updateSettingFromInput(input) {
  const key = input.dataset.setting;
  state.settings[key] = safeNumber(input.value);
  if (key === "usdRate") {
    state.settings.fxUpdatedAt = "Manual";
  }
}

function updateMasterSettingFromInput(event) {
  ensureMasterDraft();
  const key = event.currentTarget.dataset.masterSetting;
  masterDraft.settings[key] = event.currentTarget.type === "checkbox"
    ? event.currentTarget.checked
    : safeNumber(event.currentTarget.value);
  masterDraftMessage = "";
  if (event.currentTarget.type === "checkbox") {
    render();
  }
}

function handleMasterInput(event) {
  ensureMasterDraft();
  const row = masterDraft.commissionMaster.find(
    (item) => item.id === event.currentTarget.dataset.masterId,
  );
  if (!row) return;
  masterDraftMessage = "";

  if (event.currentTarget.dataset.masterField === "category") {
    row.category = event.currentTarget.value;
  } else {
    row.commissionRate = safeNumber(event.currentTarget.value) / 100;
  }
}

function saveMasterDraft() {
  ensureMasterDraft();
  const savedSelectedId = selectedMasterCategoryId;
  const previousById = new Map(state.commissionMaster.map((row) => [row.id, row]));
  const draftRows = masterDraft.commissionMaster
    .map((row) => ({
      id: row.id || crypto.randomUUID(),
      category: String(row.category || "").trim(),
      commissionRate: safeNumber(row.commissionRate),
    }))
    .filter((row) => row.category);

  draftRows.forEach((row) => {
    const previous = previousById.get(row.id);
    const originalCategory = String(previous?.category || "").trim();
    const nextCategory = row.category;
    if (!originalCategory || originalCategory.toLowerCase() === nextCategory.toLowerCase()) return;
    state.products
      .filter(
        (product) =>
          String(product.category || "").trim().toLowerCase() === originalCategory.toLowerCase(),
      )
      .forEach((product) => {
        product.category = nextCategory;
      });
  });

  state.settings = {
    ...state.settings,
    freightPerKgUsd: safeNumber(masterDraft.settings.freightPerKgUsd),
    amazonCommissionWaiverEnabled: masterDraft.settings.amazonCommissionWaiverEnabled === true,
    amazonCommissionWaiverThresholdInr:
      safeNumber(masterDraft.settings.amazonCommissionWaiverThresholdInr) || 999,
    insuranceRate: safeNumber(masterDraft.settings.insuranceRate),
    swsRate: safeNumber(masterDraft.settings.swsRate),
    warehouseRate: safeNumber(masterDraft.settings.warehouseRate),
  };
  calculatorFreightPerKgUsd = state.settings.freightPerKgUsd;
  state.commissionMaster = normalizeCommissionMaster(draftRows, state.products);
  state.commissionMaster.forEach((row) => {
    state.products
      .filter(
        (product) =>
          String(product.category || "").trim().toLowerCase() ===
          String(row.category || "").trim().toLowerCase(),
      )
      .forEach((product) => {
        product.commissionRate = safeNumber(row.commissionRate);
      });
  });

  saveState();
  masterDraft = createMasterDraft();
  masterDraftMessage = "Master data saved.";
  selectedMasterCategoryId = state.commissionMaster.some((row) => row.id === savedSelectedId)
    ? savedSelectedId
    : state.commissionMaster[0]?.id ?? null;
  render();
}

function handleProductInput(event) {
  const key = event.currentTarget.dataset.productField;
  if (key === "commissionRate") {
    const selectedProduct = getSelectedProduct();
    if (!selectedProduct) return;
    commissionPreview = {
      productId: selectedProduct.id,
      rate: safeNumber(event.currentTarget.value) / 100,
    };
    updateProductLiveDashboard(selectedProduct);
    return;
  }

  const product = getEditableProduct();
  if (!product) return;
  const draft = isDraftProduct(product);
  productSaveMessage = "";
  let pricingMessage = "";

  const percentFields = new Set(["tdsTcsRate"]);
  const textFields = new Set(["productName", "category", "design", "color", "sku", "asin", "eanCode", "hsnCode", "procurementType", "countryOfOrigin", "cooBenefit"]);

  if (key === "dealPriceRate") {
    product.dealPriceRate = safeNumber(event.currentTarget.value) / 100;
    if (!syncDealPriceFromRate(product)) {
      pricingMessage = "Deal discount must be at least 0% and less than 100%.";
    }
    updateDealLinkedFields(product, key);
  } else if (key === "dealPriceInr") {
    product.dealPriceInr = safeNumber(event.currentTarget.value);
    if (!syncDealRateFromPrice(product)) {
      pricingMessage = "Deal price must be greater than 0 and cannot exceed selling price.";
    }
    updateDealLinkedFields(product, key);
  } else if (percentFields.has(key)) {
    product[key] = safeNumber(event.currentTarget.value) / 100;
  } else if (textFields.has(key)) {
    product[key] = key === "procurementType"
      ? normalizeProcurementType(event.currentTarget.value)
      : event.currentTarget.value;
    if (key === "procurementType") {
      applyIndiaProcurementDefaults(product);
    }
    if (key === "category") {
      applyCommissionForProductCategory(product);
    }
    if (key === "countryOfOrigin" && !draft) {
      state.settings.lastCountryOfOrigin = event.currentTarget.value;
    }
  } else {
    product[key] = safeNumber(event.currentTarget.value);
    if (key === "amazonSellingPriceInr") {
      syncDealPriceFromRate(product);
      updateDealLinkedFields(product, key);
    }
  }

  if (draft && !isNewProductDraft() && !hasProductDraftChanges(product)) {
    resetProductDraft();
  }

  productSaveMessage = pricingMessage || getProductUniquenessMessage(product);
  updateProductMessage(productSaveMessage);
  updateProductLiveDashboard(product);

  if (event.type === "change" && twoDecimalPricingFields.has(key)) {
    const value = key === "dealPriceRate"
      ? safeNumber(product.dealPriceRate) * 100
      : safeNumber(product[key]);
    event.currentTarget.value = value.toFixed(2);
  }

  if (!draft) {
    saveState();
  }
  if (event.type === "change" && !draft) {
    render();
  }
  if (event.type === "change" && key === "procurementType") {
    render();
  }
}

async function handleAction(action) {
  if (action === "sync") {
    if (cloudSyncEnabled) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = null;
      await saveCloudStateNow();
    } else {
      await initializeAuthenticatedCloudSync();
    }
  }

  if (action === "logout") {
    await logout();
    return;
  }

  if (action === "save-product") {
    saveProductDraft();
  }

  if (action === "discard-product") {
    if (!productDraft) return;
    const fallbackProductId = isNewProductDraft()
      ? state.products[0]?.id ?? null
      : productDraftOriginalId;
    resetProductDraft();
    clearCommissionPreview();
    productSaveMessage = "";
    selectedProductId = fallbackProductId;
    render();
  }

  if (action === "save-master") {
    saveMasterDraft();
  }

  if (action === "add-master-category") {
    ensureMasterDraft();
    const newRow = createCommissionRow("New Category", 0.105);
    masterDraft.commissionMaster.push(newRow);
    selectedMasterCategoryId = newRow.id;
    masterDraftMessage = "";
    render();
  }

  if (action === "add") {
    if (!productDraft) {
      startNewProductDraft();
    }
    selectedProductId = productDraft.id;
    activeGroup = "Product";
    render();
  }

  if (action === "refresh-rate") {
    await refreshRate();
  }
}

async function refreshRate() {
  exchangeStatus = "Refreshing";
  render();
  try {
    const response = await fetch("/api/rates?from=USD&to=INR");
    if (!response.ok) throw new Error("Rate unavailable");
    const data = await response.json();
    state.settings.usdRate = Number(data.rate.toFixed(4));
    state.settings.fxUpdatedAt = data.date ? `Live ${data.date}` : "Live rate";
    exchangeStatus = "";
    saveState();
  } catch {
    exchangeStatus = "Manual rate active";
  }
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

render();
initializeAuth();
startWorkspaceConnectionMonitor();
