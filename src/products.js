import { normalizeInvoiceIdentifier } from "./invoice-orders.js";
import { importProductRows } from "./product-upload.js";
import { readXlsxRows } from "./xlsx-reader.js";
import { downloadProductWorkbook } from "./xlsx-export.js";
import {
  renderWorkspaceConnectionStatus,
  startWorkspaceConnectionMonitor,
} from "./connection-status.js";
import {
  getUniqueFilterOptions,
  matchesFilterValue,
  normalizeFilterValue,
} from "./product-filters.js";
import {
  getBulkDeleteWarning,
  getSelectedProducts,
  removeSelectedProducts,
} from "./product-bulk-actions.js";

const STORAGE_KEY = "custom-import-profit-state-v1";
const ORDER_HISTORY_STORAGE_KEY = "custom-import-profit-order-history-v1";
const app = document.querySelector("#products-app");

let currentUser = null;
let products = [];
let stateDocument = null;
let cloudVersion = 0;
let cloudSyncEnabled = false;
let uploadStatus = "";
let uploadStatusTone = "";
let selectedProductIds = new Set();
let bulkDeletePending = false;
let localOrderInvoices = loadLocalOrderInvoices();
let settings = {
  usdRate: 95.2,
  freightPerKgUsd: 4.5,
  amazonCommissionWaiverEnabled: true,
  amazonCommissionWaiverThresholdInr: 999,
  insuranceRate: 1.125,
  bcdRate: 15,
  swsRate: 10,
  warehouseRate: 2,
};
let filters = {
  search: "",
  category: "",
  countryOfOrigin: "",
  cooBenefit: "",
  design: "",
  color: "",
  sort: "alphabetical",
};

const sortOptions = [
  { value: "alphabetical", label: "Alphabetical A-Z" },
  { value: "sellingPriceLow", label: "Selling price: low to high" },
  { value: "sellingPriceHigh", label: "Selling price: high to low" },
  { value: "dealPriceLow", label: "Deal price: low to high" },
  { value: "dealPriceHigh", label: "Deal price: high to low" },
  { value: "amazonProfitLow", label: "Amazon profit: low to high" },
  { value: "amazonProfitHigh", label: "Amazon profit: high to low" },
  { value: "amazonDealProfitLow", label: "Amazon deal profit: low to high" },
  { value: "amazonDealProfitHigh", label: "Amazon deal profit: high to low" },
  { value: "lifetimeQuantityLow", label: "Lifetime ordered quantity: low to high" },
  { value: "lifetimeQuantityHigh", label: "Lifetime ordered quantity: high to low" },
];

function canManageProducts() {
  return ["admin", "editor"].includes(currentUser?.role);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
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
  return escapeHtml(value);
}

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safeNumber(value));
}

function formatQuantity(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(safeNumber(value));
}

function loadLocalOrderInvoices() {
  try {
    const stored = JSON.parse(localStorage.getItem(ORDER_HISTORY_STORAGE_KEY));
    if (!Array.isArray(stored)) return [];
    return stored.filter((invoice) => invoice && Array.isArray(invoice.lines));
  } catch {
    return [];
  }
}

function getLifetimeOrderedQuantity(product) {
  const sku = normalizeInvoiceIdentifier(product?.sku);
  if (!sku) return 0;
  return localOrderInvoices.reduce(
    (total, invoice) => total + invoice.lines
      .filter((line) => normalizeInvoiceIdentifier(line.sku) === sku)
      .reduce((invoiceTotal, line) => invoiceTotal + safeNumber(line.quantity), 0),
    0,
  );
}

