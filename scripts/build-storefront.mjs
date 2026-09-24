import { build } from "esbuild";

await build({
  entryPoints: {
    "workshop-20260924": "runtime/storefront/scripts/workshop-20260816-01.js",
    "workshops-20260924": "runtime/storefront/scripts/workshops-20260816-03.js",
    "workshop-admin-20260924": "runtime/storefront/scripts/workshop-admin-20260816-02.js",
    "repair-ticket-20260924": "runtime/storefront/scripts/repair-ticket-20260824-01.js",
    "payment-20260924": "runtime/storefront/scripts/payment.js",
    "archive-20260924": "runtime/storefront/scripts/archive-20260818-02.js",
    "signup-20260924": "runtime/storefront/scripts/signup.js",
  },
  outdir: "runtime/storefront/scripts",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  external: ["https://*"],
  logLevel: "info",
});

await build({
  entryPoints: {
    "layout-20260924": "runtime/storefront/styles/layout.css",
    "repair-ticket-20260924": "runtime/storefront/styles/repair-ticket-20260824-01.css",
  },
  outdir: "runtime/storefront/styles",
  bundle: true,
  minify: true,
  logLevel: "info",
});