const STORAGE_KEY = "custom-import-profit-state-v1";

const defaultSettings = {
  usdRate: 95.2,
  freightPerKgUsd: 4.5,
  insuranceRate: 1.125,
  bcdRate: 15,
  swsRate: 10,
  warehouseRate: 2,
  fxUpdatedAt: "Manual",
};

const defaultProducts = [
  {
    id: crypto.randomUUID(),
    productName: "iPhone 17 Case",
    design: "Alles",
    sku: "ABCD",
    asin: "1234ABC",
    productCostUsd: 9.5,
    weightKg: 0.05,
    countryOfOrigin: "China",
    cooBenefit: "No",
    gstRate: 18,
    overheadCostInr: 100,
    amazonSellingPriceInr: 2799,
    commissionRate: 0.105,
    pickPackFeeInr: 17,
    weightHandlingFeeInr: 42,
    fixedClosingFeeInr: 52,
    tdsTcsRate: 0.006,
  },
  {
    id: crypto.randomUUID(),
    productName: "iPhone 17 Pro Case",
    design: "Fusion",
    sku: "DDSF",
    asin: "4323DSFD",
    productCostUsd: 4.5,
    weightKg: 0.07,
    countryOfOrigin: "Korea",
    cooBenefit: "Yes",
    gstRate: 18,
    overheadCostInr: 100,
    amazonSellingPriceInr: 1699,
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
      ["design", "Design", "text"],
      ["sku", "SKU", "text"],
      ["asin", "ASIN", "text"],
      ["productCostUsd", "Product cost / unit", "number", "USD"],
    ],
  },
  {
    title: "Freight",
    fields: [["weightKg", "Weight / unit", "number", "kg"]],
  },
  {
    title: "Customs",
    fields: [
      ["countryOfOrigin", "Country of origin", "text"],
      ["cooBenefit", "COO benefit", "select", ["No", "Yes"]],
      ["gstRate", "GST rate", "number", "%"],
    ],
  },
  {
    title: "Landing",
    fields: [["overheadCostInr", "Overhead cost", "number", "INR"]],
  },
  {
    title: "Amazon",
    fields: [
      ["amazonSellingPriceInr", "Selling price", "number", "INR"],
      ["commissionRate", "Commission", "percentDecimal", "%"],
      ["pickPackFeeInr", "Pick pack fee", "number", "INR"],
      ["weightHandlingFeeInr", "Weight handling fee", "number", "INR"],
      ["fixedClosingFeeInr", "Fixed closing fee", "number", "INR"],
      ["tdsTcsRate", "TDS/TCS deduction", "percentDecimal", "%"],
    ],
  },
];