function getProductTitle(product) {
  return [product.productName || "Untitled product", product.design, product.color]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function getDealPrice(product) {
  if (product.dealPriceInr !== undefined && product.dealPriceInr !== null && product.dealPriceInr !== "") {
    return safeNumber(product.dealPriceInr);
  }
  return safeNumber(product.amazonSellingPriceInr) * (1 - safeNumber(product.dealPriceRate));
}

function renderAmazonProductLink(product) {
  const asin = String(product.asin || "").trim();
  if (!asin) return "";
  const amazonUrl = `https://www.amazon.in/dp/${encodeURIComponent(asin)}`;
  return `
    <a
      class="amazon-product-link"
      href="${amazonUrl}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open ${escapeAttribute(getProductTitle(product))} on Amazon"
    >
      <span class="amazon-wordmark" aria-hidden="true">amazon</span>
      <span class="amazon-link-arrow" aria-hidden="true">↗</span>
    </a>
  `;
}

function calculateAmazonAmounts(price, product, landingCost) {
  const gstRate = safeNumber(product.gstRate);
  const gstOnSellingPrice = price * (gstRate / (100 + gstRate));
  const waiverApplies =
    settings.amazonCommissionWaiverEnabled === true &&
    price > 0 &&
    price <= safeNumber(settings.amazonCommissionWaiverThresholdInr);
  const commissionRate = waiverApplies ? 0 : safeNumber(product.commissionRate);
  const settlement = (
    price -
    commissionRate * price -
    safeNumber(product.pickPackFeeInr) -
    safeNumber(product.weightHandlingFeeInr) -
    safeNumber(product.fixedClosingFeeInr) -
    (price - gstOnSellingPrice) * safeNumber(product.tdsTcsRate)
  );
  return {
    settlement,
    profit: settlement - gstOnSellingPrice - landingCost,
  };
}

function calculateProductMetrics(product) {
  const domesticProduct = String(product.procurementType || "").trim().toLowerCase() === "india";
  const productCostUsd = domesticProduct ? 0 : safeNumber(product.productCostUsd);
  const productCostInr = domesticProduct
    ? safeNumber(product.productCostInr)
    : productCostUsd * safeNumber(settings.usdRate);
  const freightUsd = domesticProduct
    ? 0
    : safeNumber(settings.freightPerKgUsd) * safeNumber(product.weightKg);
  const insuranceUsd = domesticProduct
    ? 0
    : (productCostUsd + freightUsd) * (safeNumber(settings.insuranceRate) / 100);
  const customsBaseUsd = productCostUsd + freightUsd + insuranceUsd;
  const hasCooBenefit = String(product.cooBenefit || "").trim().toLowerCase() === "yes";
  const bcdRate = product.bcdRate ?? settings.bcdRate;
  const basicCustomDutyUsd = domesticProduct || hasCooBenefit
    ? 0
    : customsBaseUsd * (safeNumber(bcdRate) / 100);
  const swsUsd = domesticProduct
    ? 0
    : basicCustomDutyUsd * (safeNumber(settings.swsRate) / 100);
  const importCostUsd = productCostUsd + freightUsd + insuranceUsd + basicCustomDutyUsd + swsUsd;
  const importCostInr = domesticProduct
    ? productCostInr
    : importCostUsd * safeNumber(settings.usdRate);
  const landingCost = (
    importCostInr +
    importCostInr * (safeNumber(settings.warehouseRate) / 100) +
    safeNumber(product.overheadCostInr)
  );
  const amazon = calculateAmazonAmounts(
    safeNumber(product.amazonSellingPriceInr),
    product,
    landingCost,
  );
  const deal = calculateAmazonAmounts(getDealPrice(product), product, landingCost);
  return {
    landingCost,
    amazonProfit: amazon.profit,
    amazonDealProfit: deal.profit,
    settlement: deal.settlement,
  };
}

function getStoredState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored && Array.isArray(stored.products) ? stored : null;
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}

function getFilterOptions(field) {
  return field === "sort" ? sortOptions : getUniqueFilterOptions(products, field);
}

