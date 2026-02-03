import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const templatesSource = path.join(root, "app", "data", "prompt-templates.json");
const sourcesSource = path.join(root, "app", "data", "prompt-sources.json");
const destDir = path.join(root, "build", "data");
const templatesDest = path.join(destDir, "prompt-templates.json");
const sourcesDest = path.join(destDir, "prompt-sources.json");

await fs.mkdir(destDir, { recursive: true });
await fs.copyFile(templatesSource, templatesDest);

try {
  await fs.copyFile(sourcesSource, sourcesDest);
} catch (error) {
  if ((error ?? {}).code !== "ENOENT") throw error;
}
