export function normalizeInvoiceIdentifier(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function number(value) {
  const parsed = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return "";
  return date.toISOString().slice(0, 10);
}

function dateFromFileName(fileName) {
  const match = String(fileName || "").match(/(?:^|[_-])(\d{2})(\d{2})(\d{2})(?=[_.-]|$)/);
  if (!match) return "";
  return isoDate(2000 + Number(match[1]), Number(match[2]), Number(match[3]));
}

function dateFromExcelSerial(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 20_000 || serial > 80_000) return "";
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function findInvoiceNumber(rows) {
  for (const row of rows.slice(0, 20)) {
    const labelIndex = row.findIndex((value) => normalizeHeader(value) === "invoice");
    if (labelIndex === -1) continue;
    for (let index = labelIndex + 1; index < row.length; index += 1) {
      const value = text(row[index]);
      if (value) return value;
    }
  }
  return "";
}

function findInvoiceDate(rows, fileName) {
  const fileDate = dateFromFileName(fileName);
  if (fileDate) return fileDate;

  for (const row of rows.slice(0, 12)) {
    for (const value of row) {
      const serialDate = dateFromExcelSerial(value);
      if (serialDate) return serialDate;
    }
  }
  return "";
}

function findColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(header));
}

export function parseOrderInvoiceRows(rows, fileName = "") {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("The invoice does not contain any readable rows.");
  }

  const invoiceNumber = findInvoiceNumber(rows);
  if (!invoiceNumber) throw new Error("Invoice number could not be found.");
  const invoiceDate = findInvoiceDate(rows, fileName);
  if (!invoiceDate) throw new Error("Invoice date could not be found.");

  const headerRowIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headers.includes("sku") && headers.some((header) =>
      ["pc", "qty", "quantity", "orderedqty", "orderquantity"].includes(header),
    );
  });
  if (headerRowIndex === -1) {
    throw new Error("Invoice line-item headers (SKU and quantity) could not be found.");
  }

  const headers = rows[headerRowIndex].map(normalizeHeader);
  const skuIndex = findColumn(headers, ["sku"]);
  const quantityIndex = findColumn(headers, ["pc", "qty", "quantity", "orderedqty", "orderquantity"]);
  const productNameIndex = findColumn(headers, ["productname", "product", "description", "device"]);
  const designIndex = findColumn(headers, ["design", "line"]);
  const colorIndex = findColumn(headers, ["color", "colour"]);
  const unitPriceIndex = findColumn(headers, ["pvus", "unitprice", "unitpriceus", "unitpriceusd"]);
  const amountIndex = findColumn(headers, ["us", "amount", "amountus", "amountusd"]);

  const lines = rows.slice(headerRowIndex + 1).flatMap((row) => {
    const sku = text(row[skuIndex]);
    const quantity = number(row[quantityIndex]);
    if (!sku || quantity <= 0) return [];
    return [{
      sku,
      quantity,
      productName: productNameIndex >= 0 ? text(row[productNameIndex]) : "",
      design: designIndex >= 0 ? text(row[designIndex]) : "",
      color: colorIndex >= 0 ? text(row[colorIndex]) : "",
      unitPriceUsd: unitPriceIndex >= 0 ? number(row[unitPriceIndex]) : 0,
      amountUsd: amountIndex >= 0 ? number(row[amountIndex]) : 0,
    }];
  });

  if (!lines.length) throw new Error("No ordered product quantities were found in the invoice.");

  return {
    invoiceNumber,
    invoiceDate,
    fileName: String(fileName || ""),
    totalQuantity: lines.reduce((total, line) => total + line.quantity, 0),
    lines,
  };
}