function renderSearchableDropdown(field, label, allLabel, searchPlaceholder) {
  const options = getFilterOptions(field);
  const selectedValue = filters[field];
  const selectedLabel = selectedValue
    ? options.find((option) => option.value === selectedValue)?.label || allLabel
    : allLabel;
  return `
    <div class="form-field catalog-dropdown-field">
      <span>${escapeHtml(label)}</span>
      <div
        class="searchable-select"
        data-searchable-select="${escapeAttribute(field)}"
        data-all-label="${escapeAttribute(allLabel)}"
      >
        <button
          class="searchable-select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded="false"
          data-searchable-trigger
        >
          <span data-searchable-selected>${escapeHtml(selectedLabel)}</span>
          <span class="searchable-select-arrow" aria-hidden="true">⌄</span>
        </button>
        <div class="searchable-select-menu" data-searchable-menu hidden>
          <input
            class="searchable-select-search"
            type="search"
            placeholder="${escapeAttribute(searchPlaceholder)}"
            aria-label="${escapeAttribute(searchPlaceholder)}"
            autocomplete="off"
            data-searchable-search
          />
          <div class="searchable-select-options" role="listbox">
            ${field === "sort" ? "" : `
              <button
                class="searchable-select-option ${selectedValue ? "" : "selected"}"
                type="button"
                role="option"
                aria-selected="${selectedValue ? "false" : "true"}"
                data-searchable-option
                data-value=""
              >${escapeHtml(allLabel)}</button>
            `}
            ${options.map((option) => `
              <button
                class="searchable-select-option ${option.value === selectedValue ? "selected" : ""}"
                type="button"
                role="option"
                aria-selected="${option.value === selectedValue ? "true" : "false"}"
                data-searchable-option
                data-value="${escapeAttribute(option.value)}"
              >${escapeHtml(option.label)}</button>
            `).join("")}
            <p class="searchable-select-empty" data-searchable-empty hidden>No matching options.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSidebar() {
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
        <a class="nav-link" href="index.html">Calculator</a>
        <a class="nav-link active" href="products.html">All Products</a>
        <a class="nav-link" href="invoices.html">Invoices</a>
        <a class="nav-link" href="master/index.html">Master Data</a>
        ${currentUser?.role === "admin" ? `<a class="nav-link" href="/admin">Users & Logs</a>` : ""}
        ${renderWorkspaceConnectionStatus()}
        <span class="sidebar-section-label account-section-label">Account</span>
        <span class="account-chip" title="${escapeAttribute(currentUser?.email || "")}">
          <strong>${escapeHtml(currentUser?.full_name || currentUser?.email || "User")}</strong>
          <small>${escapeHtml(currentUser?.role || "")}</small>
        </span>
        <button class="ghost-button compact sidebar-logout" data-catalog-logout type="button">Logout</button>
      </nav>
    </header>
  `;
}

function renderProductCard(product) {
  const sellingPrice = safeNumber(product.amazonSellingPriceInr);
  const metrics = calculateProductMetrics(product);
  const selected = selectedProductIds.has(product.id);
  return `
    <article
      class="catalog-card catalog-list-item ${selected ? "selected" : ""}"
      data-catalog-product-card="${escapeAttribute(product.id)}"
    >
      ${canManageProducts() ? `
        <label class="catalog-product-selector" title="Select ${escapeAttribute(getProductTitle(product))}">
          <input
            type="checkbox"
            data-catalog-product-select="${escapeAttribute(product.id)}"
            ${selected ? "checked" : ""}
          />
          <span class="sr-only">Select ${escapeHtml(getProductTitle(product))}</span>
        </label>
      ` : ""}
      <div class="catalog-list-identity">
        <div class="catalog-card-head">
          <div>
            <p class="catalog-category">${escapeHtml(product.category || "Uncategorised")}</p>
            <div class="catalog-title-row">
              <h2>${escapeHtml(getProductTitle(product))}</h2>
              ${renderAmazonProductLink(product)}
            </div>
          </div>
        </div>
        <div class="catalog-identifiers">
          <span>SKU <strong>${escapeHtml(product.sku || "-")}</strong></span>
          <span>ASIN <strong>${escapeHtml(product.asin || "-")}</strong></span>
          <span>EAN <strong>${escapeHtml(product.eanCode || "-")}</strong></span>
        </div>
      </div>
      <dl class="catalog-details">
        <div><dt>Country</dt><dd>${escapeHtml(product.countryOfOrigin || "-")}</dd></div>
        <div><dt>COO benefit</dt><dd>${escapeHtml(product.cooBenefit || "-")}</dd></div>
        <div><dt>Design</dt><dd>${escapeHtml(product.design || "-")}</dd></div>
        <div><dt>Color</dt><dd>${escapeHtml(product.color || "-")}</dd></div>
      </dl>
      <div class="catalog-card-foot">
        <div>
          <span>Selling price</span>
          <strong>${currency(sellingPrice)}</strong>
        </div>
        <div>
          <span>Amazon profit</span>
          <strong class="catalog-amazon-profit">${currency(metrics.amazonProfit)}</strong>
        </div>
        <div>
          <span>Deal price</span>
          <strong>${currency(getDealPrice(product))}</strong>
        </div>
        <div>
          <span>Amazon deal profit</span>
          <strong class="catalog-amazon-deal-profit">${currency(metrics.amazonDealProfit)}</strong>
        </div>
        <div>
          <span>Lifetime ordered quantity</span>
          <strong>${formatQuantity(getLifetimeOrderedQuantity(product))}</strong>
        </div>
        <a class="primary-button catalog-open" href="index.html?product=${encodeURIComponent(product.id)}">
          Open in calculator
        </a>
      </div>
    </article>
  `;
}

