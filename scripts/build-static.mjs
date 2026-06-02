import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

const filesToCopy = [
  "index.html",
  "style.css",
  "app.js",
  "firebase-config.js"
];

const directoriesToCopy = [
  "src"
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of filesToCopy) {
  const source = path.join(root, file);
  const target = path.join(dist, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required build asset: ${file}`);
  }
  fs.copyFileSync(source, target);
}

for (const directory of directoriesToCopy) {
  const sourceDir = path.join(root, directory);
  const targetDir = path.join(dist, directory);
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing required build asset directory: ${directory}`);
  }
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

console.log(`Built static frontend into ${dist}`);