let state = loadState();
let selectedProductId = state.products[0]?.id ?? null;
let activeGroup = "Product";
let exchangeStatus = "";

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.settings && Array.isArray(stored?.products) && stored.products.length) {
      return {
        settings: { ...defaultSettings, ...stored.settings },
        products: stored.products.map((product) => ({
          ...product,
          id: product.id || crypto.randomUUID(),
        })),
      };
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  return {
    settings: { ...defaultSettings },
    products: defaultProducts.map((product) => ({ ...product, id: crypto.randomUUID() })),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function calculateProduct(product, settings = state.settings) {
  const productCostUsd = safeNumber(product.productCostUsd);
  const weightKg = safeNumber(product.weightKg);
  const gstRate = safeNumber(product.gstRate);
  const usdRate = safeNumber(settings.usdRate);
  const freightUsd = safeNumber(settings.freightPerKgUsd) * weightKg;
  const insuranceUsd = (productCostUsd + freightUsd) * (safeNumber(settings.insuranceRate) / 100);
  const customsBaseUsd = productCostUsd + freightUsd + insuranceUsd;
  const hasCooBenefit = String(product.cooBenefit).toLowerCase() === "yes";
  const basicCustomDutyUsd = hasCooBenefit
    ? 0
    : customsBaseUsd * (safeNumber(settings.bcdRate) / 100);
  const swsUsd = basicCustomDutyUsd * (safeNumber(settings.swsRate) / 100);
  const igstUsd =
    (productCostUsd + freightUsd + insuranceUsd + basicCustomDutyUsd + swsUsd) *
    (gstRate / 100);
  const importCostUsd =
    productCostUsd + freightUsd + insuranceUsd + basicCustomDutyUsd + swsUsd;
  const importCostInr = importCostUsd * usdRate;
  const landingCostInr =
    importCostInr + importCostInr * (safeNumber(settings.warehouseRate) / 100) + safeNumber(product.overheadCostInr);
  const sellingPriceInr = safeNumber(product.amazonSellingPriceInr);
  const gstOnAmazonSellingPriceInr = sellingPriceInr * (gstRate / (100 + gstRate));
  const amazonSettlementInr =
    sellingPriceInr -
    safeNumber(product.commissionRate) * sellingPriceInr -
    safeNumber(product.pickPackFeeInr) -
    safeNumber(product.weightHandlingFeeInr) -
    safeNumber(product.fixedClosingFeeInr) -
    (sellingPriceInr - gstOnAmazonSellingPriceInr) * safeNumber(product.tdsTcsRate);
  const profitInr = amazonSettlementInr - gstOnAmazonSellingPriceInr - landingCostInr;
  const margin = sellingPriceInr ? profitInr / sellingPriceInr : 0;
  const roi = landingCostInr ? profitInr / landingCostInr : 0;

  return {
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
    gstOnAmazonSellingPriceInr,
    amazonSettlementInr,
    profitInr,
    margin,
    roi,
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

function render() {
  const app = document.querySelector("#app");
  const summary = summarize();
  const selectedProduct =
    state.products.find((product) => product.id === selectedProductId) || state.products[0];
  selectedProductId = selectedProduct?.id ?? null;
  const selectedCalc = selectedProduct ? calculateProduct(selectedProduct) : null;

  app.innerHTML = `
    <main class="shell">
      <header class="app-header">
        <div class="brand-lockup">
          <img class="brand-mark" src="import-profit-mark.png" alt="" />
          <div>
            <p class="eyebrow">Import and Profit App</p>
            <h1>Custom Import Profit Calculator</h1>
          </div>
        </div>
        <div class="header-actions">
          <button class="icon-button" data-action="reset" title="Reset" aria-label="Reset">↺</button>
          <button class="icon-button" data-action="export" title="Export CSV" aria-label="Export CSV">⇩</button>
          <button class="primary-button" data-action="add">+ Product</button>
        </div>
      </header>

      <section class="settings-band">
        ${renderSettingInput("usdRate", "USD Rate", state.settings.usdRate, "INR")}
        ${renderSettingInput("freightPerKgUsd", "Freight / kg", state.settings.freightPerKgUsd, "USD")}
        ${renderSettingInput("insuranceRate", "Insurance", state.settings.insuranceRate, "%")}
        ${renderSettingInput("bcdRate", "Custom duty", state.settings.bcdRate, "%")}
        ${renderSettingInput("swsRate", "SWS", state.settings.swsRate, "%")}
        ${renderSettingInput("warehouseRate", "Warehouse load", state.settings.warehouseRate, "%")}
        <div class="rate-tools">
          <button class="ghost-button" data-action="refresh-rate">Live USD/INR</button>
          <span class="status-text">${exchangeStatus || state.settings.fxUpdatedAt}</span>
        </div>
      </section>

      <section class="metric-grid">
        ${metric("Total landing cost", currency(summary.totals.landing), "All products")}
        ${metric("Total profit", currency(summary.totals.profit), `${percent(summary.margin)} net margin`, summary.totals.profit >= 0 ? "good" : "bad")}
        ${metric("Best product", summary.best?.product.productName || "None", summary.best ? currency(summary.best.calc.profitInr) : "No products")}
        ${metric("Profitable SKUs", `${summary.profitableCount}/${state.products.length}`, "Positive profit")}
      </section>

      <section class="workspace">
        <aside class="product-list">
          <div class="section-title">
            <h2>Products</h2>
            <button class="icon-button small" data-action="add" title="Add product" aria-label="Add product">+</button>
          </div>
          <div class="list-scroll">
            ${state.products.map((product) => renderProductRow(product)).join("")}
          </div>
        </aside>

        <section class="editor-panel">
          ${
            selectedProduct
              ? renderEditor(selectedProduct, selectedCalc)
              : `<div class="empty-state">Add a product to begin.</div>`
          }
        </section>
      </section>

      <section class="result-panel">
        <div class="section-title">
          <h2>Calculation Table</h2>
          <span class="status-text">${state.products.length} products</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Cost USD</th>
                <th>Freight USD</th>
                <th>Duty INR</th>
                <th>Import INR</th>
                <th>Landing INR</th>
                <th>Selling INR</th>
                <th>Settlement INR</th>
                <th>Profit INR</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              ${summary.calculated.map(({ product, calc }) => renderResultRow(product, calc)).join("")}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  `;

  bindEvents();
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
  const tone = calc.profitInr >= 0 ? "positive" : "negative";
  return `
    <button class="product-row ${active}" data-select-product="${product.id}">
      <span>
        <strong>${escapeHtml(product.productName || "Untitled product")}</strong>
        <small>${escapeHtml(product.sku || "No SKU")} · ${escapeHtml(product.asin || "No ASIN")}</small>
      </span>
      <b class="${tone}">${currency(calc.profitInr)}</b>
    </button>
  `;
}

function renderEditor(product, calc) {
  return `
    <div class="editor-head">
      <div>
        <p class="eyebrow">Selected Product</p>
        <h2>${escapeHtml(product.productName || "Untitled product")}</h2>
      </div>
      <div class="row-actions">
        <button class="icon-button" data-action="duplicate" title="Duplicate" aria-label="Duplicate">⧉</button>
        <button class="icon-button danger" data-action="delete" title="Delete" aria-label="Delete">×</button>
      </div>
    </div>

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
        .map((field) => renderProductField(product, field))
        .join("")}
    </div>

    <div class="breakdown-grid">
      ${breakdownItem("Freight / unit", currency(calc.freightUsd, "USD", 3))}
      ${breakdownItem("Insurance / unit", currency(calc.insuranceUsd, "USD", 3))}
      ${breakdownItem("Basic customs", `${currency(calc.basicCustomDutyUsd, "USD", 3)} · ${currency(calc.basicCustomDutyInr)}`)}
      ${breakdownItem("SWS", `${currency(calc.swsUsd, "USD", 3)} · ${currency(calc.swsInr)}`)}
      ${breakdownItem("IGST", `${currency(calc.igstUsd, "USD", 3)} · ${currency(calc.igstInr)}`)}
      ${breakdownItem("Import cost", `${currency(calc.importCostUsd, "USD", 3)} · ${currency(calc.importCostInr)}`)}
      ${breakdownItem("Landing cost", currency(calc.landingCostInr))}
      ${breakdownItem("GST on selling price", currency(calc.gstOnAmazonSellingPriceInr))}
      ${breakdownItem("Amazon settlement", currency(calc.amazonSettlementInr))}
      ${breakdownItem("Profit", currency(calc.profitInr), calc.profitInr >= 0 ? "good" : "bad")}
      ${breakdownItem("Margin", percent(calc.margin))}
      ${breakdownItem("ROI on landing", percent(calc.roi))}
    </div>
  `;
}

function renderProductField(product, [key, label, type, suffixOrOptions]) {
  const rawValue = product[key] ?? "";
  let control = "";

  if (type === "select") {
    control = `
      <select data-product-field="${key}">
        ${suffixOrOptions
          .map(
            (option) => `
              <option value="${option}" ${String(rawValue) === option ? "selected" : ""}>${option}</option>
            `,
          )
          .join("")}
      </select>
    `;
  } else {
    const value = type === "percentDecimal" ? safeNumber(rawValue) * 100 : rawValue;
    control = `
      <input
        data-product-field="${key}"
        type="${type === "text" ? "text" : "number"}"
        step="${type === "text" ? "" : "0.001"}"
        value="${escapeAttribute(value)}"
      />
    `;
  }

  return `
    <label class="form-field">
      <span>${label}</span>
      <div class="input-shell">
        ${control}
        ${suffixOrOptions && type !== "select" ? `<b>${suffixOrOptions}</b>` : ""}
      </div>
    </label>
  `;
}

function breakdownItem(label, value, tone = "") {
  return `
    <article class="breakdown-item ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function renderResultRow(product, calc) {
  return `
    <tr>
      <td>
        <strong>${escapeHtml(product.productName || "Untitled product")}</strong>
        <small>${escapeHtml(product.design || "")}</small>
      </td>
      <td>${currency(product.productCostUsd, "USD", 2)}</td>
      <td>${currency(calc.freightUsd, "USD", 3)}</td>
      <td>${currency(calc.basicCustomDutyInr)}</td>
      <td>${currency(calc.importCostInr)}</td>
      <td>${currency(calc.landingCostInr)}</td>
      <td>${currency(product.amazonSellingPriceInr)}</td>
      <td>${currency(calc.amazonSettlementInr)}</td>
      <td class="${calc.profitInr >= 0 ? "positive" : "negative"}">${currency(calc.profitInr)}</td>
      <td>${percent(calc.margin)}</td>
    </tr>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const key = event.currentTarget.dataset.setting;
      state.settings[key] = safeNumber(event.currentTarget.value);
      if (key === "usdRate") {
        state.settings.fxUpdatedAt = "Manual";
      }
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-product-field]").forEach((input) => {
    input.addEventListener("input", handleProductInput);
    input.addEventListener("change", handleProductInput);
  });

  document.querySelectorAll("[data-select-product]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProductId = button.dataset.selectProduct;
      render();
    });
  });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeGroup = button.dataset.tab;
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
}