function getVisibleProducts() {
  const search = filters.search.trim().toLowerCase();
  const searchableFields = [
    "productName",
    "category",
    "countryOfOrigin",
    "cooBenefit",
    "design",
    "color",
    "sku",
    "asin",
    "eanCode",
    "hsnCode",
  ];

  const visible = products.filter((product) => {
    if (search && !searchableFields.some((field) =>
      String(product[field] || "").toLowerCase().includes(search),
    )) return false;
    if (!matchesFilterValue(product.category, filters.category)) return false;
    if (!matchesFilterValue(product.countryOfOrigin, filters.countryOfOrigin)) return false;
    if (!matchesFilterValue(product.cooBenefit, filters.cooBenefit)) return false;
    if (!matchesFilterValue(product.design, filters.design)) return false;
    if (!matchesFilterValue(product.color, filters.color)) return false;
    return true;
  });

  return visible.sort((a, b) => {
    const numericSorters = {
      sellingPriceLow: {
        direction: 1,
        value: (product) => safeNumber(product.amazonSellingPriceInr),
      },
      sellingPriceHigh: {
        direction: -1,
        value: (product) => safeNumber(product.amazonSellingPriceInr),
      },
      dealPriceLow: {
        direction: 1,
        value: getDealPrice,
      },
      dealPriceHigh: {
        direction: -1,
        value: getDealPrice,
      },
      amazonProfitLow: {
        direction: 1,
        value: (product) => calculateProductMetrics(product).amazonProfit,
      },
      amazonProfitHigh: {
        direction: -1,
        value: (product) => calculateProductMetrics(product).amazonProfit,
      },
      amazonDealProfitLow: {
        direction: 1,
        value: (product) => calculateProductMetrics(product).amazonDealProfit,
      },
      amazonDealProfitHigh: {
        direction: -1,
        value: (product) => calculateProductMetrics(product).amazonDealProfit,
      },
      lifetimeQuantityLow: {
        direction: 1,
        value: getLifetimeOrderedQuantity,
      },
      lifetimeQuantityHigh: {
        direction: -1,
        value: getLifetimeOrderedQuantity,
      },
    };
    const sorter = numericSorters[filters.sort];
    if (sorter) {
      const difference = (sorter.value(a) - sorter.value(b)) * sorter.direction;
      if (difference) return difference;
    }
    return getProductTitle(a).localeCompare(getProductTitle(b), undefined, { sensitivity: "base" });
  });
}

function renderResults() {
  const productIds = new Set(products.map((product) => product.id));
  selectedProductIds = new Set(
    [...selectedProductIds].filter((productId) => productIds.has(productId)),
  );
  const visible = getVisibleProducts();
  const count = document.querySelector("[data-catalog-count]");
  const grid = document.querySelector("[data-catalog-grid]");
  if (count) {
    const filteredProductLabel = visible.length === 1 ? "product" : "products";
    const totalProductLabel = products.length === 1 ? "product" : "products";
    count.textContent = `${visible.length}/${products.length} products`;
    count.setAttribute(
      "aria-label",
      `${visible.length} filtered ${filteredProductLabel} out of ${products.length} total ${totalProductLabel}`,
    );
  }
  if (grid) {
    grid.innerHTML = visible.length
      ? visible.map(renderProductCard).join("")
      : `<div class="catalog-empty">No products match the selected filters.</div>`;
  }
  bindProductSelectionEvents();
  updateBulkSelectionControls(visible);
}

