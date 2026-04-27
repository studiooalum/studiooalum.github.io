import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "dist");

const directoriesToCopy = ["public", "runtime", "styles", "scripts"];
const rootFilePattern = /\.(html|png|jpe?g|gif|webp|svg|ico)$/i;
const passthroughFiles = new Set(["_headers", "_redirects", "robots.txt", "sitemap.xml", "_routes.json"]);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const copiedRootFiles = [];
for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (passthroughFiles.has(entry.name) || rootFilePattern.test(entry.name)) {
    cpSync(path.join(rootDir, entry.name), path.join(outputDir, entry.name));
    copiedRootFiles.push(entry.name);
  }
}

const copiedDirectories = [];
for (const directoryName of directoriesToCopy) {
  const sourceDir = path.join(rootDir, directoryName);
  if (!existsSync(sourceDir)) continue;
  cpSync(sourceDir, path.join(outputDir, directoryName), { recursive: true });
  copiedDirectories.push(directoryName);
}

console.log(`[cf:build] copied ${copiedRootFiles.length} root files and ${copiedDirectories.length} directories into dist/.`);