import { normalizeInvoiceIdentifier, parseOrderInvoiceRows } from "./invoice-orders.js?v=20260720-local-orders-15";
import { readXlsxRows } from "./xlsx-reader.js";
import { downloadInvoiceWorkbook } from "./xlsx-export.js?v=20260720-local-orders-13";

const ORDER_HISTORY_STORAGE_KEY = "custom-import-profit-order-history-v1";
const PRODUCT_STATE_STORAGE_KEY = "custom-import-profit-state-v1";

const app = document.querySelector("#invoice-app");
let currentUser = null;
let invoices = loadInvoices();
let uploadStatus = "";
let uploadStatusTone = "";
let editingInvoiceId = null;
let invoiceEditDraft = null;

function loadInvoices() {
  try {
    const stored = JSON.parse(localStorage.getItem(ORDER_HISTORY_STORAGE_KEY));
    return Array.isArray(stored) ? stored.filter((invoice) => invoice?.id) : [];
  } catch {
    return [];
  }
}

function saveInvoices() {
  localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(invoices));
}

function getSavedProductSkus() {
  try {
    const state = JSON.parse(localStorage.getItem(PRODUCT_STATE_STORAGE_KEY));
    return new Set((state?.products || [])
      .map((product) => normalizeInvoiceIdentifier(product.sku))
      .filter(Boolean));
  } catch {
    return new Set();
  }
}