function updateBulkSelectionControls(visibleProducts = getVisibleProducts()) {
  const visibleIds = visibleProducts.map((product) => product.id);
  const selectedVisibleCount = visibleIds.filter((productId) =>
    selectedProductIds.has(productId)
  ).length;
  const selectAll = document.querySelector("[data-catalog-select-all]");
  if (selectAll) {
    selectAll.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
    selectAll.disabled = bulkDeletePending || visibleIds.length === 0;
  }

  const selectedCount = document.querySelector("[data-catalog-selected-count]");
  if (selectedCount) {
    selectedCount.textContent = `${selectedProductIds.size} selected`;
  }

  const deleteButton = document.querySelector("[data-catalog-delete-selected]");
  if (deleteButton) {
    deleteButton.textContent = bulkDeletePending
      ? "Deleting…"
      : `Delete selected${selectedProductIds.size ? ` (${selectedProductIds.size})` : ""}`;
    deleteButton.disabled =
      bulkDeletePending ||
      selectedProductIds.size === 0 ||
      !cloudSyncEnabled;
    deleteButton.title = cloudSyncEnabled
      ? "Delete the selected products"
      : "Connect to the shared workspace before deleting products";
  }
}

function bindProductSelectionEvents() {
  document.querySelectorAll("[data-catalog-product-select]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const productId = checkbox.dataset.catalogProductSelect;
      if (checkbox.checked) selectedProductIds.add(productId);
      else selectedProductIds.delete(productId);
      const card = checkbox.closest("[data-catalog-product-card]");
      card?.classList.toggle("selected", checkbox.checked);
      updateBulkSelectionControls();
    });
  });
}

function toggleSelectAllVisible(event) {
  getVisibleProducts().forEach((product) => {
    if (event.currentTarget.checked) selectedProductIds.add(product.id);
    else selectedProductIds.delete(product.id);
  });
  renderResults();
}

async function deleteSelectedProducts() {
  if (bulkDeletePending || !canManageProducts()) return;
  const selectedProducts = getSelectedProducts(products, selectedProductIds);
  if (!selectedProducts.length) return;
  if (!cloudSyncEnabled || !stateDocument) {
    setUploadStatus("Connect to the shared workspace before deleting products.", "error");
    return;
  }
  if (!window.confirm(getBulkDeleteWarning(selectedProducts))) return;

  bulkDeletePending = true;
  updateBulkSelectionControls();
  const nextState = {
    ...stateDocument,
    products: removeSelectedProducts(products, selectedProductIds),
  };

  try {
    const saved = await request("/api/state", {
      method: "PUT",
      body: JSON.stringify({ state: nextState, version: cloudVersion }),
    });
    cloudVersion = Number(saved.version || cloudVersion);
    stateDocument = nextState;
    products = nextState.products;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    const deletedCount = selectedProducts.length;
    selectedProductIds.clear();
    filters.search = "";
    uploadStatus = `${deletedCount} product${deletedCount === 1 ? "" : "s"} deleted from the shared workspace.`;
    uploadStatusTone = "";
    bulkDeletePending = false;
    render();
  } catch (error) {
    bulkDeletePending = false;
    setUploadStatus(error.message || "The selected products could not be deleted.", "error");
    updateBulkSelectionControls();
  }
}

function resetFilters() {
  filters = {
    search: "",
    category: "",
    countryOfOrigin: "",
    cooBenefit: "",
    design: "",
    color: "",
    sort: "alphabetical",
  };
  document.querySelectorAll("[data-catalog-filter]").forEach((control) => {
    control.value = filters[control.dataset.catalogFilter];
  });
  document.querySelectorAll("[data-searchable-select]").forEach((dropdown) => {
    const field = dropdown.dataset.searchableSelect;
    const options = getFilterOptions(field);
    const selectedValue = filters[field];
    const selectedLabel = selectedValue
      ? options.find((option) => option.value === selectedValue)?.label || ""
      : dropdown.dataset.allLabel;
    const selected = dropdown.querySelector("[data-searchable-selected]");
    if (selected) selected.textContent = selectedLabel;
    dropdown.querySelectorAll("[data-searchable-option]").forEach((option) => {
      const isSelected = option.dataset.value === selectedValue;
      option.classList.toggle("selected", isSelected);
      option.setAttribute("aria-selected", String(isSelected));
      option.hidden = false;
    });
    const search = dropdown.querySelector("[data-searchable-search]");
    if (search) search.value = "";
  });
  renderResults();
}

function setUploadStatus(message, tone = "") {
  uploadStatus = message;
  uploadStatusTone = tone;
  const status = document.querySelector("[data-catalog-upload-status]");
  if (status) {
    status.className = `upload-status ${tone}`;
    status.textContent = message;
    status.hidden = !message;
  }
}

