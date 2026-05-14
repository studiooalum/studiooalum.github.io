import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "dist");
const tossClientKey = String(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || process.env.TOSS_CLIENT_KEY || "").trim();
const cloudflareWebAnalyticsToken = String(process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN || "").trim();

const directoriesToCopy = ["public", "runtime", "styles", "scripts"];
const rootFilePattern = /\.(html|png|jpe?g|gif|webp|svg|ico)$/i;
const passthroughFiles = new Set(["_headers", "_redirects", "robots.txt", "sitemap.xml", "_routes.json"]);

function injectCloudflareWebAnalytics(source) {
  if (!cloudflareWebAnalyticsToken || source.includes("static.cloudflareinsights.com/beacon.min.js")) {
    return source;
  }

  const snippet = `  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${JSON.stringify({ token: cloudflareWebAnalyticsToken })}'></script>`;

  if (source.includes("</head>")) {
    return source.replace("</head>", `${snippet}\n</head>`);
  }

  return `${snippet}\n${source}`;
}

function transformHtml(entryName, source) {
  let transformed = source;

  if (entryName === "payment.html" && tossClientKey) {
    transformed = transformed.replace(
      /<meta name="oalum-toss-client-key" content="[^"]*">/,
      `<meta name="oalum-toss-client-key" content="${tossClientKey}">`,
    );
  }

  return injectCloudflareWebAnalytics(transformed);
}

function copyRootFile(entryName) {
  const sourcePath = path.join(rootDir, entryName);
  const destinationPath = path.join(outputDir, entryName);

  if (!/\.html$/i.test(entryName)) {
    cpSync(sourcePath, destinationPath);
    return;
  }

  const source = readFileSync(sourcePath, "utf8");
  const transformed = transformHtml(entryName, source);

  writeFileSync(destinationPath, transformed);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const copiedRootFiles = [];
for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (passthroughFiles.has(entry.name) || rootFilePattern.test(entry.name)) {
    copyRootFile(entry.name);
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

if (tossClientKey) {
  console.log("[cf:build] injected Toss client key into dist/payment.html from env.");
}

if (cloudflareWebAnalyticsToken) {
  console.log("[cf:build] injected Cloudflare Web Analytics beacon into HTML files.");
}