function getSavedProductsBySku() {
  try {
    const state = JSON.parse(localStorage.getItem(PRODUCT_STATE_STORAGE_KEY));
    return new Map((state?.products || [])
      .map((product) => [normalizeInvoiceIdentifier(product.sku), product])
      .filter(([sku]) => sku));
  } catch {
    return new Map();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getInvoiceAmount(invoice) {
  if (Number.isFinite(Number(invoice.totalAmountUsd))) return Number(invoice.totalAmountUsd);
  return (invoice.lines || []).reduce(
    (total, line) => total + (Number.isFinite(Number(line.amountUsd)) ? Number(line.amountUsd) : 0),
    0,
  );
}

function formatUsd(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function hasCompletePaymentDetails(invoice) {
  return Boolean(String(invoice.paymentBank || "").trim() && invoice.paymentDate);
}

function isInvoicePaid(invoice) {
  return hasCompletePaymentDetails(invoice);
}

function renderInvoiceRow(invoice) {
  const editing = editingInvoiceId === invoice.id && invoiceEditDraft;
  return `
    <div class="invoice-register-row ${isInvoicePaid(invoice) ? "paid" : "pending"}" data-invoice-row="${escapeHtml(invoice.id)}">
      ${hasCompletePaymentDetails(invoice) ? `
        <span class="invoice-paid-badge" title="Payment bank and date are recorded">Paid</span>
      ` : `
        <label class="invoice-pending-check" title="Include this pending invoice in the selected total">
          <input type="checkbox" data-invoice-selected="${escapeHtml(invoice.id)}" ${invoice.selectedPending === true ? "checked" : ""} />
        </label>
      `}
      ${editing ? `
        <label class="form-field invoice-edit-field">
          <span>Invoice date</span>
          <div class="input-shell">
            <input type="date" value="${escapeHtml(invoiceEditDraft.invoiceDate)}" data-edit-invoice-date />
          </div>
        </label>
        <label class="form-field invoice-edit-field">
          <span>Invoice number</span>
          <div class="input-shell">
            <input type="text" value="${escapeHtml(invoiceEditDraft.invoiceNumber)}" data-edit-invoice-number />
          </div>
        </label>
      ` : `
        <div class="invoice-register-value" data-label="Invoice date">${formatDate(invoice.invoiceDate)}</div>
        <strong class="invoice-register-value" data-label="Invoice number">${escapeHtml(invoice.invoiceNumber || "-")}</strong>
      `}
      <strong class="invoice-register-value amount" data-label="Invoice amount">${formatUsd(getInvoiceAmount(invoice))}</strong>
      <label class="form-field invoice-payment-field">
        <span>Payment bank</span>
        <div class="input-shell">
          <input
            type="text"
            value="${escapeHtml(invoice.paymentBank || "")}"
            placeholder="Enter bank name"
            data-payment-bank="${escapeHtml(invoice.id)}"
          />
        </div>
      </label>
      <label class="form-field invoice-payment-field">
        <span>Payment date</span>
        <div class="input-shell">
          <input
            type="date"
            value="${escapeHtml(invoice.paymentDate || "")}"
            data-payment-date="${escapeHtml(invoice.id)}"
          />
        </div>
      </label>
      <div class="invoice-row-actions">
        ${editing ? `
          <button class="invoice-save-button" type="button" data-save-invoice="${escapeHtml(invoice.id)}">Save</button>
          <button class="invoice-cancel-button" type="button" data-cancel-invoice>Cancel</button>
        ` : `
          <button class="invoice-download-button" type="button" data-download-invoice="${escapeHtml(invoice.id)}">Download</button>
          <button class="invoice-edit-button" type="button" data-edit-invoice="${escapeHtml(invoice.id)}">Edit</button>
          <button class="invoice-delete-button" type="button" data-delete-invoice="${escapeHtml(invoice.id)}" title="Delete this invoice">Delete</button>
        `}
      </div>
    </div>
  `;
}

function render() {
  const sortedInvoices = [...invoices].sort((a, b) =>
    String(b.invoiceDate || "").localeCompare(String(a.invoiceDate || "")) ||
    String(b.invoiceNumber || "").localeCompare(String(a.invoiceNumber || "")),
  );
  const totalAmount = sortedInvoices.reduce((total, invoice) => total + getInvoiceAmount(invoice), 0);
  const paidAmount = sortedInvoices
    .filter(isInvoicePaid)
    .reduce((total, invoice) => total + getInvoiceAmount(invoice), 0);
  const pendingAmount = totalAmount - paidAmount;
  const selectedPendingAmount = sortedInvoices
    .filter((invoice) => !isInvoicePaid(invoice) && invoice.selectedPending === true)
    .reduce((total, invoice) => total + getInvoiceAmount(invoice), 0);

  app.innerHTML = `
    <main class="shell invoice-register-shell">
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
          <a class="nav-link" href="products.html">All Products</a>
          <a class="nav-link active" href="invoices.html">Invoices</a>
          <a class="nav-link" href="master/index.html">Master Data</a>
          ${currentUser?.role === "admin" ? `<a class="nav-link" href="/admin">Users & Logs</a>` : ""}
          <span class="sync-control connection-status ${navigator.onLine ? "synced" : "error"}" data-connection-indicator>
            <span class="sync-dot" aria-hidden="true"></span>
            <span data-connection-label>${navigator.onLine ? "Online" : "Offline"}</span>
          </span>
          <span class="sidebar-section-label account-section-label">Account</span>
          <span class="account-chip" title="${escapeHtml(currentUser?.email || "")}">
            <strong>${escapeHtml(currentUser?.full_name || currentUser?.email || "User")}</strong>
            <small>${escapeHtml(currentUser?.role || "")}</small>
          </span>
          <button class="ghost-button compact sidebar-logout" data-invoice-logout type="button">Logout</button>
        </nav>
      </header>

      <section class="page-topbar">
        <div>
          <p class="page-kicker">Workspace / Invoices</p>
          <h1>Invoice Register</h1>
        </div>
        <div class="page-topbar-actions">
          <span class="page-status-pill">${sortedInvoices.length} invoice${sortedInvoices.length === 1 ? "" : "s"}</span>
          <label class="primary-button file-button" title="Upload order invoice locally">
            Upload Invoice
            <input
              data-invoice-upload
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />
          </label>
        </div>
      </section>

      <section class="invoice-summary-grid">
        <div class="invoice-summary-card">
          <span>Invoices uploaded</span>
          <strong>${sortedInvoices.length}</strong>
        </div>
        <div class="invoice-summary-card">
          <span>Total invoice amount</span>
          <strong>${formatUsd(totalAmount)}</strong>
        </div>
        <div class="invoice-summary-card paid-total">
          <span>Paid invoices amount</span>
          <strong>${formatUsd(paidAmount)}</strong>
        </div>
        <div class="invoice-summary-card pending-total">
          <span>Pending invoices amount</span>
          <strong>${formatUsd(pendingAmount)}</strong>
        </div>
        <div class="invoice-summary-card selected-pending-total">
          <span>Selected pending invoices</span>
          <strong>${formatUsd(selectedPendingAmount)}</strong>
        </div>
        <div class="invoice-summary-note">
          <strong>Local invoice tracking</strong>
          <span>Invoice and payment details are saved only in this browser.</span>
        </div>
      </section>

      <section class="invoice-register-panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Payment register</p>
            <h2>Uploaded invoices</h2>
          </div>
          <span class="status-text" data-payment-save-status></span>
        </div>
        ${uploadStatus ? `<div class="upload-status ${uploadStatusTone}">${escapeHtml(uploadStatus)}</div>` : ""}
        ${sortedInvoices.length ? `
          <div class="invoice-register-head" aria-hidden="true">
            <span>Select</span>
            <span>Invoice date</span>
            <span>Invoice number</span>
            <span>Invoice amount</span>
            <span>Payment bank</span>
            <span>Payment date</span>
            <span>Action</span>
          </div>
          <div class="invoice-register-list">
            ${sortedInvoices.map(renderInvoiceRow).join("")}
          </div>
        ` : `
          <div class="invoice-register-empty">
            No invoices have been uploaded in this browser. Upload an invoice from the Products page first.
          </div>
        `}
      </section>
    </main>
  `;

  document.querySelectorAll("[data-payment-bank]").forEach((input) => {
    input.addEventListener("change", updatePaymentDetails);
  });
  document.querySelectorAll("[data-payment-date]").forEach((input) => {
    input.addEventListener("change", updatePaymentDetails);
  });
  document.querySelectorAll("[data-invoice-selected]").forEach((input) => {
    input.addEventListener("change", updatePendingSelection);
  });
  document.querySelector("[data-invoice-upload]")?.addEventListener("change", handleInvoiceUpload);
  document.querySelectorAll("[data-delete-invoice]").forEach((button) => {
    button.addEventListener("click", deleteInvoice);
  });
  document.querySelectorAll("[data-edit-invoice]").forEach((button) => {
    button.addEventListener("click", startInvoiceEdit);
  });
  document.querySelectorAll("[data-download-invoice]").forEach((button) => {
    button.addEventListener("click", downloadInvoice);
  });
  document.querySelector("[data-save-invoice]")?.addEventListener("click", saveInvoiceEdit);
  document.querySelector("[data-cancel-invoice]")?.addEventListener("click", cancelInvoiceEdit);
  document.querySelector("[data-edit-invoice-number]")?.addEventListener("input", updateInvoiceEditDraft);
  document.querySelector("[data-edit-invoice-date]")?.addEventListener("input", updateInvoiceEditDraft);
  document.querySelector("[data-invoice-logout]")?.addEventListener("click", logout);
}

async function logout() {
  await request("/api/auth/logout", { method: "POST" }).catch(() => null);
  window.location.replace("/");
}

function updateConnectionIndicator() {
  const indicator = document.querySelector("[data-connection-indicator]");
  const label = document.querySelector("[data-connection-label]");
  if (indicator) {
    indicator.className = `sync-control connection-status ${navigator.onLine ? "synced" : "error"}`;
  }
  if (label) label.textContent = navigator.onLine ? "Online" : "Offline";
}

window.addEventListener("online", updateConnectionIndicator);
window.addEventListener("offline", updateConnectionIndicator);

function downloadInvoice(event) {
  const invoice = invoices.find((item) => item.id === event.currentTarget.dataset.downloadInvoice);
  if (!invoice) return;
  downloadInvoiceWorkbook(invoice, getSavedProductsBySku(), normalizeInvoiceIdentifier);
}

function startInvoiceEdit(event) {
  const invoice = invoices.find((item) => item.id === event.currentTarget.dataset.editInvoice);
  if (!invoice) return;
  editingInvoiceId = invoice.id;
  invoiceEditDraft = {
    invoiceNumber: String(invoice.invoiceNumber || ""),
    invoiceDate: String(invoice.invoiceDate || ""),
  };
  uploadStatus = "";
  uploadStatusTone = "";
  render();
}

function updateInvoiceEditDraft(event) {
  if (!invoiceEditDraft) return;
  if (event.currentTarget.matches("[data-edit-invoice-number]")) {
    invoiceEditDraft.invoiceNumber = event.currentTarget.value;
  } else {
    invoiceEditDraft.invoiceDate = event.currentTarget.value;
  }
}

function saveInvoiceEdit() {
  const invoice = invoices.find((item) => item.id === editingInvoiceId);
  if (!invoice || !invoiceEditDraft) return;
  const invoiceNumber = invoiceEditDraft.invoiceNumber.trim();
  const invoiceDate = invoiceEditDraft.invoiceDate;

  if (!invoiceNumber || !invoiceDate) {
    uploadStatus = "Invoice number and invoice date are required.";
    uploadStatusTone = "error";
    render();
    return;
  }

  const duplicate = invoices.find((item) =>
    item.id !== invoice.id &&
    normalizeInvoiceIdentifier(item.invoiceNumber) === normalizeInvoiceIdentifier(invoiceNumber),
  );
  if (duplicate) {
    uploadStatus = `Invoice ${invoiceNumber} already exists. Enter a unique invoice number.`;
    uploadStatusTone = "error";
    render();
    return;
  }

  invoice.invoiceNumber = invoiceNumber;
  invoice.invoiceDate = invoiceDate;
  saveInvoices();
  editingInvoiceId = null;
  invoiceEditDraft = null;
  uploadStatus = `Invoice ${invoiceNumber} updated and saved locally.`;
  uploadStatusTone = "";
  render();
}

function cancelInvoiceEdit() {
  editingInvoiceId = null;
  invoiceEditDraft = null;
  uploadStatus = "";
  uploadStatusTone = "";
  render();
}

function deleteInvoice(event) {
  const invoiceId = event.currentTarget.dataset.deleteInvoice;
  const invoice = invoices.find((item) => item.id === invoiceId);
  if (!invoice) return;

  const confirmed = window.confirm(
    `Delete invoice ${invoice.invoiceNumber}?\n\n` +
    `Amount: ${formatUsd(getInvoiceAmount(invoice))}\n` +
    "Its quantities will also be removed from every product's lifetime ordered total.",
  );
  if (!confirmed) return;

  invoices = invoices.filter((item) => item.id !== invoiceId);
  if (editingInvoiceId === invoiceId) {
    editingInvoiceId = null;
    invoiceEditDraft = null;
  }
  saveInvoices();
  uploadStatus = `Invoice ${invoice.invoiceNumber} deleted from local history.`;
  uploadStatusTone = "";
  render();
}

async function handleInvoiceUpload(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  if (!file) return;

  uploadStatus = `Reading ${file.name}`;
  uploadStatusTone = "";
  render();

  try {
    const rows = await readXlsxRows(file);
    const parsedInvoice = parseOrderInvoiceRows(rows, file.name);
    const invoiceKey = normalizeInvoiceIdentifier(parsedInvoice.invoiceNumber);
    if (invoices.some((invoice) =>
      normalizeInvoiceIdentifier(invoice.invoiceNumber) === invoiceKey,
    )) {
      throw new Error(`Invoice ${parsedInvoice.invoiceNumber} was already uploaded and has not been counted again.`);
    }

    const invoice = {
      ...parsedInvoice,
      id: crypto.randomUUID(),
      importedAt: new Date().toISOString(),
      paid: false,
      paymentBank: "",
      paymentDate: "",
    };
    invoices.push(invoice);
    saveInvoices();

    const productSkus = getSavedProductSkus();
    const matchedLines = invoice.lines.filter((line) =>
      productSkus.has(normalizeInvoiceIdentifier(line.sku)),
    );
    const matchedQuantity = matchedLines.reduce((total, line) => total + Number(line.quantity || 0), 0);
    const unmatchedCount = invoice.lines.length - matchedLines.length;
    uploadStatus = `Invoice ${invoice.invoiceNumber} uploaded: ${invoice.totalQuantity} units and ${formatUsd(getInvoiceAmount(invoice))}${unmatchedCount ? `; ${unmatchedCount} SKU row${unmatchedCount === 1 ? "" : "s"} unmatched` : `; ${matchedQuantity} units matched to products`}.`;
    uploadStatusTone = unmatchedCount ? "warning" : "";
    render();
  } catch (error) {
    uploadStatus = error.message || "Could not read this invoice.";
    uploadStatusTone = "error";
    render();
  }
}

function updatePendingSelection(event) {
  const invoice = invoices.find((item) => item.id === event.currentTarget.dataset.invoiceSelected);
  if (!invoice) return;
  invoice.selectedPending = event.currentTarget.checked;
  saveInvoices();
  render();
}

function updatePaymentDetails(event) {
  const input = event.currentTarget;
  const invoiceId = input.dataset.paymentBank || input.dataset.paymentDate;
  const invoice = invoices.find((item) => item.id === invoiceId);
  if (!invoice) return;

  if (input.dataset.paymentBank) invoice.paymentBank = input.value.trim();
  if (input.dataset.paymentDate) invoice.paymentDate = input.value;
  const paymentComplete = hasCompletePaymentDetails(invoice);
  if (paymentComplete) invoice.selectedPending = false;
  saveInvoices();

  render();

  const status = document.querySelector("[data-payment-save-status]");
  if (status) {
    status.textContent = paymentComplete
      ? `${invoice.invoiceNumber} marked as paid and saved locally.`
      : `Payment details saved locally for ${invoice.invoiceNumber}.`;
  }
}

window.addEventListener("storage", () => {
  invoices = loadInvoices();
  render();
});

async function initialize() {
  try {
    const session = await request("/api/auth/session");
    currentUser = session.user;
    render();
  } catch {
    window.location.replace("/");
  }
}

app.innerHTML = `
  <main class="login-page loading-page">
    <section class="branded-loader" role="status" aria-live="polite">
      <div class="loader-orbit" aria-hidden="true">
        <img class="loader-mark" src="import-profit-mark.png" alt="" />
      </div>
      <p class="eyebrow">Import and Profit App</p>
      <h1>Preparing your invoices</h1>
      <div class="loader-progress" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </section>
  </main>
`;
initialize();