async function handleCatalogUpload(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  if (!file || !stateDocument) return;

  setUploadStatus(`Reading ${file.name}`);
  try {
    const rows = await readXlsxRows(file);
    const result = importProductRows(rows, stateDocument);
    const nextState = { ...stateDocument, products: result.products };

    if (cloudSyncEnabled) {
      const saved = await request("/api/state", {
        method: "PUT",
        body: JSON.stringify({ state: nextState, version: cloudVersion }),
      });
      cloudVersion = Number(saved.version || cloudVersion);
    }

    stateDocument = nextState;
    products = result.products;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    uploadStatus = `${result.addedCount} added, ${result.updatedCount} updated from Excel.`;
    uploadStatusTone = "";
    render();
  } catch (error) {
    setUploadStatus(error.message || "Could not import this Excel file.", "error");
  }
}

function handleCatalogDownload() {
  const visibleProducts = getVisibleProducts();
  if (!visibleProducts.length) {
    setUploadStatus("No filtered products are available to download.", "error");
    return;
  }
  downloadProductWorkbook(visibleProducts, (product) => {
    const metrics = calculateProductMetrics(product);
    return {
      ...metrics,
      dealPrice: getDealPrice(product),
      lifetimeOrderedQuantity: getLifetimeOrderedQuantity(product),
    };
  });
  setUploadStatus(
    `${visibleProducts.length} filtered product${visibleProducts.length === 1 ? "" : "s"} downloaded.`,
  );
}

function closeSearchableDropdowns(except = null) {
  document.querySelectorAll("[data-searchable-select]").forEach((dropdown) => {
    if (dropdown === except) return;
    const menu = dropdown.querySelector("[data-searchable-menu]");
    const trigger = dropdown.querySelector("[data-searchable-trigger]");
    const search = dropdown.querySelector("[data-searchable-search]");
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (search) search.value = "";
    dropdown.querySelectorAll("[data-searchable-option]").forEach((option) => {
      option.hidden = false;
    });
    const empty = dropdown.querySelector("[data-searchable-empty]");
    if (empty) empty.hidden = true;
  });
}

function filterSearchableOptions(dropdown, query) {
  const normalizedQuery = normalizeFilterValue(query);
  let visibleCount = 0;
  dropdown.querySelectorAll("[data-searchable-option]").forEach((option) => {
    const matches = !normalizedQuery ||
      normalizeFilterValue(option.textContent).includes(normalizedQuery);
    option.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  const empty = dropdown.querySelector("[data-searchable-empty]");
  if (empty) empty.hidden = visibleCount > 0;
}

function bindSearchableDropdowns() {
  document.querySelectorAll("[data-searchable-select]").forEach((dropdown) => {
    const trigger = dropdown.querySelector("[data-searchable-trigger]");
    const menu = dropdown.querySelector("[data-searchable-menu]");
    const search = dropdown.querySelector("[data-searchable-search]");
    trigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      const opening = menu.hidden;
      closeSearchableDropdowns(opening ? dropdown : null);
      menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
      if (opening) search?.focus();
    });
    menu?.addEventListener("click", (event) => event.stopPropagation());
    search?.addEventListener("input", () => filterSearchableOptions(dropdown, search.value));
    search?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeSearchableDropdowns();
        trigger?.focus();
      }
    });
    dropdown.querySelectorAll("[data-searchable-option]").forEach((option) => {
      option.addEventListener("click", () => {
        const field = dropdown.dataset.searchableSelect;
        filters[field] = option.dataset.value;
        const selected = dropdown.querySelector("[data-searchable-selected]");
        if (selected) selected.textContent = option.textContent.trim();
        dropdown.querySelectorAll("[data-searchable-option]").forEach((candidate) => {
          const isSelected = candidate === option;
          candidate.classList.toggle("selected", isSelected);
          candidate.setAttribute("aria-selected", String(isSelected));
        });
        closeSearchableDropdowns();
        trigger?.focus();
        renderResults();
      });
    });
  });
}

