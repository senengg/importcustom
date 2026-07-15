import "./verify-app.mjs";

import fs from "node:fs/promises";

const outputDirectory = "dist";

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });

for (const file of ["index.html", "master.html", "admin.html", "import-profit-mark.png"]) {
  await fs.copyFile(file, `${outputDirectory}/${file}`);
}

for (const directory of ["master", "src", "public"]) {
  await fs.cp(directory, `${outputDirectory}/${directory}`, { recursive: true });
}

console.log(`Static site built in ${outputDirectory}/.`);