function handleProductInput(event) {
  const key = event.currentTarget.dataset.productField;
  const product = state.products.find((item) => item.id === selectedProductId);
  if (!product) return;

  const percentFields = new Set(["commissionRate", "tdsTcsRate"]);
  const textFields = new Set(["productName", "design", "sku", "asin", "countryOfOrigin", "cooBenefit"]);

  if (percentFields.has(key)) {
    product[key] = safeNumber(event.currentTarget.value) / 100;
  } else if (textFields.has(key)) {
    product[key] = event.currentTarget.value;
  } else {
    product[key] = safeNumber(event.currentTarget.value);
  }

  saveState();
  render();
}

async function handleAction(action) {
  if (action === "add") {
    const newProduct = {
      ...defaultProducts[0],
      id: crypto.randomUUID(),
      productName: "New Product",
      design: "",
      sku: "",
      asin: "",
    };
    state.products.push(newProduct);
    selectedProductId = newProduct.id;
    activeGroup = "Product";
    saveState();
    render();
  }

  if (action === "duplicate") {
    const product = state.products.find((item) => item.id === selectedProductId);
    if (!product) return;
    const copy = {
      ...product,
      id: crypto.randomUUID(),
      productName: `${product.productName || "Product"} Copy`,
    };
    state.products.push(copy);
    selectedProductId = copy.id;
    saveState();
    render();
  }

  if (action === "delete") {
    if (state.products.length === 1) return;
    state.products = state.products.filter((product) => product.id !== selectedProductId);
    selectedProductId = state.products[0]?.id ?? null;
    saveState();
    render();
  }

  if (action === "reset") {
    state = {
      settings: { ...defaultSettings },
      products: defaultProducts.map((product) => ({ ...product, id: crypto.randomUUID() })),
    };
    selectedProductId = state.products[0].id;
    activeGroup = "Product";
    exchangeStatus = "";
    saveState();
    render();
  }

  if (action === "export") {
    exportCsv();
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

function exportCsv() {
  const headers = [
    "Product Name",
    "Design",
    "SKU",
    "ASIN",
    "Product Cost Per Unit",
    "Weight of Product Per Unit in KG",
    "Freight Per Unit in USD",
    "Insurance Per unit USD",
    "Country of Origin",
    "COO Benefit",
    "Basic Custom Duty USD",
    "BasicCustom Duty INR",
    "SWS USD",
    "SWS INR",
    "GST Rate",
    "IGST",
    "IGST INR",
    "Import Cost USD",
    "Import Cost INR",
    "Overhead Cost INR",
    "Landing Cost till Warehouse INR",
    "Amazon Selling Price",
    "GST on Amazon Selling Price",
    "Commission on Amazon",
    "FBA Pick Pack Fee INR",
    "FBA Weight Handling Fee INR",
    "Fixed Closing Fee INR",
    "TDS TCS Deduction",
    "Aamazon Settlement",
    "Profit on Selling in Amazon",
  ];
  const rows = state.products.map((product) => {
    const calc = calculateProduct(product);
    return [
      product.productName,
      product.design,
      product.sku,
      product.asin,
      product.productCostUsd,
      product.weightKg,
      calc.freightUsd,
      calc.insuranceUsd,
      product.countryOfOrigin,
      product.cooBenefit,
      calc.basicCustomDutyUsd,
      calc.basicCustomDutyInr,
      calc.swsUsd,
      calc.swsInr,
      product.gstRate,
      calc.igstUsd,
      calc.igstInr,
      calc.importCostUsd,
      calc.importCostInr,
      product.overheadCostInr,
      calc.landingCostInr,
      product.amazonSellingPriceInr,
      calc.gstOnAmazonSellingPriceInr,
      product.commissionRate,
      product.pickPackFeeInr,
      product.weightHandlingFeeInr,
      product.fixedClosingFeeInr,
      product.tdsTcsRate,
      calc.amazonSettlementInr,
      calc.profitInr,
    ];
  });
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "custom-import-profit.csv";
  link.click();
  URL.revokeObjectURL(url);
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
