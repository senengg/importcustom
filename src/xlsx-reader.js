export async function readXlsxRows(file) {
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
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
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
  if (!relId || !zip.has("xl/_rels/workbook.xml.rels")) return "xl/worksheets/sheet1.xml";

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
    if (part === "..") parts.pop();
    else parts.push(part);
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
    .filter((row) => row.some((value) => value !== undefined && value !== null && value !== ""));
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
