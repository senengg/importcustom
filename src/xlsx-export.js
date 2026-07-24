const encoder = new TextEncoder();

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function cellXml(value, rowIndex, columnIndex, header = false) {
  const reference = `${columnName(columnIndex)}${rowIndex}`;
  const style = header ? ' s="1"' : "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
}

function createWorksheet(rows) {
  const maximumColumns = Math.max(1, ...rows.map((row) => row.length));
  const rowXml = rows.map((row, rowOffset) => {
    const rowIndex = rowOffset + 1;
    const highlighted = rowIndex === 1 || String(row[0] || "").startsWith("TOTAL INVOICE VALUE");
    return `<row r="${rowIndex}">${row.map((value, columnIndex) =>
      cellXml(value, rowIndex, columnIndex, highlighted),
    ).join("")}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="${maximumColumns}" width="20" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A1:${columnName(maximumColumns - 1)}${Math.max(rows.length, 1)}"/>
</worksheet>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function write32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  files.forEach(([name, content]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    write32(localHeader, 0, 0x04034b50);
    write16(localHeader, 4, 20);
    write16(localHeader, 6, 0x0800);
    write16(localHeader, 8, 0);
    write32(localHeader, 14, checksum);
    write32(localHeader, 18, data.length);
    write32(localHeader, 22, data.length);
    write16(localHeader, 26, nameBytes.length);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    write32(centralHeader, 0, 0x02014b50);
    write16(centralHeader, 4, 20);
    write16(centralHeader, 6, 20);
    write16(centralHeader, 8, 0x0800);
    write16(centralHeader, 10, 0);
    write32(centralHeader, 16, checksum);
    write32(centralHeader, 20, data.length);
    write32(centralHeader, 24, data.length);
    write16(centralHeader, 28, nameBytes.length);
    write32(centralHeader, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  });

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  write32(end, 0, 0x06054b50);
  write16(end, 8, files.length);
  write16(end, 10, files.length);
  write32(end, 12, centralSize);
  write32(end, 16, localOffset);
  return new Blob([...localParts, ...centralParts, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function createWorkbook(rows, sheetName) {
  const safeSheetName = String(sheetName || "Sheet1").replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31);
  return createZip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF007C77"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`],
    ["xl/worksheets/sheet1.xml", createWorksheet(rows)],
  ]);
}

export function createInvoiceWorkbook(invoice, productBySku, normalizeSku) {
  const headers = ["SKU", "Product Name", "Design", "Color", "ASIN", "Qty", "Price (USD)", "Total Price (USD)"];
  let totalQuantity = 0;
  let totalInvoiceValue = 0;
  const rows = (invoice.lines || []).map((line) => {
    const product = productBySku.get(normalizeSku(line.sku)) || {};
    const quantity = Number(line.quantity) || 0;
    const unitPrice = Number(line.unitPriceUsd) || 0;
    const suppliedAmount = Number(line.amountUsd);
    const calculatedAmount = quantity * unitPrice;
    const totalPrice = Math.round((Number.isFinite(suppliedAmount) && suppliedAmount !== 0
      ? suppliedAmount
      : calculatedAmount) * 100) / 100;
    totalQuantity += quantity;
    totalInvoiceValue += totalPrice;
    return [
      line.sku || "",
      line.productName || product.productName || "",
      line.design || product.design || "",
      line.color || product.color || "",
      product.asin || "",
      quantity,
      unitPrice,
      totalPrice,
    ];
  });
  totalInvoiceValue = Math.round(totalInvoiceValue * 100) / 100;
  rows.push(["TOTAL INVOICE VALUE", "", "", "", "", totalQuantity, "", totalInvoiceValue]);

  return createWorkbook([headers, ...rows], "Invoice Details");
}

export function createProductWorkbook(products, getMetrics) {
  const rounded = (value, decimals = 2) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    const scale = 10 ** decimals;
    return Math.round(number * scale) / scale;
  };
  const headers = [
    "Product Name",
    "Category",
    "Design",
    "Color",
    "SKU",
    "ASIN",
    "EAN Code",
    "HSN Code",
    "Procurement Type",
    "Product Cost USD",
    "Product Cost INR",
    "Weight KG",
    "Country of Origin",
    "COO Benefit",
    "GST Rate",
    "USD Rate",
    "Freight / KG (USD)",
    "Selling Price INR",
    "Deal Discount Percent",
    "Deal Price INR",
    "Insurance / Unit (INR)",
    "Freight / Unit (INR)",
    "Basic Customs / BCD Calculation (INR)",
    "SWS (INR)",
    "IGST (INR)",
    "Import Cost (INR)",
    "Landing Cost (INR)",
    "GST Amazon (INR)",
    "GST Amazon Deal (INR)",
    "Settlement Amazon (INR)",
    "Settlement Amazon Deal (INR)",
    "Profit Amazon (INR)",
    "Profit Amazon Deal (INR)",
    "Lifetime Ordered Quantity",
  ];
  const rows = products.map((product) => {
    const metrics = getMetrics(product);
    return [
      product.productName || "",
      product.category || "",
      product.design || "",
      product.color || "",
      product.sku || "",
      product.asin || "",
      product.eanCode || "",
      product.hsnCode || "",
      product.procurementType || "",
      Number(product.productCostUsd) || 0,
      Number(product.productCostInr) || 0,
      Number(product.weightKg) || 0,
      product.countryOfOrigin || "",
      product.cooBenefit || "",
      Number(product.gstRate) || 0,
      rounded(metrics.usdRate, 4),
      rounded(metrics.freightPerKgUsd, 4),
      rounded(product.amazonSellingPriceInr),
      rounded((Number(product.dealPriceRate) || 0) * 100),
      rounded(metrics.dealPrice),
      rounded(metrics.insuranceInr),
      rounded(metrics.freightInr),
      rounded(metrics.basicCustomDutyInr),
      rounded(metrics.swsInr),
      rounded(metrics.igstInr),
      rounded(metrics.importCostInr),
      rounded(metrics.landingCost),
      rounded(metrics.gstAmazon),
      rounded(metrics.gstAmazonDeal),
      rounded(metrics.settlementAmazon),
      rounded(metrics.settlementAmazonDeal),
      rounded(metrics.amazonProfit),
      rounded(metrics.amazonDealProfit),
      rounded(metrics.lifetimeOrderedQuantity),
    ];
  });
  return createWorkbook([headers, ...rows], "Filtered Products");
}

export function downloadProductWorkbook(products, getMetrics) {
  const blob = createProductWorkbook(products, getMetrics);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Filtered-Products-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadInvoiceWorkbook(invoice, productBySku, normalizeSku) {
  const blob = createInvoiceWorkbook(invoice, productBySku, normalizeSku);
  const safeNumber = String(invoice.invoiceNumber || "invoice").replace(/[^a-z0-9._-]+/gi, "-");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Invoice-${safeNumber}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
