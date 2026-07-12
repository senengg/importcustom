import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  process.argv[2] || "C:/Users/Senthil/Desktop/Custom Import.xlsx";
const outputDir = process.argv[3] || "analysis";

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,definedName,drawing",
  maxChars: 30000,
  tableMaxRows: 20,
  tableMaxCols: 16,
  tableMaxCellChars: 140,
});

const formulas = await workbook.inspect({
  kind: "formula",
  maxChars: 30000,
  options: { maxResults: 500 },
});

const regions = await workbook.inspect({
  kind: "region",
  maxChars: 50000,
  tableMaxRows: 100,
  tableMaxCols: 30,
  tableMaxCellChars: 140,
});

await fs.writeFile(path.join(outputDir, "overview.ndjson"), overview.ndjson);
await fs.writeFile(path.join(outputDir, "formulas.ndjson"), formulas.ndjson);
await fs.writeFile(path.join(outputDir, "regions.ndjson"), regions.ndjson);

console.log("Workbook inspection written to analysis/.");
