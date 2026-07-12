import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath =
  process.argv[2] || "C:/Users/Senthil/Desktop/Custom Import.xlsx";
const outputDir = process.argv[3] || "analysis";

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

for (const sheetName of ["Import Cost", "Notes"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  const bytes = new Uint8Array(await preview.arrayBuffer());
  const safeName = sheetName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await fs.writeFile(path.join(outputDir, `${safeName}.png`), bytes);
}

console.log("Workbook previews written to analysis/.");