function bindEvents() {
  document.querySelectorAll("[data-catalog-filter]").forEach((control) => {
    const eventName = control.tagName === "INPUT" ? "input" : "change";
    control.addEventListener(eventName, () => {
      filters[control.dataset.catalogFilter] = control.value;
      renderResults();
    });
  });
  bindSearchableDropdowns();
  document.querySelector("[data-catalog-reset]")?.addEventListener("click", resetFilters);
  document.querySelector("[data-catalog-select-all]")?.addEventListener("change", toggleSelectAllVisible);
  document.querySelector("[data-catalog-delete-selected]")?.addEventListener("click", deleteSelectedProducts);
  document.querySelector("[data-catalog-upload]")?.addEventListener("change", handleCatalogUpload);
  document.querySelector("[data-catalog-download]")?.addEventListener("click", handleCatalogDownload);
  document.querySelector("[data-catalog-logout]")?.addEventListener("click", async () => {
    await request("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.replace("/");
  });
}

function render() {
  app.innerHTML = `
    <main class="shell catalog-shell">
      ${renderSidebar()}
      <section class="catalog-filter-panel">
        <div class="catalog-filter-head">
          <div class="catalog-products-heading">
            <h1>Products</h1>
            <span class="catalog-count-pill" data-catalog-count aria-live="polite"></span>
          </div>
          <div class="catalog-filter-actions">
            <button class="ghost-button compact" data-catalog-reset type="button">Reset filters</button>
            <label class="ghost-button compact file-button catalog-upload" title="Upload Excel">
              Upload Excel
              <input
                data-catalog-upload
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              />
            </label>
            <button class="ghost-button compact" data-catalog-download type="button">
              Download Excel
            </button>
            <a class="primary-button catalog-add" href="index.html">+ Product</a>
          </div>
        </div>
        <div
          class="upload-status ${uploadStatusTone}"
          data-catalog-upload-status
          ${uploadStatus ? "" : "hidden"}
        >${escapeHtml(uploadStatus)}</div>
        ${canManageProducts() ? `
          <div class="catalog-bulk-actions">
            <label class="catalog-select-all">
              <input data-catalog-select-all type="checkbox" />
              <span>Select all filtered products</span>
            </label>
            <span class="catalog-selected-count" data-catalog-selected-count>0 selected</span>
            <button
              class="bulk-delete-button"
              data-catalog-delete-selected
              type="button"
              disabled
            >Delete selected</button>
          </div>
        ` : ""}
        <div class="catalog-filters">
          <label class="form-field catalog-search">
            <span>Search all fields</span>
            <div class="input-shell">
              <input
                data-catalog-filter="search"
                type="search"
                value="${escapeAttribute(filters.search)}"
                placeholder="Product, SKU, ASIN, category, design…"
              />
            </div>
          </label>
          ${renderSearchableDropdown("category", "Category", "All categories", "Search categories")}
          ${renderSearchableDropdown("countryOfOrigin", "Country", "All countries", "Search countries")}
          ${renderSearchableDropdown("cooBenefit", "COO benefit", "All COO benefits", "Search COO benefits")}
          ${renderSearchableDropdown("design", "Design", "All designs", "Search designs")}
          ${renderSearchableDropdown("color", "Color", "All colors", "Search colors")}
          ${renderSearchableDropdown("sort", "Sort by", "", "Search sorting options")}
        </div>
      </section>

      <section class="catalog-grid" data-catalog-grid></section>
    </main>
  `;
  bindEvents();
  renderResults();
}

async function initialize() {
  const stored = getStoredState();
  products = stored?.products || [];
  settings = { ...settings, ...(stored?.settings || {}) };
  stateDocument = stored || {
    settings: { ...settings },
    commissionMaster: [],
    products,
  };
  try {
    const session = await request("/api/auth/session");
    currentUser = session.user;
    try {
      const cloud = await request("/api/state");
      cloudVersion = Number(cloud.version || 0);
      cloudSyncEnabled = true;
      if (Array.isArray(cloud?.state?.products)) {
        stateDocument = cloud.state;
        products = cloud.state.products;
        settings = { ...settings, ...(cloud.state.settings || {}) };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud.state));
      }
    } catch {
      // Local review can use the browser's saved product state.
    }
  } catch {
    if (!products.length) {
      window.location.replace("/");
      return;
    }
  }
  render();
}

app.innerHTML = `
  <main class="login-page loading-page">
    <section class="branded-loader" role="status" aria-live="polite">
      <div class="loader-orbit" aria-hidden="true">
        <img class="loader-mark" src="import-profit-mark.png" alt="" />
      </div>
      <p class="eyebrow">Import and Profit App</p>
      <h1>Preparing your products</h1>
      <div class="loader-progress" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </section>
  </main>
`;
initialize();
startWorkspaceConnectionMonitor();
document.addEventListener("click", () => closeSearchableDropdowns());
