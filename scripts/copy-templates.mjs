import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "app", "data", "prompt-templates.json");
const destDir = path.join(root, "build", "data");
const dest = path.join(destDir, "prompt-templates.json");

await fs.mkdir(destDir, { recursive: true });
await fs.copyFile(source, dest);
